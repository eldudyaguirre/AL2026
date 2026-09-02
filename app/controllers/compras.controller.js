const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT numautori
      FROM compras
      LIMIT 5
    `);

    return res.json({
      diagnostico: 'solo_numautori',
      tiempoMs: Date.now() - inicioConsulta,
      filas: result.rows.length,
      resultado: result.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error consultando numautori.',
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
