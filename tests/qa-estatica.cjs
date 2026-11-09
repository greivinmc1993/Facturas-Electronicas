'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const server=read('server/index.js'),ui=read('src/main.jsx'),quotes=read('src/QuotesPanel.jsx');
const httpQA=read('tests/qa-servidor-real.cjs');
const checks=[
 ['Transacción SQLite para ventas',()=>assert.ok(server.includes('const result=db.transaction(()=>{'))],
 ['Abonos protegidos con transacción',()=>assert.ok(server.includes("app.post('/api/companies/:companyId/sales/:saleId/payments'")&&server.includes('const settle=req.body?.settle_balance===true'))],
 ['Anulación devuelve existencias',()=>assert.ok(server.includes("'Anulación de venta POS'"))],
 ['Proformas tienen creación e historial',()=>assert.ok(server.includes("app.get('/api/companies/:companyId/quotations'"))],
 ['Proformas tienen edición',()=>assert.ok(server.includes("app.put('/api/companies/:companyId/quotations/:quoteId'"))],
 ['Backup SQLite en línea',()=>assert.ok(server.includes('await db.backup(target)'))],
 ['Integridad de copias automáticas',()=>assert.ok(server.includes("check.pragma('integrity_check'"))],
 ['Búsqueda de clientes en ventas',()=>assert.ok(ui.includes('clientSuggestions.map'))],
 ['Recursos visuales de instalador',()=>{for(const f of ['build/installerHeader.bmp','build/installerSidebar.bmp','build/uninstallerSidebar.bmp','build/icon.ico'])assert.ok(fs.existsSync(path.join(root,f)),f)}],
 ['Validación de descuento alto en interfaz',()=>assert.ok(ui.includes('discountInvalid&&<p className="posDiscountError"'))],
 ['Validación de descuento negativo en API',()=>assert.ok(server.includes('requestedDiscount<0'))],
 ['Precio de carrito con IVA',()=>assert.ok(ui.includes('priceWithTaxCents(l)')&&ui.includes('Con IVA · antes de descuentos'))],
 ['Servidor real de QA configura propietario y usa cookie para rutas protegidas',()=>{
  assert.ok(httpQA.includes("request('POST','/api/auth/setup'"));
  assert.ok(httpQA.includes("request('POST','/api/auth/login'"));
  assert.ok(httpQA.includes('sessionCookie=setCookie.split'));
  assert.ok(httpQA.includes('const authorizedHeaders=()=>sessionCookie?{cookie:sessionCookie}:{};'));
  assert.match(httpQA,/fetch\(base\+'\/api\/backups\/download',\{headers:authorizedHeaders\(\)\}\)/);
  assert.match(httpQA,/fetch\(`\$\{base\}\$\{endpoint\}export\.csv\?\$\{query\}`,\{headers:authorizedHeaders\(\)\}\)/);
 }],
 ['Versión 0.6.59 alineada en todos los metadatos',()=>{const p=require(path.join(root,'package.json')),l=require(path.join(root,'package-lock.json'));assert.equal(p.version,'0.6.59');assert.equal(l.version,'0.6.59');assert.equal(l.packages[''].version,'0.6.59')}],
];
let pass=0;for(const [label,check]of checks){try{check();pass++;console.log('PASS',label)}catch(err){console.error('FAIL',label,err.message);process.exitCode=1}}
console.log(`Resultado: ${pass}/${checks.length} pruebas estáticas`);
