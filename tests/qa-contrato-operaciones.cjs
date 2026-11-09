// QA estructural: protección contra envíos duplicados en la interfaz POS.
// El control real de concurrencia se completa con una prueba manual/E2E en Electron.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
let passed=0;
function check(title,test){test();passed++;console.log('PASS',title)}
check('Bloqueo inmediato con useRef y estado visible',()=>{
 assert.ok(source.includes('const operationLock=useRef(false),[operationBusy,setOperationBusy]=useState(false)'));
 assert.ok(source.includes('if(operationLock.current)return;'));
 assert.ok(source.includes('operationLock.current=true;setOperationBusy(true)'));
 assert.ok(source.includes('finally{operationLock.current=false;setOperationBusy(false)}'));
});
check('Venta, abono y anulación comparten el bloqueo',()=>{
 for(const phrase of ["runCommercialAction('venta'", "runCommercialAction('abono'", "runCommercialAction('anulación'"])assert.ok(source.includes(phrase),phrase);
});
check('Se limpia el carrito después de guardar, antes de imprimir',()=>{
 const segment=source.split("const submit=()=>runCommercialAction('venta'")[1].split('const finish=')[0];
 assert.ok(segment.indexOf('setCart([])')>segment.indexOf("method:'POST'"));
 assert.ok(segment.indexOf('setCart([])')<segment.indexOf('if(ticketSettings.autoPrint)'));
});
check('Botones inhabilitados mientras se registra',()=>{
 assert.ok(source.includes('disabled={draftReadyCompany!==companyId||operationBusy||!cart.length'));
 assert.ok(source.includes('disabled={operationBusy||!Number.isFinite(Number(abonoAmount))'));
 assert.ok(source.includes('disabled={operationBusy||annulReason.trim().length<5}'));
 assert.ok(source.includes('aria-busy={operationBusy}'));
});
console.log(`QA bloqueo comercial: ${passed}/${passed}`);
