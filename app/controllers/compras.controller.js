const pool = require('../database/postgres');

let proveedoresMap = null;
let proveedoresCargando = null;

async function cargarDiccionarioProveedores() {
  if (proveedoresMap) return proveedoresMap;

  if (!proveedoresCargando) {
    proveedoresCargando = (async () => {
      const mapa = new Map();
      let ultimoRuc = '';
      let total = 0;

      try {
        // Cargamos el diccionario por bloques pequeños para evitar la consulta
        // completa que se queda esperando desde Railway.
        while (true) {
          let client;
          try {
            client = pool.createDedicatedClient();
            await client.connect();

            const result = await client.query({
              text: `
                SELECT ruccedpro, nomprovee
                FROM proveedores
                WHERE ruccedpro > $1
                ORDER BY ruccedpro
                LIMIT 50
              `,
              values: [ultimoRuc],
            });

            if (result.rows.length === 0) break;

            for (const proveedor of result.rows) {
              const ruc = String(proveedor.ruccedpro || '').trim();
              if (ruc) mapa.set(ruc, proveedor.nomprovee);
              ultimoRuc = ruc;
            }

            total += result.rows.length;
            console.log(`[COMPRAS] Diccionario: ${total} proveedores cargados`);
          } finally {
            if (client) {
              try {
                await client.end();
              } catch (error) {
                console.error('[COMPRAS] Error cerrando cliente del diccionario:', error.message);
              }
            }
          }
        }

        proveedoresMap = mapa;
        console.log(`[COMPRAS] Diccionario de proveedores listo: ${mapa.size} registros`);
        return mapa;
      } finally {
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

    // El diccionario se carga una sola vez. Las compras no hacen JOIN.
    const proveedores = await cargarDiccionarioProveedores();

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
    console.log(`[COMPRAS] DICCIONARIO: ${filas.length} compras en ${tiempoMs} ms`);

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] DICCIONARIO - Error después de ${tiempoMs} ms:`, error.message);

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
