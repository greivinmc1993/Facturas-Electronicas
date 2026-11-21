'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {ensureCashSchema,registerCashRoutes}=await import(pathToFileURL(path.join(root,'server/cash.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 // Node experimental DatabaseSync no incluye el adaptador transaction() de better-sqlite3.
 db.transaction=fn=>(...args)=>{db.exec('BEGIN');try{const value=fn(...args);db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}};
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies(id) VALUES(1),(2);
  CREATE TABLE sales(id INTEGER PRIMARY KEY,company_id INTEGER,status TEXT);
  CREATE TABLE sale_payments(id INTEGER PRIMARY KEY,sale_id INTEGER,method TEXT,amount_cents INTEGER);
 `);ensureAccessSchema(db);ensureCashSchema(db);
 const add=db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm) VALUES (?,?,'placeholder_hash_more_than_20_characters','scrypt')");
 const cashier=Number(add.run('caja_cierre1','Cajero Uno').lastInsertRowid),another=Number(add.run('caja_cierre2','Cajero Dos').lastInsertRowid);
 for(const id of [cashier,another])db.prepare("INSERT INTO access_company_roles(user_id,company_id,role) VALUES (?,1,'cashier')").run(id);
 const make=db.prepare("INSERT INTO cash_sessions(company_id,opening_cents,opening_payment_id,status,opened_by_user_id,closed_at,counted_cents,expected_cents,difference_cents) VALUES (?,10000,0,'cerrada',?,CURRENT_TIMESTAMP,12500,12500,0)");
 const first=Number(make.run(1,cashier).lastInsertRowid),second=Number(make.run(1,another).lastInsertRowid),otherCompany=Number(make.run(2,cashier).lastInsertRowid);
 const routes=[];const app={get:(p,fn)=>routes.push(['GET',p,fn]),post:(p,fn)=>routes.push(['POST',p,fn])};
 registerCashRoutes(app,db,req=>Number(req.params.companyId));
 const call=(method,p,who={id:cashier,is_owner:0},body={},company='1',query={})=>{
  const route=routes.find(x=>x[0]===method&&x[1]===p);assert.ok(route,p);
  let status=200,output,headers={};
  const res={status(x){status=x;return this},json(v){output=v;return this},setHeader(k,v){headers[k]=v;return this},send(v){output=v;return this}};
  route[2]({params:{companyId:company,sessionId:String(body?.sessionId||first)},authUser:who,body,query},res);
  return{status,output,headers};
 };
 let n=0;const check=(title,fn)=>{fn();n++;console.log('OK',title)};
 const owner={id:99,is_owner:1};
 const makePdf=(text='ejemplo')=>Buffer.from(`%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n% ${text}\ntrailer <</Root 1 0 R>>\n%%EOF`).toString('base64');
 const listing='/api/companies/:companyId/cash/closures';
 const secureReport='/api/companies/:companyId/cash/closures/:sessionId/report.html';
 const meta='/api/companies/:companyId/cash/closures/:sessionId/metadata';
 const upload='/api/companies/:companyId/cash/closures/:sessionId/pdf';
 const download='/api/companies/:companyId/cash/closures/:sessionId/pdf';
 check('Migración aditiva guarda tabla PDF sin modificar sesiones',()=>{assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_sessions').get().n,3);assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cash_closure_pdfs'").get())});
 check('Cajero ve solamente sus cierres',()=>{const rows=call('GET',listing).output.items;assert.deepEqual(rows.map(s=>s.id),[first])});
 check('Propietario consulta cierres de la empresa, no otra',()=>{const rows=call('GET',listing,owner).output.items;assert.deepEqual(rows.map(s=>s.id),[second,first])});
 check('PDF sintético se archiva exactamente en su empresa y sesión',()=>{const r=call('POST',upload,{id:cashier,is_owner:0},{sessionId:first,pdfBase64:makePdf()});assert.equal(r.status,201);assert.match(r.output.sha256,/^[a-f0-9]{64}$/)});
 check('Cajero diferente no puede ver documento de otro',()=>{const r=call('GET',download,{id:another,is_owner:0},{sessionId:first});assert.equal(r.status,404)});
 check('Reporte para PDF de cajero ajeno devuelve 404',()=>{const r=call('GET',secureReport,{id:another,is_owner:0},{sessionId:first});assert.equal(r.status,404)});
 check('No permite archivar en empresa ajena',()=>{const r=call('POST',upload,{id:cashier,is_owner:0},{sessionId:otherCompany,pdfBase64:makePdf()});assert.equal(r.status,404)});
 check('Rechaza datos que no sean PDF',()=>{const r=call('POST',upload,owner,{sessionId:second,pdfBase64:Buffer.from('No es un PDF'.repeat(10)).toString('base64')});assert.equal(r.status,400)});
 check('PDF archivado no cambia ni aunque se intente volver a guardar',()=>{
  const original=db.prepare('SELECT sha256 FROM cash_closure_pdfs WHERE session_id=?').get(first).sha256;
  const r=call('POST',upload,owner,{sessionId:first,pdfBase64:makePdf('alterado')});
  assert.equal(r.output.alreadyArchived,true);assert.equal(db.prepare('SELECT sha256 FROM cash_closure_pdfs WHERE session_id=?').get(first).sha256,original);
 });
 check('PDF se recupera como binario y sin caché',()=>{
  const r=call('GET',download,owner,{sessionId:first});assert.equal(r.status,200);assert.ok(Buffer.isBuffer(r.output));assert.ok(r.output.subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(r.headers['Cache-Control'],'private, no-store');
 });
 check('Sesiones sin PDF se marcan como pendientes',()=>{const rows=call('GET',listing,owner).output.items;assert.equal(rows.find(s=>s.id===first).pdf_created_at!==null,true);assert.equal(rows.find(s=>s.id===second).pdf_created_at,null)});
 check('Metadatos autenticados contienen el cierre, usuario y SHA de SQLite',()=>{
  const result=call('GET',meta,owner,{sessionId:first});
  assert.equal(result.status,200);
  assert.equal(result.output.companyId,1);
  assert.equal(result.output.sessionId,first);
  assert.match(result.output.closedAt,/^20\d\d-/);
  assert.equal(result.output.closingUsername,'caja_cierre1');
  assert.match(result.output.sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.headers['Cache-Control'],'private, no-store');
 });
 check('Otro cajero no recibe metadatos del cierre',()=>assert.equal(call('GET',meta,{id:another,is_owner:0},{sessionId:first}).status,404));
 check('Metadatos quedan aislados por empresa',()=>assert.equal(call('GET',meta,owner,{sessionId:otherCompany}).status,404));
 check('Sesiones abiertas no admiten PDF',()=>{const run=db.prepare("INSERT INTO cash_sessions(company_id,opening_cents,opening_payment_id,status,opened_by_user_id) VALUES(1,100,0,'abierta',?)").run(cashier);const r=call('POST',upload,owner,{sessionId:Number(run.lastInsertRowid),pdfBase64:makePdf()});assert.equal(r.status,400)});
 check('Al cerrar guarda el usuario que ejecutó el arqueo',()=>{
  const response=call('POST','/api/companies/:companyId/cash/close',{id:cashier,username:'caja_cierre1',is_owner:0},{counted_amount:'1.00'});
  assert.equal(response.status,200,JSON.stringify(response.output));
  const record=db.prepare('SELECT closed_by_user_id,closed_by_username FROM cash_sessions WHERE id=?').get(response.output.closed.id);
  assert.equal(record.closed_by_user_id,cashier);assert.equal(record.closed_by_username,'caja_cierre1');
 });
 check('Usuario de cierre histórico no cambia al renombrar la cuenta',()=>{
  const record=db.prepare("SELECT id FROM cash_sessions WHERE closed_by_username='caja_cierre1' ORDER BY id DESC LIMIT 1").get();
  db.prepare("UPDATE access_users SET username='cajero_renombrado' WHERE id=?").run(cashier);
  const result=call('GET',meta,owner,{sessionId:record.id});
  assert.equal(result.output.closingUsername,'caja_cierre1');
 });
 check('Historial por empresa no permite sobrescritura entre empresas',()=>{assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_closure_pdfs').get().n,1);assert.equal(call('GET',listing,owner,{},'2').output.items.length,1)});
 db.close();console.log(`QA PDF de cierres: ${n}/${n}`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
