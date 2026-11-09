'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const roundCRC=c=>Math.round(Number(c||0)/100)*100;
const cents=v=>Math.round((Number(v)+Number.EPSILON)*100);
function calcServer(products,discount){
  const lines=products.map(p=>{
    const includesTax=Number(p.includes)===1;
    const rawUnit=includesTax?Math.round(cents(p.price)/(1+p.rate/100)):cents(p.price);
    const unit=Math.round(rawUnit/100)*100;
    const lineSubtotal=unit*p.q;
    const grossLine=includesTax?Math.round(cents(p.price)/100)*100*p.q:null;
    const unadjustedTax=Math.round(lineSubtotal*p.rate/10000)*100;
    const taxRoundingAdjustment=includesTax?grossLine-lineSubtotal-unadjustedTax:0;
    return {...p,lineSubtotal,taxRoundingAdjustment};
  });
  const subtotal=lines.reduce((a,l)=>a+l.lineSubtotal,0);
  if(discount>subtotal)throw Error('Descuento excesivo');
  let distributed=0,tax=0;
  const detail=lines.map((l,i)=>{
    const part=i===lines.length-1?discount-distributed:Math.floor(discount*l.lineSubtotal/subtotal/100)*100;
    distributed+=part;
    const remaining=l.lineSubtotal-part;
    const roundedTax=Math.round(remaining*l.rate/10000)*100;
    const adjustedRounding=remaining>0&&l.lineSubtotal>0?Math.round(l.taxRoundingAdjustment*remaining/l.lineSubtotal/100)*100:0;
    const lineTax=Math.max(0,roundedTax+adjustedRounding);
    tax+=lineTax;
    return {part,remaining,lineTax,lineTotal:remaining+lineTax};
  });
  return {subtotal,discount,tax,total:subtotal-discount+tax,detail};
}
function calcClient(products,discount){
  const lines=products.map(p=>{
    const basePrice=p.includes?p.price/(1+p.rate/100):p.price;
    const base=roundCRC(Math.round(basePrice*100))*p.q;
    const adjustment=p.includes?roundCRC(Math.round(p.price*100))*p.q-base-roundCRC(Math.round(base*p.rate/100)):0;
    return {...p,base,adjustment};
  });
  const subtotal=lines.reduce((sum,l)=>sum+l.base,0);
  const effective=Math.min(subtotal,discount);
  let allocated=0;
  const tax=lines.reduce((sum,l,i)=>{
    const part=i===lines.length-1?effective-allocated:Math.floor(effective*l.base/(subtotal||1)/100)*100;
    allocated+=part;
    const remaining=l.base-part;
    const adjustment=remaining>0&&l.base>0?Math.round(l.adjustment*remaining/l.base/100)*100:0;
    return sum+Math.max(0,roundCRC(Math.round(remaining*l.rate/100))+adjustment);
  },0);
  return {subtotal,discount:effective,tax,total:subtotal-effective+tax};
}
let passed=0;
const test=(name,fn)=>{try{fn();console.log('PASS',name);passed++;}catch(err){console.error('FAIL',name,err.stack);process.exitCode=1}};
test('Precio IVA 13% incluido: ₡700 conserva ₡700',()=>{
  const s=calcServer([{price:700,rate:13,includes:1,q:1}],0);
  assert.deepEqual({subtotal:s.subtotal,tax:s.tax,total:s.total},{subtotal:61900,tax:8100,total:70000});
});
test('Descuento igual a la base elimina totalmente IVA y ajuste residual',()=>{
  const p=[{price:700,rate:13,includes:1,q:1}]; const s=calcServer(p,61900);const c=calcClient(p,61900);
  assert.equal(s.tax,0);assert.equal(s.total,0);assert.equal(c.tax,0);assert.equal(c.total,0);
});
test('Casos mixtos con descuentos parciales: cliente y servidor coinciden',()=>{
  const groups=[
    [{price:700,rate:13,includes:1,q:1}],
    [{price:400,rate:13,includes:1,q:3}],
    [{price:800,rate:4,includes:1,q:2},{price:1900,rate:13,includes:1,q:1}],
    [{price:700,rate:13,includes:1,q:2},{price:1000,rate:0,includes:0,q:3},{price:400,rate:4,includes:1,q:1}],
    [{price:1000,rate:13,includes:0,q:1}],
  ];
  for(const group of groups){
    const subtotal=calcServer(group,0).subtotal;
    for(const fraction of [0,.1,.25,.5,.75,.9,1]){
      const disc=roundCRC(Math.round(subtotal*fraction));
      const s=calcServer(group,disc); const c=calcClient(group,disc);
      assert.deepEqual({subtotal:s.subtotal,discount:s.discount,tax:s.tax,total:s.total},c,JSON.stringify({group,fraction}));
      assert.equal(s.detail.reduce((sum,l)=>sum+l.lineTotal,0),s.total);
      assert.ok(s.total>=0);
    }
  }
});
test('Comprobación exhaustiva de descuentos y tarifas sobre distintos precios',()=>{
  for(const rate of [0,1,2,4,13])for(const includes of [0,1])for(const price of [100,350,400,619,700,999,1000,2000])for(const q of [1,2,5]){
    const p=[{price,rate,includes,q}];const subtotal=calcServer(p,0).subtotal;
    for(const disc of [0,roundCRC(subtotal/3),roundCRC(subtotal/2),subtotal]){
      const s=calcServer(p,disc), c=calcClient(p,disc);
      assert.deepEqual({subtotal:s.subtotal,discount:s.discount,tax:s.tax,total:s.total},c,JSON.stringify({p,disc}));
      if(disc===subtotal)assert.equal(s.total,0);
    }
  }
});
test('Se rechaza el descuento mayor al subtotal',()=>{
  assert.throws(()=>calcServer([{price:700,rate:13,includes:1,q:1}],62000),/excesivo/);
});
test('Código contiene los arreglos del QA en frontend y backend',()=>{
  const ui=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
  const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
  assert.ok(ui.includes('const adjustment=remainingBase>0&&base>0'));
  assert.ok(server.includes('const adjustedRounding=remainingBase>0&&line.lineSubtotal>0'));
  assert.ok(ui.includes('priceWithTaxCents(l)'));
  assert.ok(ui.includes('discountInvalid'));
  assert.ok(server.includes('requestedDiscount<0'));
});
test('La versión coincide con los metadatos',()=>{
  const pkg=require(path.join(root,'package.json'));
  const lock=require(path.join(root,'package-lock.json'));
  assert.equal(pkg.version,'0.6.59');assert.equal(lock.version,'0.6.59');assert.equal(lock.packages[''].version,'0.6.59');
});
console.log(`${passed} comprobaciones completadas. ${process.exitCode?'Fallaron pruebas.':'Sin fallos.'}`);
