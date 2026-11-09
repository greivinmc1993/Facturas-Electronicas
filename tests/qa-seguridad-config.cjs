'use strict';
// Regression: el tiempo de inactividad es global; solo el propietario lo modifica.
// El aviso de guardado se muestra únicamente tras confirmación del servidor.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const ui=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
 assert.match(ui,/const sessionUser=state\?\.authenticated && state\?\.user \? state\.user : null;/);
 assert.match(ui,/sessionUser\?\.passwordChangeRequired/);
 assert.doesNotMatch(ui,/state\.user\?\.passwordChangeRequired/);
 assert.match(ui,/Tiempo para todos los usuarios/);
 assert.match(ui,/if\(savedMinutes>0&&Date\.now\(\)-activity\.current>=savedMinutes\*60000\)lockNow\(\)/);
 assert.match(ui,/setInterval\(sync,15000\)/);
 assert.match(ui,/const saved=await api\('\/api\/auth\/settings'/);
 assert.match(ui,/const confirmed=Number\(saved\.idle_lock_minutes\)/);
 assert.match(ui,/setSettingsFeedback\(\{type:'success'/);
 assert.match(ui,/setSettingsFeedback\(\{type:'error'/);
 assert.match(ui,/role=\{settingsFeedback\.type==='error'\?'alert':'status'\}/);
 const {DatabaseSync}=require('node:sqlite');
 const {registerAuth}=await import(pathToFileURL(path.join(root,'server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies(id) VALUES(1);');
 ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get(p,...handlers){routes.push(['GET',p,handlers])},post(p,...handlers){routes.push(['POST',p,handlers])},put(p,...handlers){routes.push(['PUT',p,handlers])},delete(p,...handlers){routes.push(['DELETE',p,handlers])},use(){}};
 registerAuth(app,()=>db);
 function call(method,path,body={},sessionCookie=''){
  const route=routes.find(([m,p])=>m===method&&p===path);assert.ok(route,`${method} ${path}`);
  const req={body,headers:{cookie:sessionCookie},get(key){return key==='origin'?'http://127.0.0.1:3001':undefined}};
  let status=200,response,headers={};
  const res={status(v){status=v;return this},json(v){response=v;return this},setHeader(k,v){headers[k]=v;return this}};
  let i=0;const next=()=>{const fn=route[2][i++];if(fn)fn(req,res,next)};next();
  return {status,body:response,headers};
 }
 assert.equal(call('GET','/api/auth/status').body.idle_lock_minutes,15);
 assert.equal(call('POST','/api/auth/setup',{username:'dueno',displayName:'Dueño',password:'ClaveSegura12345'}).status,201);
 const login=call('POST','/api/auth/login',{username:'dueno',password:'ClaveSegura12345'});
 const ownerCookie=login.headers['Set-Cookie'].split(';')[0];
 assert.equal(call('POST','/api/auth/users',{username:'cajerouno',displayName:'Cajero',password:'TemporalSegura1234',companyId:1,role:'cashier'},ownerCookie).status,201);
 const cashier=call('POST','/api/auth/login',{username:'cajerouno',password:'TemporalSegura1234'});
 const cashierCookie=cashier.headers['Set-Cookie'].split(';')[0];
 for(const value of [5,15,30,60,0]){
  const result=call('PUT','/api/auth/settings',{idle_lock_minutes:value},ownerCookie);
  assert.equal(result.status,200);
  assert.equal(result.body.idle_lock_minutes,value);
  assert.equal(call('GET','/api/auth/settings',{},cashierCookie).body.idle_lock_minutes,value);
  assert.equal(call('GET','/api/auth/status',{},cashierCookie).body.idle_lock_minutes,value);
 }
 const denied=call('PUT','/api/auth/settings',{idle_lock_minutes:5},cashierCookie);
 assert.equal(denied.status,403);
 assert.equal(call('GET','/api/auth/settings',{},ownerCookie).body.idle_lock_minutes,0);
 for(const value of [1,-1,6,31,'veinte'])assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:value},ownerCookie).status,400);
 assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:30},'').status,401);
 // Restaurar valor inicial para verificar persistencia y no interferir en las pruebas.
 assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:15},ownerCookie).body.idle_lock_minutes,15);
 db.close();
 console.log('QA seguridad: usuario null controlado, confirmación UI y 5 opciones globales/roles correctos.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
