'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
// Windows Git puede convertir archivos de trabajo a CRLF; los cortes de prueba usan LF.
const normalizeLines=text=>text.replace(/\r\n?/g,'\n');
const ui=normalizeLines(fs.readFileSync(path.resolve(__dirname,'../src/main.jsx'),'utf8'));
assert.equal(normalizeLines(ui.replace(/\n/g,'\r\n')),ui,'El parser de pruebas funciona con archivos CRLF de Windows');

const section=(start,end)=>{
  const from=ui.indexOf(start);
  assert.ok(from>=0,`No se encontró ${start}`);
  const to=ui.indexOf(end,from+start.length);
  assert.ok(to>=0,`No se encontró fin de ${start}`);
  return ui.slice(from,to);
};
const submitSource=section(" const submit=()=>runCommercialAction('venta',async()=>{",'\n const finish=e=>{');
const closeSource=section(' const closeChangeReceipt=(shouldPrint=true)=>{','\n // Actualiza caja al entrar');
const effectSource=section(' useEffect(()=>{\n  if(changeReceipt!==null||deferredChangePrintRef.current==null)return;','\n const closeChangeReceipt=');

async function runCase({vuelto,autoPrint}){
  const saved=[],printed=[],notices=[],records=[];
  const saleId=73;
  let receipt=null;
  const ref={current:null};
  const scope={
    companyId:1, saleType:'contado', documentMode:'GENERICA', clientId:'', requestedDiscount:'0',
    cart:[{id:5,quantity:1}],actualPayments:[{method:'Efectivo',amount:100}],
    changeCents:vuelto, tenderCents:12000, cashApplied:10000,
    ticketSettings:{autoPrint}, draftWriteQueue:{current:Promise.resolve()},
    api:async(endpoint,opt)=>{
      if(endpoint==='/api/companies/1/cash')return {active:{id:12},otherCashOpen:false};
      if(endpoint==='/api/companies/1/sales' && opt?.method==='POST'){
        saved.push('venta');return {id:saleId,total_cents:10000,balance_cents:0};
      }
      if(endpoint==='/api/companies/1/sales/draft' && opt?.method==='DELETE'){
        saved.push('borrador');return {};
      }
      throw Error('API no esperada '+endpoint);
    },
    setCart:()=>{},setPayments:()=>{},setDiscount:()=>{},setCashTendered:()=>{},
    setClientId:()=>{},setClientQuery:()=>{},setDocumentMode:()=>{},setSaleType:()=>{},
    setChangeReceipt:value=>{receipt=value},setCashStatus:()=>{},setNotice:value=>notices.push(value),isCashier:false,
    saleMoney:value=>String(value),
    load:async()=>records.push('historial'), canReadHistory:true, loadCredits:async()=>records.push('creditos'),
    runCommercialAction:async(_label,action)=>action(),
    openTicket:async(id,print)=>printed.push({id,print})
  };
  const submit=vm.runInNewContext(`(function(){${submitSource};return submit})()`,scope);
  await submit();
  assert.deepEqual(saved,['venta','borrador'],'La venta queda persistida antes de cualquier impresión');
  assert.equal(notices.length,1);
  assert.ok(records.includes('historial'));
  assert.equal(receipt!==null,vuelto>0,'El popup aparece solo para ventas con vuelto');
  assert.equal(printed.length,(autoPrint&&vuelto<=0)?1:0,'No se imprime antes de cerrar si hay vuelto');
  if(vuelto>0){
    assert.equal(receipt.saleId,saleId);
    assert.equal(receipt.printAfterClose,autoPrint,'La preferencia se captura al registrar la venta');
    // Mientras el dialogo siga abierto, el efecto no debe ejecutar la impresión.
    let currentReceipt=receipt;
    const closeScope={changeReceipt:currentReceipt,deferredChangePrintRef:ref,setChangeReceipt:value=>{currentReceipt=value}};
    const close=vm.runInNewContext(`(function(){${closeSource};return closeChangeReceipt})()`,closeScope);
    const frames=[];
    const context=()=>({changeReceipt:currentReceipt,deferredChangePrintRef:ref,openTicket:scope.openTicket,useEffect:fn=>fn(),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame:()=>{}});
    vm.runInNewContext(effectSource,context());
    assert.equal(printed.length,0,'Un render con el popup abierto no imprime');
    close();
    assert.equal(currentReceipt,null,'El botón cierra el popup');
    assert.equal(printed.length,0,'El cierre solo prepara la impresión para después del render');
    const runEffect=()=>vm.runInNewContext(effectSource,context());
    runEffect();
    assert.equal(printed.length,0,'Impresión espera el siguiente fotograma');
    frames.forEach(fn=>fn());
    assert.equal(printed.length,1,'Confirmar el vuelto imprime una vez, incluso sin ajuste automático');
    runEffect();
    assert.equal(printed.length,1,'Re-renderizar no debe imprimir dos veces');
  }else if(autoPrint){
    assert.equal(printed[0].id,saleId);
    assert.equal(printed[0].print,true);
  }
  return true;
}
(async()=>{
  assert.match(ui,/if\(ticketSettings\.autoPrint&&changeToReturn<=0\)await openTicket\(result\.id,true\)/,'La impresión inmediata exige ausencia de vuelto');
  assert.match(ui,/onClick=\{\(\)=>closeChangeReceipt\(true\)\}>Vuelto entregado · Imprimir tiquete/,'Confirmar vuelto imprime tras cerrar');
  assert.match(ui,/onClick=\{\(\)=>closeChangeReceipt\(false\)\}>Cerrar sin imprimir/,'La opción sin impresión es explícita');
  assert.match(ui,/onClick=\{\(\)=>openTicket\(s\.id\)\}>Tiquete/,'Historial mantiene acceso a vista previa');
  assert.match(ui,/onClick=\{\(\)=>openTicket\(details\.id,true\)\}>Imprimir/,'Se conserva reimpresión manual');
  for(const [name,params] of [
    ['vuelto + automática', {vuelto:2000,autoPrint:true}],
    ['vuelto + desactivada', {vuelto:2000,autoPrint:false}],
    ['sin vuelto + automática', {vuelto:0,autoPrint:true}],
    ['sin vuelto + desactivada', {vuelto:0,autoPrint:false}]
  ]){
    await runCase(params);
    console.log('OK v0.6.72 impresión:',name);
  }
  console.log('QA impresión tras vuelto: 4 flujos ejecutados, sin duplicados.');
})().catch(error=>{console.error(error);process.exitCode=1});
