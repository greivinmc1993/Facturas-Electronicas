// QA v0.6.59: recuperación administrada de accesos, sesiones y actualizaciones atómicas.
// Solo SQLite en memoria; no toca datos de usuario.
'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {registerAuth}=await import(pathToFileURL(path.resolve(__dirname,'../server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.resolve(__dirname,'../server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies(id) VALUES(1),(2);');
 ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(err){db.exec('ROLLBACK');throw err}};
 const routes=[];
 const app={get(p,...handlers){routes.push(['GET',p,handlers])},post(p,...handlers){routes.push(['POST',p,handlers])},put(p,...handlers){routes.push(['PUT',p,handlers])},delete(p,...handlers){routes.push(['DELETE',p,handlers])},use(){}};
 registerAuth(app,()=>db);
 function call(method,route,body={},session='',params={}){
  const found=routes.find(([m,p])=>m===method&&p===route);
  assert.ok(found,`${method} ${route}`);
  let status=200,answer,headers={};
  const req={body,params,headers:{cookie:session},get(k){return k==='origin'?'http://127.0.0.1:3001':undefined}};
  const res={status(value){status=value;return this},json(value){answer=value;return this},setHeader(k,v){headers[k]=v;return this}};
  let n=0;const next=()=>{const handler=found[2][n++];if(handler)handler(req,res,next)};
  next();return {status,body:answer,headers};
 }
 const login=(username,password)=>{
  const r=call('POST','/api/auth/login',{username,password});
  assert.equal(r.status,200,JSON.stringify(r.body));
  return r.headers['Set-Cookie'].split(';')[0];
 };
 const count=()=>db.prepare('SELECT COUNT(*) n FROM access_audit_log').get().n;
 let passed=0;
 const check=(label,fn)=>{fn();passed++;console.log('OK',label)};
 const firstPassword='ClavePropietario12345',secondPassword='ClavePropietario67890';
 check('Configurar propietario de prueba',()=>assert.equal(call('POST','/api/auth/setup',{username:'dueno',displayName:'Dueño QA',password:firstPassword}).status,201));
 const owner1=login('dueno',firstPassword),owner2=login('dueno',firstPassword);
 check('Dos sesiones propietarias válidas antes de cambiar contraseña',()=>{
  assert.equal(call('GET','/api/auth/status',{},owner1).body.authenticated,true);
  assert.equal(call('GET','/api/auth/status',{},owner2).body.authenticated,true);
 });
 check('Contraseña equivocada no cambia nada ni revoca sesión',()=>{
  const prev=count();
  const r=call('POST','/api/auth/password-change',{oldPassword:'Error1234567',newPassword:secondPassword},owner1);
  assert.equal(r.status,403);assert.equal(count(),prev);
  assert.equal(call('GET','/api/auth/status',{},owner2).body.authenticated,true);
 });
 check('Nueva contraseña revoca sesiones de otros dispositivos',()=>{
  const r=call('POST','/api/auth/password-change',{oldPassword:firstPassword,newPassword:secondPassword},owner1);
  assert.equal(r.status,200);
  assert.equal(call('GET','/api/auth/status',{},owner1).body.authenticated,true);
  assert.equal(call('GET','/api/auth/status',{},owner2).body.authenticated,false);
  assert.equal(call('POST','/api/auth/login',{username:'dueno',password:firstPassword}).status,401);
  assert.equal(call('POST','/api/auth/login',{username:'dueno',password:secondPassword}).status,200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM access_audit_log WHERE event_type='auth.password_change'").get().n,1);
 });
 check('Propietario crea cajero de empresa 1 con contraseña temporal',()=>{
  const r=call('POST','/api/auth/users',{username:'cajero1',displayName:'Cajero Uno',password:'TemporalSegura12345',companyId:1,role:'cashier'},owner1);
  assert.equal(r.status,201,JSON.stringify(r.body));
 });
 const cashier=db.prepare("SELECT id FROM access_users WHERE username='cajero1'").get().id;
 const cashier1=login('cajero1','TemporalSegura12345');
 const cashier2=login('cajero1','TemporalSegura12345');
 check('Cajero con contraseña temporal debe establecer una personal',()=>{
  assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:30},cashier1).status,403);
  assert.equal(call('POST','/api/auth/password-change',{oldPassword:'TemporalSegura12345',newPassword:'CajeroPersonal12345'},cashier1).status,200);
  assert.equal(call('GET','/api/auth/status',{},cashier1).body.authenticated,true);
  assert.equal(call('GET','/api/auth/status',{},cashier2).body.authenticated,false);
 });
 check('Una actualización inválida de varias propiedades no suspende parcialmente al usuario',()=>{
  const oldAudit=count();
  const r=call('PUT','/api/auth/users/:userId',{isActive:false,password:'corta',companyId:2,role:'supervisor'},owner1,{userId:String(cashier)});
  assert.equal(r.status,400);
  const u=db.prepare('SELECT is_active FROM access_users WHERE id=?').get(cashier);
  assert.equal(u.is_active,1);
  assert.equal(db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=2').get(cashier),undefined);
  assert.equal(count(),oldAudit);
  assert.equal(call('GET','/api/auth/status',{},cashier1).body.authenticated,true);
 });
 check('Actualización válida cambia rol y revoca todas las sesiones del afectado',()=>{
  const r=call('PUT','/api/auth/users/:userId',{isActive:true,password:'NuevaTemporal12345',companyId:2,role:'supervisor'},owner1,{userId:String(cashier)});
  assert.equal(r.status,200);
  assert.equal(db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=2').get(cashier).role,'supervisor');
  assert.equal(db.prepare('SELECT password_change_required FROM access_users WHERE id=?').get(cashier).password_change_required,1);
  assert.equal(call('GET','/api/auth/status',{},cashier1).body.authenticated,false);
  assert.equal(login('cajero1','NuevaTemporal12345').startsWith('facturacr_session='),true);
 });
 check('No hay recuperación sin autenticar: ajustes de personal exigen propietario/administrador',()=>{
  const r=call('PUT','/api/auth/users/:userId',{password:'SinPermiso12345'},'',{userId:String(cashier)});
  assert.equal(r.status,401);
 });
 check('Suspensión revoca todas las sesiones',()=>{
  const r=call('PUT','/api/auth/users/:userId',{isActive:false},owner1,{userId:String(cashier)});
  assert.equal(r.status,200);
  assert.equal(call('POST','/api/auth/login',{username:'cajero1',password:'NuevaTemporal12345'}).status,401);
 });
 db.close();
 console.log(`QA v0.6.59 seguridad y sesiones: ${passed}/${passed} verificaciones`);
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
