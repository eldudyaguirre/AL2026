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

  console.log('[PROVEEDORES-TEST] INICIO', { limit, offset });

  try {
    const result = await pool.query({
      text: `
        SELECT
          ruccedpro AS "rucCed",
          nomprovee AS "proveedor"
        FROM proveedores
        ORDER BY ruccedpro
        LIMIT $1 OFFSET $2
      `,
      values: [limit, offset],
    });

    console.log('[PROVEEDORES-TEST] TERMINADO', {
      filas: result.rows.length,
      limit,
      offset,
      tiempoMs: Date.now() - inicioConsulta,
    });

    return res.json({
      tiempoMs: Date.now() - inicioConsulta,
      limit,
      offset,
      total: result.rows.length,
      proveedores: result.rows,
    });
  } catch (error) {
    console.error('[PROVEEDORES-TEST] ERROR', {
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

module.exports = { compras, proveedoresTest };
