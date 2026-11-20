'use strict';
/**
 * v0.6.82 — diagnóstico pasivo en el proceso principal.
 * Nunca abre un .p12, firma XML, contacta Hacienda ni habilita emisión.
 * Las dependencias de producción deben instalarse de forma reproducible
 * antes de cambiar cualquier permiso de firma fiscal.
 */
const {webcrypto}=require('node:crypto');
const REQUIRED=['xadesjs','xmldsigjs','xml-core'];
function compatibleNode(version){
 const m=/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version||''));
 if(!m)return false;
 const [major,minor,patch]=m.slice(1).map(Number);
 return (major===20&&(minor>19||(minor===19&&patch>=0))) ||
  (major===22&&(minor>12||(minor===12&&patch>=0))) || major>22;
}
async function cryptoSelfTest(engine=webcrypto){
 try{
  if(!engine?.subtle)return false;
  const keys=await engine.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['sign','verify']);
  const data=new TextEncoder().encode('FacturaCR v0.6.82 - SIMULACION NO FISCAL');
  const altered=new TextEncoder().encode('FacturaCR v0.6.82 - SIMULACION ALTERADA');
  const signature=await engine.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,data);
  return !!(await engine.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,signature,data))&&
   !(await engine.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,signature,altered));
 }catch{return false;}
}
async function diagnoseXadesEngine({nodeVersion=process.versions.node,
 resolvePackage=require.resolve,engine=webcrypto}={}){
 const found=REQUIRED.filter(name=>{try{return typeof resolvePackage(name)==='string';}catch{return false;}});
 const nodeCompatible=compatibleNode(nodeVersion);
 const cryptoOk=await cryptoSelfTest(engine);
 const specializedEngineInstalled=found.length===REQUIRED.length;
 // La sola detección nunca equivale a verificación XAdES-EPES.
 return Object.freeze({nodeVersion:String(nodeVersion),nodeCompatible,cryptoOk,
  detectedCount:found.length,requiredCount:REQUIRED.length,specializedEngineInstalled,
  specializedEngineValidated:false,signaturePolicyValidated:false,
  usesRealCertificate:false,canSignFiscalXml:false,canIssue:false,canSend:false,
  note:specializedEngineInstalled
   ?'Se localizaron módulos, pero falta probar sus versiones, canonicalización, política XAdES-EPES y verificación independiente. Firma fiscal bloqueada.'
   :'Todavía falta integrar y validar XAdESjs, XMLDSigjs y XML Core mediante npm ci y QA independiente. Este diagnóstico no genera firmas fiscales.'});
}
module.exports={compatibleNode,cryptoSelfTest,diagnoseXadesEngine,REQUIRED};
