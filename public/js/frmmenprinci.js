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

    // Estos elementos pueden no existir en la nueva pantalla principal.
    // No deben provocar un error que termine expulsando al usuario.
    const profileName=document.getElementById('profile-name');
    const profileUser=document.getElementById('profile-user');
    const nombreElement=document.getElementById('nombre');
    const apiValue=document.getElementById('api-value');
    const dbValue=document.getElementById('db-value');

    if(profileName) profileName.textContent=usuario;
    if(profileUser) profileUser.textContent=nombre;
    if(nombreElement) nombreElement.textContent=nombre;
    if(apiValue) apiValue.textContent='OK';
    if(dbValue) dbValue.textContent='OK';
  }catch(_){window.location.href='/login.html';}
}

async function cerrarSesion(){
  try{await fetch('/api/logout',{method:'POST'});}finally{window.location.href='/login.html';}
}

cargarDashboard();
