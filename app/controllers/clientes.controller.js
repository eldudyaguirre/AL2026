const pool = require('../database/postgres');

const CANDIDATOS_RUC = ['ruccedcli', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const CANDIDATOS_NOMBRE = ['nomclient', 'nomcli', 'nombres', 'nombre', 'razonsocial', 'razon_social'];

async function obtenerMetadatos(client) {
  const tablas = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND lower(table_name) = 'clientes'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END
    LIMIT 1
  `);

  if (!tablas.rows.length) throw new Error('No existe la tabla clientes.');

  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnas = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [esquema, tabla]);

  const disponibles = columnas.rows.map(r => r.column_name);
  const buscar = candidatos => disponibles.find(col => candidatos.includes(col.toLowerCase()));
  const colRuc = buscar(CANDIDATOS_RUC);
  const colNombre = buscar(CANDIDATOS_NOMBRE);

  if (!colRuc || !colNombre) {
    throw new Error(`No se encontraron las columnas necesarias en clientes. RUC: ${colRuc || 'no encontrada'}, nombres: ${colNombre || 'no encontrada'}.`);
  }

  return { esquema, tabla, disponibles, colRuc, colNombre };
}

function ident(valor) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

async function clientes(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const meta = await obtenerMetadatos(client);
    const q = String(req.query.q || '').trim();
    const limite = Math.min(Math.max(Number(req.query.limite) || 500, 1), 2000);

    const filtros = [];
    const valores = [];
    if (q) {
      valores.push(`%${q}%`);
      const p = `$${valores.length}`;
      filtros.push(`(CAST(${ident(meta.colRuc)} AS text) ILIKE ${p} OR CAST(${ident(meta.colNombre)} AS text) ILIKE ${p})`);
    }

    const sql = `
      SELECT
        CAST(${ident(meta.colRuc)} AS text) AS "ruc",
        CAST(${ident(meta.colNombre)} AS text) AS "nombres"
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
      ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST
      LIMIT ${limite}
    `;

    const result = await client.query(sql, valores);
    return res.json({ total: result.rows.length, clientes: result.rows });
  } catch (error) {
    console.error('[CLIENTES] Error consultando clientes:', error);
    return res.status(500).json({ error: 'Error consultando clientes.', detail: error.message });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[CLIENTES] Error cerrando cliente:', error.message); }
    }
  }
}

async function clienteDetalle(req, res) {
  let client;
  try {
    const ruc = String(req.params.ruc || '').trim();
    if (!ruc) return res.status(400).json({ error: 'RUC/Cédula requerido.' });

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const meta = await obtenerMetadatos(client);
    const columnas = meta.disponibles.map(ident).join(', ');
    const sql = `
      SELECT ${columnas}
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      WHERE CAST(${ident(meta.colRuc)} AS text) = $1
      LIMIT 1
    `;

    const result = await client.query(sql, [ruc]);
    if (!result.rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });

    return res.json({ cliente: result.rows[0], columnas: meta.disponibles });
  } catch (error) {
    console.error('[CLIENTES] Error consultando detalle:', error);
    return res.status(500).json({ error: 'Error consultando detalle del cliente.', detail: error.message });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[CLIENTES] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { clientes, clienteDetalle };
