const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT
        c.numfaccom AS "numero",
        p.ruccedpro AS "rucCed",
        p.nomprovee AS "proveedor",
        c.numautori AS "autorizacion",
        c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
        COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva",
        COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      LEFT JOIN proveedores p
        ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date

      UNION ALL

      SELECT
        c.numfaccom AS "numero",
        p.ruccedpro AS "rucCed",
        p.nomprovee AS "proveedor",
        c.numautori AS "autorizacion",
        c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
        COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva",
        COALESCE(c.totcompra, 0)::text AS "total"
      FROM comprasnv c
      LEFT JOIN proveedores p
        ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date

      ORDER BY "fecha" DESC, "numero" DESC
    `, [inicio, fin]);

    return res.json({
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      total: result.rows.length,
      compras: result.rows,
    });
  } catch (error) {
    console.error('[COMPRAS] Error consultando compras:', error);
    return res.status(500).json({
      error: 'Error consultando compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente:', error.message);
      }
    }
  }
}

async function proveedoresTest(req, res) {
  const inicioConsulta = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  console.log('[PROVEEDORES-TEST] INICIO JSON', { limit, offset });

  try {
    const result = await pool.query({
      text: `
        SELECT COALESCE(json_agg(t), '[]'::json) AS proveedores
        FROM (
          SELECT
            ruccedpro AS "rucCed",
            nomprovee AS "proveedor"
          FROM proveedores
          ORDER BY ruccedpro
          LIMIT $1 OFFSET $2
        ) t
      `,
      values: [limit, offset],
    });

    const proveedores = result.rows[0].proveedores || [];

    console.log('[PROVEEDORES-TEST] TERMINADO JSON', {
      filas: proveedores.length,
      limit,
      offset,
      tiempoMs: Date.now() - inicioConsulta,
    });

    return res.json({
      tiempoMs: Date.now() - inicioConsulta,
      limit,
      offset,
      total: proveedores.length,
      proveedores,
    });
  } catch (error) {
    console.error('[PROVEEDORES-TEST] ERROR JSON', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta,
    });

    return res.status(500).json({
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta,
    });
  }
}

async function conexionTest(req, res) {
  const inicio = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();

    const antesConnect = Date.now();
    await client.connect();
    const connectMs = Date.now() - antesConnect;

    const antesQuery = Date.now();
    const result = await client.query('SELECT 1 AS ok');
    const queryMs = Date.now() - antesQuery;

    const antesEnd = Date.now();
    await client.end();
    client = null;
    const endMs = Date.now() - antesEnd;

    return res.json({
      ok: true,
      resultado: result.rows[0],
      connectMs,
      queryMs,
      endMs,
      totalMs: Date.now() - inicio,
    });
  } catch (error) {
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      totalMs: Date.now() - inicio,
    });
  }
}

async function proveedoresRucTest(req, res) {
  const inicio = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

  console.log('[PROVEEDORES-RUC-TEST] INICIO', { limit });

  try {
    const result = await pool.query({
      text: `
        SELECT ruccedpro
        FROM proveedores
        ORDER BY ruccedpro
        LIMIT $1
      `,
      values: [limit],
    });

    console.log('[PROVEEDORES-RUC-TEST] TERMINADO', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicio,
    });

    return res.json({
      ok: true,
      total: result.rows.length,
      tiempoMs: Date.now() - inicio,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-RUC-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
      proveedores: [],
    });
  }
}

async function proveedoresRucSinOrderTest(req, res) {
  const inicio = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

  console.log('[PROVEEDORES-RUC-SIN-ORDER-TEST] INICIO', { limit });

  try {
    const result = await pool.query({
      text: `
        SELECT ruccedpro
        FROM proveedores
        LIMIT $1
      `,
      values: [limit],
    });

    console.log('[PROVEEDORES-RUC-SIN-ORDER-TEST] TERMINADO', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicio,
    });

    return res.json({
      ok: true,
      total: result.rows.length,
      tiempoMs: Date.now() - inicio,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-RUC-SIN-ORDER-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
      proveedores: [],
    });
  }
}

async function proveedoresRucCastTest(req, res) {
  const inicio = Date.now();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

  console.log('[PROVEEDORES-RUC-CAST-TEST] INICIO', { limit });

  try {
    const result = await pool.query({
      text: `
        SELECT ruccedpro
        FROM proveedores
        ORDER BY ruccedpro::text
        LIMIT $1
      `,
      values: [limit],
    });

    console.log('[PROVEEDORES-RUC-CAST-TEST] TERMINADO', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicio,
    });

    return res.json({
      ok: true,
      total: result.rows.length,
      tiempoMs: Date.now() - inicio,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-RUC-CAST-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
      proveedores: [],
    });
  }
}

async function proveedoresRucFijoTest(req, res) {
  const inicio = Date.now();

  console.log('[PROVEEDORES-RUC-FIJO-TEST] INICIO');

  try {
    const result = await pool.query(`
      SELECT ruccedpro
      FROM proveedores
      ORDER BY ruccedpro
      LIMIT 20
    `);

    console.log('[PROVEEDORES-RUC-FIJO-TEST] TERMINADO', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicio,
    });

    return res.json({
      ok: true,
      total: result.rows.length,
      tiempoMs: Date.now() - inicio,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-RUC-FIJO-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
      proveedores: [],
    });
  }
}

async function proveedoresNomproveeTest(req, res) {
  const inicio = Date.now();

  console.log('[PROVEEDORES-NOMPROVEE-TEST] INICIO');

  try {
    const result = await pool.query(`
      SELECT ruccedpro, nomprovee
      FROM proveedores
      LIMIT 20
    `);

    console.log('[PROVEEDORES-NOMPROVEE-TEST] TERMINADO', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicio,
    });

    return res.json({
      ok: true,
      total: result.rows.length,
      tiempoMs: Date.now() - inicio,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-NOMPROVEE-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicio,
      proveedores: [],
    });
  }
}

async function poolStatusTest(req, res) {
  return res.json({
    ok: true,
    pool: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
  });
}

async function poolSelectTest(req, res) {
  const inicio = Date.now();
  const resultados = [];

  try {
    for (let i = 1; i <= 5; i += 1) {
      const antes = Date.now();
      const result = await pool.query('SELECT 1 AS ok');
      resultados.push({
        prueba: i,
        ok: result.rows[0].ok,
        tiempoMs: Date.now() - antes,
      });
    }

    return res.json({
      ok: true,
      resultados,
      totalMs: Date.now() - inicio,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      resultados,
      totalMs: Date.now() - inicio,
    });
  }
}

module.exports = { compras, proveedoresTest, conexionTest, proveedoresRucTest, proveedoresRucSinOrderTest, proveedoresRucCastTest, proveedoresRucFijoTest, proveedoresNomproveeTest, poolStatusTest, poolSelectTest };
