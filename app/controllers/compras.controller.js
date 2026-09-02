const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    const info = await client.query(`
      SELECT
        current_database() AS base_datos,
        current_user AS usuario,
        COUNT(*) FILTER (WHERE ruccedpro IS NULL OR BTRIM(ruccedpro) = '') AS ruc_vacios,
        COUNT(*) FILTER (WHERE ruccedpro IS NOT NULL AND BTRIM(ruccedpro) <> '') AS ruc_con_datos
      FROM compras
    `);

    const result = await client.query(`
      SELECT
        numfaccom AS numero,
        ruccedpro AS rucCed,
        LENGTH(ruccedpro) AS rucLongitud,
        tpidprov AS tipoProveedor,
        numautori AS autorizacion,
        feccompra AS fecha
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
      ORDER BY feccompra DESC, numfaccom DESC
      LIMIT 5
    `, [inicio, fin]);

    return res.json({
      diagnostico: 'verificacion_ruc_y_base',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      base: info.rows[0],
      filas: result.rows.length,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error verificando RUC.',
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
