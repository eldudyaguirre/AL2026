const pool = require('../database/postgres');

async function diagnosticarBloqueos() {
  try {
    const result = await pool.query(`
      SELECT
        a.pid,
        a.state,
        a.wait_event_type AS "waitEventType",
        a.wait_event AS "waitEvent",
        l.mode,
        l.granted,
        a.query,
        EXTRACT(EPOCH FROM (clock_timestamp() - a.query_start))::integer AS "duracionSegundos"
      FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE c.relname IN ('compras', 'comprasnv', 'proveedores')
      ORDER BY l.granted, a.query_start NULLS LAST
    `);
    return result.rows;
  } catch (error) {
    console.error('[COMPRAS] No se pudo diagnosticar bloqueos:', error.message);
    return [];
  }
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

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error en ${etapa} después de ${tiempoMs} ms:`, error.message);
    console.error('[COMPRAS] Pool:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    });

    const bloqueos = error.message === 'Query read timeout' ? await diagnosticarBloqueos() : [];

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      etapa,
      tiempoMs,
      bloqueos,
    });
  }
}

module.exports = { compras };
