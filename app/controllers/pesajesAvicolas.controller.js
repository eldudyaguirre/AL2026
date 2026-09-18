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

    const meta = await metadatosClientes(client);
    const cabecera = await client.query(`
      SELECT
        p.*,
        COALESCE(CAST(c.${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
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
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de pesaje inválido.' });
    }

    client = await pool.connect();
    const meta = await metadatosClientes(client);

    const empresaResult = await client.query(`
      SELECT nombre_comercial, ruc, direccion, email, telefono
      FROM empresa
      LIMIT 1
    `);

    const result = await client.query(`
      SELECT
        p.*,
        COALESCE(CAST(c.\${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.\${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
      WHERE p.id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Pesaje no encontrado.' });
    }

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    const empresa = empresaResult.rows[0] || {};
    const p = result.rows[0];
    const pesos = detalle.rows || [];

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      info: {
        Title: 'Reporte de Pesaje Avícola #' + p.id,
        Author: empresa.nombre_comercial || 'Avícola y Porcina Luisin'
      }
    });

    const nombreArchivo = 'reporte-pesaje-' + p.id + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nombreArchivo + '"');
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const usableWidth = right - left;

    const azul = '#073674';
    const azulClaro = '#eef4fb';
    const gris = '#667085';
    const borde = '#d9dee7';
    const verde = '#198754';

    const texto = (valor, defecto = '—') => {
      const t = valor === null || valor === undefined ? '' : String(valor).trim();
      return t || defecto;
    };

    const num = (valor, dec = 2) => Number(valor || 0).toLocaleString('es-EC', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });

    const money = (valor, dec = 2) => '$ ' + num(valor, dec);

    const fechaEC = valor => {
      if (!valor) return '';
      const partes = String(valor).slice(0, 10).split('-');
      return partes.length === 3 ? partes[2] + '/' + partes[1] + '/' + partes[0] : String(valor);
    };

    const fechaHoraEC = valor => {
      if (!valor) return '—';
      const d = new Date(valor);
      return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString('es-EC');
    };

    // CABECERA DE EMPRESA
    doc.roundedRect(left, 20, usableWidth, 66, 7)
      .fillColor('#ffffff').fill()
      .lineWidth(0.8).strokeColor(borde).stroke();

    doc.font('Helvetica-Bold').fontSize(19).fillColor(azul)
      .text(texto(empresa.nombre_comercial, 'AVÍCOLA Y PORCINA LUISIN'), left + 16, 31, {
        width: usableWidth * 0.55
      });

    doc.font('Helvetica').fontSize(8.5).fillColor(gris)
      .text('REPORTE DE PESAJE AVÍCOLA', left + 16, 57);

    const ex = left + usableWidth * 0.59;
    const ew = usableWidth * 0.195;

    function empresaLinea(label, valor, x, y) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(azul)
        .text(label, x, y, { width: 62 });
      doc.font('Helvetica').fontSize(8).fillColor('#303b4a')
        .text(texto(valor), x + 62, y, { width: ew - 62, ellipsis: true });
    }

    empresaLinea('RUC:', empresa.ruc, ex, 31);
    empresaLinea('TELÉFONO:', empresa.telefono, ex + ew, 31);
    empresaLinea('DIRECCIÓN:', empresa.direccion, ex, 50);
    empresaLinea('EMAIL:', empresa.email, ex + ew, 50);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#303b4a')
      .text('PESAJE #' + p.id, left, 100);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(
      String(p.estado).toUpperCase() === 'PROCESADO' ? verde : '#856404'
    ).text('ESTADO: ' + texto(p.estado), right - 180, 103, {
      width: 180,
      align: 'right'
    });

    // DATOS DEL PESAJE
    const infoY = 120;
    const gap = 8;
    const infoW = (usableWidth - gap * 3) / 4;
    const infoH = 48;

    const bloques = [
      ['FECHA', fechaEC(p.fecha), 'CLIENTE', texto(p.cliente || p.ruccedcli)],
      ['RUC / CÉDULA', texto(p.ruccedcli), 'GRANJA', texto(p.granja)],
      ['CÓDIGO GRANJA', texto(p.codproy), 'GALPÓN', texto(p.galpon)],
      ['LOTE', texto(p.lote), 'NOTA / GUÍA', texto(p.nota_guia)]
    ];

    for (let i = 0; i < 4; i++) {
      const x = left + i * (infoW + gap);
      doc.roundedRect(x, infoY, infoW, infoH, 5)
        .fillColor(azulClaro).fill()
        .lineWidth(0.5).strokeColor(borde).stroke();

      doc.font('Helvetica-Bold').fontSize(7).fillColor(gris)
        .text(bloques[i][0], x + 9, infoY + 7, { width: infoW - 18 });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#303b4a')
        .text(bloques[i][1], x + 9, infoY + 19, { width: infoW - 18, ellipsis: true });

      doc.font('Helvetica-Bold').fontSize(7).fillColor(gris)
        .text(bloques[i][2], x + 9, infoY + 31, { width: infoW - 18 });
      doc.font('Helvetica').fontSize(8).fillColor('#303b4a')
        .text(bloques[i][3], x + 9, infoY + 41, { width: infoW - 18, ellipsis: true });
    }

    // RESUMEN ECONÓMICO Y DE PESO
    const resumenY = 178;
    const resumenW = (usableWidth - gap * 3) / 4;
    const resumen = [
      ['AVES PESADAS', num(p.cantidad_aves, 0), azul],
      ['PESO TOTAL', num(p.peso_total) + ' kg', azul],
      ['PESO PROMEDIO', num(p.peso_promedio) + ' kg', azul],
      ['VALOR TOTAL', p.valor_total == null ? '—' : money(p.valor_total), verde]
    ];

    for (let i = 0; i < 4; i++) {
      const x = left + i * (resumenW + gap);
      doc.roundedRect(x, resumenY, resumenW, 43, 5)
        .fillColor('#f8fafc').fill()
        .lineWidth(0.5).strokeColor(borde).stroke();

      doc.font('Helvetica-Bold').fontSize(7).fillColor(gris)
        .text(resumen[i][0], x + 9, resumenY + 7, { width: resumenW - 18 });
      doc.font('Helvetica-Bold').fontSize(12).fillColor(resumen[i][2])
        .text(resumen[i][1], x + 9, resumenY + 19, { width: resumenW - 18 });
    }

    // PRECIO Y CONTROL
    const controlY = 230;
    doc.roundedRect(left, controlY, usableWidth, 38, 5)
      .fillColor('#fffaf0').fill()
      .lineWidth(0.5).strokeColor('#ead8ad').stroke();

    doc.font('Helvetica-Bold').fontSize(7).fillColor('#856404')
      .text('PRECIO POR KG', left + 12, controlY + 7);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#604a00')
      .text(p.precio == null ? '—' : money(p.precio, 4), left + 12, controlY + 18);

    doc.font('Helvetica-Bold').fontSize(7).fillColor('#856404')
      .text('VALOR TOTAL', left + 190, controlY + 7);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(verde)
      .text(p.valor_total == null ? '—' : money(p.valor_total), left + 190, controlY + 18);

    doc.font('Helvetica').fontSize(7.5).fillColor(gris)
      .text('Registrado por: ' + texto(p.creadopor) + '   |   Creación: ' + fechaHoraEC(p.fechacreacion),
        right - 350, controlY + 11, { width: 338, align: 'right' });

    if (p.observacion) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(gris)
        .text('OBSERVACIÓN:', left, 278);
      doc.font('Helvetica').fontSize(8).fillColor('#303b4a')
        .text(texto(p.observacion), left + 65, 278, {
          width: usableWidth - 65,
          ellipsis: true
        });
    }

    // DETALLE HORIZONTAL: 6 BLOQUES, CADA UNO CON # Y PESO.
    const paresPorFila = 6;
    const filaH = 14;
    const colW = usableWidth / (paresPorFila * 2);
    let indice = 0;
    let pagina = 1;

    function cabeceraDetalle(y) {
      doc.roundedRect(left, y, usableWidth, 21, 4).fillColor(azul).fill();
      for (let i = 0; i < paresPorFila; i++) {
        const x = left + i * colW * 2;
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#ffffff')
          .text('#', x + 2, y + 7, { width: colW - 4, align: 'center' });
        doc.text('PESO (kg)', x + colW + 1, y + 7, { width: colW - 2, align: 'center' });
      }
    }

    while (indice < pesos.length || (pesos.length === 0 && pagina === 1)) {
      if (pagina > 1) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(11).fillColor(azul)
          .text('DETALLE DE PESOS — PESAJE #' + p.id, left, 18);
        cabeceraDetalle(34);
        indice = indice;
      } else {
        cabeceraDetalle(298);
      }

      const inicioY = pagina === 1 ? 298 : 34;
      const filasDisponibles = Math.max(1, Math.floor((pageHeight - inicioY - 28) / filaH));
      const restantes = pesos.length - indice;
      const filas = pesos.length === 0 ? 1 : Math.min(filasDisponibles, Math.ceil(restantes / paresPorFila));
      const inicioIndice = indice;

      for (let fila = 0; fila < filas; fila++) {
        for (let bloque = 0; bloque < paresPorFila; bloque++) {
          const itemIndex = inicioIndice + fila + bloque * filas;
          const x = left + bloque * colW * 2;
          const y = inicioY + 21 + fila * filaH;
          const item = pesos[itemIndex];

          doc.rect(x, y, colW, filaH)
            .fillColor((fila + bloque) % 2 === 0 ? '#ffffff' : '#f8fafc')
            .fill().lineWidth(0.3).strokeColor(borde).stroke();

          doc.rect(x + colW, y, colW, filaH)
            .fillColor((fila + bloque) % 2 === 0 ? '#ffffff' : '#f8fafc')
            .fill().lineWidth(0.3).strokeColor(borde).stroke();

          if (item) {
            doc.font('Helvetica').fontSize(6.5).fillColor('#475467')
              .text(String(item.numero_ave), x + 2, y + 3.5, { width: colW - 4, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor(azul)
              .text(num(item.peso), x + colW + 1, y + 3.5, { width: colW - 2, align: 'center' });
          }
        }
      }

      if (pesos.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(gris)
          .text('No hay pesos registrados.', left, inicioY + 32);
        break;
      }

      indice += filas * paresPorFila;
      pagina++;

      if (indice < pesos.length) {
        // La siguiente iteración crea una nueva página.
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
