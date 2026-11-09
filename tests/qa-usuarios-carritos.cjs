'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const {registerAuth}=await import(pathToFileURL(path.join(root,'server/auth.js')).href);
 const {ensureAccessSchema}=await import(pathToFileURL(path.join(root,'server/access-schema.js')).href);
 const {registerSaleDraftRoutes}=await import(pathToFileURL(path.join(root,'server/sale-drafts.js')).href);
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE companies(id INTEGER PRIMARY KEY);INSERT INTO companies(id) VALUES(1),(2);');ensureAccessSchema(db);
 db.transaction=fn=>()=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const routes=[],middleware=[];
 const app={get(p,...h){routes.push(['GET',p,h])},post(p,...h){routes.push(['POST',p,h])},put(p,...h){routes.push(['PUT',p,h])},delete(p,...h){routes.push(['DELETE',p,h])},use(p,h){middleware.push([p,h])}};
 registerAuth(app,()=>db);registerSaleDraftRoutes(app,()=>db);
 const invoke=(method,url,body={},cookie='',user=null)=>{
  const r=routes.find(r=>r[0]===method&&(r[1]===url||r[1].includes(':')&&new RegExp('^'+r[1].replace(/:[A-Za-z]+/g,'[^/]+')+'$').test(url)));
  assert.ok(r,`Sin ruta ${method} ${url}`);
  let status=200,data,headers={};const res={status(n){status=n;return this},json(x){data=x;return this},setHeader(k,v){headers[k]=v;return this}};
  const keys=[...r[1].matchAll(/:([A-Za-z]+)/g)].map(m=>m[1]);const parts=r[1].split('/'),actual=url.split('/'),params={};parts.forEach((part,i)=>{if(part[0]===':')params[part.slice(1)]=actual[i]});
  const req={method,path:url.replace('/api',''),body,params,headers:{cookie},authUser:user,get(name){return name==='origin'?'http://127.0.0.1:3001':undefined}};
  let i=0;const next=()=>{if(r[2][i])r[2][i++](req,res,next)};next();return{status,data,headers};
 };
 const protectedRoute=(method,path,cookie)=>{
  let status=200,data,allowed=false;
  const res={status(n){status=n;return this},json(x){data=x}};
  middleware[0][1]({path,method,headers:{cookie}},res,()=>{allowed=true});return {status,data,allowed};
 };
 let passed=0;const ok=(title,fn)=>{fn();passed++;console.log('OK ',title)};
 ok('Propietario inicial y empresas',()=>{assert.equal(invoke('POST','/api/auth/setup',{username:'propietario',displayName:'Principal',password:'ClavePrincipal1234'}).status,201)});
 const ownerLogin=invoke('POST','/api/auth/login',{username:'propietario',password:'ClavePrincipal1234'});const ownerCookie=ownerLogin.headers['Set-Cookie'].split(';')[0];
 ok('Propietario crea un cajero en empresa 1',()=>{const r=invoke('POST','/api/auth/users',{username:'cajero1',displayName:'Cajero Uno',password:'ClaveTemporal1234',companyId:1,role:'cashier'},ownerCookie);assert.equal(r.status,201);assert.equal(invoke('GET','/api/auth/users',{},ownerCookie).data.length,2)});
 const cashierLogin=invoke('POST','/api/auth/login',{username:'cajero1',password:'ClaveTemporal1234'});const cashierCookie=cashierLogin.headers['Set-Cookie'].split(';')[0];
 ok('Contraseña temporal bloquea operaciones hasta cambio obligatorio',()=>{assert.equal(cashierLogin.data.user.passwordChangeRequired,true);assert.equal(protectedRoute('POST','/companies/1/sales',cashierCookie).status,403)});
 ok('Cajero cambia su contraseña y deja de usar clave temporal',()=>{assert.equal(invoke('POST','/api/auth/password-change',{oldPassword:'ClaveTemporal1234',newPassword:'ClavePersonal6789'},cashierCookie).status,200);assert.equal(invoke('GET','/api/auth/status',{},cashierCookie).data.user.passwordChangeRequired,false)});
 ok('Cajero puede vender en empresa 1 y no en empresa 2',()=>{assert.equal(protectedRoute('POST','/companies/1/sales',cashierCookie).allowed,true);assert.equal(protectedRoute('POST','/companies/2/sales',cashierCookie).status,403)});
 ok('Cajero no puede alterar gastos, respaldos ni acceder a usuarios',()=>{assert.equal(protectedRoute('POST','/companies/1/cash/expenses',cashierCookie).status,403);assert.equal(protectedRoute('POST','/backups/restore',cashierCookie).status,403);assert.equal(invoke('GET','/api/auth/users',{},cashierCookie).status,403)});
 ok('Cajero puede abrir su caja y cerrar la suya; no ve reportes generales',()=>{assert.equal(protectedRoute('POST','/companies/1/cash/open',cashierCookie).allowed,true);assert.equal(protectedRoute('POST','/companies/1/cash/close',cashierCookie).allowed,true);assert.equal(protectedRoute('GET','/companies/1/cash/export.csv',cashierCookie).status,403)});
 const cashier=db.prepare("SELECT id FROM access_users WHERE username='cajero1'").get().id,owner=db.prepare('SELECT id FROM access_users WHERE is_owner=1').get().id;
 const ownerUser={id:owner,is_owner:1},cashierUser={id:cashier,is_owner:0};
 ok('Guardar borrador por usuario y empresa, sin convertirse en venta',()=>{
  const r=invoke('PUT','/api/companies/1/sales/draft',{lines:[{id:18,quantity:2}],saleType:'contado',discount:'0',payments:[{method:'Efectivo',amount:'2000'}]},cashierCookie,cashierUser);
  assert.equal(r.status,200);assert.equal(invoke('GET','/api/companies/1/sales/draft',{},cashierCookie,cashierUser).data.draft.lines[0].quantity,2);
  assert.equal(invoke('GET','/api/companies/1/sales/draft',{},ownerCookie,ownerUser).data.draft,null);
  assert.equal(invoke('GET','/api/companies/2/sales/draft',{},cashierCookie,cashierUser).data.draft,null);
 });
 ok('Cantidad inválida rechazada y eliminación explícita',()=>{
  const invalid=invoke('PUT','/api/companies/1/sales/draft',{lines:[{id:18,quantity:-1}],saleType:'contado',discount:'0'},cashierCookie,cashierUser);
  assert.equal(invalid.status,400);assert.equal(invoke('DELETE','/api/companies/1/sales/draft',{},cashierCookie,cashierUser).status,200);assert.equal(invoke('GET','/api/companies/1/sales/draft',{},cashierCookie,cashierUser).data.draft,null);
 });
 ok('Administrador de empresa solo crea subordinados de su propia empresa',()=>{
   const r=invoke('POST','/api/auth/users',{username:'adminuno',displayName:'Admin Empresa Uno',password:'ClaveTemporal0987',companyId:1,role:'company_admin'},ownerCookie);
   assert.equal(r.status,201);
   const adminLogin=invoke('POST','/api/auth/login',{username:'adminuno',password:'ClaveTemporal0987'});
   const cookie=adminLogin.headers['Set-Cookie'].split(';')[0];
   assert.equal(invoke('GET','/api/auth/users',{},cookie).status,403);
   assert.equal(invoke('POST','/api/auth/password-change',{oldPassword:'ClaveTemporal0987',newPassword:'ClaveAdministracion123'},cookie).status,200);
   const managed=invoke('GET','/api/auth/users',{},cookie);assert.equal(managed.status,200);assert.ok(managed.data.every(u=>!u.is_owner));
   assert.equal(invoke('POST','/api/auth/users',{username:'adminfalso',displayName:'Falso Administrador',password:'ClaveTemporal1234',companyId:1,role:'company_admin'},cookie).status,403);
   assert.equal(invoke('POST','/api/auth/users',{username:'usuariootra',displayName:'Otra Empresa',password:'ClaveTemporal1234',companyId:2,role:'cashier'},cookie).status,403);
   assert.equal(invoke('POST','/api/auth/users',{username:'empleado1',displayName:'Empleado Uno',password:'ClaveTemporal1234',companyId:1,role:'cashier'},cookie).status,201);
   const employee=db.prepare("SELECT id FROM access_users WHERE username='empleado1'").get().id;
   assert.equal(invoke('PUT',`/api/auth/users/${employee}`,{isActive:false},cookie).status,200);
   assert.equal(invoke('PUT',`/api/auth/users/${r.data.id}`,{isActive:false},cookie).status,403);
 });
 ok('Suspender cuenta invalida todas las sesiones existentes',()=>{
  assert.equal(invoke('PUT',`/api/auth/users/${cashier}`,{isActive:false},ownerCookie).status,200);
  assert.equal(protectedRoute('POST','/companies/1/sales',cashierCookie).status,401);
 });
 db.close();console.log(`QA usuarios y borradores: ${passed}/${passed}`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
