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
    return res.json({
      inicio,
      fin,
      totalProyectos: result.rows.length,
      tiempoMs: Date.now() - inicioConsulta,
      proyectos: result.rows
    });
  } catch (error) {
    console.error('[COMPRAS-PROYECTOS] Error consultando gastos por proyecto:', error);
    return res.status(500).json({
      error: 'Error consultando gastos por proyecto.',
      detail: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[COMPRAS-PROYECTOS] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { resumenGastosPorProyecto };
