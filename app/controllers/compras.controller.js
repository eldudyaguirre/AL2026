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

    const sqlCompras = `
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
      WHERE c.feccompra BETWEEN $1::date AND $2::date
    `;

    const sqlComprasNv = `
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
      WHERE c.feccompra BETWEEN $1::date AND $2::date
    `;

    const inicioCompras = Date.now();
    const resultCompras = await pool.query(sqlCompras, [inicio, fin]);
    console.log(`[COMPRAS] tabla compras: ${resultCompras.rows.length} registros en ${Date.now() - inicioCompras} ms`);

    const inicioComprasNv = Date.now();
    const resultComprasNv = await pool.query(sqlComprasNv, [inicio, fin]);
    console.log(`[COMPRAS] tabla comprasnv: ${resultComprasNv.rows.length} registros en ${Date.now() - inicioComprasNv} ms`);

    const filas = [...resultCompras.rows, ...resultComprasNv.rows];

    filas.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;

      if (fechaB !== fechaA) return fechaB - fechaA;
      return String(b.numero || '').localeCompare(String(a.numero || ''));
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] Consulta completada: ${filas.length} registros en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
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
