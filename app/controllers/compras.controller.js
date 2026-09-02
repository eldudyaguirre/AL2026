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

    // PRUEBA 3: número de factura + RUC/Cédula + nombre del proveedor.
    // Se mantiene el filtro de facturas ANULADAS.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          p.nomprovee AS proveedor
        FROM compras c
        LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
        ORDER BY c.feccompra DESC, c.numfaccom DESC
      `,
      values: [inicio, fin],
    });

    const filas = result.rows.map(fila => ({
      numero: fila.numero,
      rucCed: fila.rucCed,
      proveedor: fila.proveedor || 'PROVEEDOR NO REGISTRADO',
    }));

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA 3: ${filas.length} números + RUC + proveedor en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA 3 - Error después de ${tiempoMs} ms:`, error.message);

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
