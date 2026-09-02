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

    // Consultamos cada tabla sin JOIN para evitar que una relación con proveedores
    // pueda bloquear o ralentizar la consulta principal.
    const sqlCompras = `
      SELECT
        numfaccom AS numero,
        ruccedpro AS "rucCed",
        feccompra AS fecha,
        numautori AS autorizacion,
        totsiniva AS "subtotalSinIva",
        totconiva AS "subtotalConIva",
        totcompra AS total,
        'compras' AS origen
      FROM compras
      WHERE feccompra BETWEEN $1::date AND $2::date
    `;

    const sqlComprasNv = `
      SELECT
        numfaccom AS numero,
        ruccedpro AS "rucCed",
        feccompra AS fecha,
        numautori AS autorizacion,
        totsiniva AS "subtotalSinIva",
        totconiva AS "subtotalConIva",
        totcompra AS total,
        'comprasnv' AS origen
      FROM comprasnv
      WHERE feccompra BETWEEN $1::date AND $2::date
    `;

    const inicioCompras = Date.now();
    const resultCompras = await pool.query(sqlCompras, [inicio, fin]);
    console.log(`[COMPRAS] tabla compras: ${resultCompras.rows.length} registros en ${Date.now() - inicioCompras} ms`);

    const inicioComprasNv = Date.now();
    const resultComprasNv = await pool.query(sqlComprasNv, [inicio, fin]);
    console.log(`[COMPRAS] tabla comprasnv: ${resultComprasNv.rows.length} registros en ${Date.now() - inicioComprasNv} ms`);

    const filas = [...resultCompras.rows, ...resultComprasNv.rows];

    // Obtenemos los proveedores en una consulta independiente.
    const rucs = [...new Set(filas.map((fila) => fila.rucCed).filter(Boolean))];
    const proveedores = new Map();

    if (rucs.length) {
      const inicioProveedores = Date.now();
      const resultProveedores = await pool.query(
        `SELECT ruccedpro, nomprovee FROM proveedores WHERE ruccedpro = ANY($1::text[])`,
        [rucs]
      );

      for (const proveedor of resultProveedores.rows) {
        proveedores.set(String(proveedor.ruccedpro), proveedor.nomprovee);
      }

      console.log(`[COMPRAS] proveedores: ${resultProveedores.rows.length} encontrados en ${Date.now() - inicioProveedores} ms`);
    }

    for (const fila of filas) {
      fila.proveedor = proveedores.get(String(fila.rucCed)) || 'PROVEEDOR NO REGISTRADO';
    }

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
