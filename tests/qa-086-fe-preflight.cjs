'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {preflightFe44Draft}=await import(pathToFileURL(path.resolve(__dirname,'../server/fe-xml-preflight.js')));
 const {createFeXmlDraft}=await import(pathToFileURL(path.resolve(__dirname,'../server/fe-xml-draft.js')));
 const company={legal_name:'Comercio prueba',identification:'3101123456',email:'ventas@example.com',address:'Alajuelita, centro de pruebas'};
 const fiscal={identification_type:'02',activity_code:'4019.0',province:'1',canton:'01',district:'01'};
 const client={name:'Cliente de prueba',identification_type:'01',identification:'115460323'};
 const line={description:'Bebida de prueba',kind:'producto',cabys:'2449001000000',quantity:2,unit_price_cents:100000,
   subtotal_cents:200000,discount_cents:0,tax_rate:13,tax_cents:26000,total_cents:226000};
 const sale={id:15,status:'activa',sale_type:'contado',currency:'CRC',subtotal_cents:200000,
   discount_cents:0,tax_cents:26000,total_cents:226000};
 const sample=()=>createFeXmlDraft({company,fiscal,client,sale,lines:[line],payments:[{method:'Efectivo',amount_cents:226000}]});
 let n=0;
 const check=(title,fn)=>{fn();n++;console.log('OK prevalidación FE 4.4:',title)};
 const out=sample();
 check('Generador real aprobado preliminarmente',()=>{assert.equal(out.ready,true,JSON.stringify(out.issues));assert.equal(out.preflight.ok,true);});
 check('No confunde prevalidación con esquema oficial o firma',()=>{assert.equal(out.preflight.schema,'NOT_VALIDATED');assert.equal(out.preflight.signature,'NOT_VALIDATED');assert.ok(out.preflight.findings.some(x=>x.severity==='notice'));});
 check('Campo y línea exacta para un total manipulado',()=>{const xml=out.xml.replace('<TotalComprobante>2260.00000</TotalComprobante>','<TotalComprobante>2260.00001</TotalComprobante>');const p=preflightFe44Draft(xml,{expectedLines:1});assert.equal(p.ok,false);assert.ok(p.findings.some(x=>x.field==='ResumenFactura.TotalComprobante'&&Number.isSafeInteger(x.line)&&x.line>0));});
 check('Detecta alteración del precio unitario',()=>{const p=preflightFe44Draft(out.xml.replace('<PrecioUnitario>1000.00000</PrecioUnitario>','<PrecioUnitario>1000.00007</PrecioUnitario>'));assert.equal(p.ok,false);assert.ok(p.findings.some(x=>x.field.includes('MontoTotal')));});
 check('Detecta línea comercial desaparecida',()=>{const p=preflightFe44Draft(out.xml.replace(/<LineaDetalle>[\s\S]*?<\/LineaDetalle>/,''),{expectedLines:1});assert.equal(p.ok,false);});
 check('Detecta suma de IVA alterada',()=>{const p=preflightFe44Draft(out.xml.replace('<TotalImpuesto>260.00000</TotalImpuesto>','<TotalImpuesto>261.00000</TotalImpuesto>'));assert.equal(p.ok,false);});
 check('Detecta orden alterado',()=>{const x=out.xml.replace(/  <NumeroConsecutivo>0{20}<\/NumeroConsecutivo>\n/, '');const p=preflightFe44Draft(x);assert.equal(p.ok,false);});
 check('No permite atribuir clave fiscal a ensayo',()=>{const p=preflightFe44Draft(out.xml.replace(/<Clave>0{50}<\/Clave>/,`<Clave>${'1'.repeat(50)}</Clave>`));assert.equal(p.ok,false);});
 check('Mantiene una sola línea y su CAByS sin verificar padrón',()=>{assert.equal((out.xml.match(/<LineaDetalle>/g)||[]).length,1);assert.match(out.xml,/<CodigoCABYS>2449001000000<\/CodigoCABYS>/);assert.ok(out.warnings.some(x=>x.includes('CAByS')));});
 check('Errores del generador no se convierten en validación aprobada',()=>{const bad=createFeXmlDraft({company,fiscal,client,sale:{...sale,status:'anulada'},lines:[line],payments:[{method:'Efectivo',amount_cents:226000}]});assert.equal(bad.ready,false);assert.equal(bad.xml,null)});
 console.log(`QA prevalidación estructural FE 4.4: ${n}/${n}`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
