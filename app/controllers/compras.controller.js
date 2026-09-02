const pool = require('../database/postgres');

async function ejecutarPrueba(client, nombre, text, values) {
  const inicio = Date.now();
  try {
    const result = await client.query({ text, values });
    return {
      nombre,
      ok: true,
      ms: Date.now() - inicio,
      filas: result.rows.length,
      resultado: result.rows.slice(0, 5),
    };
  } catch (error) {
    return {
      nombre,
      ok: false,
      ms: Date.now() - inicio,
      error: error.message,
    };
  }
}

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    const pruebas = [];

    pruebas.push(await ejecutarPrueba(client, '1_count', `
      SELECT COUNT(*) AS total
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
        AND (estproces IS NULL OR UPPER(TRIM(estproces)) <> 'ANULADA')
    `, [inicio, fin]));

    pruebas.push(await ejecutarPrueba(client, '2_length_numautori', `
      SELECT numfaccom AS numero, LENGTH(numautori) AS longitud
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
        AND (estproces IS NULL OR UPPER(TRIM(estproces)) <> 'ANULADA')
    `, [inicio, fin]));

    pruebas.push(await ejecutarPrueba(client, '3_left_numautori', `
      SELECT numfaccom AS numero, LEFT(numautori, 10) AS autorizacion_parcial
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
        AND (estproces IS NULL OR UPPER(TRIM(estproces)) <> 'ANULADA')
    `, [inicio, fin]));

    pruebas.push(await ejecutarPrueba(client, '4_numautori_texto', `
      SELECT numfaccom AS numero, numautori::text AS autorizacion
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
        AND (estproces IS NULL OR UPPER(TRIM(estproces)) <> 'ANULADA')
    `, [inicio, fin]));

    pruebas.push(await ejecutarPrueba(client, '5_numautori_completo', `
      SELECT numfaccom AS numero, numautori AS autorizacion
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
        AND (estproces IS NULL OR UPPER(TRIM(estproces)) <> 'ANULADA')
    `, [inicio, fin]));

    return res.json({
      diagnostico: 'numautori',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      pruebas,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error en diagnóstico numautori.',
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

module.exports = { compras };
