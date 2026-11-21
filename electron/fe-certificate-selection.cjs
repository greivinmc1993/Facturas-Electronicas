'use strict';
/**
 * FacturaCR v0.6.74 - selector efímero de PKCS#12 por ventana/empresa.
 * El proceso de interfaz solo recibe nombre de archivo y un ticket aleatorio.
 * La ruta NUNCA se devuelve al renderer. La clave solo llega al aceptar.
 */
const fs = require('node:fs/promises');
const {randomBytes} = require('node:crypto');
const path = require('node:path');
const {inspectP12,MAX_P12_BYTES} = require('./fe-certificate-check.cjs');
const {proveP12PrivateKey} = require('./fe-private-key-proof.cjs');
const {signatureReadiness} = require('./fe-signature-gate.cjs');
const {matchCertificateToCompany} = require('./fe-certificate-company.cjs');

function companyKey(value){
 if(!Number.isSafeInteger(value)||value<=0)throw Error('Selecciona una empresa válida.');
 return value;
}
function safeStat(stat){
 return stat&&stat.isFile()&&!stat.isSymbolicLink()&&stat.size>=32&&stat.size<=MAX_P12_BYTES;
}
function sameFile(a,b){
 return !!a&&!!b&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
}
function createP12SelectionManager({fileSystem=fs,inspector=inspectP12,proof=proveP12PrivateKey}={}){
 let selected=null;
 let selectionSequence=0;
 const clear=(token)=>{
  if(selected&&token===selected.token){selected=null;return true;}
  return false;
 };
 const clearAll=()=>{selected=null;selectionSequence++;};
 const select=async(filename,companyId)=>{
  const currentSequence=++selectionSequence;
  selected=null;
  companyKey(companyId);
  if(typeof filename!=='string'||!path.isAbsolute(filename)||!/[.]p12$|[.]pfx$/i.test(filename))
   throw Error('Selecciona un certificado .p12 o .pfx válido.');
  const stat=await fileSystem.lstat(filename);
  if(!safeStat(stat))throw Error('El certificado no es un archivo válido o supera los 4 MB.');
  if(currentSequence!==selectionSequence)throw Error('La selección anterior ya no está disponible.');
  const token=randomBytes(24).toString('hex');
  selected={filename,companyId,stat,token,reading:false};
  return {name:path.basename(filename).slice(0,180),token};
 };
 const inspect=async(token,companyId,passphrase,companyIdentification)=>{
  companyKey(companyId);
  if(typeof passphrase!=='string'||passphrase.length>512||passphrase.length===0)
   throw Error('Introduce la contraseña del certificado.');
  const current=selected;
  if(!current||typeof token!=='string'||token!==current.token||companyId!==current.companyId)
   throw Error('Vuelve a seleccionar el certificado de esta empresa.');
  if(current.reading)throw Error('La verificación del certificado ya está en curso.');
  current.reading=true;
  let bytes=null,handle=null;
  try{
   const before=await fileSystem.lstat(current.filename);
   if(!safeStat(before)||!sameFile(current.stat,before))throw Error('El certificado cambió desde que lo seleccionaste. Vuelve a seleccionarlo.');
   // Se comprueba también el descriptor, para detectar sustituciones entre lstat y readFile.
   handle=await fileSystem.open(current.filename,'r');
   const opened=await handle.stat();
   if(!safeStat(opened)||!sameFile(before,opened))throw Error('El certificado cambió. Vuelve a seleccionarlo.');
   bytes=await handle.readFile();
   const after=await handle.stat();
   if(bytes.length!==opened.size||!sameFile(opened,after))throw Error('El certificado cambió durante su lectura.');
   const report=inspector(bytes,passphrase);
   // v0.6.75: prueba de correspondencia real, sin extraer la clave a disco ni
   // enviarla a React. El handshake TLS local no sustituye XMLDSig/XAdES.
   if(inspector===inspectP12&&report.technicallyReady){
    try{
     report.keyPossession=await proof(bytes,passphrase);
     report.checks.push({key:'keyProof',ok:true,title:'Correspondencia criptográfica de la clave demostrada localmente'});
    }catch(_){
     report.keyPossession={ok:false,status:'indeterminado'};
     report.checks.push({key:'keyProof',ok:false,title:'No se pudo completar el ensayo criptográfico local; requiere comprobación adicional'});
    }
   }
   // Comparación de solo lectura, informativa y sin guardar la identificación de la empresa.
   // El dato viene de la ficha visible: no es una autorización de acceso ni de emisión.
   report.companyMatch=matchCertificateToCompany(report.subject,companyIdentification);
   report.signatureReadiness=signatureReadiness(report);
   // Una comprobación satisfactoria consume el ticket; el archivo no queda asociado a la empresa.
   if(selected===current)selected=null;
   return report;
  }finally{
   if(bytes)bytes.fill(0);
   if(handle)await handle.close();
   current.reading=false;
  }
 };
 return {select,inspect,clear,clearAll};
}
module.exports={createP12SelectionManager};
