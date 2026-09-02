const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    // PRUEBA JOIN: registros 11 al 15 para aislar si uno de ellos provoca el bloqueo.
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
        ORDER BY c.feccompra DESC, c.numfaccom DESC
        OFFSET 10
        LIMIT 5
      `,
      values: ['2026-08-31', '2026-09-02'],
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA JOIN REGISTROS 11-15: ${result.rows.length} registro(s) en ${tiempoMs} ms`);

    return res.json({
      prueba: 'API JOIN registros 11 al 15',
      total: result.rows.length,
      tiempoMs,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA JOIN REGISTROS 11-15 - Error después de ${tiempoMs} ms:`, error.message);

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
