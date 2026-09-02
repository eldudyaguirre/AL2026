const pool = require('../database/postgres');

let proveedoresMap = null;
let proveedoresCargando = null;

async function cargarDiccionarioProveedores() {
  if (proveedoresMap) return proveedoresMap;

  if (!proveedoresCargando) {
    proveedoresCargando = (async () => {
      let client;
      try {
        client = pool.createDedicatedClient();
        await client.connect();

        const result = await client.query(`
          SELECT ruccedpro, nomprovee
          FROM proveedores
        `);

        const mapa = new Map();
        for (const proveedor of result.rows) {
          mapa.set(String(proveedor.ruccedpro).trim(), proveedor.nomprovee);
        }

        proveedoresMap = mapa;
        console.log(`[COMPRAS] Diccionario de proveedores cargado: ${mapa.size} registros`);
        return mapa;
      } finally {
        if (client) {
          try {
            await client.end();
          } catch (error) {
            console.error('[COMPRAS] Error cerrando cliente del diccionario:', error.message);
          }
        }
        proveedoresCargando = null;
      }
    })();
  }

  return proveedoresCargando;
}

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

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

    // El diccionario de proveedores se carga una sola vez en memoria.
    const proveedores = await cargarDiccionarioProveedores();

    // PRUEBA: compras sin JOIN. El proveedor se obtiene exclusivamente del diccionario.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed"
        FROM compras c
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
      `,
      values: [inicio, fin],
    });

    const filas = result.rows.map(fila => ({
      numero: fila.numero,
      rucCed: fila.rucCed,
      proveedor: proveedores.get(String(fila.rucCed || '').trim()) || 'PROVEEDOR NO REGISTRADO',
    }));

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] PRUEBA DICCIONARIO: ${filas.length} compras en ${tiempoMs} ms`);

    return res.json({
      prueba: 'Compras + diccionario de proveedores',
      inicio,
      fin,
      total: filas.length,
      tiempoMs,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] PRUEBA DICCIONARIO - Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      tiempoMs,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente de compras:', error.message);
      }
    }
  }
}

module.exports = { compras };
