const pool = require('../database/postgres');

// Diccionario en memoria: RUC/Cédula -> nombre del proveedor.
const proveedoresMap = new Map();

async function buscarProveedor(rucCed) {
  const ruc = String(rucCed || '').trim();
  if (!ruc) return null;
  if (proveedoresMap.has(ruc)) return proveedoresMap.get(ruc);

  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `SELECT nomprovee FROM proveedores WHERE ruccedpro = $1 LIMIT 1`,
      values: [ruc],
    });

    const nombre = result.rows.length ? result.rows[0].nomprovee : null;
    proveedoresMap.set(ruc, nombre);
    return nombre;
  } finally {
    if (client) {
      try { await client.end(); } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente proveedor:', error.message);
      }
    }
  }
}

async function obtenerCompras(tabla, inicio, fin) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query({
      text: `
        SELECT
          c.numfaccom AS numero,
          c.ruccedpro AS "rucCed",
          c.feccompra AS fecha,
          c.numautori AS autorizacion,
          c.totsiniva AS "subtotalSinIva",
          c.totconiva AS "subtotalConIva",
          c.totcompra AS total
        FROM ${tabla} c
        WHERE c.feccompra >= $1::date
          AND c.feccompra <= $2::date
          AND (c.estproces IS NULL OR UPPER(TRIM(c.estproces)) <> 'ANULADA')
      `,
      values: [inicio, fin],
    });

    return result.rows;
  } finally {
    if (client) {
      try { await client.end(); } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente de compras:', error.message);
      }
    }
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

    // Compras y comprasnv se consultan por separado, sin JOIN con proveedores.
    const [comprasRows, comprasNvRows] = await Promise.all([
      obtenerCompras('compras', inicio, fin),
      obtenerCompras('comprasnv', inicio, fin),
    ]);

    const filasBase = [
      ...comprasRows.map(r => ({ ...r, origen: 'compras' })),
      ...comprasNvRows.map(r => ({ ...r, origen: 'comprasnv' })),
    ];

    // Solo se consultan los proveedores que realmente aparecen en las compras.
    const rucs = [...new Set(
      filasBase.map(r => String(r.rucCed || '').trim()).filter(Boolean)
    )];

    await Promise.all(rucs.map(ruc => buscarProveedor(ruc)));

    const filas = filasBase.map(fila => ({
      numero: fila.numero,
      rucCed: fila.rucCed,
      proveedor: proveedoresMap.get(String(fila.rucCed || '').trim()) || 'PROVEEDOR NO REGISTRADO',
      fecha: fila.fecha,
      autorizacion: fila.autorizacion,
      subtotalSinIva: fila.subtotalSinIva,
      subtotalConIva: fila.subtotalConIva,
      total: fila.total,
      origen: fila.origen,
    }));

    filas.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (fechaB !== fechaA) return fechaB - fechaA;
      return String(b.numero || '').localeCompare(String(a.numero || ''));
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] COMPLETO: ${filas.length} registros, ${rucs.length} proveedores en ${tiempoMs} ms`);

    return res.json({ inicio, fin, total: filas.length, compras: filas });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] COMPLETO - Error después de ${tiempoMs} ms:`, error.message);
    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      tiempoMs,
    });
  }
}

module.exports = { compras };
