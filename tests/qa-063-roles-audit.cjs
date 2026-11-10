'use strict';
// v0.6.63: delegación, eliminación lógica, permisos de inventario y auditoría.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {registerAuth}=await import('../server/auth.js');
 const {ensureAccessSchema}=await import('../server/access-schema.js');
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY,trade_name TEXT,legal_name TEXT); INSERT INTO companies VALUES(1,\'Comercio 1\',\'Empresa 1\'),(2,\'Comercio 2\',\'Empresa 2\');');
 ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const handlers=[];
 const app={get(p,...h){handlers.push(['GET',p,h])},post(p,...h){handlers.push(['POST',p,h])},put(p,...h){handlers.push(['PUT',p,h])},delete(p,...h){handlers.push(['DELETE',p,h])},use(p,...h){handlers.push(['USE',p,h])}};
 registerAuth(app,()=>db,{mailConfigured:()=>false,sendMail:async()=>({})});
 const OWNER='PropietarioSeguro12345',TEMP='TemporalSeguro12345';let passed=0;
 function check(label,fn){fn();passed++;console.log('OK',label)}
 function call(method,path,body={},cookie='',params={},query={}){
  const h=handlers.find(([m,p])=>m===method&&p===path);assert.ok(h,`No existe ${method} ${path}`);
  let status=200,data,headers={},complete=[];const res={statusCode:200,status:n=>{status=n;res.statusCode=n;return res},setHeader:(k,v)=>{headers[k]=v;return res},once:(name,fn)=>{if(name==='finish')complete.push(fn);return res},json:v=>{data=v;for(const fn of complete)fn();return res}};
  const req={method,path:path.replace(/^\/api/,''),params,query,body,headers:{cookie},get:k=>k==='origin'?'http://127.0.0.1:3001':undefined};
  let i=0;const next=()=>{const fn=h[2][i++];if(fn)fn(req,res,next)};next();return{status,data,headers};
 }
 function login(username,password){const r=call('POST','/api/auth/login',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));return r.headers['Set-Cookie'].split(';')[0]}
 check('Alta segura de propietario y migración de baja lógica',()=>{
  assert.equal(db.prepare('PRAGMA table_info(access_users)').all().some(x=>x.name==='is_deleted'),true);
  assert.equal(call('POST','/api/auth/setup',{username:'dueno',displayName:'Propietario',password:OWNER}).status,201);
 });
 const own=login('dueno',OWNER),members={};
 for(const [username,role,companyId] of [['admin','company_admin',1],['supervisor','supervisor',1],['cajero','cashier',1],['otro','cashier',2]]){
  const r=call('POST','/api/auth/users',{username,displayName:username,password:TEMP,role,companyId},own);assert.equal(r.status,201,JSON.stringify(r.data));members[username]=r.data.id;
 }
 let supervisor=login('supervisor',TEMP),admin=login('admin',TEMP),cashier=login('cajero',TEMP);
 call('POST','/api/auth/password-change',{oldPassword:TEMP,newPassword:'SupervisorPersonal12345'},supervisor);
 call('POST','/api/auth/password-change',{oldPassword:TEMP,newPassword:'AdminPersonal12345'},admin);
 call('POST','/api/auth/password-change',{oldPassword:TEMP,newPassword:'CajeroPersonal12345'},cashier);
 check('Supervisor no crea cuentas sin delegación',()=>{
  const r=call('POST','/api/auth/users',{username:'delegado',displayName:'Cajero delegado',password:TEMP,role:'cashier',companyId:1},supervisor);
  assert.equal(r.status,403);
 });
 check('Solo propietario delega administración de cajeros',()=>{
  const url='/api/auth/users/:userId/delegation',body={companyId:1,allowed:true},params={userId:String(members.supervisor)};
  assert.equal(call('PUT',url,body,admin,params).status,403);
  assert.equal(call('PUT',url,body,own,params).status,200);
  assert.equal(call('GET','/api/auth/status',{},supervisor).data.authenticated,false);
  supervisor=login('supervisor','SupervisorPersonal12345');
  assert.deepEqual(call('GET','/api/auth/status',{},supervisor).data.user.delegatedCashierCompanies,[1]);
 });
 check('Supervisor autorizado crea solo cajeros de su empresa',()=>{
  const r=call('POST','/api/auth/users',{username:'delegado',displayName:'Cajero delegado',password:TEMP,role:'cashier',companyId:1},supervisor);
  assert.equal(r.status,201,JSON.stringify(r.data));members.delegado=r.data.id;
  assert.equal(call('POST','/api/auth/users',{username:'intruso',displayName:'Intruso',password:TEMP,role:'company_admin',companyId:1},supervisor).status,403);
  assert.equal(call('POST','/api/auth/users',{username:'intrusodos',displayName:'Intruso dos',password:TEMP,role:'cashier',companyId:2},supervisor).status,403);
 });
 check('Supervisor solo suspende/reanuda cajeros; no asciende roles',()=>{
  const url='/api/auth/users/:userId',params={userId:String(members.delegado)};
  assert.equal(call('PUT',url,{isActive:false},supervisor,params).status,200);
  assert.equal(db.prepare('SELECT is_active FROM access_users WHERE id=?').get(members.delegado).is_active,0);
  assert.equal(call('PUT',url,{companyId:1,role:'company_admin'},supervisor,params).status,403);
  assert.equal(call('PUT',url,{isActive:true},supervisor,params).status,200);
  assert.equal(call('DELETE',url,{confirmation:'delegado',currentPassword:'SupervisorPersonal12345'},supervisor,params).status,403);
 });
 check('Cajero puede recibir mercancía y declarar toma física, no retirar inventario',()=>{
  const path='/companies/1/inventory/movements',handler=handlers.find(([m,p])=>m==='USE'&&p==='/api');assert.ok(handler);
  function authAction(method,path,body,cookie){let code=200,ok=false;const req={method,path,body,headers:{cookie}},res={status(n){code=n;return this},json(){return this},once(){return this}};let idx=0;const next=()=>{const fn=handler[2][idx++];if(fn)fn(req,res,next);else ok=true};next();return {code,ok}}
  assert.equal(authAction('POST',path,{movement_type:'entrada'},cashier).ok,true);
  assert.equal(authAction('POST',path,{movement_type:'ajuste'},cashier).ok,true);
  assert.equal(authAction('POST',path,{movement_type:'salida'},cashier).code,403);
  assert.equal(authAction('POST','/companies/2/inventory/movements',{movement_type:'entrada'},cashier).code,403);
  assert.equal(authAction('GET','/companies/1/inventory/kardex/operativo',{},cashier).ok,true);
  assert.equal(authAction('GET','/companies/1/inventory/kardex/operativo/export.csv',{},cashier).ok,true);
  assert.equal(authAction('GET','/companies/1/inventory/kardex/operativo/export.html',{},cashier).ok,true);
  assert.equal(authAction('GET','/companies/1/inventory/kardex',{},cashier).code,403);
  assert.equal(authAction('GET','/companies/2/inventory/kardex/operativo',{},cashier).code,403);
 });
 check('Administrador puede eliminar solo perfiles subordinados de empresas propias',()=>{
  const params={userId:String(members.cajero)},url='/api/auth/users/:userId';
  assert.equal(call('DELETE',url,{confirmation:'cajero',currentPassword:'Incorrecta12345'},admin,params).status,403);
  assert.equal(call('DELETE',url,{confirmation:'otro',currentPassword:'AdminPersonal12345'},admin,params).status,400);
  assert.equal(call('DELETE',url,{confirmation:'cajero',currentPassword:'AdminPersonal12345'},admin,params).status,200);
  assert.equal(db.prepare('SELECT is_deleted,is_active FROM access_users WHERE id=?').get(members.cajero).is_deleted,1);
  assert.equal(call('GET','/api/auth/status',{},cashier).data.authenticated,false);
  assert.equal(call('POST','/api/auth/login',{username:'cajero',password:'CajeroPersonal12345'}).status,401);
  assert.equal(call('GET','/api/auth/users',{},admin).data.some(x=>x.id===members.cajero),false);
  assert.equal(call('DELETE',url,{confirmation:'admin',currentPassword:'AdminPersonal12345'},admin,{userId:String(members.admin)}).status,400);
 });
 check('Administradores no eliminan perfiles ajenos ni propietarios',()=>{
  assert.equal(call('DELETE','/api/auth/users/:userId',{confirmation:'otro',currentPassword:'AdminPersonal12345'},admin,{userId:String(members.otro)}).status,403);
  assert.equal(call('DELETE','/api/auth/users/:userId',{confirmation:'dueno',currentPassword:'AdminPersonal12345'},admin,{userId:'1'}).status,400);
 });
 check('Revocación de delegación invalida sesión y retira permiso',()=>{
  const r=call('PUT','/api/auth/users/:userId/delegation',{companyId:1,allowed:false},own,{userId:String(members.supervisor)});
  assert.equal(r.status,200);
  assert.equal(call('GET','/api/auth/status',{},supervisor).data.authenticated,false);
  supervisor=login('supervisor','SupervisorPersonal12345');
  assert.equal(call('POST','/api/auth/users',{username:'prohibido',displayName:'Prohibido',password:TEMP,companyId:1,role:'cashier'},supervisor).status,403);
 });
 check('Auditoría solo propietario y con eventos históricos de eliminación y acceso',()=>{
  assert.equal(call('GET','/api/auth/audit',{},admin).status,403);
  const r=call('GET','/api/auth/audit',{},own,{},{});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(r.data.rows.some(x=>x.event_type==='auth.login'));
  assert.ok(r.data.rows.some(x=>x.event_type==='users.deleted'&&x.object_id===String(members.cajero)));
  assert.ok(r.data.rows.some(x=>x.event_type==='users.cashier_delegation'));
  assert.ok(r.data.total>=3);
 });
 check('No almacena contraseñas en los eventos de acceso y eliminación',()=>{
  const raw=db.prepare('SELECT details_json FROM access_audit_log').all().map(x=>x.details_json).join(' ');
  assert.ok(!raw.includes(OWNER)&&!raw.includes('AdminPersonal12345'));
 });
 check('Auditoría registra el éxito de ingreso de mercadería sin incluir claves',()=>{
  const h=handlers.find(([method,p])=>method==='USE'&&p==='/api');
  let listeners=[],nextCalls=0;const req={path:'/companies/1/inventory/movements',method:'POST',body:{product_id:15,movement_type:'entrada',quantity:12,reason:'Ingreso a bodega',secret:'No registrar esta contraseña'},headers:{cookie:own}};
  const res={statusCode:201,once:(n,f)=>{if(n==='finish')listeners.push(f);return res},status(n){res.statusCode=n;return res},json(v){for(const f of listeners)f();return res}};
  let i=0;const next=()=>{const fn=h[2][i++];if(fn)fn(req,res,next);else{nextCalls++;res.json({ok:true,id:12345})}};
  next();assert.equal(nextCalls,1);
  const row=db.prepare("SELECT user_id,company_id,event_type,details_json,object_id FROM access_audit_log WHERE event_type='inventory.movement' ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.user_id,1);assert.equal(row.company_id,1);assert.equal(row.object_id,'12345');
  const details=JSON.parse(row.details_json);assert.equal(details.quantity,12);assert.equal(details.productId,15);
  assert.ok(!row.details_json.includes('No registrar'));
 });
 check('Fechas de auditoría inválidas se rechazan sin error interno',()=>{
  assert.equal(call('GET','/api/auth/audit',{},own,{}, {to:'2026-99-99'}).status,400);
  assert.equal(call('GET','/api/auth/audit',{},own,{}, {from:'2026-11-12',to:'2026-11-10'}).status,400);
 });
 check('Solo propietario puede consultar actores históricos',()=>{
  assert.equal(call('GET','/api/auth/audit/actors',{},admin).status,403);
  const r=call('GET','/api/auth/audit/actors',{},own);assert.equal(r.status,200);
  assert.equal(r.data.find(x=>x.id===members.cajero).is_deleted,1);
 });
 db.close();console.log(`QA v0.6.63 permisos, auditoría e inventario: ${passed}/${passed} aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
