'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {saveSyntheticXml,MAX_DEMO_BYTES}=require('../electron/fe-xades-demo-export.cjs');
let n=0;
async function check(name,fn){await fn();n++;console.log('OK 0.6.79 XML exportación:',name)}
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'facturacr-079-'));
 try{
  const filename=path.join(dir,'FacturaCR_DEMO_NO_FISCAL.xml');
  const base={documentsPath:dir,showSaveDialog:async()=>({filePath:filename}),writeFile:fs.writeFile};
  await check('Exporta XML de laboratorio firmado, sin clave privada ni factura real',async()=>{
   const result=await saveSyntheticXml(base),raw=await fs.readFile(filename);
   assert.equal(result.success,true);
   assert.match(raw.toString(),/^<FacturaCRLaboratorio>/);
   assert.match(raw.toString(),/<ds:Signature /);
   assert.doesNotMatch(raw.toString(),/PRIVATE KEY|<FacturaElectronica>|<Clave>|<Emisor>/);
   assert.equal(result.report.canIssue,false);assert.equal(result.report.usesRealCertificate,false);
   assert.equal(result.report.name,path.basename(filename));
   assert.equal(result.report.sha256,crypto.createHash('sha256').update(raw).digest('hex').toUpperCase());
   assert.equal(result.report.bytes,raw.length);assert(raw.length<MAX_DEMO_BYTES);
   assert(!JSON.stringify(result).includes(dir));
  });
  await check('No sobreescribe XML existente: exportación exclusiva',async()=>{
   const previous=await fs.readFile(filename);
   await assert.rejects(saveSyntheticXml(base),e=>e.code==='EEXIST');
   assert.deepEqual(await fs.readFile(filename),previous);
  });
  await check('Cancelar diálogo no genera claves ni escribe archivos',async()=>{
   let called=false;
   const response=await saveSyntheticXml({...base,showSaveDialog:async()=>({canceled:true}),generate:async()=>{called=true;}});
   assert.equal(response.cancelled,true);assert.equal(called,false);
  });
  await check('Rechaza extensiones que no sean .xml',async()=>{
   await assert.rejects(saveSyntheticXml({...base,showSaveDialog:async()=>({filePath:path.join(dir,'factura.pdf')})}),/\.xml/);
  });
  await check('Rechaza rutas relativas aunque vengan del diálogo',async()=>{
   await assert.rejects(saveSyntheticXml({...base,showSaveDialog:async()=>({filePath:'../prueba.xml'})}),/\.xml/);
  });
  await check('Bloquea una prueba sin validación de referencias',async()=>{
   const fake={xml:'<FacturaCRLaboratorio>'+'X'.repeat(1200)+'</FacturaCRLaboratorio>',summary:{syntheticXml:true,signatureValid:true}};
   await assert.rejects(saveSyntheticXml({...base,showSaveDialog:async()=>({filePath:path.join(dir,'rechazado.xml')}),generate:async()=>fake}),/no superó/);
   await assert.rejects(fs.access(path.join(dir,'rechazado.xml')));
  });
  await check('Bloquea XML de tamaño excesivo aunque el diagnóstico sea correcto',async()=>{
   const {createXmlProof}=require('../electron/fe-xades-xml-lab.cjs');
   const proof=await createXmlProof();proof.xml=proof.xml.replace('</FacturaCRLaboratorio>','X'.repeat(MAX_DEMO_BYTES)+'</FacturaCRLaboratorio>');
   await assert.rejects(saveSyntheticXml({...base,showSaveDialog:async()=>({filePath:path.join(dir,'gigante.xml')}),generate:async()=>proof}),/fuera de rango/);
  });
  await check('No expone claves ni permite importar XML externo desde parámetros',async()=>{
   const source=require('node:fs').readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
   assert.match(source,/ipcMain\.handle\('facturacr:save-xades-xml-demo',async event=>/);
   assert.match(source,/if\(!authorizedCertificateFrame\(event\)\)/);
   assert.match(source,/saveSyntheticXml\(/);
  });
  console.log(`QA exportación XML 0.6.79: ${n}/${n} aprobadas`);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
