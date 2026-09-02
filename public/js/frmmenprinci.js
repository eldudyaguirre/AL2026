function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden';}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow='';}

function toggleSubmenu(button){
  const grupo=button.closest('.menu-group');
  const estabaAbierto=grupo.classList.contains('open');
  document.querySelectorAll('.menu-group.open').forEach(item=>{
    item.classList.remove('open');
    const parent=item.querySelector('.menu-parent');
    if(parent) parent.setAttribute('aria-expanded','false');
  });
  if(!estabaAbierto){
    grupo.classList.add('open');
    button.setAttribute('aria-expanded','true');
  }
}

async function cargarDashboard(){
  try{
    const response=await fetch('/api/session');
    if(!response.ok){window.location.href='/login.html';return;}
    const data=await response.json();
    const usuario=data.usuario||'';
    const nombre=data.nombre||usuario||'-';
    document.getElementById('usuario').textContent=usuario;
    document.getElementById('profile-name').textContent=nombre;
    document.getElementById('profile-user').textContent=usuario;
    document.getElementById('nombre').textContent=nombre;
    document.getElementById('api-value').textContent='OK';
    document.getElementById('db-value').textContent='OK';
  }catch(_){window.location.href='/login.html';}
}

async function cerrarSesion(){
  try{await fetch('/api/logout',{method:'POST'});}finally{window.location.href='/login.html';}
}

cargarDashboard();
