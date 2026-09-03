const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  console.log('[COMPRAS] INICIO', new Date().toISOString());

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';
    console.log('[COMPRAS] ANTES DE QUERY', { inicio, fin });

    const result = await pool.query({
      text: `
        SELECT
          c.numfaccom AS "numero",
          c.ruccedpro AS "rucCed",
          '' AS "proveedor",
          c.numautori AS "autorizacion",
          c.feccompra AS "fecha",
          COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
          COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
          COALESCE(c.valivacom, 0)::text AS "iva",
          COALESCE(c.totcompra, 0)::text AS "total"
        FROM compras c
        WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date
        ORDER BY c.feccompra DESC, c.numfaccom DESC
      `,
      values: [inicio, fin],
      statement_timeout: 10000,
    });

    console.log('[COMPRAS] QUERY TERMINADA', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicioConsulta,
    });

    return res.json({
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    console.error('[COMPRAS] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta,
    });
    return res.status(500).json({
      error: 'Error consultando compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  }
}

async function comprasTest(req, res) {
  const inicioConsulta = Date.now();
  const inicio = req.query.inicio || '2026-08-31';
  const fin = req.query.fin || '2026-08-31';
  console.log('[COMPRAS-TEST] INICIO MD5', { inicio, fin });
  try {
    const result = await pool.query({
      text: `SELECT c.numfaccom, p.ruccedpro, md5(p.nomprovee) FROM compras c LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date`,
      values: [inicio, fin],
      rowMode: 'array',
    });
    console.log('[COMPRAS-TEST] QUERY MD5 TERMINADA', { filas: result.rows.length, tiempoMs: Date.now() - inicioConsulta });
    return res.json({ inicio, fin, tiempoMs: Date.now() - inicioConsulta, total: result.rows.length, filas: result.rows });
  } catch (error) {
    console.error('[COMPRAS-TEST] ERROR MD5', { mensaje: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
    return res.status(500).json({ error: error.message, tiempoMs: Date.now() - inicioConsulta });
  }
}

module.exports = { compras, comprasTest };
