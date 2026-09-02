const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    // PRUEBA PROVEEDORES: consultar únicamente la tabla proveedores,
    // sin JOIN y sin intervenir la tabla compras.
    const result = await client.query({
      text: `
        SELECT
          ruccedpro AS "rucCed",
          nomprovee AS proveedor
        FROM proveedores
        ORDER BY ruccedpro
        LIMIT 10
      `,
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA PROVEEDORES API: ${result.rows.length} registros en ${tiempoMs} ms`);

    return res.json({
      prueba: 'API tabla proveedores',
      total: result.rows.length,
      tiempoMs,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA PROVEEDORES API - Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudieron consultar los proveedores.',
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
