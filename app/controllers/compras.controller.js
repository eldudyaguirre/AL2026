const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  console.log('[COMPRAS] INICIO', new Date().toISOString());

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    console.log('[COMPRAS] ANTES DE QUERY', { inicio, fin });

    const result = await pool.query(`
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

    console.log('[COMPRAS] QUERY TERMINADA', {
      filas: result.rows.length,
      tiempoMs: Date.now() - inicioConsulta,
    });

    const respuesta = {
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      total: result.rows.length,
      compras: result.rows,
    };

    console.log('[COMPRAS] RESPUESTA PREPARADA', {
      total: respuesta.total,
      tiempoMs: Date.now() - inicioConsulta,
    });

    return res.json(respuesta);
  } catch (error) {
    console.error('[COMPRAS] ERROR', {
      mensaje: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta,
    });
    return res.status(500).json({
      error: 'Error consultando compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  }
}

module.exports = { compras };
