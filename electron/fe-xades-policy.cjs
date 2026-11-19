'use strict';
/**
 * v0.6.76 — Cotejo local, SOLO REFERENCIAL, del PDF de política XAdES-EPES.
 * El Anexo 2 v4.4 publica una URI y un ejemplo de hash SHA-256. No asumimos
 * que el PDF descargado hoy sea idéntico al PDF del ejemplo histórico.
 * Esta función no valida la autenticidad de la fuente de descarga, ni autoriza
 * firmar documentos: cualquier discrepancia permanece pendiente de revisión.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const POLICY_URL='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
const ANNEX_SAMPLE_SHA256_B64='DWxin1xWOel8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';
const ANNEX_URL='https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf';
const MAX_POLICY_BYTES=12*1024*1024;
function policyDigestResult(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>MAX_POLICY_BYTES)
  throw Error('El archivo de política tiene un tamaño inválido.');
 // Reconocimiento de formato básico, NO validación del PDF ni origen oficial.
 if(!bytes.subarray(0,8).toString('latin1').startsWith('%PDF-')||
    !bytes.subarray(Math.max(0,bytes.length-4096)).toString('latin1').includes('%%EOF'))
  throw Error('El archivo no presenta la estructura básica de un PDF.');
 const hash=createHash('sha256').update(bytes).digest();
 const sha256=hash.toString('hex').toUpperCase();
 const matchesAnnexSample=hash.toString('base64')===ANNEX_SAMPLE_SHA256_B64;
 hash.fill(0);
 return {
  sha256,matchesAnnexSample,
  status:matchesAnnexSample?'coincide-ejemplo':'requiere-revision',
  title:matchesAnnexSample?
   'La huella coincide con el ejemplo del Anexo 2 de Hacienda.':
   'La huella no coincide con el ejemplo del Anexo 2; puede existir una revisión diferente.',
  note:'El cotejo local no confirma la procedencia del PDF, su vigencia, la cadena de confianza, la firma XAdES ni la aceptación de Hacienda.',
  canSign:false,canIssue:false
 };
}
function sameRegularFile(a,b){
 return a?.isFile?.()&&!a?.isSymbolicLink?.()&&b?.isFile?.()&&!b?.isSymbolicLink?.()&&
  a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
}
async function inspectPolicyPdf(filename,{fileSystem=fs}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||!/[.]pdf$/i.test(filename))
  throw Error('Elige un PDF de política válido.');
 let handle=null,bytes=null;
 try{
  const original=await fileSystem.lstat(filename);
  if(!original.isFile()||original.isSymbolicLink()||original.size<16||original.size>MAX_POLICY_BYTES)
   throw Error('El PDF no es regular o supera los 12 MB.');
  handle=await fileSystem.open(filename,'r');
  const opened=await handle.stat();
  if(!sameRegularFile(original,opened))throw Error('El PDF cambió durante la selección.');
  bytes=await handle.readFile();
  const after=await handle.stat();
  if(bytes.length!==original.size||!sameRegularFile(opened,after))throw Error('El PDF cambió durante la lectura.');
  const result=policyDigestResult(bytes);
  return {...result,name:path.basename(filename).slice(0,150),sizeBytes:bytes.length,
    referenceUrl:POLICY_URL,annexUrl:ANNEX_URL,
    referenceExampleSha256:ANNEX_SAMPLE_SHA256_B64};
 }finally{
  if(bytes)bytes.fill(0);
  if(handle)await handle.close();
 }
}
module.exports={POLICY_URL,ANNEX_URL,ANNEX_SAMPLE_SHA256_B64,MAX_POLICY_BYTES,policyDigestResult,inspectPolicyPdf};
