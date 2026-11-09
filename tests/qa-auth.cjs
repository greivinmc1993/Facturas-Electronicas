'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {passwordHash,verifyPassword,registerAuth}=await import(pathToFileURL(path.resolve(__dirname,'../server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.resolve(__dirname,'../server/access-schema.js')).href);
 let passed=0;
 const check=(title,fn)=>{fn();passed++;console.log('OK',title)};
 check('Contraseña robusta y sal aleatoria',()=>{const a=passwordHash('ClaveSegura12345'),b=passwordHash('ClaveSegura12345');assert.notEqual(a,b);assert.equal(verifyPassword('ClaveSegura12345',a),true);assert.equal(verifyPassword('Incorrecta12345',a),false);assert.throws(()=>passwordHash('123'));assert.equal(verifyPassword('abc','invalid'),false)});
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY);');ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[],middleware=[];
 const app={get(p,...handlers){routes.push(['GET',p,handlers])},post(p,...handlers){routes.push(['POST',p,handlers])},put(p,...handlers){routes.push(['PUT',p,handlers])},delete(p,...handlers){routes.push(['DELETE',p,handlers])},use(p,cb){middleware.push([p,cb])}};
 const auth=registerAuth(app,()=>db);
 const call=(method,url,body={},cookie='',origin='http://127.0.0.1:3001')=>{
  const r=routes.find(x=>x[0]===method&&x[1]===url);assert.ok(r,url);
  let status=200,result,headers={};const res={status(v){status=v;return this},json(v){result=v;return this},setHeader(k,v){headers[k]=v;return this}};
  const req={path:url.replace('/api',''),body,headers:{cookie},get(k){return k==='origin'?origin:undefined}};
  let i=0;const next=()=>{const h=r[2][i++];if(h)h(req,res,next)};next();return {status,body:result,headers};
 };
 check('Sin cuenta: instalación exige propietario',()=>{const r=call('GET','/api/auth/status');assert.equal(r.body.setupRequired,true);assert.equal(r.body.authenticated,false);assert.equal(r.body.idle_lock_minutes,15)});
 check('Rechaza configuración de origen externo',()=>{const r=call('POST','/api/auth/setup',{username:'propietario',displayName:'Propietario',password:'ClaveSegura12345'},'', 'https://ejemplo.com');assert.equal(r.status,403)});
 check('Crea un único propietario y no almacena contraseña',()=>{
  const req={username:'propietario',displayName:'Propietario',password:'ClaveSegura12345'};
  assert.equal(call('POST','/api/auth/setup',req).status,201);
  assert.equal(call('POST','/api/auth/setup',req).status,400);
  const row=db.prepare('SELECT * FROM access_users').get();assert.equal(row.is_owner,1);assert.equal(row.password_algorithm,'scrypt');assert.ok(!row.password_hash.includes('ClaveSegura'));
 });
 check('Falla credencial falsa; sesión correcta usa cookie HttpOnly',()=>{
  assert.equal(call('POST','/api/auth/login',{username:'propietario',password:'Incorrecta12345'}).status,401);
  const r=call('POST','/api/auth/login',{username:'propietario',password:'ClaveSegura12345'});
  assert.equal(r.status,200);assert.match(r.headers['Set-Cookie'],/HttpOnly/);assert.match(r.headers['Set-Cookie'],/SameSite=Strict/);
  const cookie=r.headers['Set-Cookie'].split(';')[0];
  const state=call('GET','/api/auth/status',{},cookie);assert.equal(state.body.authenticated,true);
  assert.equal(call('PUT','/api/auth/settings',{idle_lock_minutes:30},cookie).body.idle_lock_minutes,30);
  assert.equal(call('POST','/api/auth/logout',{},cookie).status,200);
  assert.equal(call('GET','/api/auth/status',{},cookie).body.authenticated,false);
 });
 check('API requiere autenticación del lado servidor',()=>{assert.equal(middleware.length,1);const guarded=middleware[0][1];let result;guarded({path:'/companies',headers:{}},{status(s){this.statusCode=s;return this},json(v){result=v}},()=>{throw Error('No se debe permitir')});assert.equal(result.code,'AUTH_REQUIRED')});
 check('El reinicio de sesiones invalida credenciales',()=>{auth.invalidateSessions();assert.equal(call('GET','/api/auth/status').body.authenticated,false)});
 db.close();console.log(`QA autenticación: ${passed}/${passed} pruebas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
