// v0.6.62 · Configuración SMTP cifrada, permisos y envío de prueba sin red externa.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {createMailSettingsStore}=require('../electron/mail-settings.cjs');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-smtp-qa-'));
 let passed=0;
 const ok=async(title,fn)=>{await fn();passed++;console.log('OK',title)};
 const cryptoMock={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:value=>Buffer.from('ENCRYPTED:'+Buffer.from(value).toString('base64')),decryptString:bytes=>Buffer.from(bytes.toString().replace(/^ENCRYPTED:/,''),'base64').toString()};
 try{
  const store=createMailSettingsStore({dataDir:tmp,safeStorage:cryptoMock});
  await ok('Almacén seguro vacío y disponible',()=>{assert.equal(store.supported(),true);assert.equal(store.read(),null)});
  await ok('Guarda cifrado y nunca registra credencial en texto plano',()=>{
   store.write({host:'smtp.gmail.com',port:465,user:'emisor@ejemplo.com',password:'CLAVE-ULTRASECRETA',from:'emisor@ejemplo.com'});
   const bytes=fs.readFileSync(path.join(tmp,'smtp-settings.secure'),'utf8');
   assert.ok(!bytes.includes('CLAVE-ULTRASECRETA'));assert.ok(!bytes.includes('emisor@ejemplo.com'));
   assert.equal(store.read().password,'CLAVE-ULTRASECRETA');
  });
  const unavailable=createMailSettingsStore({dataDir:tmp,safeStorage:{isEncryptionAvailable:()=>false}});
  await ok('Falla cerrado si no hay cifrado del sistema operativo',()=>{assert.equal(unavailable.supported(),false);assert.throws(()=>unavailable.read(),/cifrado seguro/i);assert.throws(()=>unavailable.write({password:'x'}),/cifrado seguro/i)});
  const {registerAuth}=await import('../server/auth.js');
  const {ensureAccessSchema}=await import('../server/access-schema.js');
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE companies(id INTEGER PRIMARY KEY);INSERT INTO companies VALUES(1);');ensureAccessSchema(db);
  db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
  store.remove();
  const mail=[];
  const routes=[];
  const app={get(p,...handlers){routes.push(['GET',p,handlers])},post(p,...handlers){routes.push(['POST',p,handlers])},put(p,...handlers){routes.push(['PUT',p,handlers])},delete(p,...handlers){routes.push(['DELETE',p,handlers])},use(){}};
  registerAuth(app,()=>db,{mailStore:store,sendMail:async(content,cfg)=>{if(!cfg?.password)throw Error('Missing SMTP credentials');if(content.to==='fallo@ejemplo.com')throw Error('Servidor SMTP rechazó la solicitud (534).');mail.push({content,cfg})}});
  const req=(method,route,body={},cookie='',origin='http://127.0.0.1:3001')=>new Promise((resolve,reject)=>{
   const entry=routes.find(([m,p])=>m===method&&p===route);if(!entry){reject(Error('Ruta inexistente: '+route));return}
   let status=200,payload,headers={};
   const request={body,headers:{cookie},get:key=>key==='origin'?origin:key==='host'?'127.0.0.1:3001':undefined};
   const response={status:n=>{status=n;return response},json:v=>{payload=v;resolve({status,body:payload,headers});return response},setHeader:(k,v)=>{headers[k]=v;return response}};
   let i=0;const next=()=>{const handler=entry[2][i++];if(!handler){reject(Error('Sin respuesta: '+route));return}try{Promise.resolve(handler(request,response,next)).catch(reject)}catch(e){reject(e)}};next();
  });
  const ownerPass='ContraseñaPropietaria12345';
  assert.equal((await req('POST','/api/auth/setup',{username:'dueño62',displayName:'Propietario de QA',password:ownerPass})).status,400); // Usuarios ASCII en esta prueba
  assert.equal((await req('POST','/api/auth/setup',{username:'prop62',displayName:'Propietario de QA',password:ownerPass})).status,201);
  const login=await req('POST','/api/auth/login',{username:'prop62',password:ownerPass});assert.equal(login.status,200);
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  const settings='/api/auth/mail/settings',send='/api/auth/mail/test';
  await ok('GET sin sesión rechazada',async()=>assert.equal((await req('GET',settings)).status,401));
  await ok('Propietario ve estado sin credenciales',async()=>{
   const r=await req('GET',settings,{},cookie);assert.equal(r.status,200);assert.equal(r.body.available,true);assert.equal(r.body.configured,false);assert.equal(r.body.smtpPassword,undefined);assert.equal(r.body.password,undefined);
  });
  await ok('Cambio desde origen distinto se rechaza',async()=>assert.equal((await req('PUT',settings,{currentPassword:ownerPass},cookie,'http://127.0.0.1:7777')).status,403));
  await ok('Contraseña de propietario incorrecta rechaza configuración',async()=>assert.equal((await req('PUT',settings,{currentPassword:'incorrecta'},cookie)).status,403));
  await ok('Puerto inseguro y proveedor inválido se rechazan',async()=>{
   const args={host:'smtp.gmail.com',port:465,user:'emisor@ejemplo.com',from:'emisor@ejemplo.com',smtpPassword:'Clave-smtp-123',currentPassword:ownerPass};
   assert.equal((await req('PUT',settings,{...args,host:'localhost'},cookie)).status,400);
   assert.equal((await req('PUT',settings,{...args,user:'xxx\r\nRCPT TO:e@evil.com'},cookie)).status,400);
  });
  const input={host:'smtp.gmail.com',user:'emisor@ejemplo.com',from:'emisor@ejemplo.com',smtpPassword:'Clave-smtp-123',currentPassword:ownerPass};
  await ok('Guardar SMTP y no exponer clave ni en respuesta ni en estado',async()=>{
    const res=await req('PUT',settings,input,cookie);assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(res.body.configured,true);
    assert.equal(res.body.passwordSaved,true);assert.ok(!JSON.stringify(res.body).includes('Clave-smtp'));
    assert.equal((await req('GET','/api/auth/status')).body.emailRecoveryAvailable,true);
  });
  await ok('Actualización sin nueva clave conserva la anterior',async()=>{
    const r=await req('PUT',settings,{...input,smtpPassword:'',host:'smtp.office365.com'},cookie);assert.equal(r.status,200);
    assert.equal(store.read().password,'Clave-smtp-123');assert.equal(store.read().host,'smtp.office365.com');
  });
  await ok('Enviar prueba requiere propietario autenticado y contraseña',async()=>{
    assert.equal((await req('POST',send,{to:'destino@ejemplo.com',currentPassword:ownerPass})).status,401);
    assert.equal((await req('POST',send,{to:'destino@ejemplo.com',currentPassword:'incorrecta'},cookie)).status,403);
    assert.equal((await req('POST',send,{to:'destino@ejemplo.com',currentPassword:ownerPass},cookie)).status,200);
    assert.equal(mail.length,1);assert.equal(mail[0].content.to,'destino@ejemplo.com');assert.equal(mail[0].cfg.host,'smtp.office365.com');
  });
  await ok('Error Gmail 534 orienta sobre contraseña de aplicación, sin exponer claves',async()=>{
    assert.equal((await req('PUT',settings,{...input,smtpPassword:'',host:'smtp.gmail.com'},cookie)).status,200);
    const r=await req('POST',send,{to:'fallo@ejemplo.com',currentPassword:ownerPass},cookie);
    assert.equal(r.status,502);assert.match(r.body.error,/Gmail.*534/);
    assert.match(r.body.error,/contraseña de aplicación/);
    assert.ok(!r.body.error.includes('Clave-smtp-123'));
  });
  await ok('Cajero no puede leer, cambiar, probar ni borrar SMTP',async()=>{
    const r=await req('POST','/api/auth/users',{username:'cajero62',displayName:'Cajero de prueba',password:'TemporalCajaSegura12345',companyId:1,role:'cashier'},cookie);
    assert.equal(r.status,201,JSON.stringify(r.body));
    const login=await req('POST','/api/auth/login',{username:'cajero62',password:'TemporalCajaSegura12345'});assert.equal(login.status,200);const ck=login.headers['Set-Cookie'].split(';')[0];
    for(const [method,route] of [['GET',settings],['PUT',settings],['POST',send],['DELETE',settings]]){
      assert.equal((await req(method,route,{...input,to:'x@ejemplo.com'},ck)).status,403);
    }
  });
  await ok('Borrado exige contraseña y revoca disponibilidad SMTP',async()=>{
    assert.equal((await req('DELETE',settings,{currentPassword:'invalida'},cookie)).status,403);
    assert.equal((await req('DELETE',settings,{currentPassword:ownerPass},cookie)).status,200);
    assert.equal(store.read(),null);
    assert.equal((await req('GET','/api/auth/status')).body.emailRecoveryAvailable,false);
  });
  db.close();
  console.log(`QA correo SMTP FacturaCR: ${passed}/${passed} verificaciones aprobadas.`);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error('FALLÓ QA SMTP:',e);process.exitCode=1});
