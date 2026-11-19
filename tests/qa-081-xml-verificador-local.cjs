'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createXmlProof}=require('../electron/fe-xades-xml-lab.cjs');
const {saveSyntheticXml}=require('../electron/fe-xades-demo-export.cjs');
const {verifySyntheticXml,inspectSavedDemoXml,MAX_DEMO_BYTES}=require('../electron/fe-xades-demo-verifier.cjs');
let n=0;
async function check(name,fn){await fn();++n;console.log('OK v0.6.81 verificador:',name)}
(async()=>{
 const proofs={};
 for(const variant of ['standard','servicio','mercaderia'])proofs[variant]=await createXmlProof({variant});
 const standard=proofs.standard.xml;
 for(const variant of Object.keys(proofs)){
  await check(`Firma real y dos referencias de plantilla ${variant}`,async()=>{
   const data=Buffer.from(proofs[variant].xml),r=verifySyntheticXml(data);
   assert.equal(r.valid,true);assert.equal(r.variant,variant);
   assert.equal(r.signatureVerified,true);assert.equal(r.checkedReferences,2);
   assert.equal(r.canIssue,false);assert.equal(r.usesRealCertificate,false);
   assert.equal(r.sha256,crypto.createHash('sha256').update(data).digest('hex').toUpperCase());
  });
 }
 const bad=[
  ['Monto modificado',s=>s.replace('<Monto>100.00</Monto>','<Monto>101.00</Monto>')],
  ['Importe dentro de mercadería no autorizado',s=>s.replace('100.00','100.10')],
  ['Referencia XML externa',s=>s.replace('<ds:Reference URI="">','<ds:Reference URI="https://example.invalid">')],
  ['Referencia SignedProperties con ID ajeno',s=>s.replace('URI="#demo-props-','URI="#otras-props-')],
  ['Digest del documento incorrecto',s=>s.replace(/(<ds:DigestValue>)([^<])/,(_m,a,c)=>a+(c==='a'?'b':'a'))],
  ['Cambio de política SHA-256',s=>s.replace('DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=','AAAA')],
  ['Tiempo de firma cambiado',s=>s.replace(/(<xades:SigningTime>)(\d{4})/, '$12001')],
  ['Firma RSA alterada',s=>s.replace(/(<ds:SignatureValue>)([A-Za-z0-9])/,(_m,a,c)=>a+(c==='A'?'B':'A'))],
  ['Certificado reemplazado',s=>s.replace(/(<ds:X509Certificate>)([A-Za-z0-9])/,(_m,a,c)=>a+(c==='A'?'B':'A'))],
  ['Firma duplicada',s=>s.replace('</FacturaCRLaboratorio>','<ds:Signature></ds:Signature></FacturaCRLaboratorio>')],
  ['Elemento XML arbitrario',s=>s.replace('</FacturaCRLaboratorio>','<Otro>1</Otro></FacturaCRLaboratorio>')],
  ['DOCTYPE y entidades',s=>'<!DOCTYPE a [<!ENTITY x "hack">]>'+s],
  ['Referencia a un ID repetido',s=>s.replace('</FacturaCRLaboratorio>','<EnsayoId>b</EnsayoId></FacturaCRLaboratorio>')],
  ['Algoritmo SHA1 prohibido',s=>s.replace('rsa-sha256','rsa-sha1')],
  ['Espacios/serialización diferente',s=>s.replace('<FacturaCRLaboratorio>','<FacturaCRLaboratorio>\n')],
  ['Envoltorio factura fiscal falso',s=>s.replaceAll('FacturaCRLaboratorio','FacturaElectronica')],
  ['XML con comentario añadido',s=>s.replace('<Tipo>','<!-- test --><Tipo>')],
  ['Certificado serial inventado',s=>s.replace(/(<ds:X509SerialNumber>)(\d)/,(_m,a,c)=>a+(c==='0'?'1':'0'))],
 ];
 for(const [name,mutate] of bad){
  await check(`Rechaza ${name}`,async()=>{
   const changed=mutate(standard);assert.notEqual(changed,standard);
   assert.throws(()=>verifySyntheticXml(Buffer.from(changed)));
  });
 }
 await check('Rechaza buffers inválidos, XML demasiado grande y codificación no UTF-8',async()=>{
  assert.throws(()=>verifySyntheticXml('xml no autorizado'));
  assert.throws(()=>verifySyntheticXml(Buffer.from('a'.repeat(MAX_DEMO_BYTES+1))));
  assert.throws(()=>verifySyntheticXml(Buffer.from([0xff,0xfe,0x00])));
 });
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'facturacr-081-verificacion-'));
 const target=path.join(dir,'FacturaCR_DEMO_NO_FISCAL.xml');
 const io={lstat:fs.lstat,openFile:fs.open,showOpenDialog:async()=>({filePaths:[target]})};
 try{
  await fs.writeFile(target,standard);
  await check('Verifica el archivo guardado por el selector nativo sin devolver rutas ni XML',async()=>{
   const r=await inspectSavedDemoXml(io);
   assert.equal(r.success,true);assert.equal(r.report.valid,true);
   assert.equal(r.report.name,path.basename(target));
   assert(!JSON.stringify(r).includes(dir));
   assert(!JSON.stringify(r).includes('SignatureValue'));
  });
  await check('Exportación revisa la firma de nuevo y bloquea resultados falsamente exitosos',async()=>{
   const filename=path.join(dir,'no_exportar_alterado.xml');
   const badProof={...proofs.standard,xml:standard.replace('100.00','101.00')};
   await assert.rejects(saveSyntheticXml({
    documentsPath:dir,showSaveDialog:async()=>({filePath:filename}),
    writeFile:fs.writeFile,generate:async()=>badProof
   }));
   await assert.rejects(fs.access(filename));
  });
  await check('Rechaza una exportación adulterada sin atribuirle validez fiscal',async()=>{
   await fs.writeFile(target,standard.replace('100.00','200.00'));
   const r=await inspectSavedDemoXml(io);
   assert.equal(r.success,true);assert.equal(r.report.valid,false);
   assert.equal(r.report.canIssue,false);
   assert(!JSON.stringify(r).includes(dir));
  });
  await check('Cancelar selector no abre un archivo',async()=>{
   let called=false;
   const r=await inspectSavedDemoXml({...io,showOpenDialog:async()=>({canceled:true}),openFile:()=>{called=true;}});
   assert.equal(r.cancelled,true);assert.equal(called,false);
  });
  await check('Rechaza rutas relativas y extensiones distintas',async()=>{
   await assert.rejects(inspectSavedDemoXml({...io,showOpenDialog:async()=>({filePaths:['../../../otro.xml']})}));
   await assert.rejects(inspectSavedDemoXml({...io,showOpenDialog:async()=>({filePaths:[path.join(dir,'otra.txt')]})}));
  });
  await check('Rechaza enlace simbólico antes de abrir el archivo',async()=>{
   if(process.platform==='win32')return;
   const link=path.join(dir,'enlace.xml');await fs.symlink(target,link);
   await assert.rejects(inspectSavedDemoXml({...io,showOpenDialog:async()=>({filePaths:[link]})}),/Archivo de laboratorio/);
  });
  await check('Rechaza contenido modificado entre inspección y apertura',async()=>{
   let calls=0;
   await assert.rejects(inspectSavedDemoXml({...io,lstat:async(file)=>{const st=await fs.lstat(file);
    return (++calls===2)?Object.assign(Object.create(Object.getPrototypeOf(st)),st,{size:st.size+1}):st;
   }}),/cambió|Archivo de laboratorio/);
  });
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 console.log(`QA verificador local v0.6.81: ${n}/${n} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
