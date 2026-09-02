const pool = require('../database/postgres');

async function probar(nombre, text) {
  const inicio = Date.now();
  const client = await pool.connect();
  let liberado = false;

  try {
    await client.query("SET statement_timeout = '3000ms'");
    const result = await client.query({ text, query_timeout: 4000 });
    return {
      nombre,
      ok: true,
      ms: Date.now() - inicio,
      filas: result.rowCount,
      resultado: result.rows.slice(0, 5),
    };
  } catch (error) {
    client.release(error);
    liberado = true;
    return {
      nombre,
      ok: false,
      ms: Date.now() - inicio,
      error: error.message,
    };
  } finally {
    if (!liberado) client.release();
  }
}

async function compras(req, res) {
  const inicioConsulta = Date.now();

  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = req.query.inicio || hoy;
    const fin = req.query.fin || hoy;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD.' });
    }

    if (inicio > fin) {
      return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor que la fecha de fin.' });
    }

    const rango = `feccompra >= DATE '${inicio}' AND feccompra <= DATE '${fin}'`;

    // Las columnas de texto/fecha ya funcionan. Ahora aislamos cada campo numeric.
    const pruebas = [
      probar('solo_totsiniva', `SELECT totsiniva FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_totconiva', `SELECT totconiva FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_totcompra', `SELECT totcompra FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_subtotcom', `SELECT subtotcom FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_valdescom', `SELECT valdescom FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_valivacom', `SELECT valivacom FROM compras WHERE ${rango} LIMIT 20`),
      probar('todos_importes', `SELECT totsiniva, totconiva, totcompra, subtotcom, valdescom, valivacom FROM compras WHERE ${rango} LIMIT 20`),
      probar('basicos_importes', `SELECT numfaccom, ruccedpro, feccompra, numautori, totsiniva, totconiva, totcompra FROM compras WHERE ${rango} LIMIT 20`),
    ];

    const resultados = [];
    for (const prueba of pruebas) {
      resultados.push(await prueba);
    }

    return res.json({
      diagnostico: true,
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      pruebas: resultados,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error durante el diagnóstico de compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  }
}

module.exports = { compras };
