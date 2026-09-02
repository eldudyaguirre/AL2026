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
        c.numfaccom AS numero,
        c.ruccedpro AS rucCed,
        LENGTH(c.ruccedpro) AS longitudRuc,
        c.tpidprov AS tipoProveedor,
        c.numautori AS autorizacion,
        c.feccompra AS fecha
      FROM compras c
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date
      ORDER BY c.feccompra DESC, c.numfaccom DESC
      LIMIT 5
    `, [inicio, fin]);

    return res.json({
      diagnostico: 'compras_ruc',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      filas: result.rows.length,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error consultando RUC de compras.',
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
