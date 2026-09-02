const pool = require('../database/postgres');

const CANDIDATES = {
  numero: ['numfactur', 'numfactura', 'numerofactura', 'numero', 'numdocume', 'numcompro', 'comprobante'],
  rucCed: ['ruc', 'rucprovee', 'rucproveedor', 'cedruc', 'ruc_ced', 'identificacion'],
  proveedor: ['proveedor', 'nomprovee', 'nomproveedor', 'nombreproveedor', 'razonsocial', 'nombre'],
  fecha: ['fecha', 'feccompra', 'feccompr', 'fechacompra', 'fechafact', 'fechaemision', 'fecemision'],
  autorizacion: ['autorizacion', 'numautori', 'numeroautorizacion', 'claveacceso'],
  subtotalSinIva: ['subtotalsiniva', 'subtotal_sin_iva', 'subtotal0', 'subtotaliva0', 'subtotal'],
  subtotalConIva: ['subtotalconiva', 'subtotal_con_iva', 'subtotal12', 'subtotaliva'],
  total: ['total', 'totcompra', 'totalcompra', 'totalfactura'],
};

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function pickColumn(columns, candidates) {
  const normalized = new Map(columns.map(c => [c.column_name.toLowerCase(), c.column_name]));
  for (const candidate of candidates) {
    const found = normalized.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

async function columnsForTable(table) {
  const result = await pool.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return result.rows;
}

async function readTable(table, inicio, fin) {
  const columns = await columnsForTable(table);
  if (!columns.length) return [];

  const selected = {};
  for (const [key, candidates] of Object.entries(CANDIDATES)) {
    selected[key] = pickColumn(columns, candidates);
  }

  const expressions = Object.entries(selected).map(([key, column]) =>
    column ? `${quoteIdent(column)} AS ${quoteIdent(key)}` : `NULL AS ${quoteIdent(key)}`
  );

  const params = [];
  let where = '';
  if (selected.fecha && inicio && fin) {
    params.push(inicio, fin);
    where = `WHERE ${quoteIdent(selected.fecha)}::date BETWEEN $1::date AND $2::date`;
  }

  const order = selected.fecha ? `ORDER BY ${quoteIdent(selected.fecha)} DESC NULLS LAST` : '';
  const sql = `SELECT ${expressions.join(', ')} FROM ${quoteIdent(table)} ${where} ${order}`;
  const result = await pool.query(sql, params);
  return result.rows.map(row => ({ ...row, origen: table }));
}

async function compras(req, res) {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = req.query.inicio || hoy;
    const fin = req.query.fin || hoy;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD.' });
    }
    if (inicio > fin) {
      return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor que la fecha de fin.' });
    }

    const [comprasRows, comprasNvRows] = await Promise.all([
      readTable('compras', inicio, fin),
      readTable('comprasnv', inicio, fin),
    ]);

    const rows = [...comprasRows, ...comprasNvRows].sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0;
      const db = b.fecha ? new Date(b.fecha).getTime() : 0;
      return db - da;
    });

    return res.json({ inicio, fin, total: rows.length, compras: rows });
  } catch (error) {
    console.error('Error consultando compras:', error);
    return res.status(500).json({ error: 'No se pudieron consultar las compras.', detail: error.message });
  }
}

module.exports = { compras };
