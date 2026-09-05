const pool = require('../database/postgres');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

async function comprasSoloTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    if (!fechaValida(inicio) || !fechaValida(fin)) {
      return res.status(400).json({
        ok: false,
        error: 'Fechas inválidas. Use YYYY-MM-DD.'
      });
    }

    client = pool.createDedicatedClient();
    await client.connect();

    const inicioQuery = Date.now();

    // PRUEBA AISLADA: solamente la tabla compras.
    // No hay JOIN, no se consulta proveedores, no se consulta comprasnv.
    // Se traen exactamente los datos almacenados en compras.
    const result = await client.query(`
      SELECT *
      FROM compras
      WHERE feccompra >= DATE '${inicio}'
        AND feccompra <= DATE '${fin}'
    `);

    const queryMs = Date.now() - inicioQuery;

    return res.json({
      ok: true,
      prueba: 'solo_tabla_compras',
      inicio,
      fin,
      total: result.rows.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      prueba: 'solo_tabla_compras',
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioTotal
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }
  }
}

module.exports = { comprasSoloTest };
