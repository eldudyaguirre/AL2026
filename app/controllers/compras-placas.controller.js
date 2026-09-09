const pool = require('../database/postgres');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

async function listarPlacas(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    const result = await client.query(`
      SELECT TRIM(placa) AS placa, marca, modelo, anio, tipovehiculo, color, combustible, estado
      FROM vehiculos
      WHERE NULLIF(TRIM(placa),'') IS NOT NULL
      ORDER BY TRIM(placa)
    `);
    return res.json({ total: result.rows.length, vehiculos: result.rows });
  } catch (error) {
    console.error('[COMPRAS-PLACAS] Error listando vehículos:', error);
    return res.status(500).json({ error: 'Error consultando las placas.', detail: error.message, codigo: error.code });
  } finally {
    if (client) try { await client.end(); } catch (_) {}
  }
}

async function reporteDetallePorPlaca(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    const placa = String(req.query.placa || '').trim();
    const area = String(req.query.area || '').trim();
    if (!fechaValida(inicio) || !fechaValida(fin)) return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const sql = `
      SELECT * FROM (
        SELECT C.feccompra AS fecha, TRIM(C.placa) AS placa, C.ruccedpro AS "rucCed",
               COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO') AS nombre,
               C.numfaccom AS numero, C.tipdocume AS "tipoDoc",
               COALESCE(C.totsiniva,0)::numeric AS "totSinIva",
               COALESCE(C.totconiva,0)::numeric AS "totConIva",
               COALESCE(C.valivacom,0)::numeric AS iva,
               COALESCE(C.totcompra,0)::numeric AS total,
               TRIM(C.proyecto) AS area, 'COMPRA' AS origen
        FROM compras C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        UNION ALL
        SELECT C.feccompra, TRIM(C.placa), C.ruccedpro,
               COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO'), C.numfaccom, C.tipdocume,
               COALESCE(C.totsiniva,0)::numeric, COALESCE(C.totconiva,0)::numeric,
               COALESCE(C.valivacom,0)::numeric, COALESCE(C.totcompra,0)::numeric,
               TRIM(C.proyecto), 'NV'
        FROM comprasnv C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        UNION ALL
        SELECT C.feccompra, TRIM(C.placa), C.ruccedpro,
               COALESCE(D.desiteinv,'SIN REFERENCIA'), C.numfaccom, 'OD',
               COALESCE(C.subtotcom,0)::numeric, 0::numeric, 0::numeric,
               COALESCE(C.totcompra,0)::numeric, TRIM(C.proyecto), 'OD'
        FROM comprasod C LEFT JOIN detallecomprasod D ON D.numcompra=C.numcompra
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
      ) X
      WHERE NULLIF(TRIM(placa),'') IS NOT NULL
        AND ($3 = '' OR LOWER(TRIM(placa)) = LOWER($3))
        AND ($4 = '' OR LOWER(TRIM(area)) = LOWER($4))
      ORDER BY placa, fecha, numero
    `;

    const rows = (await client.query(sql, [inicio, fin, placa, area])).rows;
    const totales = rows.reduce((a, r) => {
      a.sinIva += Number(r.totSinIva || 0);
      a.conIva += Number(r.totConIva || 0);
      a.iva += Number(r.iva || 0);
      a.total += Number(r.total || 0);
      return a;
    }, { sinIva: 0, conIva: 0, iva: 0, total: 0 });

    return res.json({ inicio, fin, placa: placa || 'TODAS', area: area || 'TODAS', total: rows.length, totales, compras: rows, tiempoMs: Date.now() - inicioConsulta });
  } catch (error) {
    console.error('[COMPRAS-REPORTE-PLACA] Error consultando detalle:', error);
    return res.status(500).json({ error: 'Error consultando el reporte por placas.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) try { await client.end(); } catch (_) {}
  }
}

module.exports = { listarPlacas, reporteDetallePorPlaca };
