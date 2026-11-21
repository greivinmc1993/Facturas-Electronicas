'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {registerAuth,passwordHash}=await import(pathToFileURL(path.join(root,'server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE companies(id INTEGER PRIMARY KEY);INSERT INTO companies VALUES (1);');
 ensureAccessSchema(db);ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get(p,...h){routes.push(['GET',p,h])},post(p,...h){routes.push(['POST',p,h])},put(p,...h){routes.push(['PUT',p,h])},delete(p,...h){routes.push(['DELETE',p,h])},use(){}};
 registerAuth(app,()=>db);
 const req=(method,route,body={},cookie='',origin='http://127.0.0.1:3001')=>{
  const pathKey=route.replace(/\/\d+(?=\/|$)/g,'/:userId');
  const found=routes.find(([m,p])=>m===method&&(p===route||p===pathKey));assert.ok(found,`Ruta ${method} ${route}`);
  let status=200,payload,headers={};
  const request={body,params:{userId:route.match(/\/users\/(\d+)/)?.[1]},headers:{cookie},get:k=>k==='origin'?origin:undefined};
  const response={status(n){status=n;return this},json(v){payload=v;return this},setHeader(k,v){headers[k]=v;return this}};
  let i=0;const next=()=>{const fn=found[2][i++];if(fn)fn(request,response,next)};next();return {status,body:payload,headers};
 };
 let passed=0;const ok=(title,fn)=>{fn();passed++;console.log('OK',title)};
 const ownerPass='ClavePropietarioInicial12345',owner='propietario';
 const setup=req('POST','/api/auth/setup',{username:owner,displayName:'Persona propietaria',password:ownerPass});
 ok('Propietario recibe tres códigos FCR2 y kit dual una sola vez',()=>{
  assert.equal(setup.status,201);assert.equal(setup.headers['Cache-Control'],'no-store');
  assert.equal(setup.body.recoveryCodes.length,3);
  setup.body.recoveryCodes.forEach(code=>assert.match(code,/^FCR2-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/));
  assert.match(setup.body.emergencyKit.key,/^FCRK-(?:[A-F0-9]{8}-){7}[A-F0-9]{8}$/);
  assert.equal(JSON.parse(setup.body.emergencyKit.fileContent).format,'FacturaCR-owner-kit-v1');
 });
 const ownerId=db.prepare('SELECT id FROM access_users WHERE is_owner=1').get().id;
 ok('SQLite y auditoría solo conservan hashes, nunca secretos originales',()=>{
  const persisted=JSON.stringify({codes:db.prepare('SELECT * FROM access_recovery_codes').all(),kit:db.prepare('SELECT * FROM access_owner_emergency').all(),audit:db.prepare('SELECT * FROM access_audit_log').all()});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_recovery_codes').get().n,3);
  for(const code of setup.body.recoveryCodes)assert.ok(!persisted.includes(code));
  assert.ok(!persisted.includes(setup.body.emergencyKit.key));
  assert.ok(!persisted.includes(JSON.parse(setup.body.emergencyKit.fileContent).fragment));
 });
 const login=(name,password)=>{const result=req('POST','/api/auth/login',{username:name,password});assert.equal(result.status,200,JSON.stringify(result.body));return result.headers['Set-Cookie'].split(';')[0]};
 let ownerCookie=login(owner,ownerPass);
 ok('El estado no revela códigos ni la clave del kit',()=>{
  const r=req('GET','/api/auth/recovery/status',{},ownerCookie);assert.equal(r.status,200);assert.equal(r.body.remaining,3);assert.equal(r.body.emergencyConfigured,true);
  assert.equal(JSON.stringify(r.body).includes('FCRK-'),false);
 });
 const staff=req('POST','/api/auth/users',{username:'cajeroqa',displayName:'Cajero QA',password:'TemporalCajero123456',companyId:1,role:'cashier'},ownerCookie);
 const staffId=staff.body.id;
 ok('Nuevo cajero recibe tres códigos propios inmediatamente',()=>{assert.equal(staff.status,201);assert.equal(staff.body.recoveryCodes.length,3);assert.equal(staff.body.emergencyKit,undefined)});
 let staffCookie=login('cajeroqa','TemporalCajero123456');
 ok('El personal debe cambiar contraseña temporal antes de renovar códigos',()=>{
  assert.equal(req('POST','/api/auth/recovery/rotate',{password:'TemporalCajero123456'},staffCookie).status,403);
  const firstChange=req('POST','/api/auth/password-change',{oldPassword:'TemporalCajero123456',newPassword:'NuevaClaveCajero87654'},staffCookie);assert.equal(firstChange.status,200);assert.equal(firstChange.body.recoveryCodes.length,3);staff.body.recoveryCodes=firstChange.body.recoveryCodes;
 });
 ok('Un código usado cambia la contraseña y queda inutilizable',()=>{
  const r=req('POST','/api/auth/recovery/reset',{username:'cajeroqa',recoveryCode:staff.body.recoveryCodes[0],newPassword:'RecuperadoCajero123456'});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.remaining,2);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:'cajeroqa',recoveryCode:staff.body.recoveryCodes[0],newPassword:'OtraClaveCajero123456'}).status,403);
  assert.equal(req('GET','/api/auth/recovery/status',{},staffCookie).status,401);
  staffCookie=login('cajeroqa','RecuperadoCajero123456');
 });
 ok('Un usuario puede renovar sus tres códigos con su contraseña',()=>{
  assert.equal(req('POST','/api/auth/recovery/rotate',{password:'incorrecta'},staffCookie).status,403);
  const r=req('POST','/api/auth/recovery/rotate',{password:'RecuperadoCajero123456'},staffCookie);
  assert.equal(r.status,200);assert.equal(r.body.recoveryCodes.length,3);
  assert.equal(req('GET','/api/auth/recovery/status',{},staffCookie).body.remaining,3);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:'cajeroqa',recoveryCode:staff.body.recoveryCodes[1],newPassword:'OtraClaveCajero123456'}).status,403);
 });
 ok('Un cajero no puede usar kit extraordinario del propietario',()=>{
  assert.equal(req('POST','/api/auth/recovery/owner-kit/rotate',{password:'RecuperadoCajero123456'},staffCookie).status,403);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:'cajeroqa',method:'emergency',fileContent:setup.body.emergencyKit.fileContent,emergencyKey:setup.body.emergencyKit.key,newPassword:'ClaveNuevaCajero123456'}).status,403);
 });
 ok('Dos mitades del kit son obligatorias, no basta una sola',()=>{
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,method:'emergency',fileContent:setup.body.emergencyKit.fileContent,emergencyKey:'incorrecta',newPassword:'ClaveNuevaProp123456'}).status,403);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,method:'emergency',fileContent:'{}',emergencyKey:setup.body.emergencyKit.key,newPassword:'ClaveNuevaProp123456'}).status,403);
 });
 ok('Kit extraordinario legítimo restaura propietario y rota códigos y kit',()=>{
  const r=req('POST','/api/auth/recovery/reset',{username:owner,method:'emergency',fileContent:setup.body.emergencyKit.fileContent,emergencyKey:setup.body.emergencyKit.key,newPassword:'NuevaPropietaria123456'});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.recoveryCodes.length,3);assert.ok(r.body.emergencyKit.fileContent);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,method:'emergency',fileContent:setup.body.emergencyKit.fileContent,emergencyKey:setup.body.emergencyKit.key,newPassword:'OtraPropietaria123456'}).status,403);
  assert.equal(req('GET','/api/auth/recovery/status',{},ownerCookie).status,401);
  ownerCookie=login(owner,'NuevaPropietaria123456');
 });
 ok('El propietario puede renovar kit sin alterar códigos habituales',()=>{
  const r=req('POST','/api/auth/recovery/owner-kit/rotate',{password:'NuevaPropietaria123456'},ownerCookie);
  assert.equal(r.status,200);assert.ok(r.body.emergencyKit.key);assert.equal(req('GET','/api/auth/recovery/status',{},ownerCookie).body.remaining,3);
 });
 ok('El propietario puede asistir a un cajero con clave temporal y tres códigos nuevos',()=>{
  const r=req('POST',`/api/auth/users/${staffId}/owner-recovery`,{currentPassword:'NuevaPropietaria123456'},ownerCookie);
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.recoveryCodes.length,3);assert.ok(r.body.temporaryPassword);
  assert.equal(db.prepare('SELECT password_change_required AS p FROM access_users WHERE id=?').get(staffId).p,1);
 });
 ok('Sin endpoints ni tablas de recuperación por correo',()=>{
  assert.ok(!routes.some(([,route])=>route.includes('/email/')||route.includes('/mail/')));
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'access_%'").all().map(x=>x.name);
  assert.ok(!tables.includes('access_user_emails'));assert.ok(!tables.includes('access_email_tokens'));
 });
 ok('Protección de origen contra ataques entre sitios',()=>{
  assert.equal(req('POST','/api/auth/recovery/reset',{username:owner,recoveryCode:'FCR2-INVALID',newPassword:'NuevaOtraClave123456'},'','https://otro-sitio.example').status,403);
 });
 ok('Un usuario antiguo sin códigos puede activarlos al autenticarse',()=>{
  const oldId=Number(db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required) VALUES (?,?,?,'scrypt',0,1,0)").run('viejoqa','Antiguo QA',passwordHash('ClaveAntigua12345')).lastInsertRowid);
  const cookie=login('viejoqa','ClaveAntigua12345');
  assert.equal(req('GET','/api/auth/recovery/status',{},cookie).body.configured,false);
  const r=req('POST','/api/auth/recovery/rotate',{password:'ClaveAntigua12345'},cookie);assert.equal(r.status,200);assert.equal(r.body.recoveryCodes.length,3);
 });
 console.log(`QA v0.6.88 recuperación sin correo: ${passed}/${passed}`);db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
