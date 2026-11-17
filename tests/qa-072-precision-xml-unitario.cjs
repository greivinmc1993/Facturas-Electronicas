// QA 0.6.72: cinco decimales sin duplicar líneas ni manipular IVA.
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const {fiscalSale,fiscalSnapshot}=await import(pathToFileURL(path.resolve(__dirname,'../server/fiscal-precision.js')));
  const {createFeXmlDraft}=await import(pathToFileURL(path.resolve(__dirname,'../server/fe-xml-draft.js')));
  const company={legal_name:'Comercio de prueba',identification:'3101123456',email:'ventas@example.com',address:'San José, distrito central'};
  const fiscal={identification_type:'02',activity_code:'6201.0',province:'1',canton:'01',district:'01'};
  const client={name:'Comprador de prueba',identification_type:'01',identification:'115460323',email:'comprador@example.com'};
  const base=(price,qty,inc=true)=>{
    const calc=fiscalSale([{price,price_includes_tax:inc,quantity:qty,tax_rate:13}], '0');
    const record=calc.lines[0],cents=calc.lineCents[0];
    const line={description:'Pepsi original',kind:'producto',cabys:'1234567890123',quantity:qty,unit_price_cents:Math.round(cents.subtotal_cents/qty),
      ...cents,tax_rate:13,...fiscalSnapshot({},record)};
    const sale={id:15,status:'activa',sale_type:'contado',currency:'CRC',...cents};
    const source={company,fiscal,client,lines:[line],sale,payments:[{method:'Efectivo',amount_cents:cents.total_cents}],generatedAt:new Date('2026-11-17T12:00:00Z')};
    return {calc,source,record};
  };
  let count=0;
  const check=(name,fn)=>{fn();count++;console.log('OK residuo fiscal XML:',name)};
  check('15 Pepsi × 700 mantiene un solo detalle y total comercial de 10.500',()=>{
    const {source,calc}=base('700',15);const result=createFeXmlDraft(source);
    assert.equal(result.ready,true,JSON.stringify(result.issues));
    assert.equal((result.xml.match(/<LineaDetalle>/g)||[]).length,1);
    assert.match(result.xml,/<Cantidad>15\.000<\/Cantidad>/);
    assert.match(result.xml,/<PrecioUnitario>619\.46903<\/PrecioUnitario>/);
    assert.match(result.xml,/<MontoTotal>9292\.03540<\/MontoTotal>/);
    assert.match(result.xml,/<TotalImpuesto>1207\.96460<\/TotalImpuesto>/);
    assert.match(result.xml,/<TotalComprobante>10500\.00000<\/TotalComprobante>/);
    assert.equal(calc.commercialTotalCents,1050000);
  });
  check('El residuo 0.00005 se explica como redondeo, sin afirmar aceptación de Hacienda',()=>{
    const result=createFeXmlDraft(base('700',15).source);
    assert.equal(result.ready,true,JSON.stringify(result.issues));
    assert.ok(result.warnings.some(w=>w.includes('₡0.00005')&&w.includes('Pendiente de validar')));
  });
  check('Un precio unitario manipulado fuera del redondeo legítimo bloquea XML',()=>{
    const {source}=base('700',15);
    source.lines[0].fiscal_unit_price_5='619.46904';
    const result=createFeXmlDraft(source);
    assert.equal(result.ready,false);
    assert.ok(result.issues.some(w=>w.includes('redondeo unitario')));
  });
  check('Un total fiscal alterado con el IVA incluido bloquea XML',()=>{
    const {source}=base('700',15);
    source.lines[0].fiscal_total_5='10500.00001';
    const result=createFeXmlDraft(source);
    assert.equal(result.ready,false);
    assert.ok(result.issues.some(w=>w.includes('no concilia')||w.includes('no conserva el precio final')));
  });
  check('Precio base sin IVA también conserva una única línea y cálculo decimal',()=>{
    const result=createFeXmlDraft(base('1770',3,false).source);
    assert.equal(result.ready,true,JSON.stringify(result.issues));
    assert.equal((result.xml.match(/<LineaDetalle>/g)||[]).length,1);
    assert.match(result.xml,/<PrecioUnitario>1770\.00000<\/PrecioUnitario>/);
  });
  check('No se generan descuentos artificiales en el caso de 15 Pepsi',()=>{
    const result=createFeXmlDraft(base('700',15).source);
    assert.doesNotMatch(result.xml,/<Descuento>/);
    assert.match(result.xml,/<TotalDescuentos>0\.00000<\/TotalDescuentos>/);
  });
  console.log(`QA control de redondeo XML sin dividir productos: ${count}/${count} aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
