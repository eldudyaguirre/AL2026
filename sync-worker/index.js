const { Pool } = require('pg');

const TABLES = (process.env.SYNC_TABLES || 'compras,comprasnv,proveedores')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 5000);
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE || 200);

if (!process.env.LOCAL_DATABASE_URL || !process.env.RAILWAY_DATABASE_URL) {
  console.error('Faltan LOCAL_DATABASE_URL y/o RAILWAY_DATABASE_URL.');
  process.exit(1);
}

const localPool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

const railwayPool = new Pool({
  connectionString: process.env.RAILWAY_DATABASE_URL,
  ssl: process.env.RAILWAY_DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Identificador inválido: ${value}`);
  }
  return `"${value}"`;
}

async function getTableSchema(client, table) {
  const columnsResult = await client.query(`
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [table]);

  if (!columnsResult.rows.length) {
    throw new Error(`La tabla local public.${table} no existe.`);
  }

  const primaryKeyResult = await client.query(`
    SELECT a.attname
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = k.attnum
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND i.indisprimary
    ORDER BY k.ord
  `, [table]);

  return {
    columns: columnsResult.rows,
    primaryKey: primaryKeyResult.rows.map((row) => row.attname),
  };
}

async function ensureTargetTable(client, table, schema) {
  const tableSql = quoteIdentifier(table);
  const columnSql = schema.columns
    .map((column) => `${quoteIdentifier(column.column_name)} ${column.data_type}`)
    .join(',\n');

  await client.query(`CREATE TABLE IF NOT EXISTS ${tableSql} (${columnSql})`);

  const targetColumns = await client.query(`
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [table]);

  const expected = schema.columns
    .map((column) => `${column.column_name}|${column.data_type}`)
    .join('||');
  const actual = targetColumns.rows
    .map((column) => `${column.column_name}|${column.data_type}`)
    .join('||');

  if (expected !== actual) {
    throw new Error(`La estructura de public.${table} en Railway no coincide con LOCAL.`);
  }

  if (schema.primaryKey.length) {
    const primaryKeyExists = await client.query(`
      SELECT 1
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND i.indisprimary
    `, [table]);

    if (!primaryKeyExists.rowCount) {
      const constraintName = `pk_sync_${table}`;
      await client.query(
        `ALTER TABLE ${tableSql} ADD CONSTRAINT ${quoteIdentifier(constraintName)} PRIMARY KEY (${schema.primaryKey.map(quoteIdentifier).join(', ')})`
      );
    }
  }
}

async function insertBatch(client, table, columns, rows) {
  if (!rows.length) return;

  const tableSql = quoteIdentifier(table);
  const columnSql = columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
  const values = [];

  const tuples = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[column.column_name]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  await client.query(
    `INSERT INTO ${tableSql} (${columnSql}) VALUES ${tuples}`,
    values
  );
}

async function syncOnce() {
  const started = Date.now();
  const local = await localPool.connect();
  const railway = await railwayPool.connect();

  try {
    // Tomamos una fotografía consistente de las tablas locales.
    await local.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

    const snapshots = [];

    for (const table of TABLES) {
      const schema = await getTableSchema(local, table);
      const result = await local.query(`SELECT * FROM ${quoteIdentifier(table)}`);
      snapshots.push({ table, schema, rows: result.rows });
    }

    await local.query('COMMIT');

    // Aplicamos todas las tablas en una sola transacción en Railway.
    // La API verá el estado anterior o el nuevo, no una mezcla parcial.
    await railway.query('BEGIN');

    for (const snapshot of snapshots) {
      await ensureTargetTable(railway, snapshot.table, snapshot.schema);
    }

    for (const snapshot of snapshots) {
      await railway.query(`DELETE FROM ${quoteIdentifier(snapshot.table)}`);

      for (let offset = 0; offset < snapshot.rows.length; offset += BATCH_SIZE) {
        const batch = snapshot.rows.slice(offset, offset + BATCH_SIZE);
        await insertBatch(
          railway,
          snapshot.table,
          snapshot.schema.columns,
          batch
        );
      }
    }

    await railway.query('COMMIT');

    const counts = snapshots
      .map((snapshot) => `${snapshot.table}=${snapshot.rows.length}`)
      .join(', ');

    console.log(`[SYNC] OK ${counts} en ${Date.now() - started} ms`);
  } catch (error) {
    try { await local.query('ROLLBACK'); } catch (_) {}
    try { await railway.query('ROLLBACK'); } catch (_) {}

    console.error(`[SYNC] ERROR después de ${Date.now() - started} ms: ${error.message}`);
  } finally {
    local.release();
    railway.release();
  }
}

let running = false;

async function tick() {
  if (running) return;

  running = true;
  try {
    await syncOnce();
  } finally {
    running = false;
  }
}

console.log(`[SYNC] Tablas: ${TABLES.join(', ')}`);
console.log(`[SYNC] Intervalo: ${INTERVAL_MS} ms`);
console.log(`[SYNC] Lote: ${BATCH_SIZE} filas`);

tick();
setInterval(tick, INTERVAL_MS);

async function shutdown(signal) {
  console.log(`[SYNC] Cerrando por ${signal}...`);
  await Promise.allSettled([
    localPool.end(),
    railwayPool.end(),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
