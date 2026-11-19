'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createXmlProof,runXmlProof,C14N,DS,XADES,SHA,RSA,SIGNED_PROPS}=require('../electron/fe-xades-xml-lab.cjs');
const {ANNEX_SAMPLE_SHA256_B64,POLICY_URL}=require('../electron/fe-xades-policy.cjs');
let n=0;
async function check(title,fn){await fn();n++;console.log('OK XMLDSig laboratorio 0.6.78:',title)}
(async()=>{
 const p=await createXmlProof();
 await check('Plantilla XML no fiscal, una única firma enveloped',()=>{
  assert.match(p.xml,/^<FacturaCRLaboratorio><Tipo>SIMULACION_NO_FISCAL<\/Tipo>/);
  assert.equal((p.xml.match(/<ds:Signature /g)||[]).length,1);
  assert.match(p.xml,/http:\/\/www.w3.org\/2000\/09\/xmldsig#enveloped-signature/);
  assert.doesNotMatch(p.xml,/<FacturaElectronica|<Clave>|<Emisor>/);
 });
 await check('C14N-20010315, RSA-SHA256 y digest SHA-256',()=>{
  assert(p.xml.includes(C14N));assert(p.xml.includes(RSA));assert(p.xml.includes(SHA));
  assert.equal((p.xml.match(/<ds:Reference /g)||[]).length,2);
 });
 await check('Digest de la raíz coincide con la referencia del XML',()=>{
  const refs=[...p.xml.matchAll(/<ds:Reference [^>]+>(.*?)<\/ds:Reference>/g)];
  assert.equal(refs.length,2);
  const value=refs[0][1].match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/)[1];
  assert.equal(value,crypto.createHash('sha256').update(p.canonicalDocument).digest('base64'));
 });
 await check('SignedProperties referenciada con tipo e ID correctos',()=>{
  const refs=[...p.xml.matchAll(/<ds:Reference [^>]+>(.*?)<\/ds:Reference>/g)];
  const ref=refs[1][0];assert(ref.includes('Type="'+SIGNED_PROPS+'"'));
  const uri=ref.match(/URI="#([^\"]+)"/)[1];assert(p.xml.includes('SignedProperties Id="'+uri+'"'));
  assert.equal(ref.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/)[1],crypto.createHash('sha256').update(p.canonicalSignedProperties).digest('base64'));
 });
 await check('Política de Hacienda se incluye dentro de las propiedades firmadas',()=>{
  assert(p.xml.includes(POLICY_URL));assert(p.xml.includes(ANNEX_SAMPLE_SHA256_B64));
  assert(p.xml.includes('SignaturePolicyIdentifier'));
 });
 await check('Certificado generado en memoria con titular explícitamente ficticio',()=>{
  const b64=p.xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)[1];
  const cert=new crypto.X509Certificate(Buffer.from(b64,'base64'));
  assert.match(cert.subject,/FacturaCR DEMO NO FISCAL/);
  assert.equal(cert.issuer,cert.subject);assert.equal(cert.publicKey.asymmetricKeyDetails.modulusLength,2048);
  assert(cert.verify(cert.publicKey));
  const s=p.xml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)[1];
  assert(crypto.verify('RSA-SHA256',Buffer.from(p.canonicalSignedInfo),cert.publicKey,Buffer.from(s,'base64')));
 });
 await check('Cambiar SignedInfo invalida la firma',()=>{
  const b64=p.xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)[1];const cert=new crypto.X509Certificate(Buffer.from(b64,'base64'));
  const s=p.xml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)[1];
  assert.equal(crypto.verify('RSA-SHA256',Buffer.from(p.canonicalSignedInfo.replace(RSA,'https://falso.invalid')),cert.publicKey,Buffer.from(s,'base64')),false);
  assert.equal(p.summary.changedSignedInfoRejected,true);
 });
 await check('Cambiar documento o política invalida sus digests',()=>{
  const hash=b=>crypto.createHash('sha256').update(b).digest('base64');
  assert.notEqual(hash(p.canonicalDocument.replace('100.00','100.01')),hash(p.canonicalDocument));
  assert.notEqual(hash(p.canonicalSignedProperties.replace(ANNEX_SAMPLE_SHA256_B64,'ERROR')),hash(p.canonicalSignedProperties));
  assert.equal(p.summary.documentTamperRejected,true);assert.equal(p.summary.propsTamperRejected,true);
 });
 await check('No proporciona XML de Hacienda ni habilita firma fiscal',()=>{
  assert.equal(p.summary.usesRealCertificate,false);assert.equal(p.summary.canSignFiscalXml,false);
  assert.equal(p.summary.canIssue,false);assert.equal(p.summary.canSend,false);
 });
 await check('El IPC público recibe solo booleanos y ningún secreto, XML, clave o certificado',async()=>{
  const x=await runXmlProof();const j=JSON.stringify(x);
  assert.equal(x.signatureValid,true);assert.equal(x.selfSignedTestCertificate,true);
  assert(!j.includes('<')&&!j.includes('PRIVATE KEY')&&!j.includes('CERTIFICATE'));
  assert.equal(Object.keys(x).some(k=>/^(xml|privateKey|certificatePem|signatureBase64|canonicalSignedInfo)$/i.test(k)),false);
 });
 console.log(`QA 0.6.78 XMLDSig laboratorio: ${n}/${n} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
