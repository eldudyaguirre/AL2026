let clientes = [];
let timerBusqueda;

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalizarEtiqueta(campo) {
  const etiquetas = {
    ruccedcli: 'RUC / Cédula',
    nomclient: 'Nombres',
    nomcli: 'Nombres',
    nombres: 'Nombres',
    nombre: 'Nombre',
    razonsocial: 'Razón social',
    razon_social: 'Razón social',
    direccion: 'Dirección',
    telefono: 'Teléfono',
    celular: 'Celular',
    email: 'Correo electrónico',
    correo: 'Correo electrónico'
  };
  if (etiquetas[campo.toLowerCase()]) return etiquetas[campo.toLowerCase()];
  return campo.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
}

function formatearValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

async function cargarClientes(q = '') {
  const body = document.getElementById('clientes-body');
  const count = document.getElementById('count');
  body.innerHTML = '<tr><td colspan="2" class="loading">Consultando clientes...</td></tr>';

  try {
    const url = `/api/clientes?limite=2000${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const respuesta = await fetch(url, { credentials: 'same-origin' });
    const data = await respuesta.json();
    if (!respuesta.ok) throw new Error(data.error || 'No se pudieron consultar los clientes.');

    clientes = Array.isArray(data.clientes) ? data.clientes : [];
    count.textContent = `${clientes.length} cliente(s)`;

    if (!clientes.length) {
      body.innerHTML = '<tr><td colspan="2" class="empty">No se encontraron clientes.</td></tr>';
      return;
    }

    body.innerHTML = clientes.map(cliente => `
      <tr>
        <td>${escapeHtml(cliente.ruc)}</td>
        <td><button class="cliente-link" type="button" onclick="abrirDetalle('${encodeURIComponent(cliente.ruc)}')">${escapeHtml(cliente.nombres)}</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('[CLIENTES]', error);
    count.textContent = 'Error';
    body.innerHTML = `<tr><td colspan="2" class="error">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function abrirDetalle(rucCodificado) {
  const ruc = decodeURIComponent(rucCodificado);
  const modal = document.getElementById('cliente-modal');
  const body = document.getElementById('modal-body');
  const titulo = document.getElementById('modal-title');
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="modal-loading">Cargando datos del cliente...</div>';

  try {
    const respuesta = await fetch(`/api/clientes/${encodeURIComponent(ruc)}`, { credentials: 'same-origin' });
    const data = await respuesta.json();
    if (!respuesta.ok) throw new Error(data.error || 'No se pudo consultar el cliente.');

    const cliente = data.cliente || {};
    const columnas = Array.isArray(data.columnas) ? data.columnas : Object.keys(cliente);
    const nombre = cliente.nomclient ?? cliente.nomcli ?? cliente.nombres ?? cliente.nombre ?? cliente.razonsocial ?? 'Cliente';
    titulo.textContent = formatearValor(nombre);

    body.innerHTML = `<div class="detail-grid">${columnas.map(campo => `
      <div class="detail-item">
        <div class="detail-label">${escapeHtml(normalizarEtiqueta(campo))}</div>
        <div class="detail-value">${escapeHtml(formatearValor(cliente[campo]))}</div>
      </div>
    `).join('')}</div>`;
  } catch (error) {
    console.error('[CLIENTES] detalle', error);
    body.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function cerrarDetalle() {
  const modal = document.getElementById('cliente-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function abrirMenu() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('show');
}

function cerrarMenu() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
}

function toggleSubmenu(button) {
  const grupo = button.closest('.menu-group');
  if (!grupo) return;
  const abierto = grupo.classList.toggle('open');
  button.setAttribute('aria-expanded', String(abierto));
}

function cerrarSesion() {
  window.location.href = '/api/logout';
}

document.addEventListener('DOMContentLoaded', () => {
  cargarClientes();
  const buscar = document.getElementById('buscar');
  buscar?.addEventListener('input', () => {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(() => cargarClientes(buscar.value.trim()), 300);
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') cerrarDetalle();
});
