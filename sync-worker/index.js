const { Pool } = require('pg');
const crypto = require('crypto');

const TABLES_CONFIG = process.env.SYNC_TABLES
  ? process.env.SYNC_TABLES.split(',').map((value) => value.trim()).filter(Boolean)
  : null;

const INTERVAL_MS = Math.max(1000, Number(process.env.SYNC_INTERVAL_MS || 10000));
const BATCH_SIZE = Math.max(1, Number(process.env.SYNC_BATCH_SIZE || 200));

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

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  return value;
}

function rowHash(row, columns) {
  const payload = columns.map((column) => [
    column.column_name,
    normalizeValue(row[column.column_name]),
  ]);
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function primaryKeyToken(row, primaryKey) {
  return JSON.stringify(primaryKey.map((column) => normalizeValue(row[column])));
}

async function getTables(client) {
  if (TABLES_CONFIG) return TABLES_CONFIG;

  const result = await client.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  return result.rows.map((row) => row.tablename);
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
      AND c.relkind IN ('r', 'p')
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
      AND c.relkind IN ('r', 'p')
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

  if (!schema.primaryKey.length) {
    throw new Error(`La tabla public.${table} no tiene clave primaria. El modo incremental requiere PRIMARY KEY.`);
  }

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

async function loadTargetRows(client, table, columns) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  const map = new Map();
  for (const row of result.rows) {
    map.set(primaryKeyToken(row, columns.primaryKey), rowHash(row, columns.columns));
  }
  return map;
}

async function upsertBatch(client, table, schema, rows) {
  if (!rows.length) return;

  const tableSql = quoteIdentifier(table);
  const columnSql = schema.columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
  const conflictSql = schema.primaryKey.map(quoteIdentifier).join(', ');
  const updateColumns = schema.columns
    .filter((column) => !schema.primaryKey.includes(column.column_name))
    .map((column) => `${quoteIdentifier(column.column_name)} = EXCLUDED.${quoteIdentifier(column.column_name)}`)
    .join(', ');

  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = schema.columns.map((column, columnIndex) => {
      values.push(row[column.column_name]);
      return `$${rowIndex * schema.columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  const action = updateColumns
    ? `DO UPDATE SET ${updateColumns}`
    : 'DO NOTHING';

  await client.query(
    `INSERT INTO ${tableSql} (${columnSql}) VALUES ${tuples} ON CONFLICT (${conflictSql}) ${action}`,
    values
  );
}

async function deleteMissingRows(client, table, schema, localKeys) {
  const target = await client.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  let deleted = 0;

  for (const row of target.rows) {
    const token = primaryKeyToken(row, schema.primaryKey);
    if (localKeys.has(token)) continue;

    const where = schema.primaryKey.map((column, index) => `${quoteIdentifier(column)} IS NOT DISTINCT FROM $${index + 1}`).join(' AND ');
    const values = schema.primaryKey.map((column) => row[column]);
    const result = await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE ${where}`, values);
    deleted += result.rowCount;
  }

  return deleted;
}

async function syncTable(local, railway, table) {
  const schema = await getTableSchema(local, table);
  await ensureTargetTable(railway, table, schema);

  const result = await local.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  const localRows = result.rows;
  const localKeys = new Set(localRows.map((row) => primaryKeyToken(row, schema.primaryKey)));
  const targetHashes = await loadTargetRows(railway, table, schema);

  const changedRows = localRows.filter((row) => {
    const key = primaryKeyToken(row, schema.primaryKey);
    return targetHashes.get(key) !== rowHash(row, schema.columns);
  });

  for (let offset = 0; offset < changedRows.length; offset += BATCH_SIZE) {
    await upsertBatch(
      railway,
      table,
      schema,
      changedRows.slice(offset, offset + BATCH_SIZE)
    );
  }

  const deleted = await deleteMissingRows(railway, table, schema, localKeys);

  return {
    table,
    local: localRows.length,
    changed: changedRows.length,
    deleted,
  };
}

async function syncOnce() {
  const started = Date.now();
  const local = await localPool.connect();
  const railway = await railwayPool.connect();

  try {
    await local.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const tables = await getTables(local);

    await railway.query('BEGIN');
    const results = [];

    for (const table of tables) {
      results.push(await syncTable(local, railway, table));
    }

    await railway.query('COMMIT');
    await local.query('COMMIT');

    const summary = results
      .map((item) => `${item.table}=${item.local} filas, ${item.changed} cambios, ${item.deleted} eliminadas`)
      .join(' | ');

    console.log(`[SYNC] OK en ${Date.now() - started} ms :: ${summary}`);
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

console.log(`[SYNC] Tablas: ${TABLES_CONFIG ? TABLES_CONFIG.join(', ') : 'TODAS las tablas de public'}`);
console.log(`[SYNC] Intervalo: ${INTERVAL_MS} ms`);
console.log(`[SYNC] Lote: ${BATCH_SIZE} filas`);

tick();
setInterval(tick, INTERVAL_MS);

async function shutdown(signal) {
  console.log(`[SYNC] Cerrando por ${signal}...`);
  await Promise.allSettled([localPool.end(), railwayPool.end()]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
