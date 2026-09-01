function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden';}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow='';}

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
    document.getElementById('avatar').textContent=(nombre||'AL').substring(0,2).toUpperCase();
    document.getElementById('api-value').textContent='OK';
    document.getElementById('db-value').textContent='OK';
  }catch(_){window.location.href='/login.html';}
}

async function cerrarSesion(){
  try{await fetch('/api/logout',{method:'POST'});}finally{window.location.href='/login.html';}
}

cargarDashboard();
