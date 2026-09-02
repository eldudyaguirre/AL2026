const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT
        c.numfaccom AS "numero",
        p.ruccedpro AS "rucCed",
        p.nomprovee AS "proveedor",
        c.numautori AS "autorizacion",
        c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
        COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      LEFT JOIN proveedores p
        ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date
      ORDER BY c.feccompra DESC, c.numfaccom DESC
      LIMIT 5
    `, [inicio, fin]);

    return res.json({
      diagnostico: 'compras_total',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      filas: result.rows.length,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error consultando compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente:', error.message);
      }
    }
  }
}

module.exports = { compras };
