'use strict';
// QA correctivo: Kardex operativo sin costos, CSV Windows y auditoría PDF legible.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const root=path.join(__dirname,'..');
 const {registerKardexRoutes}=await import('../server/kardex.js');
 const {auditDetail,auditColumns,auditPdfHtml}=await import('../src/audit-presentation.js');
 const {csvExcelBlob,csvSafeCell}=await import('../src/csv-export.js');
 const {ensureAccessSchema}=await import('../server/access-schema.js');
 const {registerAuth}=await import('../server/auth.js');
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE companies(id INTEGER PRIMARY KEY,legal_name TEXT,trade_name TEXT,identification TEXT);
  CREATE TABLE products(id INTEGER PRIMARY KEY,company_id INTEGER,description TEXT,product_code TEXT,unit TEXT,is_deleted INTEGER DEFAULT 0,kind TEXT,stock INTEGER,track_stock INTEGER,cost INTEGER);
  CREATE TABLE inventory_movements(id INTEGER PRIMARY KEY,company_id INTEGER,product_id INTEGER,created_at TEXT,movement_type TEXT,quantity INTEGER,delta INTEGER,stock_before INTEGER,stock_after INTEGER,reason TEXT,notes TEXT,unit_cost_cents INTEGER);
  INSERT INTO companies VALUES(1,'Negocio de pruebas','Negocio de pruebas','001001001');
  INSERT INTO products VALUES(5,1,'Café de montaña','CAF001','Unid',0,'producto',200,1,90000);
  INSERT INTO inventory_movements VALUES(1,1,5,'2026-11-10 10:00:00','ajuste',200,200,0,200,'Conteo físico','Bodega principal',90000);`);
 const handlers=[];const app={get(path,fn){handlers.push(['GET',path,fn])},post(path,...fns){handlers.push(['POST',path,fns])},put(path,...fns){handlers.push(['PUT',path,fns])},delete(path,...fns){handlers.push(['DELETE',path,fns])},use(path,...fns){handlers.push(['USE',path,fns])}};
 registerKardexRoutes(app,db);
 let pass=0;
 async function check(title,fn){await fn();pass++;console.log('OK',title)}
 const api=async(path,query={})=>{
  const entry=handlers.find(x=>x[0]==='GET'&&x[1]===path);assert.ok(entry,'Ruta no encontrada: '+path);
  const result={statusCode:200,headers:{},chunks:[],data:null};
  const res={status(n){result.statusCode=n;return this},setHeader(k,v){result.headers[k.toLowerCase()]=v;return this},type(t){result.headers['content-type']=t;return this},write(b){result.chunks.push(Buffer.isBuffer(b)?b:Buffer.from(b));return this},end(){result.data=Buffer.concat(result.chunks);return this},json(v){result.data=v;return this},send(v){result.data=v;return this}};
  await entry[2]({params:{companyId:'1'},query},res);return result;
 };
 await check('Kardex operativo limita explícitamente los campos visibles',()=>{
  const source=fs.readFileSync(path.join(root,'server/kardex.js'),'utf8');
  const match=source.match(/const operationalFields=`([^`]+)`/);
  assert.ok(match);assert.ok(!/cost|price|valor|margin|profit|currency|unit_cost/i.test(match[1]));
 });
 const operational=await api('/api/companies/:companyId/inventory/kardex/operativo');
 await check('Consulta operativa devuelve existencias y ningún dato financiero',()=>{
  assert.equal(operational.statusCode,200);assert.equal(operational.data.rows.length,1);
  assert.equal(operational.data.rows[0].product_name,'Café de montaña');
  assert.equal(operational.data.rows[0].stock_after,200);
  const serialized=JSON.stringify(operational.data);
  for(const key of ['unit_cost_cents','unitCostCents','cost','price','movementCostCents'])assert.ok(!serialized.includes('"'+key+'"'));
 });
 await check('Filtros operativos de tipo y artículo respetan consulta',async()=>{
  const one=await api('/api/companies/:companyId/inventory/kardex/operativo',{type:'ajuste',productId:'5'});
  const none=await api('/api/companies/:companyId/inventory/kardex/operativo',{type:'salida'});
  assert.equal(one.data.rows.length,1);assert.equal(none.data.rows.length,0);
 });
 const csv=await api('/api/companies/:companyId/inventory/kardex/operativo/export.csv');
 await check('Kardex operativo exporta UTF-16 LE con acentos y sin costos',()=>{
  assert.equal(csv.data[0],0xff);assert.equal(csv.data[1],0xfe);
  const decoded=csv.data.subarray(2).toString('utf16le');
  assert.ok(decoded.startsWith('sep=;\r\n'));assert.match(decoded,/Café de montaña/);assert.match(decoded,/Conteo físico/);
  assert.doesNotMatch(decoded,/Costo|90000/);
 });
 const pdf=await api('/api/companies/:companyId/inventory/kardex/operativo/export.html');
 await check('Kardex operativo genera HTML para PDF sin precio ni valoración',()=>{
  assert.match(pdf.data,/Kardex operativo/);assert.match(pdf.data,/Café de montaña/);
  assert.doesNotMatch(pdf.data,/90000|Costo histórico|Valor movimiento/);
 });
 const auditEvent={id:3,occurred_at:'2026-11-10 10:00:00',username:'cajero01',display_name:'Cajero',trade_name:'Comercio Ñandú',event_type:'inventory.movement',details:{method:'POST',productId:5,type:'ajuste',quantity:200,reason:'Conteo físico'},product_name:'Café de montaña',product_code:'CAF001'};
 await check('Auditoría presenta acción, producto y motivo sin JSON técnico',()=>{
  const txt=auditDetail(auditEvent);assert.match(txt,/Ajuste por conteo físico/);assert.match(txt,/Café de montaña/);
  assert.match(txt,/Existencia contada: 200/);assert.doesNotMatch(txt,/method|productId|"type"|POST/);
 });
 await check('El CSV de auditoría funciona en Excel Windows con acentos y BOM',async()=>{
  const headers=['ID','Fecha Costa Rica','Usuario','Empresa','Operación','Detalle'];
  const row=auditColumns(auditEvent);const csv=['sep=;',headers.map(csvSafeCell).join(';'),row.map(csvSafeCell).join(';')].join('\r\n');
  const bytes=Buffer.from(await csvExcelBlob(csv).arrayBuffer());assert.deepEqual([...bytes.subarray(0,2)],[0xff,0xfe]);
  const decoded=bytes.subarray(2).toString('utf16le');assert.match(decoded,/Café de montaña/);assert.match(decoded,/Conteo físico/);assert.match(decoded,/Comercio Ñandú/);
  assert.doesNotMatch(decoded,/"method"|"productId"|"quantity"/);
 });
 await check('El HTML PDF de auditoría incorpora encabezado, filtros y detalle claro',()=>{
  const html=auditPdfHtml([auditEvent],{total:3,page:1,filters:{category:'inventory.',from:'2026-11-10',to:'2026-11-10'}});
  assert.match(html,/Auditoría del propietario/);assert.match(html,/Kardex/);assert.match(html,/Conteo físico/);assert.match(html,/@page/);
  assert.doesNotMatch(html,/\{"method"/);
 });
 await check('El reporte PDF escapa texto inyectado',()=>{
  const bad={...auditEvent,product_name:'<script>alert(1)</script>'};const html=auditPdfHtml([bad]);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 });
 await check('La pantalla de cajero contiene el botón de actualización y un historial visible',()=>{
  const jsx=fs.readFileSync(path.join(root,'src/CashierStockPanel.jsx'),'utf8');
  assert.match(jsx,/Actualizar inventario y movimientos/);assert.match(jsx,/Historial y reportes/);assert.match(jsx,/setRevision\(n=>n\+1\)/);
  assert.match(jsx,/exportReport\('pdf'\)/);assert.doesNotMatch(jsx,/Ingresos y tomas físicas/i);
 });
 await check('El menú del cajero muestra solo Kardex operativo y conserva el Kardex global',()=>{
  const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
  assert.match(main,/cashier-kardex/);assert.match(main,/Kardex · Movimientos/);assert.doesNotMatch(main,/Ingresos \/ Tomas físicas/);
 });
 ensureAccessSchema(db);
 const authHandlers=[];registerAuth({get(p,...f){authHandlers.push(['GET',p,f])},post(p,...f){authHandlers.push(['POST',p,f])},put(p,...f){authHandlers.push(['PUT',p,f])},delete(p,...f){authHandlers.push(['DELETE',p,f])},use(p,...f){authHandlers.push(['USE',p,f])}},()=>db,{mailConfigured:()=>false,sendMail:async()=>({})});
 await check('El endpoint operativo sigue bajo permisos de inventario sin abrir el Kardex completo',()=>{
  const authText=fs.readFileSync(path.join(root,'server/auth.js'),'utf8');
  assert.match(authText,/inventory\\\/kardex\\\/operativo/);assert.match(authText,/inventory\.read/);
  assert.ok(authHandlers.some(x=>x[0]==='USE'&&x[1]==='/api'));
 });
 db.close();console.log(`QA Kardex y auditoría: ${pass}/${pass} aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
