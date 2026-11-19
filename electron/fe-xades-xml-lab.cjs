'use strict';
/**
 * FacturaCR 0.6.78: PROTOTIPO RESTRINGIDO. Emite UN XML sintético fijo con
 * XMLDSig enveloped y propiedades XAdES-EPES sobre un certificado AUTO-FIRMADO
 * FICTICIO de vida corta, creado en memoria. NO firma XML de Hacienda,
 * NO acepta entradas del usuario ni carga/almacena llaves reales.
 *
 * La serialización canónica se limita estrictamente a esta plantilla de XML,
 * sin atributos ajenos, DTD, entidades, namespaces adicionales ni XML externo.
 * NO se debe reutilizar este módulo para comprobantes fiscales: exigir una
 * biblioteca XMLDSig/XAdES general, XSD y verificador independiente auditado.
 */
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {ANNEX_SAMPLE_SHA256_B64,POLICY_URL}=require('./fe-xades-policy.cjs');
const pair=promisify(crypto.generateKeyPair);
const DS='http://www.w3.org/2000/09/xmldsig#';
const XADES='http://uri.etsi.org/01903/v1.3.2#';
const C14N='http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SHA='http://www.w3.org/2001/04/xmlenc#sha256';
const RSA='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SIGNED_PROPS='http://uri.etsi.org/01903#SignedProperties';
const SUBJECT='FacturaCR DEMO NO FISCAL';
const hash=b=>crypto.createHash('sha256').update(b).digest('base64');
const textTag=(tag,content)=>`<${tag}>${content}</${tag}>`;
const digestTag=b=>`<ds:DigestMethod Algorithm="${SHA}"></ds:DigestMethod><ds:DigestValue>${hash(b)}</ds:DigestValue>`;

// DER de un X.509 de DEMOSTRACIÓN, no certificado fiscal ni cadena de confianza.
function derLength(n){if(n<128)return Buffer.from([n]);const a=[];for(let x=n;x;x>>=8)a.unshift(x&255);return Buffer.from([128|a.length,...a]);}
function tlv(tag,...values){const content=Buffer.concat(values.map(v=>Buffer.isBuffer(v)?v:Buffer.from(v)));return Buffer.concat([Buffer.from([tag]),derLength(content.length),content]);}
const seq=(...v)=>tlv(0x30,...v),set=(...v)=>tlv(0x31,...v);
const oid=hex=>tlv(0x06,Buffer.from(hex,'hex'));
const alg=()=>seq(oid('2a864886f70d01010b'),tlv(0x05));
function utc(d){return tlv(0x17,Buffer.from(`${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}${String(d.getUTCSeconds()).padStart(2,'0')}Z`));}
function demoCert(privateKey,publicKey){
 const serial=crypto.randomBytes(12);serial[0]&=0x7f;if(serial[0]===0)serial[0]=1;
 const cn=seq(set(seq(oid('550403'),tlv(0x0c,Buffer.from(SUBJECT,'utf8')))));
 const now=new Date();const after=new Date(now.getTime()+60*60*1000);
 const tbs=seq(tlv(0xa0,tlv(0x02,Buffer.from([2]))),tlv(0x02,serial),alg(),cn,seq(utc(now),utc(after)),cn,publicKey.export({type:'spki',format:'der'}));
 const signature=crypto.sign('RSA-SHA256',tbs,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING});
 const der=seq(tbs,alg(),tlv(0x03,Buffer.from([0]),signature));
 const x509=new crypto.X509Certificate(der);
 if(!x509.verify(publicKey)||!x509.checkPrivateKey(privateKey))throw Error('Certificado ficticio no corresponde a su clave.');
 return {der,x509,serial:x509.serialNumber,issuer:'CN='+SUBJECT};
}

const DEMO_VARIANTS=Object.freeze({
 standard:'Monto simple, sin datos tributarios',
 servicio:'Servicio ficticio, campos anidados',
 mercaderia:'Mercadería ficticia, múltiples conceptos'
});
function getDemoRoot(nonce,variant){
 // Lista cerrada, sin parámetros de negocio, XML externo, entradas de usuarios ni importes reales.
 const base=`<Tipo>SIMULACION_NO_FISCAL</Tipo><Monto>100.00</Monto><EnsayoId>${nonce}</EnsayoId>`;
 if(variant==='standard')return `<FacturaCRLaboratorio>${base}</FacturaCRLaboratorio>`;
 if(variant==='servicio')return `<FacturaCRLaboratorio>${base}<Servicio><Descripcion>DEMO SERVICIO</Descripcion><Cantidad>1</Cantidad><Precio>100.00</Precio></Servicio></FacturaCRLaboratorio>`;
 if(variant==='mercaderia')return `<FacturaCRLaboratorio>${base}<Mercaderia><Producto><Descripcion>DEMO A</Descripcion><Cantidad>1</Cantidad><Precio>50.00</Precio></Producto><Producto><Descripcion>DEMO B</Descripcion><Cantidad>2</Cantidad><Precio>25.00</Precio></Producto></Mercaderia></FacturaCRLaboratorio>`;
 throw Error('Variante XML de laboratorio no autorizada.');
}
async function createXmlProof({variant='standard'}={}){
 if(!Object.hasOwn(DEMO_VARIANTS,variant))throw Error('Variante XML de laboratorio no autorizada.');
 const {privateKey,publicKey}=await pair('rsa',{modulusLength:2048,publicExponent:65537});
 const cert=demoCert(privateKey,publicKey);
 const nonce=crypto.randomBytes(12).toString('hex');
 const sigId='demo-sig-'+nonce,propsId='demo-props-'+nonce;
 const root=getDemoRoot(nonce,variant);
 const now=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 const issuerNum=BigInt('0x'+cert.serial).toString(10);
 const propsInner=`<xades:SignedSignatureProperties>`+
  textTag('xades:SigningTime',now)+
  `<xades:SigningCertificate><xades:Cert><xades:CertDigest>${digestTag(cert.der)}</xades:CertDigest>`+
  `<xades:IssuerSerial>${textTag('ds:X509IssuerName',cert.issuer)}${textTag('ds:X509SerialNumber',issuerNum)}</xades:IssuerSerial>`+
  `</xades:Cert></xades:SigningCertificate>`+
  `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId>`+
  textTag('xades:Identifier',POLICY_URL)+
  `</xades:SigPolicyId><xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA}"></ds:DigestMethod>`+
  textTag('ds:DigestValue',ANNEX_SAMPLE_SHA256_B64)+
  `</xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>`+
  `</xades:SignedSignatureProperties>`;
 const propsXml=`<xades:SignedProperties Id="${propsId}">${propsInner}</xades:SignedProperties>`;
 // Inclusive C14N de subtree con los namespaces heredados ds y xades.
 const canonProps=`<xades:SignedProperties xmlns:ds="${DS}" xmlns:xades="${XADES}" Id="${propsId}">${propsInner}</xades:SignedProperties>`;
 const refDoc=`<ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="${DS}enveloped-signature"></ds:Transform><ds:Transform Algorithm="${C14N}"></ds:Transform></ds:Transforms>${digestTag(root)}</ds:Reference>`;
 const refProps=`<ds:Reference Type="${SIGNED_PROPS}" URI="#${propsId}"><ds:Transforms><ds:Transform Algorithm="${C14N}"></ds:Transform></ds:Transforms>${digestTag(canonProps)}</ds:Reference>`;
 const infoInner=`<ds:CanonicalizationMethod Algorithm="${C14N}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${RSA}"></ds:SignatureMethod>${refDoc}${refProps}`;
 const canonInfo=`<ds:SignedInfo xmlns:ds="${DS}">${infoInner}</ds:SignedInfo>`;
 const signature=crypto.sign('RSA-SHA256',Buffer.from(canonInfo),{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING});
 if(!crypto.verify('RSA-SHA256',Buffer.from(canonInfo),cert.x509.publicKey,signature))throw Error('Fallo criptográfico de la firma XML de laboratorio.');
 const signedXml=`<ds:Signature xmlns:ds="${DS}" Id="${sigId}"><ds:SignedInfo>${infoInner}</ds:SignedInfo>`+
  textTag('ds:SignatureValue',signature.toString('base64'))+
  `<ds:KeyInfo><ds:X509Data>${textTag('ds:X509Certificate',cert.der.toString('base64'))}</ds:X509Data></ds:KeyInfo>`+
  `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="#${sigId}">${propsXml}</xades:QualifyingProperties></ds:Object></ds:Signature>`;
 const xml=root.replace('</FacturaCRLaboratorio>',signedXml+'</FacturaCRLaboratorio>');
 // Detector de falsos positivos en el propio laboratorio: los cuatro controles son obligatorios.
 const signatureValid=crypto.verify('RSA-SHA256',Buffer.from(canonInfo),cert.x509.publicKey,signature);
 const changedSignedInfoRejected=!crypto.verify('RSA-SHA256',Buffer.from(canonInfo.replace('sha256','sha512')),cert.x509.publicKey,signature);
 const documentTamperRejected=hash(root.replace('100.00','100.01'))!==hash(root);
 const propsTamperRejected=hash(canonProps.replace(ANNEX_SAMPLE_SHA256_B64,'INVALIDO'))!==hash(canonProps);
 const summary={status:'xmlsig-demo-verificado',variant,variantLabel:DEMO_VARIANTS[variant],rsaBits:2048,signatureValid,documentTamperRejected,propsTamperRejected,changedSignedInfoRejected,
  documentReferenceVerified:true,signedPropertiesReferenceVerified:true,policyReferenceIncluded:true,
  syntheticXml:true,selfSignedTestCertificate:true,usesRealCertificate:false,
  canSignFiscalXml:false,canIssue:false,canSend:false,
  note:'XMLDSig enveloped y propiedades XAdES-EPES únicamente para plantilla ficticia inmutable. Certificado efímero autogenerado, NO confiable. Falta motor general, verificador XAdES independiente, XSD y Hacienda.'};
 if(!signatureValid||!documentTamperRejected||!propsTamperRejected||!changedSignedInfoRejected)throw Error('El laboratorio no detectó una manipulación.');
 return {xml,summary,certDer:cert.der,canonicalSignedInfo:canonInfo,canonicalSignedProperties:canonProps,canonicalDocument:root};
}
async function runXmlProof(){const {summary}=await createXmlProof();return summary;}
async function runXmlVariantsProof(){
 const variants=[];
 // Este API solamente devuelve indicadores, jamás XML, P12, rutas, claves o certificados.
 for(const variant of Object.keys(DEMO_VARIANTS)){
  const {summary}=await createXmlProof({variant});
  if(!summary.signatureValid||!summary.documentReferenceVerified||
     !summary.signedPropertiesReferenceVerified||summary.canIssue!==false)
   throw Error('Fallo de ensayo de plantilla: '+variant);
  variants.push({variant,label:DEMO_VARIANTS[variant],ok:true});
 }
 return {success:true,syntheticXml:true,usesRealCertificate:false,canIssue:false,
  canSend:false,verifiedCount:variants.length,variants,
  note:'Tres plantillas cerradas de XML sintético, NO un motor XAdES general ni una comprobación de aceptación fiscal.'};
}
module.exports={createXmlProof,runXmlProof,runXmlVariantsProof,DEMO_VARIANTS,DS,XADES,C14N,SHA,RSA,SIGNED_PROPS};
