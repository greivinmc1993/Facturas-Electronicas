/**
 * FacturaCR v0.6.85 — XAdESjs integrado, EXCLUSIVAMENTE LABORATORIO.
 * NO recibe XML externos, certificados de contribuyentes, contraseñas, empresas
 * ni parámetros desde la UI. El motor fiscal y el envío permanecen bloqueados.
 * La carga diferida evita afectar el arranque normal de Ventas y SQLite.
 */
import {runSpecializedSyntheticTrial,XML_VARIANTS} from './fe-xades-specialized-lab.mjs';

async function loadSpecializedLibraries(){
 const [xadesjs,xmldsigjs,xmldom,xpathModule]=await Promise.all([
  import('xadesjs'),import('xmldsigjs'),import('@xmldom/xmldom'),import('xpath')
 ]);
 return {xadesjs,xmldsigjs,xmldom,xpath:xpathModule.default??xpathModule};
}

/** Los argumentos son solo para ensayos unitarios con doble de dependencias.
 *  Electron invoca esta función sin argumentos; React no puede proporcionarlos.
 */
export async function runIntegratedSyntheticSuite({loadLibraries=loadSpecializedLibraries,
 runTrial=runSpecializedSyntheticTrial}={}){
 const dependencies=await loadLibraries();
 const results=[];
 for(const variant of Object.keys(XML_VARIANTS)){
  const trial=await runTrial(variant,dependencies);
  if(trial?.variant!==variant||trial?.signed!==true||trial?.references!==2||
      trial?.mutationsRejected!==2||trial?.nonFiscal!==true||
      !/^[a-f0-9]{64}$/.test(trial?.sha256??'')){
    throw new Error('Una firma sintética o su verificación no superó el ensayo');
  }
  // Nunca exponemos el XML, la clave privada o el certificado al renderer.
  results.push(Object.freeze({variant,sha256:trial.sha256,references:2,mutationsRejected:2}));
 }
 return Object.freeze({verifiedCount:results.length,mutationsRejected:results.length*2,
  results:Object.freeze(results),integratedLabVerified:true,nonFiscal:true,
  usesRealCertificate:false,canSignFiscalXml:false,canIssue:false,canSend:false,
  note:'XAdESjs 3.1.0: 3 XML sintéticos verificados y 6 alteraciones rechazadas. No acredita conformidad XAdES-EPES tributaria ni habilita emisión.'});
}
