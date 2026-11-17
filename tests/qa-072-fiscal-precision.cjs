// QA de la precisión fiscal v2 · unidades de cinco decimales y fotografía histórica.
const assert=require('node:assert/strict');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const m=await import(pathToFileURL(path.resolve(__dirname,'../server/fiscal-precision.js')));
 let count=0;
 const test=(name,fn)=>{fn();count++;console.log('OK fiscal v0.6.72:',name)};
 const one=(price,tax_rate=13,inc=true,qty=1,discount='0')=>m.fiscalSale([{price,price_includes_tax:inc,quantity:qty,tax_rate}],discount);
 test('₡2.000 final conserva exactamente precio, base e IVA de cinco decimales',()=>{
  const a=one('2000');assert.equal(m.fiveString(a.lines[0].base5),'1769.91150');assert.equal(m.fiveString(a.lines[0].tax5),'230.08850');assert.equal(m.fiveString(a.total5),'2000.00000');
 });
 test('₡400 final y ₡700 final mantienen totales exactos',()=>{for(const price of ['400','700'])assert.equal(m.fiveString(one(price).total5),Number(price).toFixed(5));});
 test('₡3.500 final conserva IVA 402.65487',()=>{const a=one('3500');assert.equal(m.fiveString(a.lines[0].tax5),'402.65487');});
 test('Precio base sin IVA ₡1.770 produce IVA ₡230,10',()=>{const a=one('1770',13,false);assert.equal(m.fiveString(a.tax5),'230.10000');assert.equal(m.fiveString(a.total5),'2000.10000');});
 test('No redondea unidad 3 a colones: total ₡6.000',()=>{const a=one('2000',13,true,3);assert.equal(m.fiveString(a.lines[0].base5),'5309.73451');assert.equal(m.fiveString(a.total5),'6000.00000');});
 test('Descuento total elimina IVA',()=>{const a=one('700',13,true,1,'619.46903');assert.equal(m.fiveString(a.total5),'0.00000');});
 test('Descuento parcial conserva base, IVA y total exactos',()=>{const a=one('2000',13,true,1,'100');assert.equal(m.fiveString(a.lines[0].base5-a.lines[0].discount5+a.lines[0].tax5),m.fiveString(a.total5));});
 test('Impuestos 0, 1, 2, 4 y 13 % permiten ambas modalidades',()=>{for(const rate of [0,1,2,4,13])for(const inc of [true,false]){const a=one('700',rate,inc);assert.ok(a.tax5>=0n);assert.equal(a.total5,a.lines[0].base5-a.lines[0].discount5+a.tax5);}});
 test('0.5 % sin coma flotante',()=>{const a=one('1000',0.5,false);assert.equal(m.fiveString(a.tax5),'5.00000');});
 test('Combinación de cuatro productos preserva total comercial ₡9.500',()=>{const a=m.fiscalSale([1,2,3].map(()=>({price:'2000',price_includes_tax:true,quantity:1,tax_rate:13})).concat([{price:'3500',price_includes_tax:true,quantity:1,tax_rate:13}]));assert.equal(m.fiveString(a.total5),'9500.00000');assert.equal(m.fiveString(a.tax5),'1092.92037');});
 test('No redondea pagos ni precios a colones enteros',()=>{const a=one('400.25');assert.equal(m.fiveString(a.total5),'400.25000');assert.equal(a.commercialTotalCents,40025);});
 test('Distribuye descuentos por el método de restos mayores',()=>{const a=m.fiscalSale([{price:'1',price_includes_tax:0,quantity:1,tax_rate:13},{price:'1',price_includes_tax:0,quantity:1,tax_rate:13},{price:'1',price_includes_tax:0,quantity:1,tax_rate:13}],'0.00002');assert.equal(a.lines.reduce((sum,x)=>sum+x.discount5,0n),2n);});
 test('Siempre concilian los centavos comerciales incluso cuando los cinco decimales no redondean por separado',()=>{for(let i=1;i<5000;i+=7)for(const rate of [0,1,2,4,13]){const a=one((i/100).toFixed(2),rate,true,3);for(const l of a.lineCents)assert.equal(l.subtotal_cents-l.discount_cents+l.tax_cents,l.total_cents);}});
 test('Nunca ajusta el IVA fiscal para cuadrar centavos comerciales',()=>{const a=one('1.17',4,true,3);assert.equal(m.fiveString(a.lines[0].tax5),m.fiveString(a.tax5));});
 test('Fotografía de línea conserva precio de entrada y modalidad',()=>{const a=one('700',13,true);const x=m.fiscalSnapshot({},a.lines[0]);assert.equal(x.fiscal_input_price_5,'700.00000');assert.equal(x.fiscal_includes_tax,1);assert.equal(x.fiscal_calculation_version,'2');});
 test('Fotografía con precio base distingue modalidad',()=>{const a=one('700',13,false);const x=m.fiscalSnapshot({},a.lines[0]);assert.equal(x.fiscal_includes_tax,0);assert.equal(x.fiscal_base_5,'700.00000');});
 test('Cinco decimales máximos admitidos, seis rechazados',()=>{assert.equal(m.fiveString(m.parseFive('1.23456')),'1.23456');assert.throws(()=>m.parseFive('1.123456'));});
 test('Formato científico y datos negativos no admitidos',()=>{for(const bad of ['NaN','Infinity','1e4','-2','abc','1,000'])assert.throws(()=>m.parseFive(bad));});
 test('Descuento mayor a base se rechaza',()=>assert.throws(()=>one('700',13,true,1,'700'),/descuento/i));
 test('Cantidad decimal se rechaza',()=>assert.throws(()=>m.fiscalSale([{price:'100',price_includes_tax:1,tax_rate:13,quantity:1.5}]),/cantidad/i));
 test('Conversión centavos exacta',()=>{assert.equal(m.toCents(m.parseFive('400.25')),40025);assert.equal(m.fiveString(m.fromCents(40025)),'400.25000');});
 test('Máximo estricto y rechazo de flotantes no seguros',()=>{assert.throws(()=>one('99999999999.00'),/alto/i);});
 console.log(`QA fiscal v0.6.72: ${count}/${count} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
