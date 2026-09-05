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
  const inicioTotal = Date.now();
  let client;
  let inicioConnect;
  let finConnect;
  let inicioQuery;
  let finQuery;
  let inicioEnd;
  let finEnd;

  console.log('[CONEXION-TEST] INICIO');

  try {
    client = pool.createDedicatedClient();

    inicioConnect = Date.now();
    console.log('[CONEXION-TEST] ANTES DE CONNECT');
    await client.connect();
    finConnect = Date.now();
    console.log('[CONEXION-TEST] CONNECT TERMINADO', finConnect - inicioConnect, 'ms');

    inicioQuery = Date.now();
    console.log('[CONEXION-TEST] ANTES DE SELECT 1');
    const result = await client.query('SELECT 1 AS ok');
    finQuery = Date.now();
    console.log('[CONEXION-TEST] SELECT 1 TERMINADO', finQuery - inicioQuery, 'ms');

    inicioEnd = Date.now();
    await client.end();
    finEnd = Date.now();
    client = null;
    console.log('[CONEXION-TEST] END TERMINADO', finEnd - inicioEnd, 'ms');

    return res.json({
      ok: true,
      resultado: result.rows[0],
      connectMs: finConnect - inicioConnect,
      queryMs: finQuery - inicioQuery,
      endMs: finEnd - inicioEnd,
      totalMs: Date.now() - inicioTotal,
    });
  } catch (error) {
    console.error('[CONEXION-TEST] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      connectMs: inicioConnect && finConnect ? finConnect - inicioConnect : null,
      queryMs: inicioQuery && finQuery ? finQuery - inicioQuery : null,
      totalMs: Date.now() - inicioTotal,
    });

    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      connectMs: inicioConnect && finConnect ? finConnect - inicioConnect : null,
      queryMs: inicioQuery && finQuery ? finQuery - inicioQuery : null,
      totalMs: Date.now() - inicioTotal,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[CONEXION-TEST] ERROR CERRANDO CLIENTE', error.message);
      }
    }
  }
}

module.exports = { compras, proveedoresTest, conexionTest };
