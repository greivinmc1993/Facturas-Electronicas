'use strict';
// Regresión v0.6.58: cualquier rol autenticado puede cambiar la política GLOBAL.
// La UI solo confirma una escritura aceptada y registra el actor en auditoría.
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
 assert.match(ui,/className="securitySettingsInner"/);
 assert.match(ui,/className="securitySettingsControls"/);
 assert.match(ui,/className="securitySettingsActions"/);
 const style=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 assert.match(style,/\.securitySettingsInner\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(style,/@media\(max-width:1100px\).*?grid-template-columns:1fr/);
 assert.match(style,/@media\(max-width:650px\).*?securitySettingsControls/);
 assert.match(style,/\.securitySettingsControls label\{[^}]*margin:0;/,'El selector debe anular el margen inferior global de 18px');
 assert.match(style,/\.securitySettingsControls select\{[^}]*height:42px;/,'El selector debe medir exactamente 42px');
 assert.match(style,/\.securitySettingsActions button\{[^}]*height:42px;/,'Los botones deben medir exactamente 42px');
 assert.match(style,/\.securitySettingsActions\{[^}]*grid-template-columns:168px 90px;/,'Ambos botones deben compartir la misma rejilla');
 assert.match(ui,/Todos los usuarios pueden modificar el tiempo de inactividad/);
 assert.match(ui,/hasSession&&securitySettingsOpen&&!sessionUser\.passwordChangeRequired&&\(/);
 assert.doesNotMatch(ui,/sessionUser\.isOwner&&<button type="button"/);
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
 function call(method,url,body={},sessionCookie=''){
  const route=routes.find(([m,p])=>m===method&&p===url);assert.ok(route,`${method} ${url}`);
  const req={body,headers:{cookie:sessionCookie},get(key){return key==='origin'?'http://127.0.0.1:3001':undefined}};
  let status=200,response,headers={};
  const res={status(v){status=v;return this},json(v){response=v;return this},setHeader(k,v){headers[k]=v;return this}};
  let i=0;const next=()=>{const fn=route[2][i++];if(fn)fn(req,res,next)};next();
  return {status,body:response,headers};
 }
 let checks=0;const ok=(description,fn)=>{fn();checks++;console.log('OK '+description)};
 ok('Predeterminado global 15 minutos',()=>assert.equal(call('GET','/api/auth/status').body.idle_lock_minutes,15));
 ok('Se puede crear propietario',()=>assert.equal(call('POST','/api/auth/setup',{username:'dueno',displayName:'Dueño',password:'ClaveSegura12345'}).status,201));
 const login=call('POST','/api/auth/login',{username:'dueno',password:'ClaveSegura12345'});
 const ownerCookie=login.headers['Set-Cookie'].split(';')[0];
 const roles=[['company_admin','adminemp'],['supervisor','superuno'],['cashier','cajerouno']];
 const cookies=[['owner',ownerCookie]];
 for(const [role,username] of roles){
   const password='TemporalSegura1234';
   ok(`${role}: cuenta creada`,()=>assert.equal(call('POST','/api/auth/users',{username,displayName:username,password,companyId:1,role},ownerCookie).status,201));
   const session=call('POST','/api/auth/login',{username,password});
   const cookie=session.headers['Set-Cookie'].split(';')[0];
   ok(`${role}: contraseña temporal impide modificar seguridad`,()=>assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:5},cookie).status,403));
   ok(`${role}: cambio de contraseña obligatorio`,()=>assert.equal(call('POST','/api/auth/password-change',{oldPassword:password,newPassword:'PersonalSegura6789'},cookie).status,200));
   cookies.push([role,cookie]);
 }
 let n=0;
 for(const [role,cookie] of cookies){
   const chosen=[5,15,30,60][n++];
   ok(`${role}: cambia y persiste ${chosen} minutos globales`,()=>{
    const result=call('PUT','/api/auth/settings',{idle_lock_minutes:chosen},cookie);
    assert.equal(result.status,200);
    assert.equal(result.body.idle_lock_minutes,chosen);
    for(const [otherRole,otherCookie] of cookies){
      assert.equal(call('GET','/api/auth/settings',{},otherCookie).body.idle_lock_minutes,chosen,otherRole);
      assert.equal(call('GET','/api/auth/status',{},otherCookie).body.idle_lock_minutes,chosen,otherRole);
    }
    const audit=db.prepare("SELECT user_id,event_type,object_id FROM access_audit_log WHERE event_type='security.idle_lock_changed' ORDER BY id DESC LIMIT 1").get();
    const id=db.prepare('SELECT id FROM access_users WHERE username=?').get(role==='owner'?'dueno':role==='company_admin'?'adminemp':role==='supervisor'?'superuno':'cajerouno').id;
    assert.equal(audit.user_id,id);
    assert.equal(audit.event_type,'security.idle_lock_changed');
   });
 }
 ok('Cajero también puede desactivar el bloqueo global',()=>{
  assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:0},cookies.at(-1)[1]).body.idle_lock_minutes,0);
 });
 ok('Tiempo inválido se rechaza y no modifica la configuración',()=>{
  for(const value of [1,-1,6,31,'veinte','15',null,undefined]){
   assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:value},cookies.at(-1)[1]).status,400);
   assert.equal(call('GET','/api/auth/settings',{},ownerCookie).body.idle_lock_minutes,0);
  }
 });
 ok('Los no autenticados no cambian la configuración',()=>assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:30},'').status,401));
 ok('Un ajuste repetido no crea un evento de auditoría falso',()=>{
  const old=db.prepare("SELECT count(*) AS n FROM access_audit_log WHERE event_type='security.idle_lock_changed'").get().n;
  assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:0},cookies.at(-1)[1]).status,200);
  const again=db.prepare("SELECT count(*) AS n FROM access_audit_log WHERE event_type='security.idle_lock_changed'").get().n;
  assert.equal(again,old);
 });
 ok('Propietario puede restaurar 15 minutos',()=>assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:15},ownerCookie).body.idle_lock_minutes,15));
 db.close();
 console.log(`QA seguridad global v0.6.58: ${checks}/${checks} verificaciones correctas.`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
