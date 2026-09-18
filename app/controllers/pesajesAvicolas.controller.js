const PDFDocument = require('pdfkit');
const pool = require('../database/postgres');
const { getSession } = require('../auth/session');

const RUC_CANDIDATOS = ['ruccedcli', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const NOMBRE_CANDIDATOS = ['nomclient', 'nomcli', 'nombres', 'nombre', 'razonsocial', 'razon_social'];

function ident(valor) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

function esAdministrativo(req) {
  const session = getSession(req);
  return session && String(session.segapp || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

function requiereAdministrativo(req, res) {
  if (!esAdministrativo(req)) {
    res.status(403).json({ error: 'Solo los usuarios ADMINISTRATIVO pueden procesar pesajes.' });
    return false;
  }
  req.session = getSession(req);
  return true;
}

async function metadatosClientes(client) {
  const tablas = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND lower(table_name) = 'clientes'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END
    LIMIT 1
  `);
  if (!tablas.rows.length) throw new Error('No existe la tabla clientes.');

  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnas = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [esquema, tabla]);

  const disponibles = columnas.rows.map(r => r.column_name);
  const buscar = candidatos => disponibles.find(col => candidatos.includes(col.toLowerCase()));
  const colRuc = buscar(RUC_CANDIDATOS);
  const colNombre = buscar(NOMBRE_CANDIDATOS);

  if (!colRuc || !colNombre) {
    throw new Error('No se encontraron RUC/cédula y nombre en clientes.');
  }

  return { esquema, tabla, colRuc, colNombre };
}

async function clientes(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const meta = await metadatosClientes(client);
    const q = String(req.query.q || '').trim();
    const valores = [];
    let where = '';

    if (q) {
      valores.push('%' + q + '%');
      where = `WHERE CAST(${ident(meta.colRuc)} AS text) ILIKE $1
                 OR CAST(${ident(meta.colNombre)} AS text) ILIKE $1`;
    }

    const result = await client.query(`
      SELECT
        CAST(${ident(meta.colRuc)} AS text) AS "ruccedcli",
        CAST(${ident(meta.colNombre)} AS text) AS "nombre"
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      ${where}
      ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST
      LIMIT 1000
    `, valores);

    res.json({ clientes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error clientes:', error);
    res.status(500).json({ error: 'Error consultando clientes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function granjas(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT codproy, proyecto
      FROM proyectos
      WHERE UPPER(TRIM(tiparea)) = 'AVICOLA'
        AND activo = TRUE
      ORDER BY proyecto
    `);

    res.json({ granjas: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error granjas:', error);
    res.status(500).json({ error: 'Error consultando granjas.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function listar(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const meta = await metadatosClientes(client);

    const result = await client.query(`
      SELECT
        p.id,
        p.fecha,
        p.ruccedcli,
        COALESCE(CAST(c.${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        p.codproy,
        COALESCE(pr.proyecto, p.codproy) AS granja,
        p.galpon,
        p.lote,
        p.nota_guia,
        p.observacion,
        p.cantidad_aves,
        p.peso_total,
        p.peso_promedio,
        p.estado,
        p.precio,
        p.valor_total,
        p.creadopor,
        p.fechacreacion
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
      ORDER BY p.fecha DESC, p.id DESC
      LIMIT 200
    `);

    res.json({ pesajes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error historial:', error);
    res.status(500).json({ error: 'Error consultando pesajes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function guardar(req, res) {
  const datos = req.body || {};
  const fecha = String(datos.fecha || '').trim();
  const ruccedcli = String(datos.ruccedcli || '').trim();
  const codproy = String(datos.codproy || '').trim();
  const galpon = String(datos.galpon || '').trim();
  const lote = String(datos.lote || '').trim();
  const nota_guia = String(datos.nota_guia || '').trim();
  const observacion = String(datos.observacion || '').trim();
  const pesos = Array.isArray(datos.pesos) ? datos.pesos : [];

  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria.' });
  if (!ruccedcli) return res.status(400).json({ error: 'Seleccione un cliente.' });
  if (!codproy) return res.status(400).json({ error: 'Seleccione una granja.' });
  if (!pesos.length) return res.status(400).json({ error: 'Debe ingresar al menos un peso.' });

  const pesosNumericos = pesos.map(Number);
  if (pesosNumericos.some(peso => !Number.isFinite(peso) || peso <= 0)) {
    return res.status(400).json({ error: 'Todos los pesos deben ser mayores que cero.' });
  }

  const pesoTotal = pesosNumericos.reduce((suma, peso) => suma + peso, 0);
  const cantidadAves = pesosNumericos.length;
  const pesoPromedio = pesoTotal / cantidadAves;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const cabecera = await client.query(`
      INSERT INTO pesajes_avicolas (
        fecha, ruccedcli, codproy, galpon, lote,
        nota_guia, observacion, cantidad_aves,
        peso_total, peso_promedio, estado, creadopor
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INGRESADO',$11)
      RETURNING id, fecha, cantidad_aves, peso_total, peso_promedio, estado
    `, [
      fecha, ruccedcli, codproy, galpon || null, lote || null,
      nota_guia || null, observacion || null, cantidadAves,
      pesoTotal.toFixed(2), pesoPromedio.toFixed(2),
      req.session?.usuario || null
    ]);

    const pesajeId = cabecera.rows[0].id;

    for (let i = 0; i < pesosNumericos.length; i++) {
      await client.query(`
        INSERT INTO pesajes_avicolas_detalle (pesaje_id, numero_ave, peso)
        VALUES ($1, $2, $3)
      `, [pesajeId, i + 1, pesosNumericos[i].toFixed(2)]);
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Pesaje guardado correctamente.', pesaje: cabecera.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[PESAJE AVI] Error guardando:', error);
    res.status(500).json({ error: 'No se pudo guardar el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function detalle(req, res) {
  let client;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de pesaje inválido.' });

    client = await pool.connect();

    const cabecera = await client.query(`
      SELECT
        p.*,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      WHERE p.id = $1
    `, [id]);

    if (!cabecera.rows.length) return res.status(404).json({ error: 'Pesaje no encontrado.' });

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    res.json({ pesaje: cabecera.rows[0], pesos: detalle.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error detalle:', error);
    res.status(500).json({ error: 'Error consultando el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function procesar(req, res) {
  if (!requiereAdministrativo(req, res)) return;

  const id = Number(req.params.id);
  const precio = Number(req.body?.precio);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de pesaje inválido.' });
  }
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: 'Ingrese un precio mayor que cero.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const actual = await client.query(`
      SELECT id, peso_total, estado
      FROM pesajes_avicolas
      WHERE id = $1
      FOR UPDATE
    `, [id]);

    if (!actual.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pesaje no encontrado.' });
    }

    if (actual.rows[0].estado !== 'INGRESADO') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El pesaje ya fue procesado o no se encuentra en estado INGRESADO.' });
    }

    const pesoTotal = Number(actual.rows[0].peso_total);
    const valorTotal = pesoTotal * precio;

    const actualizado = await client.query(`
      UPDATE pesajes_avicolas
      SET estado = 'PROCESADO',
          precio = $2,
          valor_total = $3
      WHERE id = $1
      RETURNING id, estado, precio, valor_total
    `, [id, precio.toFixed(4), valorTotal.toFixed(2)]);

    await client.query('COMMIT');
    res.json({ mensaje: 'Pesaje procesado correctamente.', pesaje: actualizado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[PESAJE AVI] Error procesando:', error);
    res.status(500).json({ error: 'No se pudo procesar el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function reporte(req, res) {
  let client;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de pesaje inválido.' });

    client = await pool.connect();

    const result = await client.query(`
      SELECT
        p.*,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      WHERE p.id = $1
    `, [id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Pesaje no encontrado.' });

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    const p = result.rows[0];
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const nombreArchivo = `reporte-pesaje-${p.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('REPORTE DE PESAJE AVÍCOLA', { align: 'center' });
    doc.moveDown(0.7);
    doc.fontSize(10).font('Helvetica').text(`ID DEL PESAJE: ${p.id}`, { align: 'center' });
    doc.moveDown();

    const linea = (etiqueta, valor) => {
      doc.font('Helvetica-Bold').text(String(etiqueta) + ': ', { continued: true });
      doc.font('Helvetica').text(String(valor ?? ''));
    };

    linea('Fecha', p.fecha ? new Date(p.fecha).toLocaleDateString('es-EC') : '');
    linea('Cliente', p.cliente || p.ruccedcli || '');
    linea('RUC / Cédula', p.ruccedcli);
    linea('Código de granja', p.codproy);
    linea('Granja', p.granja);
    linea('Galpón', p.galpon || '—');
    linea('Lote', p.lote || '—');
    linea('Nota / Guía', p.nota_guia || '—');
    linea('Observación', p.observacion || '—');
    linea('Estado', p.estado);
    linea('Precio por kg', p.precio == null ? '—' : Number(p.precio).toFixed(4));
    linea('Valor total', p.valor_total == null ? '—' : Number(p.valor_total).toFixed(2));
    linea('Registrado por', p.creadopor || '—');
    linea('Fecha de creación', p.fechacreacion ? new Date(p.fechacreacion).toLocaleString('es-EC') : '—');

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(12).text('RESUMEN');
    doc.font('Helvetica').fontSize(10);
    linea('Aves pesadas', p.cantidad_aves);
    linea('Peso total', Number(p.peso_total || 0).toFixed(2) + ' kg');
    linea('Peso promedio', Number(p.peso_promedio || 0).toFixed(2) + ' kg');

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(12).text('DETALLE DE PESOS');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica-Bold').text('#     Peso (kg)');
    doc.moveDown(0.2);
    doc.font('Helvetica');
    for (const item of detalle.rows) {
      doc.text(String(item.numero_ave).padStart(4) + '   ' + Number(item.peso).toFixed(2) + ' kg');
      if (doc.y > 760) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9).text('#     Peso (kg)');
        doc.moveDown(0.2);
        doc.font('Helvetica');
      }
    }

    doc.end();
  } catch (error) {
    console.error('[PESAJE AVI] Error reporte:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo generar el reporte.', detail: error.message });
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

module.exports = { clientes, granjas, listar, guardar, detalle, procesar, reporte };
