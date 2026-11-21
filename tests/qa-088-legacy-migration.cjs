'use strict';
// Comprueba una migración realista desde la v0.6.87 sin conexión a correo.
// SQLite de memoria: no utiliza datos ni secretos del usuario.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {registerAuth,passwordHash}=await import(pathToFileURL(path.join(root,'server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE companies(id INTEGER PRIMARY KEY,legal_name TEXT,identification TEXT); 
 INSERT INTO companies VALUES (1,'Comercio de prueba','123456789');
 `);
 ensureAccessSchema(db);
 // Recrear las tablas de recuperación por correo de una base histórica antes de migrarla.
 db.exec(`CREATE TABLE access_user_emails(user_id INTEGER PRIMARY KEY,email TEXT NOT NULL);
 CREATE TABLE access_email_tokens(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL);`);
 const oldCode='FCR1-'+randomBytes(24).toString('hex').toUpperCase().match(/.{8}/g).join('-');
 const normalized=oldCode.replace(/[\s-]/g,'');
 const hash=createHash('sha256').update(normalized).digest('hex');
 const password='PropietarioHistorico12345';
 const ownerId=Number(db.prepare(`INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required)
 VALUES (?, ?, ?, 'scrypt', 1, 1, 0)`).run('anterior','Propietario histórico',passwordHash(password)).lastInsertRowid);
 db.prepare('INSERT INTO access_owner_recovery(user_id,code_hash) VALUES (?,?)').run(ownerId,hash);
 db.prepare('INSERT INTO access_user_emails(user_id,email) VALUES (?,?)').run(ownerId,'antiguo@example.invalid');
 db.prepare('INSERT INTO access_email_tokens(user_id,token_hash) VALUES (?,?)').run(ownerId,'x'.repeat(64));
 const passed=[];
 const test=(name,fn)=>{fn();passed.push(name);console.log('OK',name)};
 // La actualización retira exclusivamente los secretos de recuperación por correo.
 ensureAccessSchema(db);ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get(p,...h){routes.push(['GET',p,h])},post(p,...h){routes.push(['POST',p,h])},put(p,...h){routes.push(['PUT',p,h])},delete(p,...h){routes.push(['DELETE',p,h])},use(){}};
 registerAuth(app,()=>db);
 function req(method,route,body={},cookie=''){
  const found=routes.find(([m,p])=>m===method&&p===route);assert.ok(found,`No existe ${method} ${route}`);
  let status=200,payload,headers={};
  const request={body,headers:{cookie},get:k=>k==='origin'?'http://127.0.0.1:3001':undefined};
  const response={status(s){status=s;return this},json(v){payload=v;return this},setHeader(k,v){headers[k]=v;return this}};
  let i=0;function next(){const h=found[2][i++];if(h)h(request,response,next)}next();
  return {status,body:payload,headers};
 }
 test('Migración conserva propietario, contraseña y empresa',()=>{
  const row=db.prepare('SELECT username,password_hash FROM access_users WHERE id=?').get(ownerId);
  assert.equal(row.username,'anterior');assert.ok(row.password_hash.startsWith('scrypt$'));
  assert.equal(db.prepare('SELECT legal_name FROM companies WHERE id=1').get().legal_name,'Comercio de prueba');
 });
 test('Migración retira tablas de correo sin eliminar código anterior FCR1',()=>{
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert.ok(!names.includes('access_user_emails'));assert.ok(!names.includes('access_email_tokens'));
  assert.equal(db.prepare('SELECT code_hash FROM access_owner_recovery WHERE user_id=?').get(ownerId).code_hash,hash);
 });
 const login=req('POST','/api/auth/login',{username:'anterior',password});
 test('Propietario existente entra y puede consultar estado de migración',()=>{
  assert.equal(login.status,200,JSON.stringify(login.body));
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  const state=req('GET','/api/auth/recovery/status',{},cookie);
  assert.equal(state.status,200);assert.equal(state.body.configured,false);assert.equal(state.body.legacyAvailable,true);
 });
 const oldReset=req('POST','/api/auth/recovery/reset',{username:'anterior',recoveryCode:oldCode,newPassword:'RestablecidaAntigua12345'});
 test('Antiguo FCR1 rescata la cuenta una última vez',()=>{
  assert.equal(oldReset.status,200,JSON.stringify(oldReset.body));
  assert.equal(req('POST','/api/auth/login',{username:'anterior',password:'RestablecidaAntigua12345'}).status,200);
  assert.equal(db.prepare('SELECT 1 FROM access_owner_recovery WHERE user_id=?').get(ownerId),undefined);
  assert.equal(req('POST','/api/auth/recovery/reset',{username:'anterior',recoveryCode:oldCode,newPassword:'OtraNuevaClave123456'}).status,403);
 });
 const fresh=req('POST','/api/auth/login',{username:'anterior',password:'RestablecidaAntigua12345'});
 const freshCookie=fresh.headers['Set-Cookie'].split(';')[0];
 const rotate=req('POST','/api/auth/recovery/rotate',{password:'RestablecidaAntigua12345'},freshCookie);
 const kit=req('POST','/api/auth/recovery/owner-kit/rotate',{password:'RestablecidaAntigua12345'},freshCookie);
 test('Propietario migrado obtiene 3 códigos y kit por separado, una sola vez',()=>{
  assert.equal(rotate.status,200,JSON.stringify(rotate.body));assert.equal(rotate.body.recoveryCodes.length,3);
  assert.equal(kit.status,200,JSON.stringify(kit.body));assert.ok(kit.body.emergencyKit.fileContent);assert.ok(kit.body.emergencyKit.key);
  const state=req('GET','/api/auth/recovery/status',{},freshCookie).body;
  assert.equal(state.remaining,3);assert.equal(state.emergencyConfigured,true);assert.equal(state.legacyAvailable,false);
 });
 console.log(`QA migración legacy recuperación v0.6.88: ${passed.length}/${passed.length}`);
 db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
