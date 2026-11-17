'use strict';
// v0.6.72: el nombre de usuario de una cuenta eliminada permanece reservado,
// pero su ficha es visible en el archivo para personal con permisos.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {registerAuth}=await import('../server/auth.js');
 const {ensureAccessSchema}=await import('../server/access-schema.js');
 const db=new DatabaseSync(':memory:');
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY,trade_name TEXT,legal_name TEXT); INSERT INTO companies VALUES(1,'Comercio Uno','Empresa Uno'),(2,'Comercio Dos','Empresa Dos');");
 ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[];
 const app={get:(p,...f)=>routes.push(['GET',p,f]),post:(p,...f)=>routes.push(['POST',p,f]),put:(p,...f)=>routes.push(['PUT',p,f]),delete:(p,...f)=>routes.push(['DELETE',p,f]),use:(p,...f)=>routes.push(['USE',p,f])};
 registerAuth(app,()=>db,{mailConfigured:()=>false,sendMail:async()=>({})});
 const PASSWORD='ClaveSegura123456';let count=0;
 function check(label,fn){fn();count++;console.log('OK usuarios archivados:',label)}
 function req(method,path,body={},cookie='',params={}){
  const route=routes.find(([m,p])=>m===method&&p===path);assert.ok(route,`No existe ${method} ${path}`);
  let status=200,data,headers={};
  const res={status(v){status=v;return res},setHeader(k,v){headers[k]=v;return res},once(){return res},json(v){data=v;return res}};
  const r={method,path:path.replace(/^\/api/,''),params,body,headers:{cookie},get:name=>name==='origin'?'http://127.0.0.1:3001':undefined};
  let i=0;const next=()=>{const fn=route[2][i++];if(fn)fn(r,res,next)};next();return{status,data,headers};
 }
 function login(username,password=PASSWORD){const r=req('POST','/api/auth/login',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));return r.headers['Set-Cookie'].split(';')[0]}
 function create(cookie,username,companyId,role='cashier'){
  const r=req('POST','/api/auth/users',{username,displayName:username+' Visible',password:PASSWORD,companyId,role},cookie);
  assert.equal(r.status,201,JSON.stringify(r.data));return r.data.id;
 }
 try{
  const setup=req('POST','/api/auth/setup',{username:'propietario',displayName:'Dueño',password:PASSWORD});
  assert.equal(setup.status,201,JSON.stringify(setup.data));
  const owner=login('propietario');
  const admin1=create(owner,'adminuno',1,'company_admin'),admin2=create(owner,'admindos',2,'company_admin');
  const cajero=create(owner,'cajero',1),otro=create(owner,'cajaotro',2),suspendido=create(owner,'suspendido',1);
  const adminOneFirst=login('adminuno'),adminTwoFirst=login('admindos');
  for(const [cookie,name] of [[adminOneFirst,'AdminUno123456'],[adminTwoFirst,'AdminDos123456']]){
   const r=req('POST','/api/auth/password-change',{oldPassword:PASSWORD,newPassword:name},cookie);
   assert.equal(r.status,200,JSON.stringify(r.data));
  }
  const adminOne=login('adminuno','AdminUno123456'),adminTwo=login('admindos','AdminDos123456');
  check('archivo inicialmente vacío y restringido por login',()=>{
   assert.deepEqual(req('GET','/api/auth/users/archived',{},owner).data,[]);
   assert.equal(req('GET','/api/auth/users/archived').status,401);
  });
  check('eliminar mantiene baja lógica, roles y el ID histórico',()=>{
   const r=req('DELETE','/api/auth/users/:userId',{confirmation:'cajero',currentPassword:PASSWORD},owner,{userId:String(cajero)});
   assert.equal(r.status,200,JSON.stringify(r.data));
   const u=db.prepare('SELECT username,is_deleted,is_active,id FROM access_users WHERE id=?').get(cajero);
   assert.deepEqual([u.username,u.is_deleted,u.is_active,u.id],['cajero',1,0,cajero]);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM access_company_roles WHERE user_id=?').get(cajero).n,1);
  });
  check('el propietario ve el eliminado exclusivamente en el archivo',()=>{
   const active=req('GET','/api/auth/users',{},owner).data;
   const archived=req('GET','/api/auth/users/archived',{},owner).data;
   assert.equal(active.some(u=>u.username==='cajero'),false);
   assert.equal(archived.length,1);assert.equal(archived[0].username,'cajero');
   assert.equal(archived[0].is_deleted,1);assert.equal(archived[0].companies[0].company_id,1);
   assert.equal(Object.hasOwn(archived[0],'password_hash'),false);
   assert.equal(Object.hasOwn(archived[0],'email'),false);
  });
  check('nombre eliminado produce explicación precisa y HTTP 409',()=>{
   const r=req('POST','/api/auth/users',{username:' CAJERO ',displayName:'Cajero nuevo',password:PASSWORD,companyId:1,role:'cashier'},owner);
   assert.equal(r.status,409,JSON.stringify(r.data));assert.equal(r.data.code,'USERNAME_ARCHIVED');
   assert.match(r.data.error,/perfil eliminado/i);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM access_users WHERE username='cajero'").get().n,1);
  });
  check('un administrador ve solo usuarios archivados de sus empresas',()=>{
   const a=req('GET','/api/auth/users/archived',{},adminOne);
   assert.equal(a.status,200);assert.deepEqual(a.data.map(u=>u.username),['cajero']);
   assert.deepEqual(req('GET','/api/auth/users/archived',{},adminTwo).data,[]);
  });
  check('colisión ajena no revela identidad de una empresa distinta',()=>{
   const r=req('POST','/api/auth/users',{username:'cajero',displayName:'Cajero nuevo',password:PASSWORD,companyId:2,role:'cashier'},adminTwo);
   assert.equal(r.status,409);assert.equal(r.data.code,'USERNAME_UNAVAILABLE');
   assert.doesNotMatch(r.data.error,/eliminado|archivo|historial/i);
  });
  check('administrador de la empresa afectada recibe mensaje de archivo',()=>{
   const r=req('POST','/api/auth/users',{username:'cajero',displayName:'Cajero nuevo',password:PASSWORD,companyId:1,role:'cashier'},adminOne);
   assert.equal(r.status,409);assert.equal(r.data.code,'USERNAME_ARCHIVED');
  });
  check('perfiles activos mantienen unicidad sin confundirse con archivados',()=>{
   const r=req('POST','/api/auth/users',{username:'adminuno',displayName:'Nuevo Admin',password:PASSWORD,companyId:1,role:'cashier'},owner);
   assert.equal(r.status,409);assert.equal(r.data.code,'USERNAME_UNAVAILABLE');
  });
  check('usuario suspendido sigue en listado habitual y no en archivados',()=>{
   const r=req('PUT','/api/auth/users/:userId',{isActive:false},owner,{userId:String(suspendido)});
   assert.equal(r.status,200);
   assert.equal(req('GET','/api/auth/users',{},owner).data.find(x=>x.id===suspendido).is_active,0);
   assert.equal(req('GET','/api/auth/users/archived',{},owner).data.some(x=>x.id===suspendido),false);
  });
  check('nombre alternativo crea cuenta nueva sin reactivar la antigua',()=>{
   const fresh=create(owner,'cajero2',1);
   assert.notEqual(fresh,cajero);
   assert.equal(db.prepare('SELECT is_deleted FROM access_users WHERE id=?').get(cajero).is_deleted,1);
   assert.equal(db.prepare('SELECT is_active FROM access_users WHERE id=?').get(fresh).is_active,1);
  });
  check('archivo solo lectura y sin credenciales en respuesta',()=>{
   const archived=req('GET','/api/auth/users/archived',{},owner).data;
   assert.equal(archived.some(x=>x.id===admin1||x.id===admin2||x.id===otro),false);
   assert.equal(archived.every(x=>!('password_hash' in x)&&!('temporaryPassword' in x)),true);
   assert.equal(req('POST','/api/auth/login',{username:'cajero',password:PASSWORD}).status,401);
  });
  check('la bitácora conserva quién eliminó el perfil',()=>{
   const audit=db.prepare("SELECT user_id,object_id FROM access_audit_log WHERE event_type='users.deleted' AND object_id=?").get(String(cajero));
   assert.ok(audit);assert.equal(String(audit.object_id),String(cajero));
  });
  console.log(`QA usuarios archivados v0.6.72: ${count}/${count} aprobadas`);
 }finally{db.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
