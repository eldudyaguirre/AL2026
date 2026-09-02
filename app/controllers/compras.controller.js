const pool = require('../database/postgres');

async function diagnosticoCompras(inicio, fin) {
  const pruebas = [
    ['countRango', 'SELECT COUNT(*)::integer AS total FROM compras WHERE feccompra BETWEEN $1::date AND $2::date'],
    ['unoRango', 'SELECT numfaccom, feccompra FROM compras WHERE feccompra BETWEEN $1::date AND $2::date LIMIT 1'],
    ['columnasRango', `SELECT numfaccom AS numero, ruccedpro AS "rucCed", feccompra AS fecha, numautori AS autorizacion, totsiniva AS "subtotalSinIva", totconiva AS "subtotalConIva", totcompra AS total FROM compras WHERE feccompra BETWEEN $1::date AND $2::date LIMIT 20`],
    ['todoSinFiltro', `SELECT numfaccom AS numero, ruccedpro AS "rucCed", feccompra AS fecha, numautori AS autorizacion, totsiniva AS "subtotalSinIva", totconiva AS "subtotalConIva", totcompra AS total FROM compras LIMIT 20`],
  ];

  const diagnostico = {};
  for (const [nombre, sql] of pruebas) {
    const inicioPrueba = Date.now();
    try {
      const result = await pool.query({ text: sql, values: [inicio, fin], query_timeout: 3000 });
      diagnostico[nombre] = {
        ok: true,
        ms: Date.now() - inicioPrueba,
        filas: result.rowCount,
        resultado: result.rows[0] || null,
      };
    } catch (error) {
      diagnostico[nombre] = {
        ok: false,
        ms: Date.now() - inicioPrueba,
        error: error.message,
      };
    }
  }

  return diagnostico;
}

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let etapa = 'inicio';

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

    etapa = 'SELECT compras';
    const inicioCompras = Date.now();
    const resultCompras = await pool.query(
      `SELECT
        numfaccom AS numero,
        ruccedpro AS "rucCed",
        feccompra AS fecha,
        numautori AS autorizacion,
        totsiniva AS "subtotalSinIva",
        totconiva AS "subtotalConIva",
        totcompra AS total,
        'compras' AS origen
       FROM compras
       WHERE feccompra BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    );
    console.log(`[COMPRAS] tabla compras: ${resultCompras.rows.length} registros en ${Date.now() - inicioCompras} ms`);

    etapa = 'SELECT comprasnv';
    const inicioComprasNv = Date.now();
    const resultComprasNv = await pool.query(
      `SELECT
        numfaccom AS numero,
        ruccedpro AS "rucCed",
        feccompra AS fecha,
        numautori AS autorizacion,
        totsiniva AS "subtotalSinIva",
        totconiva AS "subtotalConIva",
        totcompra AS total,
        'comprasnv' AS origen
       FROM comprasnv
       WHERE feccompra BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    );
    console.log(`[COMPRAS] tabla comprasnv: ${resultComprasNv.rows.length} registros en ${Date.now() - inicioComprasNv} ms`);

    etapa = 'SELECT proveedores';
    const inicioProveedores = Date.now();
    const resultProveedores = await pool.query(
      `SELECT ruccedpro, nomprovee FROM proveedores`
    );
    console.log(`[COMPRAS] proveedores: ${resultProveedores.rows.length} registros en ${Date.now() - inicioProveedores} ms`);

    const proveedores = new Map(
      resultProveedores.rows.map(p => [String(p.ruccedpro), p.nomprovee])
    );

    const filas = [...resultCompras.rows, ...resultComprasNv.rows].map(fila => ({
      ...fila,
      proveedor: proveedores.get(String(fila.rucCed)) || 'PROVEEDOR NO REGISTRADO',
    }));

    filas.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (fechaB !== fechaA) return fechaB - fechaA;
      return String(b.numero || '').localeCompare(String(a.numero || ''));
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] Consulta completada: ${filas.length} registros en ${tiempoMs} ms`);

    return res.json({ inicio, fin, total: filas.length, compras: filas });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error en ${etapa} después de ${tiempoMs} ms:`, error.message);
    console.error('[COMPRAS] Pool:', { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });

    const diagnostico = etapa === 'SELECT compras' && error.message === 'Query read timeout'
      ? await diagnosticoCompras(req.query.inicio || null, req.query.fin || null)
      : null;

    return res.status(500).json({ error: 'No se pudieron consultar las compras.', detail: error.message, etapa, tiempoMs, diagnostico });
  }
}

module.exports = { compras };
