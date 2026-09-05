const pool = require('../database/postgres');

async function comprasDiccionarioTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    console.log(`[COMPRAS-DICCIONARIO] INICIO ${inicio} -> ${fin}`);

    client = pool.createDedicatedClient();
    await client.connect();
    console.log('[COMPRAS-DICCIONARIO] PostgreSQL conectado');

    await client.query('SET statement_timeout = 15000');
    console.log('[COMPRAS-DICCIONARIO] statement_timeout=15000');

    const inicioCompras = Date.now();
    console.log('[COMPRAS-DICCIONARIO] TEST 1: compras SOLA');
    const comprasResult = await client.query(`
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed", c.numautori AS "autorizacion", c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva", COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva", COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date
      ORDER BY c.feccompra DESC, c.numfaccom DESC
    `, [inicio, fin]);
    const comprasMs = Date.now() - inicioCompras;
    console.log(`[COMPRAS-DICCIONARIO] TEST 1 OK: ${comprasResult.rows.length} filas en ${comprasMs} ms`);

    const inicioComprasNv = Date.now();
    console.log('[COMPRAS-DICCIONARIO] TEST 2: comprasnv SOLA');
    const comprasNvResult = await client.query(`
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed", c.numautori AS "autorizacion", c.feccompra AS "fecha",
        COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva", COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(c.valivacom, 0)::text AS "iva", COALESCE(c.totcompra, 0)::text AS "total"
      FROM comprasnv c
      WHERE c.feccompra >= $1::date AND c.feccompra <= $2::date
      ORDER BY c.feccompra DESC, c.numfaccom DESC
    `, [inicio, fin]);
    const comprasNvMs = Date.now() - inicioComprasNv;
    console.log(`[COMPRAS-DICCIONARIO] TEST 2 OK: ${comprasNvResult.rows.length} filas en ${comprasNvMs} ms`);

    const rucs = [...new Set(
      [...comprasResult.rows, ...comprasNvResult.rows]
        .map(row => row.rucCed)
        .filter(Boolean)
    )];
    console.log(`[COMPRAS-DICCIONARIO] TEST 3: ${rucs.length} RUC únicos`);

    return res.json({
      ok: true,
      inicio,
      fin,
      compras: comprasResult.rows.length,
      comprasnv: comprasNvResult.rows.length,
      rucsUnicos: rucs.length,
      comprasMs,
      comprasNvMs,
      tiempoMs: Date.now() - inicioTotal
    });
  } catch (error) {
    console.error(`[COMPRAS-DICCIONARIO] ERROR después de ${Date.now() - inicioTotal} ms:`, error.message, error.code || '');
    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioTotal
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

async function comprasConexionTest(req, res) {
  const inicioTotal = Date.now();
  let client;
  const resultados = [];

  try {
    console.log('[COMPRAS-CONEXION] INICIO');

    client = pool.createDedicatedClient();
    const inicioConnect = Date.now();
    await client.connect();
    const connectMs = Date.now() - inicioConnect;
    console.log(`[COMPRAS-CONEXION] CONNECT OK en ${connectMs} ms`);

    await client.query('SET statement_timeout = 15000');

    for (let i = 1; i <= 5; i++) {
      const inicio = Date.now();
      console.log(`[COMPRAS-CONEXION] SELECT 1 #${i}...`);
      const result = await client.query('SELECT 1 AS ok');
      const tiempoMs = Date.now() - inicio;
      resultados.push({ prueba: i, tiempoMs, valor: result.rows[0].ok });
      console.log(`[COMPRAS-CONEXION] SELECT 1 #${i} OK en ${tiempoMs} ms`);
    }

    const tiempoMs = Date.now() - inicioTotal;
    console.log(`[COMPRAS-CONEXION] FIN OK en ${tiempoMs} ms`);

    return res.json({
      ok: true,
      connectMs,
      resultados,
      tiempoMs
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioTotal;
    console.error(`[COMPRAS-CONEXION] ERROR después de ${tiempoMs} ms:`, error.message, error.code || '');
    return res.status(500).json({
      ok: false,
      error: error.message,
      codigo: error.code,
      resultados,
      tiempoMs
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = { comprasDiccionarioTest, comprasConexionTest };
