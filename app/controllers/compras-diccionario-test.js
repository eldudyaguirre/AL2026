const pool = require('../database/postgres');

async function comprasDiccionarioTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';
    console.log(`[COMPRAS-DICCIONARIO] INICIO ${inicio} -> ${fin}`);

    client = pool.createDedicatedClient();
    const inicioConnect = Date.now();
    console.log('[COMPRAS-DICCIONARIO] Conectando PostgreSQL...');
    await client.connect();
    const connectMs = Date.now() - inicioConnect;
    console.log(`[COMPRAS-DICCIONARIO] PostgreSQL conectado en ${connectMs} ms`);

    console.log('[COMPRAS-DICCIONARIO] Configurando statement_timeout=15000 ms...');
    await client.query('SET statement_timeout = 15000');
    console.log('[COMPRAS-DICCIONARIO] statement_timeout configurado');

    const inicioCompras = Date.now();
    console.log('[COMPRAS-DICCIONARIO] PASO 1: consultando compras/comprasnv...');
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
    console.log(`[COMPRAS-DICCIONARIO] PASO 1 OK: ${comprasResult.rows.length} compras en ${comprasMs} ms`);

    const rucs = [...new Set(comprasResult.rows.map(row => row.rucCed).filter(Boolean))];
    console.log(`[COMPRAS-DICCIONARIO] RUC únicos: ${rucs.length}`);

    const inicioProveedores = Date.now();
    let proveedoresResult = { rows: [] };
    if (rucs.length > 0) {
      console.log('[COMPRAS-DICCIONARIO] PASO 2: consultando proveedores por RUC...');
      proveedoresResult = await client.query(`
        SELECT p.ruccedpro AS "rucCed", p.nomprovee AS "proveedor"
        FROM proveedores p
        WHERE p.ruccedpro = ANY($1)
      `, [rucs]);
      console.log(`[COMPRAS-DICCIONARIO] PASO 2 OK: ${proveedoresResult.rows.length} proveedores`);
    }
    const proveedoresMs = Date.now() - inicioProveedores;

    const inicioMapeo = Date.now();
    console.log('[COMPRAS-DICCIONARIO] PASO 3: construyendo diccionario y mapeando...');
    const diccionario = new Map(proveedoresResult.rows.map(row => [String(row.rucCed), row.proveedor]));
    const compras = comprasResult.rows.map(row => ({
      ...row,
      proveedor: diccionario.get(String(row.rucCed)) || ''
    }));
    const mapeoMs = Date.now() - inicioMapeo;
    console.log(`[COMPRAS-DICCIONARIO] PASO 3 OK en ${mapeoMs} ms`);

    const inicioEnd = Date.now();
    console.log('[COMPRAS-DICCIONARIO] Cerrando conexión...');
    await client.end();
    client = null;
    const endMs = Date.now() - inicioEnd;
    console.log(`[COMPRAS-DICCIONARIO] FIN OK en ${Date.now() - inicioTotal} ms`);

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
    console.error(`[COMPRAS-DICCIONARIO] ERROR después de ${Date.now() - inicioTotal} ms:`, error.message, error.code || '');
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
