const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();

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

    console.log(`[COMPRAS] Inicio consulta ${inicio} a ${fin}`);

    const sql = `
      SELECT
        c.numfaccom AS numero,
        c.ruccedpro AS "rucCed",
        COALESCE(p.nomprovee, 'PROVEEDOR NO REGISTRADO') AS proveedor,
        c.feccompra AS fecha,
        c.numautori AS autorizacion,
        c.totsiniva AS "subtotalSinIva",
        c.totconiva AS "subtotalConIva",
        c.totcompra AS total,
        'compras' AS origen
      FROM compras c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra::date BETWEEN $1::date AND $2::date

      UNION ALL

      SELECT
        c.numfaccom AS numero,
        c.ruccedpro AS "rucCed",
        COALESCE(p.nomprovee, 'PROVEEDOR NO REGISTRADO') AS proveedor,
        c.feccompra AS fecha,
        c.numautori AS autorizacion,
        c.totsiniva AS "subtotalSinIva",
        c.totconiva AS "subtotalConIva",
        c.totcompra AS total,
        'comprasnv' AS origen
      FROM comprasnv c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra::date BETWEEN $1::date AND $2::date

      ORDER BY fecha DESC NULLS LAST, numero DESC;
    `;

    const result = await pool.query(sql, [inicio, fin]);
    const tiempoMs = Date.now() - inicioConsulta;

    console.log(`[COMPRAS] Consulta completada: ${result.rows.length} registros en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error después de ${tiempoMs} ms:`, error.message);
    console.error('[COMPRAS] Pool:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    });

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      tiempoMs,
    });
  }
}

module.exports = { compras };
