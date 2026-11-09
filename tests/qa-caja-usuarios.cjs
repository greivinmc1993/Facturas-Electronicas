'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const {registerCashRoutes,ensureCashSchema}=await import(pathToFileURL(path.join(root,'server/cash.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY);INSERT INTO companies(id) VALUES(1);CREATE TABLE sales(id INTEGER PRIMARY KEY, company_id INTEGER, status TEXT);CREATE TABLE sale_payments(id INTEGER PRIMARY KEY,sale_id INTEGER,method TEXT,amount_cents INTEGER);");ensureAccessSchema(db);ensureCashSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const insert=db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm) VALUES (?,?,'placeholder_hash_more_than_20_characters','scrypt')");
 const a=Number(insert.run('cajero1','Uno').lastInsertRowid),b=Number(insert.run('cajero2','Dos').lastInsertRowid);
 for(const id of [a,b])db.prepare("INSERT INTO access_company_roles(user_id,company_id,role) VALUES (?,1,'cashier')").run(id);
 const routes=[];const app={get:(p,fn)=>routes.push(['GET',p,fn]),post:(p,fn)=>routes.push(['POST',p,fn])};
 registerCashRoutes(app,db,req=>Number(req.params.companyId));
 function call(method,route,user,body={}){
  const x=routes.find(x=>x[0]===method&&x[1]===route);assert.ok(x);
  let status=200,data;const res={status(v){status=v;return this},json(v){data=v;return this}};
  x[2]({params:{companyId:'1'},query:{},body,authUser:{id:user,is_owner:0}},res);
  return{status,data};
 }
 let tests=0;const check=(title,fn)=>{fn();tests++;console.log('OK ',title)};
 check('Primera caja almacena al cajero que la abrió',()=>{const r=call('POST','/api/companies/:companyId/cash/open',a,{opening_amount:'1000',note:'Inicio'});assert.equal(r.status,201);assert.equal(db.prepare('SELECT opened_by_user_id FROM cash_sessions').get().opened_by_user_id,a)});
 check('Segundo cajero no ve detalles de caja ajena',()=>{const r=call('GET','/api/companies/:companyId/cash',b);assert.equal(r.data.active,null);assert.equal(r.data.otherCashOpen,true);assert.equal(r.data.history.length,0)});
 check('No permite cerrar una caja ajena',()=>{const r=call('POST','/api/companies/:companyId/cash/close',b,{counted_amount:'1000'});assert.equal(r.status,400);assert.match(r.data.error,/otro usuario/)});
 check('Dueño del turno cierra y conserva histórico propio',()=>{const r=call('POST','/api/companies/:companyId/cash/close',a,{counted_amount:'1000'});assert.equal(r.status,200);assert.equal(r.data.closed.difference_cents,0);assert.equal(call('GET','/api/companies/:companyId/cash',a).data.history.length,1)});
 check('Cajero diferente puede abrir un turno nuevo sin ver el anterior',()=>{assert.equal(call('POST','/api/companies/:companyId/cash/open',b,{opening_amount:'500'}).status,201);const r=call('GET','/api/companies/:companyId/cash',b);assert.equal(r.data.history.length,1);assert.equal(r.data.active.opened_by_user_id,b)});
 db.close();console.log(`QA cajas por usuario: ${tests}/${tests}`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
