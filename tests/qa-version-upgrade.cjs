// QA real de actualización de instaladores DIFERENTES: FacturaCR 0.6.34 -> 0.6.59.
// Exclusivamente en runners efímeros Windows de GitHub Actions, jamás en un equipo del usuario.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const {assertHistoricalRowsPreserved}=require('./qa-upgrade-schema.cjs');
const {authenticateUpgradeApi}=require('./qa-version-auth.cjs');
const root=path.resolve(__dirname,'..');
const release=path.join(root,'release');
const evidence=path.join(release,'qa-evidence');
const previousVersion='0.6.34';
const currentVersion=require('../package.json').version;
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'){
 console.error('Seguridad: esta prueba solo puede ejecutarse en un runner temporal Windows de GitHub Actions.');process.exit(1);
}
assert.equal(currentVersion,'0.6.59','La prueba requiere ajustar explícitamente las versiones esperadas');
function installerFromEnv(key){
 const value=process.env[key];
 assert.ok(value,`Falta ${key}`);
 const full=path.resolve(value);
 assert.ok(fs.statSync(full).isFile()&&full.toLowerCase().endsWith('.exe'),`Instalador inválido: ${full}`);
 return full;
}
const previousInstaller=installerFromEnv('FACTURACR_QA_PREVIOUS_INSTALLER');
const currentInstaller=installerFromEnv('FACTURACR_QA_CURRENT_INSTALLER');
assert.notEqual(previousInstaller,currentInstaller,'Los instaladores deben ser archivos distintos');
const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa-cross-version-'));
const installDir=path.join(tempRoot,'app');
const dataDir=path.join(tempRoot,'datos');
const dbFile=path.join(dataDir,'facturacr.sqlite');
const exe=path.join(installDir,'FacturaCR.exe');
const report={previousVersion,currentVersion,passed:false,steps:[],previousSha256:null,currentSha256:null};
const marker='QA_VERSION_'+process.pid+'_'+Date.now();
// El smoke del .exe crea el propietario. La contraseña se comparte solo con los
// procesos temporales de QA, para iniciar una NUEVA sesión en la API posterior.
const ownerUsername='qa_propietario';
const ownerPassword='QaTemporal'+crypto.randomBytes(24).toString('hex')+'9';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
fs.mkdirSync(evidence,{recursive:true});
fs.mkdirSync(dataDir,{recursive:true});
function hashFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function run(file,args,timeoutMs=210000){return new Promise((resolve,reject)=>{
 const child=spawn(file,args,{cwd:root,windowsHide:true,stdio:'ignore'});
 let done=false;
 const timer=setTimeout(()=>{if(!done){done=true;child.kill();reject(Error('Tiempo agotado: '+file))}},timeoutMs);
 child.once('error',e=>{if(!done){done=true;clearTimeout(timer);reject(e)}});
 child.once('exit',(code,signal)=>{if(!done){done=true;clearTimeout(timer);code===0?resolve():reject(Error(`${path.basename(file)} terminó con ${code} (${signal})`))}});
})}
function mark(name,details={}){report.steps.push({name,ok:true,...details});console.log('OK',name)}
async function smoke(stage,expected){
 const resultFile=path.join(tempRoot,stage+'.json');
 const shot=path.join(tempRoot,stage+'.png');
 const child=spawn(exe,['--qa-smoke',`--qa-data-dir=${dataDir}`,`--qa-result=${resultFile}`,`--qa-screenshot=${shot}`],{cwd:root,windowsHide:false,stdio:'ignore',
   env:{...process.env,FACTURACR_QA_OWNER_PASSWORD:ownerPassword}});
 let exited=false;
 child.once('exit',()=>{exited=true});
 try{
  const deadline=Date.now()+110000;
  while(Date.now()<deadline&&!fs.existsSync(resultFile)&&!exited)await sleep(350);
  assert.ok(fs.existsSync(resultFile),`El programa no generó resultado en ${stage}`);
  const result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
  assert.equal(result.success,true,JSON.stringify(result));
  assert.equal(result.health?.ok,true);
  assert.equal(result.health?.version,expected,`El ejecutable no corresponde a ${expected}`);
  assert.ok(result.dom?.navButtons>=4,'Menú no disponible');
  fs.copyFileSync(resultFile,path.join(evidence,'cross-version-'+stage+'.json'));
  if(fs.existsSync(shot))fs.copyFileSync(shot,path.join(evidence,'cross-version-'+stage+'.png'));
  mark('arranque-'+stage,{version:expected});
 }finally{
  const deadline=Date.now()+12000;
  while(!exited&&Date.now()<deadline)await sleep(200);
  if(!exited){child.kill();await sleep(600)}
 }
}
const TABLES=['companies','clients','products','sales','sale_lines','sale_payments','inventory_movements','quotations','quotation_lines','company_ticket_settings','company_quote_settings'];
function snapshot(db){
 const data={};
 for(const table of TABLES){
  data[table]=db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
 }
 return data;
}
function seedPrevious(){
 const Database=require('better-sqlite3');
 const db=new Database(dbFile);
 db.pragma('foreign_keys = ON');
 try{
  const populate=db.transaction(()=>{
   const company=db.prepare('INSERT INTO companies(legal_name,identification,trade_name,avatar_color) VALUES(?,?,?,?)').run('QA Comercio anterior',marker,'Sucursal prueba','#167f70').lastInsertRowid;
   const secondary=db.prepare('INSERT INTO companies(legal_name,identification) VALUES (?,?)').run('QA Empresa independiente',marker+'B').lastInsertRowid;
   const client=db.prepare('INSERT INTO clients(company_id,name,identification,email,phone,trade_name,address) VALUES(?,?,?,?,?,?,?)').run(company,'Cliente persistente','117770001','qa@example.invalid','88880000','Nombre comercial','Dirección de prueba').lastInsertRowid;
   const product=db.prepare('INSERT INTO products(company_id,kind,description,price,currency,tax_rate,stock,track_stock,product_code,price_includes_tax) VALUES(?,?,?,?,?,?,?,?,?,?)').run(company,'producto','Artículo de prueba',700,'CRC',13,7,1,'QASKU',1).lastInsertRowid;
   const sale=db.prepare('INSERT INTO sales(company_id,client_id,sale_type,status,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents) VALUES(?,?,?,?,?,?,?,?,?,?)').run(company,client,'credito','activa',61900,0,8100,70000,20000,50000).lastInsertRowid;
   db.prepare('INSERT INTO sale_lines(sale_id,product_id,description,quantity,unit_price_cents,tax_rate,discount_cents,subtotal_cents,tax_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?)').run(sale,product,'Artículo de prueba',1,61900,13,0,61900,8100,70000);
   db.prepare('INSERT INTO sale_payments(sale_id,method,amount_cents) VALUES(?,?,?)').run(sale,'Efectivo',20000);
   db.prepare('INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason) VALUES(?,?,?,?,?,?,?,?)').run(company,product,'salida',1,-1,8,7,'Venta POS');
   const quote=db.prepare('INSERT INTO quotations(company_id,client_id,client_name,client_identification,client_email,client_phone,title,terms,valid_days,logo_snapshot,subtotal_cents,tax_cents,total_cents,client_trade_name,client_address) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(company,client,'Cliente persistente','117770001','qa@example.invalid','88880000','Proforma histórica','Condiciones históricas',15,'',61900,8100,70000,'Nombre comercial','Dirección de prueba').lastInsertRowid;
   db.prepare('INSERT INTO quotation_lines(quotation_id,description,quantity,unit_price_cents,tax_rate,subtotal_cents,tax_cents,total_cents,source_product_id,input_price_cents,input_includes_tax) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(quote,'Artículo de prueba',1,61900,13,61900,8100,70000,product,70000,1);
   db.prepare('INSERT INTO company_ticket_settings(company_id,settings_json) VALUES(?,?)').run(company,JSON.stringify({logo:'',note:'Ticket persistente'}));
   db.prepare('INSERT INTO company_quote_settings(company_id,settings_json) VALUES(?,?)').run(company,JSON.stringify({logo:'',terms:'Proforma persistente'}));
   assert.equal(db.prepare('SELECT COUNT(*) n FROM clients WHERE company_id=?').get(secondary).n,0);
  });
  populate();
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  return snapshot(db);
 }finally{db.close()}
}
function verifyAfter(expected){
 const Database=require('better-sqlite3');
 const db=new Database(dbFile,{readonly:true,fileMustExist:true});
 try{
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok','Integridad SQLite');
  assert.deepEqual(db.pragma('foreign_key_check'),[],'Integridad de relaciones');
  assertHistoricalRowsPreserved(expected,snapshot(db));
  const sale=db.prepare('SELECT total_cents,paid_cents,balance_cents FROM sales').get();
  assert.equal(sale.total_cents-sale.paid_cents,sale.balance_cents,'Saldo de crédito alterado');
  assert.equal(db.prepare('SELECT stock FROM products').get().stock,7,'Inventario alterado');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM quotations').get().n,1,'Proforma perdida');
 }finally{db.close()}
}
async function verifyApiAfterUpgrade(){
 const {pathToFileURL}=require('node:url');
 const {startServer}=await import(pathToFileURL(path.join(root,'server/index.js')).href);
 const active=await startServer({dataDir,port:0});
 try{
  const base=`http://127.0.0.1:${active.port}`;
  // El login de Electron pertenece a otro proceso. La nueva API requiere
  // una sesión propia, creada por el endpoint normal y cookie HttpOnly.
  const auth=await authenticateUpgradeApi(base,{username:ownerUsername,password:ownerPassword});
  const get=auth.get;
  const health=await get('/api/health');assert.equal(health.version,currentVersion);
  const companies=await get('/api/companies');
  // También después del login, las solicitudes sin cookie deben seguir bloqueadas.
  await auth.verifyUnauthorized('/api/companies');
  assert.equal(companies.length,2,'Las empresas no aparecen en la API actualizada');
  const company=companies.find(c=>c.identification===marker);
  assert.ok(company,'No aparece la empresa principal');
  const id=company.id;
  const sales=await get(`/api/companies/${id}/sales`);
  assert.equal(sales.length,1,'La venta histórica no es consultable');
  assert.equal(sales[0].balance_cents,50000);
  const quotes=await get(`/api/companies/${id}/quotations`);
  assert.equal(quotes.length,1,'La proforma histórica no es consultable');
  const quote=await get(`/api/companies/${id}/quotations/${quotes[0].id}`);
  assert.equal(quote.lines.length,1,'La línea de la proforma no es consultable');
  const settings=await get(`/api/companies/${id}/quote-settings`);
  assert.equal(settings.settings.terms,'Proforma persistente');
  const other=await get(`/api/companies/${companies.find(c=>c.id!==id).id}/sales`);
  assert.equal(other.length,0,'Los datos de ventas se mezclaron entre empresas');
 }finally{await active.close()}
}
async function main(){
 report.previousSha256=hashFile(previousInstaller);
 report.currentSha256=hashFile(currentInstaller);
 assert.notEqual(report.previousSha256,report.currentSha256,'Los instaladores no pueden ser idénticos');
 await run(previousInstaller,['/S',`/D=${installDir}`]);
 assert.ok(fs.existsSync(exe),'No se instaló versión anterior');
 mark('instalacion-version-anterior');
 await smoke('antes-de-actualizar',previousVersion);
 assert.ok(fs.existsSync(dbFile),'No se creó la base de datos de la versión anterior');
 const original=seedPrevious();
 mark('datos-comerciales-en-version-anterior',{tables:TABLES.length});
 await run(currentInstaller,['/S',`/D=${installDir}`]);
 assert.ok(fs.existsSync(exe),'Desapareció FacturaCR.exe en la actualización');
 mark('instalacion-nueva-sobre-anterior');
 await smoke('despues-de-actualizar',currentVersion);
 verifyAfter(original);
 mark('datos-conservados-integridad-relaciones-saldos');
 await verifyApiAfterUpgrade();
 mark('api-actualizada-consulta-datos-historicos-y-separacion-empresas');
 report.passed=true;
 console.log('QA real de actualización de FacturaCR '+previousVersion+' a '+currentVersion+': APROBADO');
}
main().catch(e=>{report.error=String(e.stack||e);console.error('FALLÓ QA entre versiones:',report.error);process.exitCode=1})
.finally(()=>{
 try{fs.writeFileSync(path.join(evidence,'cross-version-upgrade-report.json'),JSON.stringify(report,null,2))}catch(e){console.error('Error al guardar evidencia',e.message)}
 try{fs.rmSync(tempRoot,{recursive:true,force:true,maxRetries:10,retryDelay:250})}catch(e){console.error('No se pudo borrar temporal de QA',e.message)}
});
