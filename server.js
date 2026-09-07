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
app.use(express.json());app.get('/',(_req,res)=>res.redirect('/html/login.html'));app.get('/login.html',(_req,res)=>res.redirect('/html/login.html'));app.get('/frmmenprinci.html',(_req,res)=>res.redirect('/html/frmmenprinci.html'));app.get('/FrmCueCobrar.html',(_req,res)=>res.redirect('/html/FrmCueCobrar.html'));app.get('/FrmBalGeneral.html',(_req,res)=>res.redirect('/html/FrmBalGeneral.html'));app.get('/FrmBalResul.html',(_req,res)=>res.redirect('/html/FrmBalResul.html'));app.get('/ResumenAdm.html',(_req,res)=>res.redirect('/html/ResumenAdm.html'));app.get('/Clientes.html',(_req,res)=>res.redirect('/html/Clientes.html'));app.get('/Proveedores.html',(_req,res)=>res.redirect('/html/Proveedores.html'));

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

const fabricaMenu=`<li class="menu-group"><button type="button" class="menu-parent" onclick="toggleSubmenu(this)" aria-expanded="false"><i class="fi fi-rr-industry-windows icon"></i><span>Fábrica</span><i class="fi fi-rr-angle-small-down submenu-arrow"></i></button><ul class="submenu"><li><a href="/html/ResumenFab.html">Resumen</a></li><li style="height:1px;background:#e1e5ea;margin:6px 10px;"></li><li><a href="#bitacora-fabrica">Bitácora</a></li><li style="height:1px;background:#e1e5ea;margin:6px 10px;"></li><li><a href="#formulas-fabrica">Fórmulas</a></li><li><span style="display:block;padding:7px 10px 4px 10px;font-size:13px;font-weight:700;color:#073674;">Inventario</span></li><li><a href="#materia-prima" style="padding-left:28px;font-size:12px;">Materia Prima</a></li><li><a href="#producto-final" style="padding-left:28px;font-size:12px;">Producto Final</a></li><li><a href="#ordenes-compra-fabrica">Órdenes de Compra</a></li><li><a href="#ordenes-ingreso-fabrica">Órdenes de Ingreso</a></li><li><a href="#ordenes-despacho-fabrica">Órdenes de Despacho</a></li><li style="height:1px;background:#e1e5ea;margin:6px 10px;"></li><li><a href="#configuracion-fabrica">Configuración</a></li></ul></li>`;

app.get('/html/:archivo.html',(req,res,next)=>{
  const archivo=req.params.archivo;
  const filePath=path.join(__dirname,'public','html',`${archivo}.html`);
  if(!fs.existsSync(filePath)) return next();
  try{
    let html=fs.readFileSync(filePath,'utf8');
    for(const [origen,destino] of Object.entries(menuLinkMap)){
      html=html.split(`href="${origen}"`).join(`href="${destino}"`);
    }
    const fabricaRegex=/<li class="menu-group(?: open)?"><button[^>]*>\s*<i[^>]*><\/i>\s*<span>Fábrica<\/span>[\s\S]*?<\/button><ul class="submenu">[\s\S]*?<\/ul><\/li>/;
    html=html.replace(fabricaRegex,fabricaMenu);
    if(!html.includes('href="/html/FrmBalResul.html"')){
      const balanceGeneralLi=/<li><a href="\/html\/FrmBalGeneral\.html"[^>]*>Balance General<\/a><\/li>/;
      html=html.replace(balanceGeneralLi,match=>`${match}<li><a href="/html/FrmBalResul.html">Balance de Resultados</a></li>`);
    }
    res.type('html').send(html);
  }catch(error){next(error);}
});

app.use('/api',authRoutes);app.use('/api',systemRoutes);app.use('/api',comprasRoutes);app.use('/api',ventasRoutes);app.use('/api',cuePagarRoutes);app.use('/api',cueCobrarRoutes);app.use('/api',balGeneralRoutes);app.use('/api',balResulRoutes);app.use('/api',trabajadoresRoutes);app.use('/api',clientesRoutes);app.use('/api',proveedoresRoutes);app.get('/health',systemController.health);app.use(express.static('public'));app.listen(port,'0.0.0.0',()=>console.log(`AL2026 API listening on port ${port}`));process.on('SIGTERM',async()=>{await pool.end();process.exit(0);});
