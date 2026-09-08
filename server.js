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
const menuSourcePath=path.join(__dirname,'public','html','frmmenprinci.html');
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

function obtenerMenuOriginal(){
  const origen=fs.readFileSync(menuSourcePath,'utf8');
  const inicio=origen.indexOf('<nav');
  const fin=origen.indexOf('</nav>',inicio);
  if(inicio<0||fin<0) throw new Error('No se encontró el menú original en frmmenprinci.html');
  let nav=origen.slice(inicio,fin+6);
  for(const [origenLink,destino] of Object.entries(menuLinkMap)){
    nav=nav.split(`href="${origenLink}"`).join(`href="${destino}"`);
  }
  return nav;
}

app.get('/html/:archivo.html',(req,res,next)=>{
  const archivo=req.params.archivo;
  const filePath=path.join(__dirname,'public','html',`${archivo}.html`);
  if(!fs.existsSync(filePath)) return next();
  if(archivo.toLowerCase()==='login') return res.sendFile(filePath);
  try{
    let html=fs.readFileSync(filePath,'utf8');
    if(archivo!=='frmmenprinci'){
      const menuOriginal=obtenerMenuOriginal();
      const inicio=html.indexOf('<nav');
      const fin=html.indexOf('</nav>',inicio);
      if(inicio>=0&&fin>=0) html=html.slice(0,inicio)+menuOriginal+html.slice(fin+6);
    }
    for(const [origenLink,destino] of Object.entries(menuLinkMap)){
      html=html.split(`href="${origenLink}"`).join(`href="${destino}"`);
    }
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