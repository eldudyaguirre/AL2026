const pool = require('../database/postgres');

// Diccionario en memoria: solo se cargan los proveedores que realmente aparecen
// en las compras consultadas. No se lee la tabla proveedores completa.
const proveedoresMap = new Map();

async function buscarProveedor(rucCed) {
  const ruc = String(rucCed || '').trim();
  if (!ruc) return null;

  if (proveedoresMap.has(ruc)) {
    return proveedoresMap.get(ruc);
  }

  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT nomprovee
        FROM proveedores
        WHERE ruccedpro = $1
        LIMIT 1
      `,
      values: [ruc],
    });

    const nombre = result.rows.length ? result.rows[0].nomprovee : null;
    proveedoresMap.set(ruc, nombre);
    return nombre;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente proveedor:', error.message);
      }
    }
  }
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

    // Primero consultamos únicamente compras. No hay JOIN ni acceso a proveedores.
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          c.feccompra AS fecha,
          c.numautori AS autorizacion
        FROM compras c
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
      `,
      values: [inicio, fin],
    });

    const filasBase = result.rows;

    // Solo buscamos los RUC que aparecen en estas compras y en paralelo.
    const rucs = [...new Set(
      filasBase
        .map(fila => String(fila.rucCed || '').trim())
        .filter(Boolean)
    )];

    const nombres = await Promise.all(
      rucs.map(async ruc => [ruc, await buscarProveedor(ruc)])
    );

    const proveedores = new Map(nombres);

    const filas = filasBase.map(fila => ({
      numero: fila.numero,
      rucCed: fila.rucCed,
      proveedor: proveedores.get(String(fila.rucCed || '').trim()) || 'PROVEEDOR NO REGISTRADO',
      fecha: fila.fecha,
      autorizacion: fila.autorizacion,
    }));

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] DICCIONARIO POR RUC + FECHA + AUTORIZACION: ${filas.length} compras, ${rucs.length} proveedores consultados en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] DICCIONARIO POR RUC + FECHA + AUTORIZACION - Error después de ${tiempoMs} ms:`, error.message);

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
