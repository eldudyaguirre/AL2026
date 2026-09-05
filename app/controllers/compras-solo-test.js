const pool = require('../database/postgres');

async function comprasSoloTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const inicioQuery = Date.now();

    // PRUEBA AISLADA: solamente la tabla compras.
    // Sin JOIN, sin proveedores, sin comprasnv y sin filtro de fechas.
    const result = await client.query(`
      SELECT *
      FROM compras
      LIMIT 10
    `);

    const queryMs = Date.now() - inicioQuery;

    return res.json({
      ok: true,
      prueba: 'solo_tabla_compras_10_primeras',
      total: result.rows.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      prueba: 'solo_tabla_compras_10_primeras',
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioTotal
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = { comprasSoloTest };
