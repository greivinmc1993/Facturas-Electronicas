'use strict';
/**
 * FacturaCR v0.6.81 — verificación LOCAL de una exportación de LABORATORIO.
 * La implementación es deliberadamente una LISTA CERRADA de tres formatos
 * XML que el proyecto emite. No es un parser XML universal, ni un validador
 * XAdES fiscal; jamás usar para XML de terceros, FE 4.4 o certificados reales.
 *
 * En lugar de confiar en las marcas 'success' del generador, reconstruye de
 * forma independiente cada referencia y verifica SignatureValue con la clave
 * pública X509 incluida en el archivo. Rechaza toda forma fuera de plantilla.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {constants:fsFlags}=require('node:fs');
const {TextDecoder}=require('node:util');
const {POLICY_URL,ANNEX_SAMPLE_SHA256_B64}=require('./fe-xades-policy.cjs');
const MAX_DEMO_BYTES=100_000;
const DS='http://www.w3.org/2000/09/xmldsig#';
const XADES='http://uri.etsi.org/01903/v1.3.2#';
const C14N='http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SHA='http://www.w3.org/2001/04/xmlenc#sha256';
const RSA='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SIGNED_PROPS='http://uri.etsi.org/01903#SignedProperties';
const hash=b=>crypto.createHash('sha256').update(b).digest('base64');
const digestTag=b=>`<ds:DigestMethod Algorithm="${SHA}"></ds:DigestMethod><ds:DigestValue>${hash(b)}</ds:DigestValue>`;
const tag=(name,text)=>`<${name}>${text}</${name}>`;
const suffix='</FacturaCRLaboratorio>';

function originalRoot(id,variant){
 const base=`<Tipo>SIMULACION_NO_FISCAL</Tipo><Monto>100.00</Monto><EnsayoId>${id}</EnsayoId>`;
 if(variant==='standard')return `<FacturaCRLaboratorio>${base}${suffix}`;
 if(variant==='servicio')return `<FacturaCRLaboratorio>${base}<Servicio><Descripcion>DEMO SERVICIO</Descripcion><Cantidad>1</Cantidad><Precio>100.00</Precio></Servicio>${suffix}`;
 if(variant==='mercaderia')return `<FacturaCRLaboratorio>${base}<Mercaderia><Producto><Descripcion>DEMO A</Descripcion><Cantidad>1</Cantidad><Precio>50.00</Precio></Producto><Producto><Descripcion>DEMO B</Descripcion><Cantidad>2</Cantidad><Precio>25.00</Precio></Producto></Mercaderia>${suffix}`;
 throw Error('Plantilla de demostración desconocida.');
}
function oneMatch(xml,re){const matches=[...xml.matchAll(re)];return matches.length===1?matches[0][1]:null;}
function fromBase64(s){
 if(typeof s!=='string'||!s||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
  throw Error('Codificación de firma o certificado inválida.');
 const decoded=Buffer.from(s,'base64');
 if(decoded.toString('base64')!==s)throw Error('Codificación Base64 no canónica.');
 return decoded;
}
function verifySyntheticXml(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1000||bytes.length>MAX_DEMO_BYTES)
  throw Error('Tamaño del XML ficticio no admitido.');
 const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const id=oneMatch(xml,/<EnsayoId>([0-9a-f]{24})<\/EnsayoId>/g);
 if(!id)throw Error('No es un XML de laboratorio reconocido.');
 let variant=null,root=null,signatureXml=null;
 for(const name of ['standard','servicio','mercaderia']){
  const testRoot=originalRoot(id,name),prefix=testRoot.slice(0,-suffix.length);
  const opening=`<ds:Signature xmlns:ds="${DS}" Id="demo-sig-${id}">`;
  if(xml.startsWith(prefix+opening)&&xml.endsWith('</ds:Signature>'+suffix)){
   if(variant!==null)throw Error('El XML coincide con más de una plantilla.');
   variant=name;root=testRoot;signatureXml=xml.slice(prefix.length,-suffix.length);
  }
 }
 if(!variant||!signatureXml)throw Error('Solo se admiten las plantillas de XML ficticio de FacturaCR.');
 const signatureB64=oneMatch(signatureXml,/<ds:SignatureValue>([A-Za-z0-9+/=]+)<\/ds:SignatureValue>/g);
 const certB64=oneMatch(signatureXml,/<ds:X509Certificate>([A-Za-z0-9+/=]+)<\/ds:X509Certificate>/g);
 const time=oneMatch(signatureXml,/<xades:SigningTime>(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)<\/xades:SigningTime>/g);
 if(!signatureB64||!certB64||!time||!Number.isFinite(Date.parse(time)))
  throw Error('Faltan datos firmados o el formato es inválido.');
 if(new Date(time).toISOString().replace('.000Z','Z')!==time)
  throw Error('Fecha de demostración no canónica.');
 const certBytes=fromBase64(certB64),signature=fromBase64(signatureB64);
 const cert=new crypto.X509Certificate(certBytes);
 if(cert.subject!=='CN=FacturaCR DEMO NO FISCAL'||cert.issuer!==cert.subject||
    cert.publicKey.asymmetricKeyType!=='rsa'||cert.publicKey.asymmetricKeyDetails?.modulusLength!==2048||
    !cert.verify(cert.publicKey))
  throw Error('El certificado no corresponde al laboratorio ficticio.');
 const serial=BigInt('0x'+cert.serialNumber).toString(10);
 const sigId='demo-sig-'+id,propsId='demo-props-'+id;
 const propsInner='<xades:SignedSignatureProperties>'+tag('xades:SigningTime',time)+
  `<xades:SigningCertificate><xades:Cert><xades:CertDigest>${digestTag(certBytes)}</xades:CertDigest>`+
  `<xades:IssuerSerial>${tag('ds:X509IssuerName','CN=FacturaCR DEMO NO FISCAL')}${tag('ds:X509SerialNumber',serial)}</xades:IssuerSerial>`+
  '</xades:Cert></xades:SigningCertificate>'+
  '<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId>'+tag('xades:Identifier',POLICY_URL)+
  `</xades:SigPolicyId><xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA}"></ds:DigestMethod>`+
  tag('ds:DigestValue',ANNEX_SAMPLE_SHA256_B64)+
  '</xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier></xades:SignedSignatureProperties>';
 const propsXml=`<xades:SignedProperties Id="${propsId}">${propsInner}</xades:SignedProperties>`;
 const canonProps=`<xades:SignedProperties xmlns:ds="${DS}" xmlns:xades="${XADES}" Id="${propsId}">${propsInner}</xades:SignedProperties>`;
 const refDocument=`<ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="${DS}enveloped-signature"></ds:Transform><ds:Transform Algorithm="${C14N}"></ds:Transform></ds:Transforms>${digestTag(root)}</ds:Reference>`;
 const refProps=`<ds:Reference Type="${SIGNED_PROPS}" URI="#${propsId}"><ds:Transforms><ds:Transform Algorithm="${C14N}"></ds:Transform></ds:Transforms>${digestTag(canonProps)}</ds:Reference>`;
 const infoInner=`<ds:CanonicalizationMethod Algorithm="${C14N}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${RSA}"></ds:SignatureMethod>${refDocument}${refProps}`;
 const canonicalInfo=`<ds:SignedInfo xmlns:ds="${DS}">${infoInner}</ds:SignedInfo>`;
 const expected=`<ds:Signature xmlns:ds="${DS}" Id="${sigId}"><ds:SignedInfo>${infoInner}</ds:SignedInfo>`+
  tag('ds:SignatureValue',signatureB64)+
  `<ds:KeyInfo><ds:X509Data>${tag('ds:X509Certificate',certB64)}</ds:X509Data></ds:KeyInfo>`+
  `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="#${sigId}">${propsXml}</xades:QualifyingProperties></ds:Object></ds:Signature>`;
 // Igualdad absoluta: prohíbe referencias ajenas, DTD, firmas duplicadas, IDs
 // superpuestos, wrappers XML y transformaciones que este verificador no entiende.
 if(signatureXml!==expected)throw Error('La estructura o las referencias firmadas fueron modificadas.');
 if(!crypto.verify('RSA-SHA256',Buffer.from(canonicalInfo),{key:cert.publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},signature))
  throw Error('Firma RSA-SHA256 inválida.');
 const now=Date.now();
 return {valid:true,variant,checkedReferences:2,signatureVerified:true,
  signedPropertiesVerified:true,documentDigestVerified:true,
  selfSignedDemo:true,certificateWithinValidityNow:now>=Date.parse(cert.validFrom)&&now<=Date.parse(cert.validTo),
  sha256:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),bytes:bytes.length,
  syntheticXml:true,usesRealCertificate:false,canSignFiscalXml:false,canIssue:false,canSend:false,
  note:'Firma y digestos correctos SOLO para la exportación exacta de LABORATORIO FacturaCR. No verifica firmas XAdES generales, cadenas de confianza, XSD ni aceptación fiscal.'};
}
async function inspectSavedDemoXml({showOpenDialog,lstat,openFile}){
 if(typeof showOpenDialog!=='function'||typeof lstat!=='function'||typeof openFile!=='function')
  throw Error('No están disponibles los controles de selección segura.');
 const chosen=await showOpenDialog({
  title:'Verificar XML FICTICIO guardado (no fiscal)',properties:['openFile'],
  filters:[{name:'XML de laboratorio',extensions:['xml']}]
 });
 if(chosen?.canceled||!chosen?.filePaths?.[0])return {success:false,cancelled:true};
 const filePath=chosen.filePaths[0];
 if(!path.isAbsolute(filePath)||path.extname(filePath).toLowerCase()!=='.xml')
  throw Error('Selecciona un archivo .xml con el diálogo de Windows.');
 const stat=await lstat(filePath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_DEMO_BYTES||stat.size<1000)
  throw Error('Archivo de laboratorio no permitido por formato o tamaño.');
 // Abrir sin seguir enlaces simbólicos cuando la plataforma lo permite,
 // y cotejar la identidad del descriptor frente al archivo seleccionado.
 const handle=await openFile(filePath,fsFlags.O_RDONLY|(process.platform==='win32'?0:(fsFlags.O_NOFOLLOW||0)));
 let bytes;
 try{
  const opened=await handle.stat(),current=await lstat(filePath);
  if(!opened.isFile()||!current.isFile()||current.isSymbolicLink()||opened.size!==stat.size||
     current.size!==stat.size||(opened.ino&&current.ino&&opened.ino!==current.ino)||
     (opened.dev&&current.dev&&opened.dev!==current.dev))
   throw Error('El archivo cambió mientras se abría.');
  bytes=await handle.readFile();
 }finally{await handle.close();}
 if(!Buffer.isBuffer(bytes)||bytes.length!==stat.size)throw Error('El archivo cambió mientras se leía.');
 // El nombre, no la ruta, es el único dato del sistema de archivos que llega a React.
 const name=path.basename(filePath);
 try{return {success:true,report:{name,...verifySyntheticXml(bytes)}};}
 catch{return {success:true,report:{name,valid:false,syntheticXml:false,canIssue:false,canSend:false,
   note:'No se pudo verificar como exportación íntegra del laboratorio. Revisa el archivo o genera otro XML ficticio.'}};}
}
module.exports={verifySyntheticXml,inspectSavedDemoXml,MAX_DEMO_BYTES};
