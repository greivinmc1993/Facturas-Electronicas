// v0.6.61 · QA de registro, verificación y recuperación por correo.
// Todas las pruebas usan SQLite en memoria y un transporte de correo falso.
'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {registerAuth}=await import(pathToFileURL(path.resolve(__dirname,'../server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.resolve(__dirname,'../server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE companies(id INTEGER PRIMARY KEY);INSERT INTO companies VALUES(1),(2);');
 ensureAccessSchema(db);ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get(p,...handlers){routes.push(['GET',p,handlers])},post(p,...handlers){routes.push(['POST',p,handlers])},put(p,...handlers){routes.push(['PUT',p,handlers])},delete(p,...handlers){routes.push(['DELETE',p,handlers])},use(){}};
 const mail=[];
 let mailFails=false,configured=true;
 registerAuth(app,()=>db,{mailConfigured:()=>configured,sendMail:async info=>{if(mailFails)throw Error('Fallo SMTP de prueba');mail.push(info)}});
 async function req(method,route,body={},cookie='',origin='http://127.0.0.1:3001'){
   const entry=routes.find(([m,p])=>m===method&&p===route);assert.ok(entry,route);
   let status=200,payload,headers={};
   const request={body,headers:{cookie},get:k=>k==='origin'?origin:undefined};
   return await new Promise((resolve,reject)=>{
     const response={status(n){status=n;return this},json(v){payload=v;resolve({status,body:payload,headers});return this},setHeader(k,v){headers[k]=v;return this}};
     let index=0;
     const next=()=>{
       const fn=entry[2][index++];if(!fn){reject(Error('Solicitud sin respuesta: '+route));return;}
       try{Promise.resolve(fn(request,response,next)).catch(reject)}catch(e){reject(e)}
     };next();
   });
 }
 const owner='prop061',ownerPass='ClavePropietariaInicial12345';
 const start=await req('POST','/api/auth/setup',{username:owner,displayName:'Propietario',password:ownerPass});
 assert.equal(start.status,201);
 const login=async(user,password)=>{const r=await req('POST','/api/auth/login',{username:user,password});assert.equal(r.status,200,JSON.stringify(r.body));return r.headers['Set-Cookie'].split(';')[0]};
 const ownerCookie=await login(owner,ownerPass);
 let passed=0;
 const ok=async(name,fn)=>{await fn();console.log('OK',name);passed++};
 const codeFrom=()=>mail.at(-1)?.body.match(/FCR-MAIL-(?:[0-9A-F]{6}-){2}[0-9A-F]{6}/)?.[0];
 await ok('Esquema aditivo e idempotente, conserva empresas y usuario',async()=>{
   assert.equal(db.prepare('SELECT COUNT(*) n FROM companies').get().n,2);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM access_user_emails').get().n,0);
   assert.equal((await req('GET','/api/auth/email/status',{},ownerCookie)).body.eligible,true);
 });
 await ok('Sin correo verificado no se permite recuperación',async()=>{
   const r=await req('POST','/api/auth/email/recovery/request',{username:owner});
   assert.equal(r.status,200);assert.equal(mail.length,0);
 });
 await ok('Solo se verifica con contraseña, sesión y origen locales',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:ownerPass})).status,401);
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:ownerPass},ownerCookie,'https://evil.example')).status,403);
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:'Incorrecta12345'},ownerCookie)).status,403);
   assert.equal(mail.length,0);
 });
 await ok('Solicitud SMTP falla sin guardar código reutilizable',async()=>{
   mailFails=true;
   const r=await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:ownerPass},ownerCookie);
   mailFails=false;assert.equal(r.status,502);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM access_email_tokens').get().n,0);
 });
 await ok('Registro envía código, guarda solo hash y exige verificación',async()=>{
   const r=await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:ownerPass},ownerCookie);
   assert.equal(r.status,200,JSON.stringify(r.body));const code=codeFrom();assert.ok(code);
   assert.equal((await req('GET','/api/auth/email/status',{},ownerCookie)).body.verified,false);
   const stored=db.prepare("SELECT * FROM access_email_tokens WHERE purpose='verify'").get();
   assert.match(stored.code_hash,/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(stored).includes(code));
 });
 const verifyCode=codeFrom();
 await ok('Código de verificación incorrecto falla sin cambiar cuenta',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:'FCR-MAIL-000000-000000-000000'},ownerCookie)).status,403);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM access_user_emails').get().n,0);
 });
 await ok('Verificar correo lo activa y consume el código una sola vez',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:verifyCode},ownerCookie)).status,200);
   assert.equal((await req('GET','/api/auth/email/status',{},ownerCookie)).body.verified,true);
   assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:verifyCode},ownerCookie)).status,403);
 });
 await ok('Solicitud de recuperación siempre devuelve respuesta genérica',async()=>{
   const a=await req('POST','/api/auth/email/recovery/request',{username:owner});
   const b=await req('POST','/api/auth/email/recovery/request',{username:'cuenta_inexistente'});
   assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.body,b.body);
   assert.equal(mail.at(-1).to,'prop@ejemplo.com');
 });
 const resetCode=codeFrom();
 await ok('Contraseña inválida no consume token de recuperación',async()=>{
   const r=await req('POST','/api/auth/email/recovery/reset',{username:owner,code:resetCode,newPassword:'corta'});
   assert.equal(r.status,400);assert.equal(db.prepare("SELECT COUNT(*) n FROM access_email_tokens WHERE purpose='reset'").get().n,1);
 });
 await ok('Recuperación cambia contraseña, revoca sesión y consume token',async()=>{
   const r=await req('POST','/api/auth/email/recovery/reset',{username:owner,code:resetCode,newPassword:'ClaveNuevaPropietaria98765'});
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal((await req('GET','/api/auth/status',{},ownerCookie)).body.authenticated,false);
   assert.equal((await req('POST','/api/auth/login',{username:owner,password:ownerPass})).status,401);
   assert.equal((await req('POST','/api/auth/login',{username:owner,password:'ClaveNuevaPropietaria98765'})).status,200);
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:owner,code:resetCode,newPassword:'ClaveNuevaPropietaria88888'})).status,403);
 });
 const newOwnerCookie=await login(owner,'ClaveNuevaPropietaria98765');
 const create=async(username,role)=>req('POST','/api/auth/users',{username,displayName:username,password:'TemporalUsuarioSegura12345',companyId:1,role},newOwnerCookie);
 const admin=await create('admincorreo','company_admin');const supervisor=await create('supercorreo','supervisor');const cashier=await create('cajecorreo','cashier');const cashier2=await create('cajecorreo2','cashier');
 assert.equal(admin.status,201);assert.equal(supervisor.status,201);assert.equal(cashier.status,201);assert.equal(cashier2.status,201);
 const temporary='TemporalUsuarioSegura12345';
 async function personalSession(username){
   const ck=await login(username,temporary);
   assert.equal((await req('POST','/api/auth/password-change',{oldPassword:temporary,newPassword:'CuentaPersonalSegura12345'},ck)).status,200);
   return ck;
 }
 const adminCookie=await personalSession('admincorreo');const supervisorCookie=await personalSession('supercorreo');const cashierCookie=await personalSession('cajecorreo');const cashier2Cookie=await personalSession('cajecorreo2');
 await ok('Los cuatro roles pueden registrar exclusivamente su propio correo',async()=>{
   for(const cookie of [newOwnerCookie,adminCookie,supervisorCookie,cashierCookie,cashier2Cookie]){
     const status=await req('GET','/api/auth/email/status',{},cookie);
     assert.equal(status.status,200);
     assert.equal(status.body.eligible,true);
     if(cookie!==newOwnerCookie)assert.equal(status.body.email,'');
   }
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'sup@ejemplo.com',password:'ContraseñaErrónea12345'},supervisorCookie)).status,403);
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:'CuentaPersonalSegura12345'},cashierCookie)).status,409);
 });
 await ok('Administrador confirma su correo personal y puede recuperarse',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'admin@ejemplo.com',password:'CuentaPersonalSegura12345'},adminCookie)).status,200);
   const verify=codeFrom();assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:verify},adminCookie)).status,200);
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'admincorreo'})).status,200);
   const reset=codeFrom();assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'admincorreo',code:reset,newPassword:'ClaveAdminRestablecida12345'})).status,200);
   assert.equal((await req('GET','/api/auth/status',{},adminCookie)).body.authenticated,false);
 });
 await ok('No se puede registrar un correo ya verificado por otro usuario',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop@ejemplo.com',password:'ClaveAdminRestablecida12345'},await login('admincorreo','ClaveAdminRestablecida12345'))).status,409);
 });
 await ok('Supervisor verifica su correo sin acceder al del propietario',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'sup@ejemplo.com',password:'CuentaPersonalSegura12345'},supervisorCookie)).status,200);
   const code=codeFrom();assert.equal((await req('POST','/api/auth/email/verification/confirm',{code},supervisorCookie)).status,200);
   assert.equal((await req('GET','/api/auth/email/status',{},supervisorCookie)).body.email,'sup@ejemplo.com');
   assert.equal((await req('GET','/api/auth/email/status',{},cashierCookie)).body.email,'');
 });
 await ok('Cajero verifica exclusivamente su correo (ignora userId ajeno)',async()=>{
   assert.equal((await req('POST','/api/auth/email/verification/request',{userId:admin.body.id,email:'caj@ejemplo.com',password:'CuentaPersonalSegura12345'},cashierCookie)).status,200);
   const token=db.prepare("SELECT user_id,purpose FROM access_email_tokens WHERE purpose='verify'").all();
   assert.ok(token.some(t=>t.user_id===cashier.body.id));
   assert.ok(!token.some(t=>t.user_id===admin.body.id));
   const code=codeFrom();assert.equal((await req('POST','/api/auth/email/verification/confirm',{code},cashierCookie)).status,200);
   assert.equal((await req('GET','/api/auth/email/status',{},cashierCookie)).body.email,'caj@ejemplo.com');
   assert.equal((await req('GET','/api/auth/email/status',{},supervisorCookie)).body.email,'sup@ejemplo.com');
 });
 await ok('Otro cajero sin correo verificado no recibe código',async()=>{
   const previous=mail.length;
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'cajecorreo2'})).status,200);
   assert.equal(mail.length,previous);
 });
 await ok('Código de cajero no permite recuperar propietario, administrador, supervisor ni otro cajero',async()=>{
   const passwordBefore=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(cashier.body.id).password_hash;
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'cajecorreo'})).status,200);
   assert.equal(mail.at(-1).to,'caj@ejemplo.com');
   const code=codeFrom();assert.ok(code);
   const rolesBefore=db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=? ORDER BY company_id').all(cashier.body.id);
   const ownerHash=db.prepare('SELECT password_hash FROM access_users WHERE is_owner=1').get().password_hash;
   for(const username of ['prop061','admincorreo','supercorreo','cajecorreo2']){
     assert.equal((await req('POST','/api/auth/email/recovery/reset',{username,code,newPassword:'NuevaClaveIntrusa12345'})).status,403,username);
   }
   assert.equal(db.prepare('SELECT password_hash FROM access_users WHERE is_owner=1').get().password_hash,ownerHash);
   assert.equal(db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(cashier.body.id).password_hash,passwordBefore);
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'cajecorreo',code,newPassword:'CajeroRecuperadoSolo12345',role:'company_admin',isOwner:true,companyId:2})).status,200);
   assert.deepEqual(db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=? ORDER BY company_id').all(cashier.body.id),rolesBefore);
   assert.equal(db.prepare('SELECT is_owner FROM access_users WHERE id=?').get(cashier.body.id).is_owner,0);
   assert.equal((await req('POST','/api/auth/login',{username:'cajecorreo',password:'CuentaPersonalSegura12345'})).status,401);
   const cashierReLogin=await req('POST','/api/auth/login',{username:'cajecorreo',password:'CajeroRecuperadoSolo12345'});
   assert.equal(cashierReLogin.status,200);
   assert.equal(cashierReLogin.body.user.isOwner,false);
   assert.deepEqual(cashierReLogin.body.user.companies.map(x=>({company_id:x.company_id,role:x.role})),[{company_id:1,role:'cashier'}]);
   const cashierNewCookie=cashierReLogin.headers['Set-Cookie'].split(';')[0];
   assert.equal((await req('GET','/api/auth/users',{},cashierNewCookie)).status,403);
   assert.equal((await req('GET','/api/auth/status',{},cashierCookie)).body.authenticated,false);
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'cajecorreo',code,newPassword:'NuevaClaveIntrusa12345'})).status,403);
 });
 await ok('Supervisor recupera únicamente su propia cuenta sin cambiar rol',async()=>{
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'supercorreo'})).status,200);
   assert.equal(mail.at(-1).to,'sup@ejemplo.com');
   const code=codeFrom();
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'cajecorreo',code,newPassword:'OtraCajeroClave12345'})).status,403);
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'supercorreo',code,newPassword:'SupervisorRecuperado12345'})).status,200);
   assert.equal(db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=1').get(supervisor.body.id).role,'supervisor');
   assert.equal((await req('GET','/api/auth/status',{},supervisorCookie)).body.authenticated,false);
 });
 await ok('Al retirar rol administrativo se conserva la recuperación de la misma cuenta',async()=>{
   db.prepare("UPDATE access_company_roles SET role='supervisor' WHERE user_id=?").run(admin.body.id);
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'admincorreo'})).status,200);
   assert.equal(mail.at(-1).to,'admin@ejemplo.com');
   const code=codeFrom();
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:'admincorreo',code,newPassword:'ExAdminRecuperado12345'})).status,200);
   assert.equal(db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=1').get(admin.body.id).role,'supervisor');
 });
 await ok('Cuenta suspendida no puede recuperarse aunque tenga correo verificado',async()=>{
   db.prepare('UPDATE access_users SET is_active=0 WHERE id=?').run(cashier.body.id);
   const previous=mail.length;
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:'cajecorreo'})).status,200);
   assert.equal(mail.length,previous);
   const invalid=await req('POST','/api/auth/email/recovery/reset',{username:'cajecorreo',code:'FCR-MAIL-000000-000000-000000',newPassword:'CajeroResucitado12345'});
   assert.equal(invalid.status,403);
   assert.equal((await req('POST','/api/auth/login',{username:'cajecorreo',password:'CajeroRecuperadoSolo12345'})).status,401);
 });
 await ok('No se exponen códigos en SQLite ni auditoría',async()=>{
   const json=JSON.stringify(db.prepare('SELECT * FROM access_audit_log').all());
   for(const code of [verifyCode,resetCode])assert.ok(!json.includes(code));
   assert.equal(db.prepare('SELECT COUNT(*) n FROM companies').get().n,2);
 });
 await ok('Código vencido se rechaza sin modificar la contraseña',async()=>{
   assert.equal((await req('POST','/api/auth/email/recovery/request',{username:owner})).status,200);
   const expired=codeFrom();assert.ok(expired);
   const id=db.prepare("SELECT id FROM access_users WHERE username=?").get(owner).id;
   db.prepare("UPDATE access_email_tokens SET expires_at=? WHERE user_id=? AND purpose='reset'").run(Date.now()-100,id);
   assert.equal((await req('POST','/api/auth/email/recovery/reset',{username:owner,code:expired,newPassword:'OtraClaveMuySegura12345'})).status,403);
   assert.equal((await req('POST','/api/auth/login',{username:owner,password:'ClaveNuevaPropietaria98765'})).status,200);
 });
 await ok('Cinco intentos incorrectos agotan la verificación, incluso con código real',async()=>{
   const ownerCurrent=await login(owner,'ClaveNuevaPropietaria98765');
   assert.equal((await req('POST','/api/auth/email/verification/request',{email:'prop.nuevo@ejemplo.com',password:'ClaveNuevaPropietaria98765'},ownerCurrent)).status,200);
   const realCode=codeFrom();
   for(let i=0;i<5;i++)assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:'FCR-MAIL-000000-000000-000000'},ownerCurrent)).status,403);
   assert.equal((await req('POST','/api/auth/email/verification/confirm',{code:realCode},ownerCurrent)).status,403);
   assert.equal((await req('GET','/api/auth/email/status',{},ownerCurrent)).body.email,'prop@ejemplo.com');
 });
 await ok('La interfaz ofrece recuperación individual a todos y limpia campos privados',async()=>{
   const fs=require('node:fs');const ui=fs.readFileSync(path.resolve(__dirname,'../src/main.jsx'),'utf8');
   assert.ok(ui.includes('emailStatus?.eligible'));assert.ok(ui.includes('emailRecoveryAvailable'));
   assert.ok(ui.includes("setEmailPassword('');setEmailVerifyCode('')"));
   assert.ok(ui.includes('Recuperar propietario con código de emergencia'));
   assert.ok(ui.includes('Recuperar mi cuenta por correo'));
   assert.ok(ui.includes('Cada persona registra su propio correo'));
   assert.ok(ui.includes('El rol y las empresas asignadas no cambian.'));
 });
 await ok('Sin SMTP la interfaz informa indisponibilidad sin correo falso',async()=>{
   configured=false;
   const r=await req('POST','/api/auth/email/recovery/request',{username:owner});
   assert.equal(r.status,503);
   assert.equal((await req('GET','/api/auth/status')).body.emailRecoveryAvailable,false);
 });
 console.log(`QA correo seguro FacturaCR: ${passed}/${passed} verificaciones aprobadas.`);
 db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
