const express = require('express');
const authRoutes = require('./app/routes/auth.routes');
const systemRoutes = require('./app/routes/system.routes');
const comprasRoutes = require('./app/routes/compras.routes');
const ventasRoutes = require('./app/routes/ventas.routes');
const cuePagarRoutes = require('./app/routes/cuepagar.routes');
const cueCobrarRoutes = require('./app/routes/cuecobrar.routes');
const balGeneralRoutes = require('./app/routes/balgeneral.routes');
const balResulRoutes = require('./app/routes/balresul.routes');
const trabajadoresRoutes = require('./app/routes/trabajadores.routes');
const clientesRoutes = require('./app/routes/clientes.routes');
const proveedoresRoutes = require('./app/routes/proveedores.routes');
const systemController = require('./app/controllers/system.controller');
const pool = require('./app/database/postgres');
const fs = require('fs');
const path = require('path');
const app = express();
const port = Number(process.env.PORT || 3000);
app.use(express.json());

const loginPath=path.join(__dirname,'public','html','login.html');
app.get('/',(_req,res)=>res.sendFile(loginPath));
app.get('/login.html',(_req,res)=>res.sendFile(loginPath));
app.get('/frmmenprinci.html',(_req,res)=>res.redirect('/html/frmmenprinci.html'));
app.get('/FrmCueCobrar.html',(_req,res)=>res.redirect('/html/FrmCueCobrar.html'));
app.get('/FrmBalGeneral.html',(_req,res)=>res.redirect('/html/FrmBalGeneral.html'));
app.get('/FrmBalResul.html',(_req,res)=>res.redirect('/html/FrmBalResul.html'));
app.get('/ResumenAdm.html',(_req,res)=>res.redirect('/html/ResumenAdm.html'));
app.get('/Clientes.html',(_req,res)=>res.redirect('/html/Clientes.html'));
app.get('/Proveedores.html',(_req,res)=>res.redirect('/html/Proveedores.html'));

const menuLinkMap={
  '#resumen-avicola':'/html/ResumenAvi.html',
  '#resumen-porcina':'/html/ResumenPor.html',
  '#resumen-fabrica':'/html/ResumenFab.html',
  '#granja1':'/html/ResumenAvi.html#granja1',
  '#granja2':'/html/ResumenAvi.html#granja2',
  '#pesaje-avicola':'/html/ResumenAvi.html#pesaje-avicola',
  '#reportes-avicola':'/html/ResumenAvi.html#reportes-avicola',
  '#parametros-avicola':'/html/ResumenAvi.html#parametros-avicola',
  '#granja1-porcina':'/html/ResumenPor.html#granja1-porcina',
  '#granja2-porcina':'/html/ResumenPor.html#granja2-porcina',
  '#pesaje-porcina':'/html/ResumenPor.html#pesaje-porcina',
  '#reportes-porcina':'/html/ResumenPor.html#reportes-porcina',
  '#parametros-porcina':'/html/ResumenPor.html#parametros-porcina',
  '#inventario':'/html/ResumenFab.html#inventario-fabrica',
  '#items':'/html/ResumenFab.html#items-fabrica',
  '#produccion':'/html/ResumenFab.html#produccion-fabrica',
  '#ordenes-compra':'/html/ResumenFab.html#ordenes-compra-fabrica',
  '#inventario-fabrica':'/html/ResumenFab.html#inventario-fabrica',
  '#items-fabrica':'/html/ResumenFab.html#items-fabrica',
  '#produccion-fabrica':'/html/ResumenFab.html#produccion-fabrica',
  '#ordenes-compra-fabrica':'/html/ResumenFab.html#ordenes-compra-fabrica',
  '#trabajadores':'/html/ResumenAdm.html#trabajadores',
  '#roles':'/html/ResumenAdm.html#roles',
  '#configuracion':'/html/ResumenAdm.html#configuracion'
};

const fabricaMenu=`<li class="menu-group"><button type="button" class="menu-parent" onclick="toggleSubmenu(this)" aria-expanded="false"><i class="fi fi-rr-industry-windows icon"></i><span>Fábrica</span><i class="fi fi-rr-angle-small-down submenu-arrow"></i></button><ul class="submenu"><li><a href="/html/ResumenFab.html">Resumen</a></li><li class="menu-group"><button type="button" class="menu-parent" onclick="toggleSubmenu(this)" aria-expanded="false"><span>Inventario</span><i class="fi fi-rr-angle-small-down submenu-arrow"></i></button><ul class="submenu"><li><a href="/html/ResumenFab.html#materia-prima">Materia Prima</a></li><li><a href="/html/ResumenFab.html#producto-final">Producto Final</a></li></ul></li><li><a href="/html/ResumenFab.html#items-fabrica">Items</a></li><li><a href="/html/ResumenFab.html#produccion-fabrica">Producción</a></li><li><a href="/html/ResumenFab.html#ordenes-compra-fabrica">Órdenes de compra</a></li></ul></li>`;

function reemplazarMenuFabrica(html){
  const inicio=html.search(/<li class="menu-group(?: open)?">\s*<button[^>]*>\s*<i[^>]*><\/i>\s*<span>Fábrica<\/span>/i);
  if(inicio<0) return html;
  const ulInicio=html.indexOf('<ul class="submenu">',inicio);
  if(ulInicio<0) return html;
  let pos=ulInicio;
  let profundidad=0;
  while(pos<html.length){
    const siguienteUl=html.indexOf('<ul',pos);
    const siguienteCierre=html.indexOf('</ul>',pos);
    if(siguienteCierre<0) return html;
    if(siguienteUl>=0 && siguienteUl<siguienteCierre){
      profundidad++;
      pos=siguienteUl+3;
    }else{
      profundidad--;
      pos=siguienteCierre+5;
      if(profundidad===0){
        const finLi=html.indexOf('</li>',pos);
        if(finLi<0) return html;
        return html.slice(0,inicio)+fabricaMenu+html.slice(finLi+5);
      }
    }
  }
  return html;
}

app.get('/html/:archivo.html',(req,res,next)=>{
  const archivo=req.params.archivo;
  const filePath=path.join(__dirname,'public','html',`${archivo}.html`);
  if(!fs.existsSync(filePath)) return next();
  if(archivo.toLowerCase()==='login') return res.sendFile(filePath);
  try{
    let html=fs.readFileSync(filePath,'utf8');
    for(const [origen,destino] of Object.entries(menuLinkMap)){
      html=html.split(`href="${origen}"`).join(`href="${destino}"`);
    }
    html=reemplazarMenuFabrica(html);
    if(!html.includes('href="/html/FrmBalResul.html"')){
      const balanceGeneralLi=/<li><a href="\/html\/FrmBalGeneral\.html"[^>]*>Balance General<\/a><\/li>/;
      html=html.replace(balanceGeneralLi,match=>`${match}<li><a href="/html/FrmBalResul.html">Balance de Resultados</a></li>`);
    }
    html=html.replace(/\s*<link[^>]+href=["'][^"']*\/css\/frmmenprinci\.css[^"']*["'][^>]*>/gi,'');
    html=html.replace(/\s*<script[^>]+src=["'][^"']*\/js\/frmmenprinci\.js[^"']*["']><\/script>/gi,'');
    html=html.replace('</head>','<link rel="stylesheet" href="/css/frmmenprinci.css?v=20260908">\n</head>');
    html=html.replace('</body>','<script src="/js/frmmenprinci.js?v=20260908"></script>\n</body>');
    res.type('html').send(html);
  }catch(error){next(error);}
});

app.use('/api',authRoutes);
app.use('/api',systemRoutes);
app.use('/api',comprasRoutes);
app.use('/api',ventasRoutes);
app.use('/api',cuePagarRoutes);
app.use('/api',cueCobrarRoutes);
app.use('/api',balGeneralRoutes);
app.use('/api',balResulRoutes);
app.use('/api',trabajadoresRoutes);
app.use('/api',clientesRoutes);
app.use('/api',proveedoresRoutes);
app.get('/health',systemController.health);
app.use(express.static('public'));
app.listen(port,'0.0.0.0',()=>console.log(`AL2026 API listening on port ${port}`));
process.on('SIGTERM',async()=>{await pool.end();process.exit(0);});