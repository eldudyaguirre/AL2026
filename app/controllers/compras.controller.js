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

    // Para este módulo usamos una conexión TCP nueva, sin reutilizar conexiones
    // del pool que pudieran haber quedado bloqueadas por un problema de red.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          p.nomprovee AS proveedor,
          c.feccompra AS fecha,
          c.numautori AS autorizacion,
          c.totsiniva AS "subtotalSinIva",
          c.totconiva AS "subtotalConIva",
          c.totcompra AS total,
          'compras' AS origen
        FROM compras c
        LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date

        UNION ALL

        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          p.nomprovee AS proveedor,
          c.feccompra AS fecha,
          c.numautori AS autorizacion,
          c.totsiniva AS "subtotalSinIva",
          c.totconiva AS "subtotalConIva",
          c.totcompra AS total,
          'comprasnv' AS origen
        FROM comprasnv c
        LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date

        ORDER BY fecha DESC NULLS LAST, numero DESC
      `,
      values: [inicio, fin],
    });

    const filas = result.rows.map(fila => ({
      ...fila,
      proveedor: fila.proveedor || 'PROVEEDOR NO REGISTRADO',
    }));

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] ${filas.length} registros en ${tiempoMs} ms (cliente dedicado)`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error después de ${tiempoMs} ms:`, error.message);

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
