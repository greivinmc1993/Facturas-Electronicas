'use strict';
// Autenticación por HTTP real después de la actualización entre versiones.
// El propietario se crea en el smoke del ejecutable; esta prueba NO omite la seguridad.
const assert=require('node:assert/strict');

async function authenticateUpgradeApi(base,{username,password,fetchImpl=fetch}){
  assert.match(String(base),/^http:\/\/127\.0\.0\.1:\d+$/,'La prueba solo acepta la API local');
  assert.ok(typeof username==='string'&&username.length>0,'Falta el usuario QA');
  assert.ok(typeof password==='string'&&password.length>=12,'Falta la contraseña temporal QA');

  const send=async(method,relative,body,sessionCookie='')=>{
    const headers=sessionCookie?{cookie:sessionCookie}:{};
    if(body!==undefined)headers['content-type']='application/json';
    const response=await fetchImpl(base+relative,{
      method,headers,redirect:'manual',cache:'no-store',
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const result=await response.json();
    return {status:response.status,body:result,headers:response.headers};
  };

  // Como el smoke empaquetado ya instaló el propietario en SQLite,
  // un servidor nuevo no hereda su sesión, pero sí encuentra esa cuenta.
  const status=await send('GET','/api/auth/status');
  assert.equal(status.status,200,'No responde el estado de autenticación');
  assert.equal(status.body.setupRequired,false,'La cuenta propietaria no persistió tras la actualización');
  assert.equal(status.body.authenticated,false,'La API de QA debe comenzar sin sesión');

  const blocked=await send('GET','/api/companies');
  assert.equal(blocked.status,401,'La API comercial no debe ser pública');
  assert.equal(blocked.body.code,'AUTH_REQUIRED','Se esperaba el rechazo de sesión');

  const login=await send('POST','/api/auth/login',{username,password});
  assert.equal(login.status,200,'No fue posible iniciar sesión con el propietario temporal QA');
  assert.equal(login.body.user?.isOwner,true,'El usuario de QA no es propietario');
  const setCookie=login.headers.get('set-cookie')||'';
  const match=setCookie.match(/^facturacr_session=([a-f0-9]{64});/);
  assert.ok(match,'El servidor no devolvió una cookie de sesión válida');
  assert.match(setCookie,/(?:^|;)\s*HttpOnly(?:;|$)/i,'La cookie debe ser HttpOnly');
  assert.match(setCookie,/(?:^|;)\s*SameSite=Strict(?:;|$)/i,'La cookie debe ser SameSite=Strict');
  const sessionCookie=`facturacr_session=${match[1]}`;
  const current=await send('GET','/api/auth/status',undefined,sessionCookie);
  assert.equal(current.status,200);
  assert.equal(current.body.authenticated,true,'No se reconoció la sesión de QA');
  assert.equal(current.body.user?.isOwner,true,'La sesión autenticada no es de propietario');

  return {
    // El token queda únicamente en este closure; no se exporta al reporte ni se imprime.
    get:async(relative)=>{
      const response=await send('GET',relative,undefined,sessionCookie);
      assert.equal(response.status,200,`${relative} devolvió HTTP ${response.status}`);
      return response.body;
    },
    verifyUnauthorized:async(relative)=>{
      const response=await send('GET',relative);
      assert.equal(response.status,401,`${relative} debería permanecer protegida`);
      assert.equal(response.body.code,'AUTH_REQUIRED');
    }
  };
}
module.exports={authenticateUpgradeApi};
