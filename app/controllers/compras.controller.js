const pool = require('../database/postgres');

async function probar(nombre, text, values = []) {
  const inicio = Date.now();
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '3000ms'");
    const result = await client.query({ text, values, query_timeout: 4000 });
    return {
      nombre,
      ok: true,
      ms: Date.now() - inicio,
      filas: result.rowCount,
      resultado: result.rows.slice(0, 3),
    };
  } catch (error) {
    client.release(error);
    return {
      nombre,
      ok: false,
      ms: Date.now() - inicio,
      error: error.message,
    };
  } finally {
    if (!client.released) client.release();
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

    // Diagnóstico temporal: comprobamos exactamente qué operación sobre compras
    // está demorando en la conexión de Railway.
    const pruebas = [
      probar('conexion', `SELECT current_database() AS database, current_schema() AS schema, current_user AS usuario`),
      probar('countCompras', `SELECT COUNT(*)::integer AS total FROM compras`),
      probar('primeraCompra', `SELECT numfaccom, ruccedpro, feccompra, numautori FROM compras LIMIT 1`),
      probar('fechaMinMax', `SELECT MIN(feccompra) AS minimo, MAX(feccompra) AS maximo FROM compras`),
      probar('countRango', `SELECT COUNT(*)::integer AS total FROM compras WHERE feccompra >= DATE '${inicio}' AND feccompra <= DATE '${fin}'`),
      probar('comprasRango', `SELECT numfaccom, ruccedpro, feccompra, numautori FROM compras WHERE feccompra >= DATE '${inicio}' AND feccompra <= DATE '${fin}' LIMIT 20`),
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
