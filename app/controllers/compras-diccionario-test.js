const pool = require('../database/postgres');

async function comprasDiccionarioTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    const inicioConnect = Date.now();
    await client.connect();
    const connectMs = Date.now() - inicioConnect;

    const inicioCompras = Date.now();
    const comprasResult = await client.query(`
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed", c.numautori AS "autorizacion", c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva", COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva", COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date
      UNION ALL
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed", c.numautori AS "autorizacion", c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva", COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva", COALESCE(c.totcompra, 0)::text AS "total"
      FROM comprasnv c
      WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date
      ORDER BY "fecha" DESC, "numero" DESC
    `, [inicio, fin]);
    const comprasMs = Date.now() - inicioCompras;

    const rucs = [...new Set(comprasResult.rows.map(row => row.rucCed).filter(Boolean))];

    const inicioProveedores = Date.now();
    let proveedoresResult = { rows: [] };
    if (rucs.length > 0) {
      proveedoresResult = await client.query(`
        SELECT p.ruccedpro AS "rucCed", p.nomprovee AS "proveedor"
        FROM proveedores p
        WHERE p.ruccedpro = ANY($1)
      `, [rucs]);
    }
    const proveedoresMs = Date.now() - inicioProveedores;

    const inicioMapeo = Date.now();
    const diccionario = new Map(proveedoresResult.rows.map(row => [String(row.rucCed), row.proveedor]));
    const compras = comprasResult.rows.map(row => ({
      ...row,
      proveedor: diccionario.get(String(row.rucCed)) || ''
    }));
    const mapeoMs = Date.now() - inicioMapeo;

    const inicioEnd = Date.now();
    await client.end();
    client = null;
    const endMs = Date.now() - inicioEnd;

    return res.json({
      ok: true,
      inicio,
      fin,
      total: compras.length,
      proveedoresEncontrados: proveedoresResult.rows.length,
      rucsUnicos: rucs.length,
      connectMs,
      comprasMs,
      proveedoresMs,
      mapeoMs,
      endMs,
      tiempoMs: Date.now() - inicioTotal,
      compras
    });
  } catch (error) {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioTotal
    });
  }
}

module.exports = { comprasDiccionarioTest };
