'use strict';
// Regresión sin dependencias nativas: simula las respuestas HTTP y verifica
// que un upgrade no consulte empresas sin login ni filtre la cookie de sesión.
const assert=require('node:assert/strict');
const {authenticateUpgradeApi}=require('./qa-version-auth.cjs');
let count=0;
async function test(name,fn){await fn();count++;console.log('OK',name)}
const base='http://127.0.0.1:32456';
const username='qa_propietario';
const password='ClaveDePruebaSegura12345';
const cookie='facturacr_session='+'a'.repeat(64);
function mockServer({setupRequired=false,badCookie=false,denyLogin=false}={}){
  const requests=[];
  const fetchImpl=async(url,options)=>{
    const route=new URL(url).pathname;
    requests.push({route,method:options.method,authenticated:options.headers.cookie===cookie});
    let status=200,body={},headers={};
    if(route==='/api/auth/status'){
      body={setupRequired,authenticated:options.headers.cookie===cookie,
        user:options.headers.cookie===cookie?{isOwner:true}:null};
    }else if(route==='/api/companies'){
      if(options.headers.cookie!==cookie){status=401;body={code:'AUTH_REQUIRED'};}
      else body=[{id:1,identification:'QA-OLD'}];
    }else if(route==='/api/auth/login'){
      const supplied=JSON.parse(options.body);
      assert.equal(supplied.username,username);
      assert.equal(supplied.password,password);
      if(denyLogin){status=401;body={code:'BAD_PASSWORD'};}
      else {body={user:{isOwner:true}};headers={'set-cookie':badCookie?cookie+'; Path=/api':cookie+'; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200'};}
    }else throw Error('Ruta inesperada '+route);
    return {status,headers:new Headers(headers),json:async()=>body};
  };
  return {requests,fetchImpl};
}
async function main(){
 await test('Exige propietario persistente, rechazo 401 y login por cookie HttpOnly',async()=>{
  const m=mockServer();
  const auth=await authenticateUpgradeApi(base,{username,password,fetchImpl:m.fetchImpl});
  const companies=await auth.get('/api/companies');
  assert.equal(companies[0].identification,'QA-OLD');
  assert.deepEqual(m.requests.map(r=>r.route),[
    '/api/auth/status','/api/companies','/api/auth/login','/api/auth/status','/api/companies']);
  assert.equal(m.requests[1].authenticated,false);
  assert.equal(m.requests[4].authenticated,true);
  assert.equal(Object.prototype.hasOwnProperty.call(auth,'cookie'),false);
 });
 await test('Rechaza el acceso comercial sin cookie aun después de iniciar sesión',async()=>{
  const m=mockServer();
  const auth=await authenticateUpgradeApi(base,{username,password,fetchImpl:m.fetchImpl});
  await auth.verifyUnauthorized('/api/companies');
  assert.equal(m.requests.at(-1).authenticated,false);
 });
 await test('No permite saltar configuración inicial si se perdió el propietario',async()=>{
  const m=mockServer({setupRequired:true});
  await assert.rejects(authenticateUpgradeApi(base,{username,password,fetchImpl:m.fetchImpl}),/no persistió/);
  assert.deepEqual(m.requests.map(r=>r.route),['/api/auth/status']);
 });
 await test('Rechaza cookies que no sean HttpOnly / SameSite Strict',async()=>{
  const m=mockServer({badCookie:true});
  await assert.rejects(authenticateUpgradeApi(base,{username,password,fetchImpl:m.fetchImpl}),/HttpOnly/);
 });
 await test('Un login incorrecto falla sin consultar los registros históricos',async()=>{
  const m=mockServer({denyLogin:true});
  await assert.rejects(authenticateUpgradeApi(base,{username,password,fetchImpl:m.fetchImpl}),/No fue posible iniciar sesión/);
  assert.ok(m.requests.every(r=>r.route!=='/api/companies'||!r.authenticated));
 });
 await test('Solo se autoriza consultar el servidor local de prueba',async()=>{
  await assert.rejects(authenticateUpgradeApi('https://servidor-ejemplo.invalid',{username,password,fetchImpl:mockServer().fetchImpl}),/solo acepta la API local/);
 });
 console.log(`QA autenticación de actualización: ${count}/${count}`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
