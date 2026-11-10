// v0.6.62: únicamente propietario recupera cuentas ajenas; pruebas SQLite en memoria.
'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
(async () => {
  const {registerAuth} = await import('../server/auth.js');
  const {ensureAccessSchema} = await import('../server/access-schema.js');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY); INSERT INTO companies VALUES(1),(2);');
  ensureAccessSchema(db);
  db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const ret=fn();db.exec('COMMIT');return ret;}catch(e){db.exec('ROLLBACK');throw e;}};
  const routes=[];
  const app={get(p,...h){routes.push(['GET',p,h]);},post(p,...h){routes.push(['POST',p,h]);},put(p,...h){routes.push(['PUT',p,h]);},delete(p,...h){routes.push(['DELETE',p,h]);},use(){}};
  registerAuth(app,()=>db);
  function call(method,route,body={},cookie='',params={},origin='http://127.0.0.1:3001') {
    const found=routes.find(([m,p])=>m===method&&p===route);assert.ok(found,`${method} ${route}`);
    let status=200,data,headers={};
    const req={body,params,headers:{cookie},get:k=>k==='origin'?origin:undefined};
    const res={status:n=>{status=n;return res},json:v=>{data=v;return res},setHeader:(k,v)=>{headers[k]=v;return res}};
    let i=0;
    const next=()=>{const h=found[2][i++];if(h)h(req,res,next);};next();
    return{status,data,headers};
  }
  const ownerPass='PropietarioSeguro12345',temp='TemporalSegura12345';
  let passed=0;
  const test=(label,fn)=>{fn();passed++;console.log('OK',label);};
  function login(username,password) {
    const response=call('POST','/api/auth/login',{username,password});
    assert.equal(response.status,200,JSON.stringify(response.data));return response.headers['Set-Cookie'].split(';')[0];
  }
  test('Configurar propietario y abrir sesión',()=>{assert.equal(call('POST','/api/auth/setup',{username:'dueno',displayName:'Propietario',password:ownerPass}).status,201);});
  const owner=login('dueno',ownerPass);
  const created={};
  for(const [username,role] of [['admin','company_admin'],['supervisor','supervisor'],['cajero','cashier']]){
    const r=call('POST','/api/auth/users',{username,displayName:username,password:temp,role,companyId:1},owner);
    assert.equal(r.status,201,JSON.stringify(r.data));created[username]=r.data.id;
  }
  const cashierSession=login('cajero',temp);
  test('La clave temporal requiere cambiar contraseña antes de operar',()=>assert.equal(call('GET','/api/auth/status',{},cashierSession).data.user.passwordChangeRequired,true));
  const adminSession=login('admin',temp);
  assert.equal(call('POST','/api/auth/password-change',{oldPassword:temp,newPassword:'AdminPersonal123456'},adminSession).status,200);
  const supervisorSession=login('supervisor',temp);
  assert.equal(call('POST','/api/auth/password-change',{oldPassword:temp,newPassword:'SupervisorPersonal12345'},supervisorSession).status,200);
  const url='/api/auth/users/:userId/owner-recovery',id=created.cajero,params={userId:String(id)};
  test('La API rechaza recuperación de otros sin iniciar sesión',()=>assert.equal(call('POST',url,{currentPassword:ownerPass},'',params).status,401));
  test('Un administrador de empresa no puede recuperar cuentas ajenas',()=>assert.equal(call('POST',url,{currentPassword:'AdminPersonal123456'},adminSession,params).status,403));
  test('Un supervisor no puede recuperar otras cuentas',()=>assert.equal(call('POST',url,{currentPassword:'SupervisorPersonal12345'},supervisorSession,params).status,403));
  test('El cajero no puede recuperarse usando la ruta del propietario',()=>assert.equal(call('POST',url,{currentPassword:temp},cashierSession,params).status,403));
  test('El administrador no puede restablecer la clave mediante edición de usuario',()=>assert.equal(call('PUT','/api/auth/users/:userId',{password:'Intrusa12345'},adminSession,params).status,403));
  test('Ni el propietario puede eludir su propia reautenticación mediante edición',()=>assert.equal(call('PUT','/api/auth/users/:userId',{password:'Intrusa12345'},owner,params).status,403));
  test('El propietario no puede recuperarse a sí mismo por ruta de personal',()=>assert.equal(call('POST',url,{currentPassword:ownerPass},owner,{userId:'1'}).status,400));
  test('Origen externo no autorizado',()=>assert.equal(call('POST',url,{currentPassword:ownerPass},owner,params,'https://externo.example').status,403));
  test('Contraseña propietaria incorrecta rechaza sin modificar SQLite',()=>{
    const prev=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(id).password_hash;
    assert.equal(call('POST',url,{currentPassword:'Equivocada12345'},owner,params).status,403);
    assert.equal(db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(id).password_hash,prev);
  });
  db.prepare("INSERT INTO access_user_emails(user_id,email,verified) VALUES (?,?,1)").run(id,'cajero@ejemplo.com');
  const roleBefore=db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=?').all(id);
  let newTemporary;
  test('El propietario genera una contraseña aleatoria temporal para el cajero',()=>{
    const r=call('POST',url,{currentPassword:ownerPass},owner,params);
    assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.data.temporaryPassword,/^FCR-9[a-f0-9]{36}$/);
    newTemporary=r.data.temporaryPassword;
  });
  test('La recuperación revoca sesiones previas y contraseña anterior',()=>{
    assert.equal(call('GET','/api/auth/status',{},cashierSession).data.authenticated,false);
    assert.equal(call('POST','/api/auth/login',{username:'cajero',password:temp}).status,401);
  });
  test('Los roles, empresas y correo verificado no cambian',()=>{
    assert.deepEqual(db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=?').all(id),roleBefore);
    assert.equal(db.prepare('SELECT email,verified FROM access_user_emails WHERE user_id=?').get(id).email,'cajero@ejemplo.com');
    assert.equal(db.prepare('SELECT password_change_required FROM access_users WHERE id=?').get(id).password_change_required,1);
  });
  test('La nueva clave solo permite acceder tras cambio obligatorio',()=>{
    const ck=login('cajero',newTemporary);
    assert.equal(call('GET','/api/auth/status',{},ck).data.user.passwordChangeRequired,true);
    assert.equal(call('POST','/api/auth/password-change',{oldPassword:newTemporary,newPassword:'CajeroRenovado98765'},ck).status,200);
    assert.equal(call('GET','/api/auth/status',{},ck).data.user.passwordChangeRequired,false);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM access_company_roles WHERE user_id=? AND role=?').get(id,'company_admin').n,0);
  });
  test('Auditoría registra propietario y destinatario sin contraseña',()=>{
    const rows=db.prepare("SELECT user_id,object_id FROM access_audit_log WHERE event_type='auth.owner_assisted_recovery'").all();
    assert.equal(rows.length,1);assert.equal(rows[0].user_id,1);assert.equal(rows[0].object_id,String(id));
    assert.ok(!JSON.stringify(rows).includes(newTemporary));
  });
  test('No se recuperan cuentas suspendidas',()=>{
    assert.equal(call('PUT','/api/auth/users/:userId',{isActive:false},owner,params).status,200);
    assert.equal(call('POST',url,{currentPassword:ownerPass},owner,params).status,404);
  });
  test('El propietario puede recuperar otra cuenta de administrador',()=>{
    const r=call('POST',url,{currentPassword:ownerPass},owner,{userId:String(created.admin)});
    assert.equal(r.status,200);
    assert.equal(db.prepare('SELECT role FROM access_company_roles WHERE user_id=?').get(created.admin).role,'company_admin');
  });
  db.close();console.log(`QA recuperación administrativa exclusiva: ${passed}/${passed} pruebas aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
