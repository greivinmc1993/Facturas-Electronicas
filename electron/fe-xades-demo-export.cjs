'use strict';
/**
 * FacturaCR 0.6.79 — Exportación EXCLUSIVA de la prueba sintética firmada.
 * El XML que produce createXmlProof() no es un comprobante electrónico.
 * La clave efímera nunca se escribe ni se devuelve al renderer.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {createXmlProof}=require('./fe-xades-xml-lab.cjs');
const {verifySyntheticXml}=require('./fe-xades-demo-verifier.cjs');
const MAX_DEMO_BYTES=100_000;

async function saveSyntheticXml({showSaveDialog,writeFile,documentsPath,clock=()=>new Date(),generate=createXmlProof}){
 if(typeof showSaveDialog!=='function'||typeof writeFile!=='function'||typeof documentsPath!=='string')
  throw Error('Configuración de exportación de laboratorio incompleta.');
 const date=clock().toISOString().replace(/[:.]/g,'-');
 const suggested='FacturaCR_DEMO_NO_FISCAL_'+date+'.xml';
 const chosen=await showSaveDialog({
  title:'Guardar XML FICTICIO — no válido para Hacienda',
  defaultPath:path.join(documentsPath,suggested),
  buttonLabel:'Guardar XML de laboratorio',
  filters:[{name:'XML de laboratorio (NO FISCAL)',extensions:['xml']}]
 });
 if(chosen?.canceled||!chosen?.filePath)return {success:false,cancelled:true};
 const filePath=chosen.filePath;
 if(!path.isAbsolute(filePath)||path.extname(filePath).toLowerCase()!=='.xml')
  throw Error('Selecciona un archivo .xml mediante el diálogo de Windows.');
 // Generar DESPUÉS de elegir destino para no crear claves si el usuario cancela.
 const proof=await generate();
 const summary=proof?.summary;
 if(typeof proof?.xml!=='string'||!proof.xml.startsWith('<FacturaCRLaboratorio>')||
    !proof.xml.endsWith('</FacturaCRLaboratorio>')||!summary?.syntheticXml||
    !summary?.selfSignedTestCertificate||summary?.usesRealCertificate!==false||
    summary?.canSignFiscalXml!==false||summary?.canIssue!==false||summary?.canSend!==false||
    !summary?.signatureValid||!summary?.documentReferenceVerified||
    !summary?.signedPropertiesReferenceVerified||
    !summary?.documentTamperRejected||!summary?.propsTamperRejected||!summary?.changedSignedInfoRejected)
   throw Error('La prueba sintética no superó las comprobaciones requeridas.');
 const bytes=Buffer.from(proof.xml,'utf8');
 if(bytes.length>MAX_DEMO_BYTES||bytes.length<1000)throw Error('Tamaño del XML de prueba fuera de rango.');
 // Segunda barrera independiente del indicador de éxito del generador:
 // recalcular digestos y verificar RSA antes de autorizar un archivo.
 const verified=verifySyntheticXml(bytes);
 if(!verified.valid||verified.canIssue!==false)throw Error('La firma de prueba no pasó el verificador local.');
 // Exclusivo: no sigue enlaces simbólicos ni sustituye archivos existentes.
 await writeFile(filePath,bytes,{flag:'wx',mode:0o600});
 return {success:true,report:{name:path.basename(filePath),bytes:bytes.length,
   sha256:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
   syntheticXml:true,usesRealCertificate:false,canIssue:false,canSend:false,locallyVerifiedBeforeSave:true,
   note:'XML de LABORATORIO con certificado ficticio. Firma y referencias comprobadas localmente antes del guardado; no es factura electrónica ni sustituye verificación externa general.'}};
}
module.exports={saveSyntheticXml,MAX_DEMO_BYTES};
