// v0.6.60 · Recuperación local del propietario y revocación de sesiones.
// SQLite íntegramente en memoria; jamás toca la base del usuario.
'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {registerAuth,passwordHash}=await import(pathToFileURL(path.resolve(__dirname,'../server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.resolve(__dirname,'../server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies VALUES (1);');
 ensureAccessSchema(db);ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get(p,...h){routes.push(['GET',p,h])},post(p,...h){routes.push(['POST',p,h])},put(p,...h){routes.push(['PUT',p,h])},delete(p,...h){routes.push(['DELETE',p,h])},use(){}};
 registerAuth(app,()=>db);
 function req(method,route,body={},cookie='',origin='http://127.0.0.1:3001'){
  const endpoint=routes.find(([m,p])=>m===method&&p===route);
  assert.ok(endpoint,route);
  let status=200,payload,headers={};
  const request={body,headers:{cookie},get:k=>k==='origin'?origin:undefined};
  const response={status(n){status=n;return this},json(v){payload=v;return this},setHeader(k,v){headers[k]=v;return this}};
  let i=0;const next=()=>{const handler=endpoint[2][i++];if(handler)handler(request,response,next)};
  next();return {status,body:payload,headers};
 }
 function login(user,password){const r=req('POST','/api/auth/login',{username:user,password});assert.equal(r.status,200,JSON.stringify(r.body));return r.headers['Set-Cookie'].split(';')[0]}
 const owner='propietario',firstPass='PrimeraClaveSegura12345';
 const firstSetup=req('POST','/api/auth/setup',{username:owner,displayName:'Propietario principal',password:firstPass});
 const firstCode=firstSetup.body.recoveryCode;
 let passed=0;
 const ok=(name,fn)=>{fn();passed++;console.log('OK',name)};
 ok('Alta genera código de recuperación criptográficamente largo y muestra solo una vez',()=>{
  assert.equal(firstSetup.status,201);assert.match(firstCode,/^FCR1-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/);
  assert.equal(firstSetup.headers['Cache-Control'],'no-store');
  assert.equal(req('POST','/api/auth/setup',{username:owner,displayName:'Otro',password:firstPass}).status,400);
 });
 const ownerId=db.prepare('SELECT id FROM access_users WHERE is_owner=1').get().id;
 const recoveryRecord=()=>db.prepare('SELECT code_hash FROM access_owner_recovery WHERE user_id=?').get(ownerId);
 ok('SQLite solo almacena hash SHA-256 del código',()=>{
  assert.match(recoveryRecord().code_hash,/^[a-f0-9]{64}$/);
  assert.ok(!recoveryRecord().code_hash.includes(firstCode));
  const rows=db.prepare('SELECT * FROM access_audit_log').all();assert.ok(!JSON.stringify(rows).includes(firstCode));
 });
 const ownerA=login(owner,firstPass),ownerB=login(owner,firstPass);
 ok('Estado de recuperación requiere sesión propietaria',()=>{
  assert.equal(req('GET','/api/auth/recovery/status').status,401);
  assert.equal(req('GET','/api/auth/recovery/status',{},ownerA).body.configured,true);
 });
 ok('Origen externo rechazado para operaciones de recuperación',()=>{
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:firstCode,newPassword:'ClaveNuevaSegura45678'},'','https://otrodominio.example').status,403);
  assert.equal(req('POST','/api/auth/recovery/rotate',{password:firstPass},ownerA,'https://otrodominio.example').status,403);
 });
 ok('Operaciones de recuperación no exponen código sin contraseña',()=>{
  assert.equal(req('POST','/api/auth/recovery/rotate',{password:'NoEsLaCorrecta1234'},ownerA).status,403);
  assert.ok(recoveryRecord().code_hash);
 });
 const staffCreated=req('POST','/api/auth/users',{username:'cajero_1',displayName:'Cajero Uno',password:'TemporalCajero12345',companyId:1,role:'cashier'},ownerA);
 assert.equal(staffCreated.status,201,JSON.stringify(staffCreated.body));
 const staffCookie=login('cajero_1','TemporalCajero12345');
 ok('Cajero no puede leer ni modificar código del propietario',()=>{
  assert.equal(req('GET','/api/auth/recovery/status',{},staffCookie).status,403);
  assert.equal(req('POST','/api/auth/recovery/rotate',{password:'TemporalCajero12345'},staffCookie).status,403);
 });
 const rotate=req('POST','/api/auth/recovery/rotate',{password:firstPass},ownerA);
 const rotatedCode=rotate.body.recoveryCode;
 ok('Rotación autenticada cambia código y cierra otras sesiones',()=>{
  assert.equal(rotate.status,200,JSON.stringify(rotate.body));
  assert.notEqual(rotatedCode,firstCode);
  assert.equal(req('GET','/api/auth/status',{},ownerA).body.authenticated,true);
  assert.equal(req('GET','/api/auth/status',{},ownerB).body.authenticated,false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM access_audit_log WHERE event_type='auth.recovery_rotated'").get().n,1);
 });
 ok('Código revocado y nombre inexistente dan respuesta genérica sin revelar cuenta',()=>{
  const p='NuevaClavePropietaria67890';
  const old=req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:firstCode,newPassword:p});
  const unknown=req('POST','/api/auth/recovery/reset',{username:'inexistente',recoveryCode:firstCode,newPassword:p});
  assert.equal(old.status,403);assert.equal(unknown.status,403);assert.equal(old.body.error,unknown.body.error);
 });
 ok('Contraseña nueva inválida no consume el código ni cambia la clave antigua',()=>{
  const prev=recoveryRecord().code_hash;
  const r=req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:rotatedCode,newPassword:'corta'});
  assert.equal(r.status,400);assert.equal(recoveryRecord().code_hash,prev);
  assert.equal(login(owner,firstPass).startsWith('facturacr_session='),true);
 });
 const reset=req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:rotatedCode,newPassword:'SegundaClavePropietaria12345'});
 const secondCode=reset.body.recoveryCode;
 ok('Restablecimiento consume código y entrega otro de un solo uso',()=>{
  assert.equal(reset.status,200,JSON.stringify(reset.body));assert.match(secondCode,/^FCR1-/);
  assert.notEqual(secondCode,rotatedCode);
  assert.equal(req('GET','/api/auth/status',{},ownerA).body.authenticated,false);
  assert.equal(req('POST','/api/auth/login',{username:owner,password:firstPass}).status,401);
  assert.equal(req('POST','/api/auth/login',{username:owner,password:'SegundaClavePropietaria12345'}).status,200);
 });
 ok('Reutilizar código consumido es imposible',()=>{
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:rotatedCode,newPassword:'NuevaClave99999'}).status,403);
 });
 ok('Segundo código permite recuperación siguiente y revoca sesiones',()=>{
  const current=login(owner,'SegundaClavePropietaria12345');
  const result=req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:secondCode,newPassword:'TerceraClavePropietaria67890'});
  assert.equal(result.status,200);assert.equal(req('GET','/api/auth/status',{},current).body.authenticated,false);
  assert.equal(login(owner,'TerceraClavePropietaria67890').startsWith('facturacr_session='),true);
 });
 ok('No se guardan códigos claros en auditoría ni en credenciales',()=>{
  const audit=db.prepare('SELECT * FROM access_audit_log').all();
  const json=JSON.stringify(audit);
  for(const code of [firstCode,rotatedCode,secondCode])assert.ok(!json.includes(code));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM access_audit_log WHERE event_type='auth.owner_recovered'").get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_owner_recovery').get().n,1);
 });
 ok('Se limita el número de intentos de recuperación fallidos',()=>{
  for(let i=0;i<6;i++)assert.equal(req('POST','/api/auth/recovery/reset',{username:'intentos_fallidos',recoveryCode:firstCode,newPassword:'ClaveSegura54321'}).status,403);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:'intentos_fallidos',recoveryCode:firstCode,newPassword:'ClaveSegura54321'}).status,429);
 });
 ok('Datos comerciales y carritos no se borran al recuperar acceso',()=>{
  assert.equal(db.prepare('SELECT COUNT(*) n FROM companies').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sale_drafts').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_users').get().n,2);
 });
 ok('Propietario anterior migra sin código oculto y puede generar el primero',()=>{
  const legacy=new DatabaseSync(':memory:');
  legacy.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies VALUES(5);');
  ensureAccessSchema(legacy);
  const priorPassword='ClaveAnteriorPropietario12345';
  legacy.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required) VALUES (?,?,?,'scrypt',1,1,0)")
    .run('dueno_viejo','Dueño histórico',passwordHash(priorPassword));
  legacy.exec('DROP TABLE access_owner_recovery'); // esquema viejo; conservamos propietario
  ensureAccessSchema(legacy);ensureAccessSchema(legacy);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM access_users').get().n,1);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM access_owner_recovery').get().n,0);
  legacy.transaction=fn=>()=>{legacy.exec('BEGIN IMMEDIATE');try{const v=fn();legacy.exec('COMMIT');return v}catch(e){legacy.exec('ROLLBACK');throw e}};
  const legacyRoutes=[];
  const legacyApp={get(p,...h){legacyRoutes.push(['GET',p,h])},post(p,...h){legacyRoutes.push(['POST',p,h])},put(p,...h){legacyRoutes.push(['PUT',p,h])},delete(p,...h){legacyRoutes.push(['DELETE',p,h])},use(){}};
  registerAuth(legacyApp,()=>legacy);
  function callLegacy(method,route,body={},cookie=''){
    const found=legacyRoutes.find(x=>x[0]===method&&x[1]===route);assert.ok(found);
    let status=200,answer,headers={};
    const req={body,headers:{cookie},get:k=>k==='origin'?'http://127.0.0.1:3001':undefined};
    const res={status(v){status=v;return this},json(v){answer=v;return this},setHeader(k,v){headers[k]=v;return this}};
    let i=0;const next=()=>{const h=found[2][i++];if(h)h(req,res,next)};
    next();return {status,body:answer,headers};
  }
  const loginResult=callLegacy('POST','/api/auth/login',{username:'dueno_viejo',password:priorPassword});
  assert.equal(loginResult.status,200);
  const sessionCookie=loginResult.headers['Set-Cookie'].split(';')[0];
  assert.equal(callLegacy('GET','/api/auth/recovery/status',{},sessionCookie).body.configured,false);
  const rotated=callLegacy('POST','/api/auth/recovery/rotate',{password:priorPassword},sessionCookie);
  assert.equal(rotated.status,200);assert.match(rotated.body.recoveryCode,/^FCR1-/);
  assert.equal(callLegacy('GET','/api/auth/recovery/status',{},sessionCookie).body.configured,true);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM companies').get().n,1);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM access_users').get().n,1);
  legacy.close();
 });
 db.close();console.log(`QA recuperación de propietario v0.6.60: ${passed}/${passed}`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
