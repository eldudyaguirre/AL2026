(function(){
  window.abrirMenu=window.abrirMenu||function(){
    const sidebar=document.getElementById('sidebar');
    const overlay=document.getElementById('overlay');
    if(sidebar) sidebar.classList.add('open');
    if(overlay) overlay.classList.add('show');
    document.body.style.overflow='hidden';
  };

  window.cerrarMenu=window.cerrarMenu||function(){
    const sidebar=document.getElementById('sidebar');
    const overlay=document.getElementById('overlay');
    if(sidebar) sidebar.classList.remove('open');
    if(overlay) overlay.classList.remove('show');
    document.body.style.overflow='';
  };

  window.toggleSubmenu=window.toggleSubmenu||function(button){
    const grupo=button&&button.closest('.menu-group');
    if(!grupo) return;
    const estabaAbierto=grupo.classList.contains('open');
    if(estabaAbierto){
      grupo.classList.remove('open');
      button.setAttribute('aria-expanded','false');
      return;
    }
    const nivel=grupo.parentElement;
    nivel.querySelectorAll(':scope > .menu-group.open').forEach(item=>{
      if(item!==grupo){
        item.classList.remove('open');
        const parent=item.querySelector(':scope > .menu-parent');
        if(parent) parent.setAttribute('aria-expanded','false');
      }
    });
    grupo.classList.add('open');
    button.setAttribute('aria-expanded','true');
  };

  window.cargarMenuUsuario=async function(){
    try{
      const response=await fetch('/api/session');
      if(!response.ok){window.location.href='/html/login.html';return;}
      const data=await response.json();
      const usuario=data.usuario||'';
      const nombre=data.nombre||usuario||'-';
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
    }catch(_){window.location.href='/html/login.html';}
  };

  if(typeof window.cerrarSesion!=='function'){
    window.cerrarSesion=async function(){
      try{await fetch('/api/logout',{method:'POST'});}finally{window.location.href='/html/login.html';}
    };
  }

  if(document.getElementById('profile-name') && !document.querySelector('[data-page-dashboard]')){
    window.cargarMenuUsuario();
  }
})();
