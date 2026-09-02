const pool = require('../database/postgres');

async function database(req, res) {
  try {
    const result = await pool.query(
      'SELECT version(), current_database(), current_user, now() AS server_time'
    );
    const row = result.rows[0];

    return res.json({
      connected: true,
      database: row.current_database,
      user: row.current_user,
      serverTime: row.server_time,
      version: row.version,
    });
  } catch (error) {
    console.error('Database connection error:', error.message);
    return res.status(500).json({ connected: false, error: error.message });
  }
}

async function health(req, res) {
  try {
    await pool.query('SELECT 1');
    return res.json({ api: 'ok', database: 'ok' });
  } catch (error) {
    return res.status(503).json({ api: 'ok', database: 'error' });
  }
}

async function poolStatus(req, res) {
  return res.json({
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
}

async function comprasDiagnostico(req, res) {
  const resultados = {};

  async function probar(nombre, text) {
    const inicio = Date.now();
    try {
      const result = await pool.query({
        text,
        statement_timeout: 5000,
      });
      resultados[nombre] = {
        ok: true,
        filas: result.rows.length,
        tiempoMs: Date.now() - inicio,
        datos: result.rows[0],
      };
    } catch (error) {
      resultados[nombre] = {
        ok: false,
        tiempoMs: Date.now() - inicio,
        error: error.message,
        code: error.code,
      };
    }
  }

  try {
    await probar('compras', `
      SELECT COUNT(*)::int AS total
      FROM compras
      WHERE feccompra::date BETWEEN '2026-08-31' AND '2026-09-02'
    `);

    await probar('comprasnv', `
      SELECT COUNT(*)::int AS total
      FROM comprasnv
      WHERE feccompra::date BETWEEN '2026-08-31' AND '2026-09-02'
    `);

    await probar('proveedores', `
      SELECT COUNT(*)::int AS total
      FROM proveedores
    `);

    await probar('consulta_completa', `
      SELECT
        c.numfaccom AS numero,
        c.ruccedpro AS ruc_ced,
        p.nomprovee AS proveedor,
        c.feccompra AS fecha,
        c.numautori AS autorizacion,
        c.totsiniva AS subtotal_sin_iva,
        c.totconiva AS subtotal_con_iva,
        c.totcompra AS total
      FROM compras c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra::date BETWEEN '2026-08-31' AND '2026-09-02'

      UNION ALL

      SELECT
        c.numfaccom AS numero,
        c.ruccedpro AS ruc_ced,
        p.nomprovee AS proveedor,
        c.feccompra AS fecha,
        c.numautori AS autorizacion,
        c.totsiniva AS subtotal_sin_iva,
        c.totconiva AS subtotal_con_iva,
        c.totcompra AS total
      FROM comprasnv c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra::date BETWEEN '2026-08-31' AND '2026-09-02'

      ORDER BY fecha DESC NULLS LAST, numero DESC
    `);

    return res.json({ ok: true, resultados });
  } catch (error) {
    console.error('Error en diagnóstico de compras:', error);
    return res.status(500).json({ ok: false, error: error.message, resultados });
  }
}

module.exports = { database, health, poolStatus, comprasDiagnostico };
