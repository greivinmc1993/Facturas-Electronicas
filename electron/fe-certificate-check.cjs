'use strict';
/**
 * FacturaCR 0.6.74 - inspección local y efímera de un PKCS#12.
 * Esta función NO firma, almacena, exporta ni envía datos del certificado.
 * La compatibilidad de una firma XAdES-EPES con Hacienda debe probarse aparte.
 */
const tls=require('node:tls');
const {X509Certificate}=require('node:crypto');
const MAX_P12_BYTES=4*1024*1024;
function inspectP12(data,passphrase,now=new Date()){
 if(!Buffer.isBuffer(data)||data.length<32||data.length>MAX_P12_BYTES)throw Error('El archivo PKCS#12 no tiene un tamaño permitido.');
 if(typeof passphrase!=='string'||passphrase.length>512)throw Error('Contraseña del archivo inválida.');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Fecha de comprobación inválida.');
 // OpenSSL dentro de Node exige que el PFX contenga tanto clave privada como certificado.
 // No extraemos ni exportamos la clave privada. Se descarta el contexto al finalizar.
 const ctx=tls.createSecureContext({pfx:data,passphrase});
 const der=ctx.context.getCertificate();
 if(!der||!der.length)throw Error('El contenedor no incluye un certificado principal.');
 const cert=new X509Certificate(der);
 const from=new Date(cert.validFrom),until=new Date(cert.validTo);
 if(!Number.isFinite(from.getTime())||!Number.isFinite(until.getTime()))throw Error('Fechas X.509 inválidas.');
 const algorithm=cert.publicKey.asymmetricKeyType;
 const bits=algorithm==='rsa'||algorithm==='rsa-pss'?cert.publicKey.asymmetricKeyDetails?.modulusLength:null;
 const timeOk=from<=now && now<=until;
 const rsaOk=algorithm==='rsa' && (bits===2048||bits===4096);
 return {
  recognized:true,
  subject:String(cert.subject||'').slice(0,500),
  issuer:String(cert.issuer||'').slice(0,500),
  validFrom:from.toISOString(),validTo:until.toISOString(),
  fingerprint256:cert.fingerprint256,
  publicKeyType:algorithm||'desconocido',
  rsaBits:bits||null,
  checks:[
   {key:'privateKey',ok:true,title:'PKCS#12 contiene una clave privada utilizable por OpenSSL'},
   {key:'validity',ok:timeOk,title:timeOk?'Dentro del período de validez':'Certificado vencido o aún no vigente'},
   {key:'algorithm',ok:rsaOk,title:rsaOk?'Clave pública RSA de 2048 o 4096 bits':'Algoritmo o longitud de clave requiere revisión'}
  ],
  technicallyReady:timeOk&&rsaOk,
  canSign:false,
  canIssue:false,
  note:'Inspección técnica local. No comprueba revocación, cadena de confianza, titularidad fiscal, política XAdES-EPES, aceptación de Hacienda ni la emisión de XML.'
 };
}
module.exports={inspectP12,MAX_P12_BYTES};
