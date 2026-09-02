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

    // El COUNT del rango ya funciona. Ahora probamos cada columna por separado
    // para encontrar cuál provoca el timeout al devolver las filas.
    const pruebas = [
      probar('solo_numfaccom', `SELECT numfaccom FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_ruccedpro', `SELECT ruccedpro FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_feccompra', `SELECT feccompra FROM compras WHERE ${rango} LIMIT 20`),
      probar('solo_numautori', `SELECT numautori FROM compras WHERE ${rango} LIMIT 20`),
      probar('numero_y_fecha', `SELECT numfaccom, feccompra FROM compras WHERE ${rango} LIMIT 20`),
      probar('numero_ruc_fecha', `SELECT numfaccom, ruccedpro, feccompra FROM compras WHERE ${rango} LIMIT 20`),
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
