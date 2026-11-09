'use strict';
// Suite de integración de rutas REALES y SQL REAL en base temporal.
// Express/better-sqlite3 se sustituyen SOLO en memoria de pruebas mediante adaptadores;
// esto NO sustituye pruebas finales con dependencias productivas y Electron en Windows.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa-integracion-'));
const staging=path.join(temp,'staging');fs.mkdirSync(staging);fs.copyFileSync(path.join(root,'package.json'),path.join(temp,'package.json'));
// Copiar contenido del servidor sin modificar el código de producción.
let serverText=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
assert.ok(serverText.includes("import express from 'express'"));
assert.ok(serverText.includes("import Database from 'better-sqlite3'"));
serverText=serverText.replace("import express from 'express'","import express from './express.mjs'")
 .replace("import Database from 'better-sqlite3'","import Database from './sqlite.mjs'");
fs.writeFileSync(path.join(staging,'index.mjs'),serverText);
fs.copyFileSync(path.join(root,'server','dashboard.js'),path.join(staging,'dashboard.js'));
fs.copyFileSync(path.join(root,'server','inventory-alerts.js'),path.join(staging,'inventory-alerts.js'));
fs.copyFileSync(path.join(root,'server','kardex.js'),path.join(staging,'kardex.js'));
fs.copyFileSync(path.join(root,'server','kardex-costs.js'),path.join(staging,'kardex-costs.js'));
fs.copyFileSync(path.join(root,'server','inventory-valuation.js'),path.join(staging,'inventory-valuation.js'));
for(const name of ['express.mjs','sqlite.mjs'])fs.copyFileSync(path.join(__dirname,'qa-adapters',name),path.join(staging,name));

fs.copyFileSync(path.join(root,'server','report-format.js'),path.join(staging,'report-format.js'));
fs.copyFileSync(path.join(root,'server','cash.js'),path.join(staging,'cash.js'));
fs.copyFileSync(path.join(root,'server','access-schema.js'),path.join(staging,'access-schema.js'));
fs.copyFileSync(path.join(root,'server','auth.js'),path.join(staging,'auth.js'));
fs.copyFileSync(path.join(root,'server','sale-drafts.js'),path.join(staging,'sale-drafts.js'));
// El módulo ESM se interpreta como ESM incluso si el proyecto padre usa CommonJS.
fs.writeFileSync(path.join(staging,'package.json'),'{'+'"type":"module"'+'}');
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('OK ',name)}catch(err){failed++;console.error('FAIL',name,err.stack||err)}}
(async()=>{
 const {startServer}=await import(pathToFileURL(path.join(staging,'index.mjs')).href);
 const {routes}=await import(pathToFileURL(path.join(staging,'express.mjs')).href);
 const started=await startServer({dataDir:path.join(temp,'db'),port:0});
 const dbPath=path.join(temp,'db','facturacr.sqlite');
 const read=()=>new DatabaseSync(dbPath,{readOnly:true});
 const call=async(method,url,body={})=>{
  const parsedUrl=new URL(url,'http://localhost');const pathname=parsedUrl.pathname;
  const route=routes.find(r=>{
   if(r.method!==method)return false;
   const matcher=new RegExp('^'+r.path.replace(/:[A-Za-z][A-Za-z0-9_]*/g,'[^/]+').replace(/\//g,'\\/')+'$');
   return matcher.test(pathname);
  });
  assert.ok(route,`Ruta inexistente ${method} ${url}`);
  const keys=[...route.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(m=>m[1]);
  const actualParts=pathname.split('/'),routeParts=route.path.split('/'),params={};
  routeParts.forEach((part,i)=>{if(part.startsWith(':'))params[part.slice(1)]=actualParts[i]});
  let status=200,result,completed=false;
  const chunks=[];const res={headersSent:false,write(v){chunks.push(Buffer.isBuffer(v)?v:Buffer.from(String(v)));return true},end(){const b=Buffer.concat(chunks);result=b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8');completed=true;return this},status(s){status=s;return this},json(v){result=v;completed=true;return this},setHeader(){},type(){return this},send(v){result=Buffer.isBuffer(v)&&v[0]===255&&v[1]===254?v.subarray(2).toString('utf16le'):v;completed=true;return this}};
  await route.handler({params,body,headers:{},query:Object.fromEntries(parsedUrl.searchParams),originalUrl:url,authUser:{id:null,is_owner:1}},res);
  assert.equal(completed,true,`Sin respuesta ${method} ${url}`);
  return {status,body:result};
 };
 try{
  await check('API de diagnóstico declara versión actual',async()=>{const r=await call('GET','/api/health');assert.equal(r.status,200);assert.equal(r.body.version,'0.6.59')});
  await check('Inicio y esquema SQLite en base nueva',async()=>{
   const sql=read();const tables=sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
   for(const name of ['companies','clients','products','sales','sale_lines','sale_payments','inventory_movements','quotations','quotation_lines','company_quote_settings','access_users','access_company_roles','access_permission_overrides','access_security_settings','access_audit_log'])assert.ok(tables.includes(name),name);
   assert.equal(sql.prepare('PRAGMA foreign_keys').get().foreign_keys,1);sql.close();
  });
  await check('Esquema de seguridad creado pero todavía sin credenciales ni bloqueo activo',async()=>{
   const sql=read();
   assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM access_users').get().n,0);
   assert.equal(sql.prepare('SELECT idle_lock_minutes AS m FROM access_security_settings WHERE id=1').get().m,15);
   assert.equal(sql.prepare('SELECT preserve_draft_on_lock AS keep FROM access_security_settings WHERE id=1').get().keep,1);
   sql.close();
  });
  let a,b,clientId,prodId,saleId,creditId,quoteId;
  await check('Empresas independientes y color guardado',async()=>{
   let r=await call('POST','/api/companies',{legal_name:'QA Comercio A',identification:'123456789',avatar_color:'#7c3aed'});assert.equal(r.status,201);a=r.body.id;
   r=await call('POST','/api/companies',{legal_name:'QA Comercio B',identification:'987654321',avatar_color:'#0891b2'});assert.equal(r.status,201);b=r.body.id;
   r=await call('GET','/api/companies');assert.equal(r.body.find(x=>x.id===a).avatar_color,'#7c3aed');assert.equal(r.body.length,2);
   const sql=read();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM companies WHERE identification=?').get('123456789').n,1);sql.close();
  });
  await check('Caja: apertura aislada y bloqueo de segunda sesión',async()=>{
    let r=await call('POST',`/api/companies/${a}/cash/open`,{opening_amount:'5000',note:'QA turno inicial'});
    assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.active.opening_cents,500000);
    r=await call('POST',`/api/companies/${a}/cash/open`,{opening_amount:'100'});assert.equal(r.status,400);
    r=await call('GET',`/api/companies/${b}/cash`);assert.equal(r.status,200);assert.equal(r.body.active,null);
  });
  await check('Caja: gastos válidos, restricciones y diferencias',async()=>{
    let r=await call('POST',`/api/companies/${a}/cash/expenses`,{category:'Transporte',description:'Pasaje proveedor',amount:'1500.50'});
    assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.active.summary.expense_cents,150050);
    assert.equal(r.body.active.summary.expected_cents,349950);
    r=await call('POST',`/api/companies/${a}/cash/expenses`,{category:'Otros',description:'',amount:'10'});assert.equal(r.status,400);
    r=await call('POST',`/api/companies/${a}/cash/expenses`,{category:'Otros',description:'Gasto negativo',amount:'-1'});assert.equal(r.status,400);
    r=await call('POST',`/api/companies/${a}/cash/close`,{counted_amount:'3400',note:'Diferencia QA'});
    assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.closed.difference_cents,-9950);
    assert.equal(r.body.active,null);
    r=await call('POST',`/api/companies/${a}/cash/expenses`,{category:'Otros',description:'Sin caja',amount:'10'});assert.equal(r.status,400);
    r=await call('POST',`/api/companies/${a}/cash/close`,{counted_amount:'5'});assert.equal(r.status,400);
  });
  await check('Caja: reportes CSV y PDF aislados por empresa',async()=>{
    let r=await call('GET',`/api/companies/${a}/cash/export.html`);assert.equal(r.status,200);assert.ok(r.body.includes('Pasaje proveedor'));
    r=await call('GET',`/api/companies/${a}/cash/export.csv`);assert.equal(r.status,200);assert.ok(String(r.body).includes('Transporte'));assert.ok(String(r.body).includes('Fondo inicial'));assert.ok(String(r.body).includes('\"5000,00\"'));assert.ok(!String(r.body).includes('₡'));for(const section of ['REPORTE DE CAJA','RESUMEN','CIERRE','GASTOS','Monto (CRC)'])assert.ok(String(r.body).includes(section),section);
    r=await call('GET',`/api/companies/${b}/cash/export.html`);assert.equal(r.status,404);
  });
  await check('Cliente registrado por empresa',async()=>{
   const r=await call('POST',`/api/companies/${a}/clients`,{name:'Cliente QA',identification:'115460323',identification_type:'01',country_code:'506'});
   assert.equal(r.status,201);clientId=r.body.id;
   const list=await call('GET',`/api/companies/${b}/clients`);assert.equal(list.body.length,0);
  });
  await check('Producto IVA incluido ₡700 con existencias',async()=>{
   const r=await call('POST',`/api/companies/${a}/products`,{kind:'producto',description:'Producto QA',cabys:'1234567890123',product_code:'SKU700',price:'700',cost:'300',currency:'CRC',tax_code:'08',price_includes_tax:'1',unit:'Unid',stock:'10',min_stock:'2',track_stock:'1',alert_enabled:'1'});
   assert.equal(r.status,201,JSON.stringify(r.body));prodId=r.body.id;
  });
  await check('Valoración de existencias por empresa, costo CRC y filtros',async()=>{
   let r=await call('GET',`/api/companies/${a}/inventory/valuation`);
   assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.summary.products,1);
   assert.equal(r.body.summary.valueCents,300000);
   r=await call('GET',`/api/companies/${b}/inventory/valuation`);assert.equal(r.body.summary.products,0);
   r=await call('GET',`/api/companies/${a}/inventory/valuation?cost=known&status=available`);
   assert.equal(r.body.rows.length,1);
   r=await call('GET',`/api/companies/${a}/inventory/valuation?cost=missing`);assert.equal(r.body.rows.length,0);
   r=await call('GET',`/api/companies/${a}/inventory/valuation?status=invalid`);assert.equal(r.status,400);
   r=await call('GET','/api/companies/999999/inventory/valuation');assert.equal(r.status,404);
  });
  await check('Valoración exporta CSV y HTML completo y seguro',async()=>{
   let r=await call('GET',`/api/companies/${a}/inventory/valuation/export.csv`);
   assert.equal(r.status,200);assert.ok(r.body.includes('SKU700'));assert.ok(r.body.includes('3000.00'));
   r=await call('GET',`/api/companies/${a}/inventory/valuation/export.html`);
   assert.equal(r.status,200);assert.ok(r.body.includes('Valoración de inventario'));
   assert.ok(r.body.includes('SKU700'));
  });
  await check('Kardex global: historial, saldos, aislamiento y filtros',async()=>{
   let r=await call('GET',`/api/companies/${a}/inventory/kardex`);
   assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.summary.count>=1);
   assert.equal(r.body.rows[0].stock_after,10);
   r=await call('GET',`/api/companies/${b}/inventory/kardex`);assert.equal(r.body.summary.count,0);
   r=await call('GET',`/api/companies/${a}/inventory/kardex?type=entrada&productId=${prodId}`);
   assert.equal(r.status,200);assert.ok(r.body.rows.every(x=>x.movement_type==='entrada'));
   r=await call('GET',`/api/companies/${a}/inventory/kardex?type=invalido`);assert.equal(r.status,400);
   r=await call('GET',`/api/companies/${a}/inventory/kardex?from=2026-02-31`);assert.equal(r.status,400);
   r=await call('GET',`/api/companies/999999/inventory/kardex`);assert.equal(r.status,404);
  });
  await check('Kardex exporta PDF y rechaza XLSX retirado',async()=>{
   const pdf=await call('GET',`/api/companies/${a}/inventory/kardex/export.html?productId=${prodId}`);
   assert.equal(pdf.status,200);assert.ok(pdf.body.includes('Kardex'));assert.ok(pdf.body.includes('Inventario inicial'));
   assert.ok(!routes.some(r=>r.path.endsWith('/kardex/export.xlsx')));
   assert.ok(!routes.some(r=>r.path.endsWith('/valuation/export.xlsx')));
  });
  await check('Catálogo y movimientos ofrecen PDF con datos de empresa',async()=>{
   for(const u of [`/api/companies/${a}/products/export.html`,`/api/companies/${a}/inventory/movements/export.html`]){
    const r=await call('GET',u);assert.equal(r.status,200);assert.ok(r.body.includes('QA Comercio A'));assert.ok(r.body.includes('Producto QA'));
   }
  });
  await check('Kardex CSV tiene encabezado y movimientos filtrados',async()=>{
   const r=await call('GET',`/api/companies/${a}/inventory/kardex/export.csv?productId=${prodId}`);
   assert.equal(r.status,200);assert.ok(r.body.includes('Existencia anterior'));
   assert.ok(r.body.includes('Inventario inicial'));
  });
  await check('Alertas de inventario por empresa no mezclan artículos y validan compañía',async()=>{
   const aRes=await call('GET',`/api/companies/${a}/inventory/alerts`);
   assert.equal(aRes.status,200);assert.equal(aRes.body.summary.total,0);
   const bRes=await call('GET',`/api/companies/${b}/inventory/alerts`);
   assert.equal(bRes.status,200);assert.equal(bRes.body.rows.length,0);
   const invalid=await call('GET','/api/companies/999999/inventory/alerts');assert.equal(invalid.status,404);
  });
  await check('Ajuste físico permite saldo cero y conserva motivo, variación y trazabilidad',async()=>{
   const url=`/api/companies/${a}/inventory/movements`;
   let r=await call('POST',url,{product_id:prodId,movement_type:'ajuste',quantity:0,reason:'Conteo físico',notes:'Inventario físico en cero'});
   assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.stock_before,10);assert.equal(r.body.stock_after,0);assert.equal(r.body.delta,-10);
   const sql=read();assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,0);sql.close();
   r=await call('POST',url,{product_id:prodId,movement_type:'entrada',quantity:10,reason:'Compra a proveedor',notes:'Restituir existencias'});
   assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.stock_after,10);
   const card=await call('GET',`/api/companies/${a}/inventory/kardex?productId=${prodId}`);
   assert.equal(card.status,200);assert.ok(card.body.rows.some(x=>x.movement_type==='ajuste'&&x.stock_after===0&&x.reason==='Conteo físico'));
  });
  await check('No permite motivos vacíos, ajustes sin cambio ni salidas que generen stock negativo',async()=>{
   const url=`/api/companies/${a}/inventory/movements`;
   const bad=[
    {product_id:prodId,movement_type:'ajuste',quantity:9,reason:'x'},
    {product_id:prodId,movement_type:'ajuste',quantity:10,reason:'Conteo físico'},
    {product_id:prodId,movement_type:'salida',quantity:11,reason:'Producto dañado'},
    {product_id:prodId,movement_type:'entrada',quantity:0,reason:'Compra a proveedor'}
   ];
   for(const body of bad){const r=await call('POST',url,body);assert.equal(r.status,400,JSON.stringify(r.body))}
   const sql=read();assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,10);sql.close();
  });
  await check('Contado: ₡619 base + ₡81 IVA = ₡700 y salida de inventario',async()=>{
   const r=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',client_id:clientId,discount:0,lines:[{product_id:prodId,quantity:1}],payments:[{method:'SINPE Móvil',amount:700}]});
   assert.equal(r.status,201,JSON.stringify(r.body));saleId=r.body.id;assert.equal(r.body.total_cents,70000);
   const sql=read(),s=sql.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
   assert.deepEqual([s.subtotal_cents,s.tax_cents,s.total_cents,s.balance_cents],[61900,8100,70000,0]);
   assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,9);
   assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE product_id=? AND reason='Venta POS'").get(prodId).n,1);sql.close();
  });
  await check('Costo histórico de línea capturado al vender y no se recalcula al actualizar catálogo',async()=>{
   const sql=read();
   try{const line=sql.prepare('SELECT unit_cost_cents,quantity FROM sale_lines WHERE sale_id=?').get(saleId);
    assert.equal(line.unit_cost_cents,30000);assert.equal(line.quantity,1);
   }finally{sql.close()}
  });
  await check('Contado: pago insuficiente no crea otra venta ni mueve stock',async()=>{
   const before=read();const count=before.prepare('SELECT COUNT(*) AS n FROM sales').get().n, stock=before.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock;before.close();
   const r=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:0,lines:[{product_id:prodId,quantity:1}],payments:[{method:'Efectivo',amount:699}]});
   assert.equal(r.status,400);
   const after=read();assert.equal(after.prepare('SELECT COUNT(*) AS n FROM sales').get().n,count);assert.equal(after.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,stock);after.close();
  });
  await check('Venta con descuento: la API calcula impuestos y no deja residuos',async()=>{
   const r=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:0,lines:[{product_id:prodId,quantity:2}],payments:[{method:'Tarjeta',amount:1400}]});
   assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.total_cents,140000);
   const extra=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:620,lines:[{product_id:prodId,quantity:1}],payments:[]});
   assert.equal(extra.status,400,'El descuento superior a la base debe rechazarse');
  });
  await check('Crédito y abonos parciales: saldo coherente',async()=>{
   const sale=await call('POST',`/api/companies/${a}/sales`,{sale_type:'credito',client_id:clientId,discount:0,lines:[{product_id:prodId,quantity:1}],payments:[{method:'Efectivo',amount:200}]});
   assert.equal(sale.status,201,JSON.stringify(sale.body));creditId=sale.body.id;assert.equal(sale.body.balance_cents,50000);
   const abono=await call('POST',`/api/companies/${a}/sales/${creditId}/payments`,{method:'SINPE Móvil',amount:499});assert.equal(abono.status,200);assert.equal(abono.body.balance_cents,100);
   const fin=await call('POST',`/api/companies/${a}/sales/${creditId}/payments`,{method:'SINPE Móvil',amount:1,settle_balance:true});assert.equal(fin.status,200);assert.equal(fin.body.balance_cents,0);
   const over=await call('POST',`/api/companies/${a}/sales/${creditId}/payments`,{method:'Efectivo',amount:1});assert.equal(over.status,400);
  });
  await check('Aislamiento de empresas en ventas y cotizaciones',async()=>{
   const other=await call('GET',`/api/companies/${b}/sales/${saleId}`);assert.notEqual(other.status,200);
   const bad=await call('POST',`/api/companies/${b}/sales`,{sale_type:'contado',client_id:clientId,discount:0,lines:[{product_id:prodId,quantity:1}],payments:[]});assert.notEqual(bad.status,201);
  });
  await check('Anulación devuelve existencias y segundo intento se rechaza',async()=>{
   const pre=read();const before=pre.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock;pre.close();
   const r=await call('POST',`/api/companies/${a}/sales/${saleId}/annul`,{reason:'Prueba QA de anulación'});assert.equal(r.status,200,JSON.stringify(r.body));
   const after=read();assert.equal(after.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,before+1);after.close();
   const twice=await call('POST',`/api/companies/${a}/sales/${saleId}/annul`,{reason:'Intento duplicado'});assert.equal(twice.status,400);
  });
  await check('Proforma no descuenta existencias ni registra venta',async()=>{
   const pre=read();const sales=pre.prepare('SELECT COUNT(*) AS n FROM sales').get().n,stock=pre.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock;pre.close();
   const r=await call('POST',`/api/companies/${a}/quotations`,{client_id:clientId,title:'Proforma QA',lines:[{product_id:prodId,quantity:2}]});assert.equal(r.status,201,JSON.stringify(r.body));quoteId=r.body.id;
   const after=read();assert.equal(after.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,stock);assert.equal(after.prepare('SELECT COUNT(*) AS n FROM sales').get().n,sales);after.close();
  });
  await check('Editar proforma existente mantiene número y no mueve inventario',async()=>{
   const old=await call('GET',`/api/companies/${a}/quotations/${quoteId}`);assert.equal(old.status,200,JSON.stringify(old.body));
   const l=old.body.lines[0];
   const updated=await call('PUT',`/api/companies/${a}/quotations/${quoteId}`,{client_id:clientId,title:'Proforma QA editada',lines:[{existing_line_id:l.id,quantity:3,description:l.description}]});
   assert.equal(updated.status,200,JSON.stringify(updated.body));assert.equal(updated.body.id,quoteId);
   const sql=read();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM quotations').get().n,1);assert.equal(sql.prepare('SELECT quantity FROM quotation_lines WHERE quotation_id=?').get(quoteId).quantity,3);sql.close();
  });
  await check('Eliminar proforma respeta empresa, borra sus líneas y conserva inventario y ventas',async()=>{
   const before=read();const stock=before.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,sales=before.prepare('SELECT COUNT(*) AS n FROM sales').get().n;before.close();
   let result=await call('DELETE',`/api/companies/${b}/quotations/${quoteId}`);assert.equal(result.status,404);
   result=await call('DELETE',`/api/companies/${a}/quotations/0`);assert.equal(result.status,400);
   result=await call('GET',`/api/companies/${a}/quotations/${quoteId}`);assert.equal(result.status,200);
   result=await call('DELETE',`/api/companies/${a}/quotations/${quoteId}`);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.ok,true);
   const after=read();assert.equal(after.prepare('SELECT COUNT(*) AS n FROM quotations WHERE id=?').get(quoteId).n,0);assert.equal(after.prepare('SELECT COUNT(*) AS n FROM quotation_lines WHERE quotation_id=?').get(quoteId).n,0);assert.equal(after.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,stock);assert.equal(after.prepare('SELECT COUNT(*) AS n FROM sales').get().n,sales);after.close();
   result=await call('GET',`/api/companies/${a}/quotations/${quoteId}`);assert.equal(result.status,404);
   result=await call('DELETE',`/api/companies/${a}/quotations/${quoteId}`);assert.equal(result.status,404);
  });
  await check('Respaldo SQLite automático es íntegro',async()=>{
   const result=await call('POST','/api/backups/automatic/run');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.created,true);
   const files=fs.readdirSync(path.join(temp,'db','automatic-backups'));assert.ok(files.length>=1);
   const bk=new DatabaseSync(path.join(temp,'db','automatic-backups',files[0]),{readOnly:true});assert.equal(bk.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(bk.prepare('SELECT COUNT(*) AS n FROM companies').get().n,2);bk.close();
  });
  await check('Configuración de respaldos valida frecuencia y retención',async()=>{
   const invalid=await call('PUT','/api/backups/automatic',{enabled:true,frequency:'hourly',time:'20:00',keep:-1});assert.equal(invalid.status,400);
   const valid=await call('PUT','/api/backups/automatic',{enabled:false,frequency:'weekly',time:'21:15',keep:7});assert.equal(valid.status,200);
   const current=await call('GET','/api/backups/automatic');assert.equal(current.body.config.keep,7);assert.equal(current.body.config.frequency,'weekly');
  });
  await check('Inventario insuficiente revierte toda la transacción',async()=>{
   const sql=read(),oldStock=sql.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,oldSales=sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n;sql.close();
   const r=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:0,lines:[{product_id:prodId,quantity:100}],payments:[{method:'Tarjeta',amount:70000}]});
   assert.equal(r.status,400);const checkDb=read();assert.equal(checkDb.prepare('SELECT stock FROM products WHERE id=?').get(prodId).stock,oldStock);assert.equal(checkDb.prepare('SELECT COUNT(*) AS n FROM sales').get().n,oldSales);checkDb.close();
  });
  await check('Descuento negativo y pago excesivo se rechazan',async()=>{
   const a1=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:-1,lines:[{product_id:prodId,quantity:1}],payments:[]});assert.equal(a1.status,400);
   const a2=await call('POST',`/api/companies/${a}/sales`,{sale_type:'contado',discount:0,lines:[{product_id:prodId,quantity:1}],payments:[{method:'Efectivo',amount:701}]});assert.equal(a2.status,400);
  });
  await check('Configuración impresión se guarda en la base',async()=>{
   const settings={logo:'',autoPrint:true,paperWidth:'80'};
   const r=await call('PUT',`/api/companies/${a}/ticket-settings`,settings);assert.equal(r.status,200,JSON.stringify(r.body));
   const get=await call('GET',`/api/companies/${a}/ticket-settings`);assert.equal(get.body.settings.autoPrint,true);
  });
  await check('Prueba de carga SQLite: búsqueda indexada y 10.000 artículos',async()=>{
   const db=new DatabaseSync(path.join(temp,'bulk.sqlite'));
   db.exec('CREATE TABLE products(id INTEGER PRIMARY KEY, description TEXT, sku TEXT UNIQUE, stock INTEGER)');
   const insert=db.prepare('INSERT INTO products(description,sku,stock) VALUES (?,?,?)');
   db.exec('BEGIN');for(let i=0;i<10000;i++)insert.run(`Artículo QA ${i}`,`SKU${i}`,100);db.exec('COMMIT');
   const stmt=db.prepare('SELECT * FROM products WHERE sku=?');
   const start=performance.now();for(let i=0;i<1000;i++)assert.equal(stmt.get(`SKU${i*9}`).stock,100);
   const ms=Math.round(performance.now()-start);assert.ok(ms<5000,`1.000 consultas tardaron ${ms} ms`);db.close();
   console.log('   Datos sintéticos, 10.000 artículos y 1.000 búsquedas:',ms,'ms (NO representa el rendimiento de Electron)');
  });
  await check('Dashboard avanzado: métricas, cliente, condición y separación entre empresas',async()=>{
   const range='from=2026-01-01&to=2026-12-31';
   let r=await call('GET',`/api/companies/${a}/dashboard?${range}`);
   assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.summary.revenue_cents>0);
   assert.ok(r.body.summary.annulled_count>=1);assert.ok(r.body.top_clients.length>=1);
   assert.ok(r.body.sale_types.length>=1);assert.ok(r.body.summary.units>=1);
   r=await call('GET',`/api/companies/${b}/dashboard?${range}`);assert.equal(r.status,200);assert.equal(r.body.summary.revenue_cents,0);
   r=await call('GET',`/api/companies/${a}/dashboard?${range}&client=${clientId}`);assert.equal(r.status,200);assert.ok(r.body.summary.revenue_cents>0);
   assert.ok(r.body.top_clients.every(c=>c.client_id===clientId));
   r=await call('GET',`/api/companies/${a}/dashboard?${range}&client=${clientId}&type=credito`);assert.equal(r.status,200);assert.ok(r.body.sale_types.every(x=>x.type==='credito'));
   r=await call('GET',`/api/companies/${b}/dashboard?${range}&client=${clientId}`);assert.equal(r.status,400);
  });
  await check('Rentabilidad muestra cobertura parcial y omite líneas sin costo histórico',async()=>{
   const sql=new DatabaseSync(dbPath);
   try{sql.prepare('UPDATE sale_lines SET unit_cost_cents=NULL WHERE sale_id=?').run(creditId)}finally{sql.close()}
   const r=await call('GET',`/api/companies/${a}/dashboard?from=2026-01-01&to=2026-12-31`);
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.ok(r.body.profitability.priced_lines>=1);
   assert.ok(r.body.profitability.unpriced_lines>=1);
   assert.equal(r.body.profitability.estimated_gross_margin_cents,r.body.profitability.covered_net_sales_cents-r.body.profitability.cost_cents);
   assert.ok(r.body.monthly.length>=1);
   assert.ok(r.body.comparison.from<'2026-01-01');
  });
  await check('Rentabilidad por producto respeta cobertura, costos históricos y aislamiento de empresa',async()=>{
   const range='from=2026-01-01&to=2026-12-31';
   const r=await call('GET',`/api/companies/${a}/dashboard?${range}`);
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.ok(Array.isArray(r.body.product_margins));
   const item=r.body.product_margins.find(x=>x.product_id===prodId);
   assert.ok(item,'Debe existir la línea del producto con costo histórico');
   assert.equal(item.covered_net_sales_cents-item.historical_cost_cents,item.margin_cents);
   assert.ok(item.unpriced_lines>=1,'La línea histórica sin costo no debe desaparecer');
   assert.equal(item.priced_lines+item.unpriced_lines,item.total_lines);
   assert.equal(item.coverage_pct,Math.round(item.priced_lines*10000/item.total_lines)/100);
   const other=await call('GET',`/api/companies/${b}/dashboard?${range}`);
   assert.deepEqual(other.body.product_margins,[],'No deben filtrarse productos de otras empresas');
   const filtered=await call('GET',`/api/companies/${a}/dashboard?${range}&client=${clientId}`);
   assert.equal(filtered.status,200);
   assert.ok(filtered.body.product_margins.every(x=>x.priced_lines+x.unpriced_lines===x.total_lines));
   const invalid=await call('GET',`/api/companies/${b}/dashboard?${range}&client=${clientId}`);
   assert.equal(invalid.status,400);
  });
  await check('Rentabilidad por producto aparece en CSV y ambos tipos de PDF',async()=>{
   const q='from=2026-01-01&to=2026-12-31';
   const csv=await call('GET',`/api/companies/${a}/dashboard/export.csv?${q}&kind=resumen`);
   assert.equal(csv.status,200);assert.ok(csv.body.includes('Rentabilidad por artículo'));
   assert.ok(csv.body.includes('Líneas sin costo'));assert.ok(csv.body.includes('Margen cubierto CRC'));
   for(const kind of ['resumen','detallado']){
    const html=await call('GET',`/api/companies/${a}/dashboard/export.html?${q}&kind=${kind}`);
    assert.equal(html.status,200);assert.ok(html.body.includes('Rentabilidad por producto'));
    assert.ok(html.body.includes('Costo histórico'));
   }
  });
  await check('Dashboard: método, estado y paginación',async()=>{
   const base=`/api/companies/${a}/dashboard`;
   let r=await call('GET',base+'?from=2026-01-01&to=2026-12-31&method=Tarjeta');
   assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.summary.sale_count>=1);
   assert.ok(r.body.payment_methods.every(x=>x.method==='Tarjeta'));
   r=await call('GET',base+'?from=2026-01-01&to=2026-12-31&status=anuladas');
   assert.equal(r.status,200);assert.equal(r.body.summary.revenue_cents,0);assert.ok(r.body.sales_count>=1);
   r=await call('GET',base+'/sales?from=2026-01-01&to=2026-12-31&page=1');assert.equal(r.status,200);
   assert.ok(r.body.rows.length<=50);assert.ok(r.body.rows.every(x=>x.status==='activa'));
   r=await call('GET',base+'/sales?from=2026-01-01&to=2026-12-31&page=0');assert.equal(r.status,400);
  });
  await check('Exportación CSV y PDF contiene los datos solicitados',async()=>{
   const base=`/api/companies/${a}/dashboard/`,q='from=2026-01-01&to=2026-12-31&kind=detallado';
   let r=await call('GET',base+'export.csv?'+q);
   assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.includes('Número venta'));assert.ok(r.body.includes('Filtro desde UTC'));
   assert.ok(r.body.includes('Cliente QA'));
   r=await call('GET',base+'export.html?'+q);assert.equal(r.status,200);
   assert.ok(r.body.includes('Reporte comercial'));assert.ok(r.body.includes('Detalle completo'));
   assert.ok(r.body.includes('Cliente QA'));
  });
  await check('CSV detallado exporta más de 500 ventas mientras la tabla pagina de 50 en 50',async()=>{
   const bulk=new DatabaseSync(dbPath);
   try{
    const insert=bulk.prepare("INSERT INTO sales(company_id,sale_type,status,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents,created_at) VALUES (?, 'contado','activa',100,0,13,113,113,0,'2026-05-04 12:00:00')");
    bulk.exec('BEGIN');for(let i=0;i<510;i++)insert.run(a);bulk.exec('COMMIT');
   }finally{bulk.close()}
   const q='from=2026-05-04&to=2026-05-04';
   const page1=await call('GET',`/api/companies/${a}/dashboard/sales?${q}&page=1`);
   const page2=await call('GET',`/api/companies/${a}/dashboard/sales?${q}&page=2`);
   assert.equal(page1.status,200);assert.equal(page1.body.total,510);assert.equal(page1.body.rows.length,50);assert.equal(page2.body.rows.length,50);
   const csv=await call('GET',`/api/companies/${a}/dashboard/export.csv?${q}&kind=detallado`);
   assert.equal(csv.status,200);assert.equal(csv.body.trim().split('\r\n').length,512,'sep=; + cabecera + 510 ventas');
  });
  await check('Comparación anterior respeta rango y mantiene separadas empresas y anulaciones',async()=>{
   const sql=new DatabaseSync(dbPath);
   try{
    sql.prepare("INSERT INTO sales(company_id,sale_type,status,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents,created_at) VALUES (?, 'contado','activa',1000,0,130,1130,1130,0,'2026-05-03 12:00:00')").run(a);
    sql.prepare("INSERT INTO sales(company_id,sale_type,status,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents,created_at) VALUES (?, 'contado','activa',100000,0,13000,113000,113000,0,'2026-05-03 12:00:00')").run(b);
   }finally{sql.close()}
   const r=await call('GET',`/api/companies/${a}/dashboard?from=2026-05-04&to=2026-05-04`);
   assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.comparison.from,'2026-05-03');assert.equal(r.body.comparison.to,'2026-05-03');
   assert.equal(r.body.comparison.previous.revenue_cents,1130);
   assert.equal(r.body.comparison.previous.sale_count,1);
   const csv=await call('GET',`/api/companies/${a}/dashboard/export.csv?from=2026-05-04&to=2026-05-04&kind=resumen`);
   assert.equal(csv.status,200);assert.ok(csv.body.includes('Margen bruto estimado'));assert.ok(csv.body.includes('Comparación con período anterior'));
   const pdf=await call('GET',`/api/companies/${a}/dashboard/export.html?from=2026-05-04&to=2026-05-04&kind=resumen`);
   assert.equal(pdf.status,200);assert.ok(pdf.body.includes('Margen bruto estimado'));
  });
  await check('Kardex: snapshot de costo nuevo, cambios posteriores y exportaciones',async()=>{
   const initial=read();
   const first=initial.prepare('SELECT unit_cost_cents,delta FROM inventory_movements WHERE company_id=? AND product_id=? ORDER BY id LIMIT 1').get(a,prodId);
   assert.equal(first.unit_cost_cents,30000,'Movimiento inicial debe guardar costo ₡300');initial.close();
   let r=await call('POST',`/api/companies/${a}/inventory/movements`,{product_id:prodId,movement_type:'entrada',quantity:2,reason:'Compra para pruebas de costos'});
   assert.equal(r.status,201,JSON.stringify(r.body));
   const before=read();assert.equal(before.prepare('SELECT unit_cost_cents FROM inventory_movements WHERE id=?').get(r.body.id).unit_cost_cents,30000);before.close();
   const modify=new DatabaseSync(dbPath);
   modify.prepare('UPDATE products SET cost=500 WHERE company_id=? AND id=?').run(a,prodId);
   modify.close();
   r=await call('POST',`/api/companies/${a}/inventory/movements`,{product_id:prodId,movement_type:'entrada',quantity:1,reason:'Compra con nuevo costo registrado'});
   assert.equal(r.status,201,JSON.stringify(r.body));
   const verify=read();
   assert.equal(verify.prepare('SELECT unit_cost_cents FROM inventory_movements WHERE id=?').get(r.body.id).unit_cost_cents,50000);
   assert.equal(verify.prepare('SELECT unit_cost_cents FROM inventory_movements WHERE company_id=? AND product_id=? ORDER BY id LIMIT 1').get(a,prodId).unit_cost_cents,30000);
   verify.close();
   const k=await call('GET',`/api/companies/${a}/inventory/kardex?productId=${prodId}`);
   assert.equal(k.status,200);assert.ok(k.body.summary.covered>=2);assert.ok(k.body.summary.incomingCents>=110000);
   const csv=await call('GET',`/api/companies/${a}/inventory/kardex/export.csv?productId=${prodId}`);
   assert.equal(csv.status,200);assert.ok(csv.body.includes('Costo unitario histórico CRC'));assert.ok(csv.body.includes('500.00'));
   const pdf=await call('GET',`/api/companies/${a}/inventory/kardex/export.html?productId=${prodId}`);
   assert.equal(pdf.status,200);assert.ok(pdf.body.includes('Movimientos sin costo histórico'));
  });
  await check('Kardex: filas anteriores sin costo siguen sin valorar',async()=>{
   const old=new DatabaseSync(dbPath);
   const id=old.prepare('SELECT id FROM inventory_movements WHERE company_id=? AND product_id=? ORDER BY id LIMIT 1').get(a,prodId).id;
   old.prepare('UPDATE inventory_movements SET unit_cost_cents=NULL WHERE id=?').run(id);
   old.close();
   const r=await call('GET',`/api/companies/${a}/inventory/kardex?productId=${prodId}`);
   assert.equal(r.status,200);assert.ok(r.body.summary.uncovered>=1);
   assert.equal(r.body.rows.find(x=>x.id===id).movementCostCents,null);
  });
  await check('Dashboard rechaza fechas, clientes y filtros inválidos',async()=>{
   for(const suffix of ['from=2026-02-30&to=2026-03-01','from=2026-12-31&to=2026-01-01','from=2026-01-01&to=2026-12-31&type=incorrecto','from=2026-01-01&to=2026-12-31&method=Inexistente']){
    const r=await call('GET',`/api/companies/${a}/dashboard?${suffix}`);assert.equal(r.status,400,suffix);
   }
  });
 } finally{await started.close()}
 console.log(`QA integración local: ${passed} superadas / ${passed+failed}, ${failed} errores`);
 if(failed)process.exitCode=1;
})().catch(e=>{console.error('Fallo al iniciar QA:',e.stack||e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true})});
