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

    // PRUEBA AISLADA: solamente numautori de las compras del rango.
    // No se consulta proveedores, no hay JOIN y no se leen las demás columnas.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.numautori AS autorizacion
        FROM compras c
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
      `,
      values: [inicio, fin],
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA SOLO AUTORIZACION: ${result.rows.length} registros en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: result.rows.length,
      compras: result.rows,
      prueba: 'solo numero y autorizacion',
      tiempoMs,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA SOLO AUTORIZACION - Error después de ${tiempoMs} ms:`, error.message);

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
        console.error('[COMPRAS] Error cerrando cliente:', error.message);
      }
    }
  }
}

module.exports = { compras };
