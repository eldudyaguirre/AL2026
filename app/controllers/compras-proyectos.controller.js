const pool = require('../database/postgres');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

async function resumenGastosPorProyecto(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;

    if (!fechaValida(inicio) || !fechaValida(fin)) {
      return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    }

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const sql = `
      SELECT proyecto, COUNT(*)::int AS movimientos,
             COALESCE(SUM(gasto), 0)::numeric AS gasto
      FROM (
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto,
               COALESCE(C.totsiniva, 0) + COALESCE(C.totconiva, 0) AS gasto
        FROM compras C
        WHERE C.estproces <> 'ANULADA'
          AND C.feccompra >= DATE '${inicio}'
          AND C.feccompra <= DATE '${fin}'
        UNION ALL
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto,
               COALESCE(C.totsiniva, 0) + COALESCE(C.totconiva, 0) AS gasto
        FROM comprasnv C
        WHERE C.estproces <> 'ANULADA'
          AND C.feccompra >= DATE '${inicio}'
          AND C.feccompra <= DATE '${fin}'
        UNION ALL
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto,
               COALESCE(C.subtotcom, 0) AS gasto
        FROM comprasod C
        WHERE C.estproces <> 'ANULADA'
          AND C.feccompra >= DATE '${inicio}'
          AND C.feccompra <= DATE '${fin}'
      ) X
      WHERE proyecto IS NOT NULL
      GROUP BY proyecto
      ORDER BY gasto DESC, proyecto
    `;

    const result = await client.query(sql);
    return res.json({ inicio, fin, totalProyectos: result.rows.length, tiempoMs: Date.now() - inicioConsulta, proyectos: result.rows });
  } catch (error) {
    console.error('[COMPRAS-PROYECTOS] Error consultando gastos por proyecto:', error);
    return res.status(500).json({ error: 'Error consultando gastos por proyecto.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[COMPRAS-PROYECTOS] Error cerrando cliente:', error.message); }
    }
  }
}

async function reporteDetallePorArea(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    const area = String(req.query.area || '').trim();

    if (!fechaValida(inicio) || !fechaValida(fin)) {
      return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    }

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const sql = `
      SELECT * FROM (
        SELECT C.feccompra AS fecha, C.ruccedpro AS "rucCed", COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO') AS nombre,
               C.numfaccom AS "numero", C.tipdocume AS "tipoDoc", COALESCE(C.totsiniva,0)::numeric AS "totSinIva",
               COALESCE(C.totconiva,0)::numeric AS "totConIva", COALESCE(C.valivacom,0)::numeric AS iva,
               COALESCE(C.totcompra,0)::numeric AS total, TRIM(C.proyecto) AS area, 'COMPRA' AS origen
        FROM compras C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        UNION ALL
        SELECT C.feccompra, C.ruccedpro, COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO'), C.numfaccom, C.tipdocume,
               COALESCE(C.totsiniva,0)::numeric, COALESCE(C.totconiva,0)::numeric, COALESCE(C.valivacom,0)::numeric,
               COALESCE(C.totcompra,0)::numeric, TRIM(C.proyecto), 'NV'
        FROM comprasnv C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        UNION ALL
        SELECT C.feccompra, C.ruccedpro, COALESCE(D.desiteinv,'SIN REFERENCIA'), C.numfaccom, 'OD',
               COALESCE(C.subtotcom,0)::numeric, 0::numeric, 0::numeric, COALESCE(C.totcompra,0)::numeric,
               TRIM(C.proyecto), 'OD'
        FROM comprasod C LEFT JOIN detallecomprasod D ON D.numcompra=C.numcompra
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
      ) X
      WHERE NULLIF(TRIM(area),'') IS NOT NULL
        AND ($3 = '' OR LOWER(TRIM(area)) = LOWER($3))
      ORDER BY area, fecha, numero
    `;

    const result = await client.query(sql, [inicio, fin, area]);
    const totales = result.rows.reduce((a, r) => {
      a.sinIva += Number(r.totSinIva || 0); a.conIva += Number(r.totConIva || 0);
      a.iva += Number(r.iva || 0); a.total += Number(r.total || 0); return a;
    }, { sinIva: 0, conIva: 0, iva: 0, total: 0 });

    return res.json({ inicio, fin, area: area || 'TODAS', total: result.rows.length, totales, compras: result.rows });
  } catch (error) {
    console.error('[COMPRAS-REPORTE-AREA] Error consultando detalle:', error);
    return res.status(500).json({ error: 'Error consultando el reporte por áreas.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[COMPRAS-REPORTE-AREA] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { resumenGastosPorProyecto, reporteDetallePorArea };
