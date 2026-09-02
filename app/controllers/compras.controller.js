const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    // PRUEBA: todas las compras del rango + proveedores, sin LIMIT ni ORDER BY.
    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          p.nomprovee AS proveedor
        FROM compras c
        LEFT JOIN proveedores p
          ON p.ruccedpro = c.ruccedpro
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
      `,
      values: ['2026-08-31', '2026-09-02'],
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA JOIN SIN LIMIT/ORDER BY: ${result.rows.length} registro(s) en ${tiempoMs} ms`);

    return res.json({
      prueba: 'API JOIN sin LIMIT ni ORDER BY',
      total: result.rows.length,
      tiempoMs,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA JOIN SIN LIMIT/ORDER BY - Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      tiempoMs,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente dedicado:', error.message);
      }
    }
  }
}

module.exports = { compras };
