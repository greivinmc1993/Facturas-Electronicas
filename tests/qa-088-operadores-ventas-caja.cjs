// Contrato de regresión de código: vendedores, historial, impresión y caja.
// La integración HTTP con Express y better-sqlite3 se ejecuta además en qa:real-server.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const roles=read('server/access-schema.js'),auth=read('server/auth.js'),backend=read('server/index.js'),ui=read('src/main.jsx');
let count=0;
function check(name,fn){fn();count++;console.log('OK QA caja/usuarios:',name)}
check('Cajero puede crear ventas y consultar las propias',()=>{
 assert.match(roles,/cashier:\s*\[[\s\S]*?'sales\.create','sales\.read_own'/);
 assert.ok(auth.includes("method==='POST'?'sales.create':method==='GET'?'sales.read_own'"));
});
check('Lecturas de historial y tiquete restringidas por usuario autenticado',()=>{
 assert.match(backend,/s\.created_by_user_id=\?/);
 assert.ok(backend.includes("created_by_user_id=?)').get(id,companyId,req.salesOwnOnly"));
 assert.match(auth,/req\.salesOwnOnly=!can\(a\.user,Number\(match\[1\]\),'sales\.read_all'\)/);
});
check('Ventas persisten el usuario y la sesión de caja sin borrar históricos',()=>{
 assert.match(backend,/addColumn\('sales','created_by_user_id'/);
 assert.match(backend,/addColumn\('sales','cash_session_id'/);
 assert.match(backend,/req\.authUser\.id,activeCash\.id/);
});
check('Servidor verifica apertura y dueño de caja dentro de la transacción',()=>{
 const tx=backend.indexOf('const result=db.transaction(()=>{',backend.indexOf("app.post('/api/companies/:companyId/sales'"));
 assert.ok(tx>0);
 const verify=backend.indexOf("const activeCash=db.prepare(",tx);
 const insert=backend.indexOf('INSERT INTO sales(company_id',tx);
 assert.ok(verify>tx&&insert>verify);
 assert.match(backend,/if\(!activeCash\)throw Error\('Debes abrir una caja/);
 assert.match(backend,/cashierRole&&Number\(activeCash\.opened_by_user_id\)!==Number\(req\.authUser\.id\)/);
});
check('La interfaz impide operar sin caja y ofrece abrirla',()=>{
 assert.match(ui,/disabled=\{!cashReady/);
 assert.match(ui,/if\(!cashReady\)\{setNotice\('Debes abrir una caja antes de confirmar una venta/);
 assert.match(ui,/const currentCash=await api\(`/);
 assert.match(ui,/Ir a Caja y gastos/);
});
check('Se imprime solo después de cerrar el modal de vuelto',()=>{
 assert.match(ui,/deferredChangePrintRef\.current=shouldPrint\?changeReceipt\.saleId:null/);
 assert.match(ui,/requestAnimationFrame\(\(\)=>\{void openTicket\(saleId,true\)\}\)/);
 assert.match(ui,/Vuelto entregado · Imprimir tiquete/);
 assert.match(ui,/Cerrar sin imprimir/);
});
check('Cajero recibe vista de caja correcta y permiso de ajustes de tiquete',()=>{
 assert.match(ui,/<CashPanel companyId=\{selected\} company=\{current\} isCashier=/);
 assert.match(ui,/isCashier\?'Mis ventas':'Historial de ventas'/);
 assert.ok(auth.includes("['GET','PUT'].includes(method)?'sales.create'"));
});
console.log(`QA caja y venta multiusuario: ${count}/${count} controles`);
