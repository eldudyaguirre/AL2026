const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = req.query.inicio || hoy;
    const fin = req.query.fin || hoy;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD.' });
    }

    if (inicio > fin) {
      return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor que la fecha de fin.' });
    }

    // PRUEBA 1: traer únicamente el número de factura de compras.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT c.numfaccom AS numero
        FROM compras c
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
        ORDER BY c.feccompra DESC, c.numfaccom DESC
      `,
      values: [inicio, fin],
    });

    const filas = result.rows.map(fila => ({
      numero: fila.numero,
    }));

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA 1: ${filas.length} números en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA 1 - Error después de ${tiempoMs} ms:`, error.message);

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
