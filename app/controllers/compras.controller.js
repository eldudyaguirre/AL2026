const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    // PRUEBA JOIN: una sola compra + su proveedor.
    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          p.nomprovee AS proveedor
        FROM compras c
        LEFT JOIN proveedores p
          ON p.ruccedpro = c.ruccedpro
        WHERE c.numfaccom = $1
      `,
      values: ['009-004-002084595'],
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA JOIN INDIVIDUAL: ${result.rows.length} registro(s) en ${tiempoMs} ms`);

    return res.json({
      prueba: 'API JOIN una compra + proveedor',
      facturaConsultada: '009-004-002084595',
      total: result.rows.length,
      tiempoMs,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA JOIN INDIVIDUAL - Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudo consultar la compra con su proveedor.',
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
