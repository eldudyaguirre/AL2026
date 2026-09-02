const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    // PRUEBA PROVEEDOR: buscar un proveedor específico por RUC/Cédula.
    const result = await client.query({
      text: `
        SELECT
          ruccedpro AS "rucCed",
          nomprovee AS proveedor
        FROM proveedores
        WHERE ruccedpro = $1
      `,
      values: ['0790002350001'],
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA PROVEEDOR API: ${result.rows.length} registro(s) en ${tiempoMs} ms`);

    return res.json({
      prueba: 'API proveedor por RUC',
      rucConsultado: '0790002350001',
      total: result.rows.length,
      tiempoMs,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA PROVEEDOR API - Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudo consultar el proveedor.',
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
