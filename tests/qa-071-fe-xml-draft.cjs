'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {createFeXmlDraft}=await import(pathToFileURL(path.resolve(__dirname,'../server/fe-xml-draft.js')));
 let passed=0;const check=(name,fn)=>{fn();passed++;console.log('OK XML 4.4 borrador:',name)};
 const company={legal_name:'Comercial A & B <Central>',identification:'3101123456',email:'ventas@example.com',address:'Costado norte del parque & edificio 2'};
 const fiscal={identification_type:'02',activity_code:'123456',province:'1',canton:'01',district:'01'};
 const sale={id:7,status:'activa',sale_type:'contado',currency:'CRC',subtotal_cents:200000,discount_cents:0,tax_cents:26000,total_cents:226000};
 const client={name:'Cliente <José> & Cía',identification_type:'01',identification:'115460323',email:'cliente@example.com'};
 const lines=[{description:'Servicio & asesoría',kind:'servicio',cabys:'5999999999999',quantity:2,unit_price_cents:100000,subtotal_cents:200000,discount_cents:0,tax_rate:13,tax_cents:26000,total_cents:226000}];
 const src=()=>({company,fiscal,sale,client,lines,payments:[{method:'Efectivo',amount_cents:226000}],generatedAt:new Date('2026-11-16T18:00:00Z')});
 check('Genera XML local sin firma ni envío',()=>{const out=createFeXmlDraft(src());assert.equal(out.ready,true);assert.equal(out.mode,'draft-only');assert.match(out.xml,/FacturaElectronica/);assert.doesNotMatch(out.xml,/<Signature/);});
 check('Clave y consecutivo sintéticos inservibles para Hacienda',()=>{const out=createFeXmlDraft(src());assert.match(out.xml,/<Clave>0{50}<\/Clave>/);assert.match(out.xml,/<NumeroConsecutivo>0{20}<\/NumeroConsecutivo>/);assert.match(out.xml,/BORRADOR DE PRUEBA/);});
 check('Escapa contenido peligroso en receptor, emisor y detalle',()=>{const x=createFeXmlDraft(src()).xml;assert.match(x,/Comercial A &amp; B &lt;Central&gt;/);assert.match(x,/Cliente &lt;José&gt; &amp; Cía/);assert.match(x,/Servicio &amp; asesoría/);assert.doesNotMatch(x,/<Central>/);});
 check('Montos históricos exactos CRC cuando el IVA coincide con la base',()=>{const r=createFeXmlDraft(src());assert.equal(r.totals.totalCents,226000);assert.match(r.xml,/<TotalComprobante>2260\.00000<\/TotalComprobante>/);assert.match(r.xml,/<TotalImpuesto>260\.00000<\/TotalImpuesto>/);});
 check('No inventa fecha fiscal histórica: fecha actual de simulación con -06:00',()=>assert.match(createFeXmlDraft(src()).xml,/<FechaEmision>2026-11-16T12:00:00-06:00<\/FechaEmision>/));
 check('Formato CIIU4 4019.0 se acepta y se conserva literalmente en XML',()=>{
  const r=createFeXmlDraft({...src(),fiscal:{...fiscal,activity_code:'4019.0'}});
  assert.equal(r.ready,true,JSON.stringify(r.issues));
  assert.match(r.xml,/<CodigoActividadEmisor>4019\.0<\/CodigoActividadEmisor>/);
  assert.doesNotMatch(r.xml,/<CodigoActividadEmisor>401900<\/CodigoActividadEmisor>/);
  assert.ok(r.warnings.some(x=>x.includes('RUT de Hacienda')));
 });
 check('Otro código CIIU4 mantiene el punto y cifras',()=>{
  const r=createFeXmlDraft({...src(),fiscal:{...fiscal,activity_code:'6201.0'}});
  assert.equal(r.ready,true);assert.match(r.xml,/<CodigoActividadEmisor>6201\.0<\/CodigoActividadEmisor>/);
 });
 check('Compatibilidad con actividad guardada de seis dígitos sin conversión automática',()=>{
  const r=createFeXmlDraft({...src(),fiscal:{...fiscal,activity_code:'123456'}});
  assert.equal(r.ready,true);assert.match(r.xml,/<CodigoActividadEmisor>123456<\/CodigoActividadEmisor>/);
 });
 check('Actividad vacía o con formato incorrecto impide descargar borrador',()=>{
  for(const code of ['', '4019.', '40190','4019.00','4019.a','X<123','12 345']){
    const r=createFeXmlDraft({...src(),fiscal:{...fiscal,activity_code:code}});
    assert.equal(r.ready,false,code);assert.equal(r.xml,null,code);
    assert.ok(r.issues.some(x=>x.startsWith('Actividad económica:')),code);
  }
 });
 check('No permite venta anulada ni ventas a crédito sin plazo fiscal',()=>{for(const change of [{status:'anulada'},{sale_type:'credito'}]){const r=createFeXmlDraft({...src(),sale:{...sale,...change}});assert.equal(r.ready,false);}});
 check('Una venta de empresa equivocada no podría pasar la ruta de SQL; dato parcial también se rechaza',()=>{const r=createFeXmlDraft({...src(),fiscal:null});assert.equal(r.ready,false)});
 check('Bloquea venta sin receptor identificado',()=>{const r=createFeXmlDraft({...src(),client:null});assert.equal(r.ready,false);assert.ok(r.issues.some(x=>x.startsWith('Cliente:')));});
 check('Bloquea líneas sin CAByS de 13 dígitos',()=>{const r=createFeXmlDraft({...src(),lines:[{...lines[0],cabys:''}]});assert.equal(r.ready,false);assert.ok(r.issues.some(x=>x.includes('CAByS')))});
 check('Detecta modificación de importes históricos',()=>{const r=createFeXmlDraft({...src(),lines:[{...lines[0],tax_cents:24000}]});assert.equal(r.ready,false);assert.ok(r.issues.some(x=>x.includes('no concilian')))});
 check('Rechaza suma de venta inconsistente y no presenta XML falso',()=>{const r=createFeXmlDraft({...src(),sale:{...sale,total_cents:226100}});assert.equal(r.ready,false);assert.equal(r.xml,null);});
 check('Detecta tarifa todavía no cubierta por el borrador',()=>{const r=createFeXmlDraft({...src(),lines:[{...lines[0],tax_rate:0.5}]});assert.equal(r.ready,false)});
 check('Cifras con descuentos conserva neto histórico y subtotal',()=>{
  const a={...lines[0],discount_cents:10000,tax_cents:24700,total_cents:214700};
  const s={...sale,discount_cents:10000,tax_cents:24700,total_cents:214700};
  const out=createFeXmlDraft({...src(),sale:s,lines:[a],payments:[{method:'Efectivo',amount_cents:214700}]});assert.equal(out.ready,true,JSON.stringify(out.issues));
  assert.match(out.xml,/<MontoDescuento>100\.00000<\/MontoDescuento>/);
  assert.match(out.xml,/<TotalVentaNeta>1900\.00000<\/TotalVentaNeta>/);
 });
 check('Encabezado ordenado según especificación FE 4.4',()=>{
  const x=createFeXmlDraft(src()).xml;
  const tags=['Clave','ProveedorSistemas','CodigoActividadEmisor','NumeroConsecutivo','FechaEmision','Emisor'];
  let prev=0;for(const t of tags){const pos=x.indexOf('<'+t+'>');if(pos<0&&t==='Emisor')continue;assert.ok(pos>prev,t);prev=pos}
  assert.ok(x.indexOf('<FechaEmision>')<x.indexOf('<Emisor>'));
 });
 check('Línea incluye base imponible e impuesto asumido en su orden',()=>{
  const x=createFeXmlDraft(src()).xml;
  const slice=x.slice(x.indexOf('<LineaDetalle>'),x.indexOf('</LineaDetalle>'));
  for(const tag of ['SubTotal','BaseImponible','Impuesto','ImpuestoAsumidoEmisorFabrica','ImpuestoNeto','MontoTotalLinea'])assert.ok(slice.includes('<'+tag+'>'),tag);
  assert.ok(slice.indexOf('<BaseImponible>')<slice.indexOf('<Impuesto>'));
  assert.ok(slice.indexOf('<ImpuestoAsumidoEmisorFabrica>')>slice.indexOf('</Impuesto>'));
  assert.match(slice,/<ImpuestoAsumidoEmisorFabrica>0.00000<\/ImpuestoAsumidoEmisorFabrica>/);
 });
 check('Desglose de IVA y medio de pago real antes del total del comprobante',()=>{
  const x=createFeXmlDraft(src()).xml;
  assert.ok(x.indexOf('<TotalVentaNeta>')<x.indexOf('<TotalDesgloseImpuesto>'));
  assert.ok(x.indexOf('<TotalDesgloseImpuesto>')<x.indexOf('<TotalImpuesto>'));
  assert.ok(x.indexOf('<MedioPago>')<x.indexOf('<TotalComprobante>'));
  assert.match(x,/<CodigoTarifaIVA>08<\/CodigoTarifaIVA>/);
  assert.match(x,/<TipoMedioPago>01<\/TipoMedioPago>/);
  assert.match(x,/<TotalMedioPago>2260.00000<\/TotalMedioPago>/);
 });
 check('Cuatro bases históricas con IVA redondeado rechazadas indicando diferencias exactas',()=>{
  const example=[177000,177000,177000,309500].map((base,i)=>({
    description:'Artículo '+i,kind:'producto',cabys:'4444444444444',quantity:1,unit_price_cents:base,
    subtotal_cents:base,discount_cents:0,tax_rate:13,
    tax_cents:i===3?40500:23000,total_cents:base+(i===3?40500:23000)
  }));
  const result=createFeXmlDraft({...src(),lines:example,sale:{...sale,subtotal_cents:840500,discount_cents:0,tax_cents:109500,total_cents:950000},payments:[{method:'Efectivo',amount_cents:950000}]});
  assert.equal(result.ready,false);assert.equal(result.xml,null);
  assert.equal(result.issues.filter(i=>i.includes('IVA registrado')).length,4);
  assert.ok(result.issues.some(i=>i.includes('230.10000')));
  assert.ok(result.issues.some(i=>i.includes('402.35000')));
 });
 check('Cuatro mercancías con IVA exacto producen resumen 8405 + 1092.65 = 9497.65',()=>{
  const bases=[177000,177000,177000,309500];
  const correct=[23010,23010,23010,40235];
  const example=bases.map((base,i)=>({description:'Producto '+(i+1),kind:'producto',cabys:'4444444444444',quantity:1,unit_price_cents:base,
    subtotal_cents:base,discount_cents:0,tax_rate:13,tax_cents:correct[i],total_cents:base+correct[i]}));
  const out=createFeXmlDraft({...src(),lines:example,sale:{...sale,subtotal_cents:840500,discount_cents:0,tax_cents:109265,total_cents:949765},payments:[{method:'Efectivo',amount_cents:949765}]});
  assert.equal(out.ready,true,JSON.stringify(out.issues));
  assert.match(out.xml,/<TotalServGravados>0.00000<\/TotalServGravados>/);
  assert.match(out.xml,/<TotalMercanciasGravadas>8405.00000<\/TotalMercanciasGravadas>/);
  assert.match(out.xml,/<TotalDesgloseImpuesto>[\s\S]*?<TotalMontoImpuesto>1092.65000<\/TotalMontoImpuesto>/);
  assert.match(out.xml,/<TotalImpuesto>1092.65000<\/TotalImpuesto>/);
  assert.match(out.xml,/<TotalComprobante>9497.65000<\/TotalComprobante>/);
 });
 check('Mercancía se clasifica por tipo de producto y no por CAByS ficticio' ,()=>{
  const one={...lines[0],kind:'producto'};
  const x=createFeXmlDraft({...src(),lines:[one]}).xml;
  assert.match(x,/<TotalMercanciasGravadas>2000.00000<\/TotalMercanciasGravadas>/);
  assert.match(x,/<TotalServGravados>0.00000<\/TotalServGravados>/);
 });
 check('Mezcla de medios reales sin inventar un pago',()=>{
  const x=createFeXmlDraft({...src(),payments:[{method:'SINPE Móvil',amount_cents:126000},{method:'Tarjeta',amount_cents:100000}]}).xml;
  assert.match(x,/<TipoMedioPago>06<\/TipoMedioPago>/);
  assert.match(x,/<TipoMedioPago>02<\/TipoMedioPago>/);
 });
 check('Faltan pagos: rechaza XML de contado y explica el error',()=>{
  const r=createFeXmlDraft({...src(),payments:[]});assert.equal(r.ready,false);assert.ok(r.issues.some(i=>i.startsWith('Medio de pago:')));
 });
 check('Borrador siempre declara pendientes XSD, firma y numeración fiscal' ,()=>{const x=createFeXmlDraft(src());assert.ok(x.warnings.some(s=>s.includes('XSD')));assert.ok(x.warnings.some(s=>s.includes('consecutivo')));});
 console.log(`QA generador borrador FE 4.4: ${passed}/${passed} aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
