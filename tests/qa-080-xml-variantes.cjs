'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createXmlProof,runXmlVariantsProof,DEMO_VARIANTS}=require('../electron/fe-xades-xml-lab.cjs');
let n=0;async function test(label,fn){await fn();n++;console.log('OK v0.6.80:',label)}
(async()=>{
 await test('Se preserva plantilla anterior por defecto',async()=>{
  const r=await createXmlProof();
  assert.equal(r.summary.variant,'standard');
  assert.match(r.xml,/^<FacturaCRLaboratorio><Tipo>SIMULACION_NO_FISCAL<\/Tipo><Monto>100.00<\/Monto><EnsayoId>[a-f0-9]{24}<\/EnsayoId><ds:Signature/);
 });
 for(const variant of Object.keys(DEMO_VARIANTS)){
  await test('Firma y certificado efímeros: '+variant,async()=>{
   const r=await createXmlProof({variant});
   assert.equal(r.summary.signatureValid,true);
   assert.equal(r.summary.documentReferenceVerified,true);
   assert.equal(r.summary.signedPropertiesReferenceVerified,true);
   assert.equal(r.summary.usesRealCertificate,false);
   assert.equal(r.summary.canIssue,false);assert.equal(r.summary.canSend,false);
   assert.equal(r.summary.variant,variant);
   assert(r.xml.includes('<ds:Signature '));assert(!r.xml.includes('PRIVATE KEY'));
   if(variant==='servicio')assert(r.xml.includes('<Servicio>'));
   if(variant==='mercaderia')assert(r.xml.includes('<Mercaderia>'));
   const cert=new crypto.X509Certificate(r.certDer);
   assert.equal(cert.publicKey.asymmetricKeyDetails.modulusLength,2048);
   const sig=Buffer.from(r.xml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)[1],'base64');
   assert(crypto.verify('RSA-SHA256',Buffer.from(r.canonicalSignedInfo),cert.publicKey,sig));
  });
 }
 await test('Rechaza variante desconocida antes de generar claves',async()=>{
  await assert.rejects(createXmlProof({variant:'FacturaElectronica'}),/no autorizada/);
  await assert.rejects(createXmlProof({variant:'../../personal.p12'}),/no autorizada/);
  await assert.rejects(createXmlProof({variant:''}),/no autorizada/);
 });
 await test('Rechaza entrada arbitraria, sin firmador de XML de terceros',async()=>{
  await assert.rejects(createXmlProof({variant:'<FacturaElectronica/>',xml:'<FacturaElectronica/>'}),/no autorizada/);
 });
 await test('El resumen para React no revela XML, certificados ni claves',async()=>{
  const result=await runXmlVariantsProof();
  assert.equal(result.success,true);assert.equal(result.verifiedCount,3);
  assert.equal(result.syntheticXml,true);assert.equal(result.usesRealCertificate,false);
  assert.equal(result.canIssue,false);assert.equal(result.canSend,false);
  assert.deepEqual(result.variants.map(v=>v.variant),['standard','servicio','mercaderia']);
  assert(result.variants.every(v=>v.ok));
  assert(!JSON.stringify(result).includes('SignatureValue'));
  assert(!JSON.stringify(result).includes('PRIVATE KEY'));
  assert(!JSON.stringify(result).includes('<'));
 });
 console.log(`QA v0.6.80 variantes: ${n}/${n} aprobadas`);
})().catch(err=>{console.error(err);process.exitCode=1;});
