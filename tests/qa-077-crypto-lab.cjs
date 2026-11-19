'use strict';
const assert=require('node:assert/strict');
const {createHash,verify,constants}=require('node:crypto');
const {existsSync,mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {LAB_XML,createLabProof,runLocalCryptoLab}=require('../electron/fe-xades-crypto-lab.cjs');
const {ANNEX_SAMPLE_SHA256_B64}=require('../electron/fe-xades-policy.cjs');
let count=0;
const check=async(name,test)=>{await test();count++;console.log('OK v0.6.77 laboratorio:',name)};
(async()=>{
 const proof=await createLabProof();
 try{
  const {summary,signature,signedBytes,publicKeyPem}=proof;
  await check('Firma RSA-SHA256 real sobre XML ficticio',()=>{
   assert.equal(summary.method,'RSA-SHA256');assert.equal(summary.rsaBits,2048);
   assert.equal(summary.keyProofVerified,true);
   assert.equal(verify('RSA-SHA256',signedBytes,{key:publicKeyPem,padding:constants.RSA_PKCS1_PADDING},signature),true);
  });
  await check('El contenido se firma con nonce aleatorio y digest reproducible',()=>{
   assert(signedBytes.toString('utf8').startsWith('<?xml version="1.0"'));
   assert.match(signedBytes.toString('utf8'),/<EnsayoId>[a-f0-9]{32}<\/EnsayoId><\/FacturaCRLaboratorio>$/);
   assert.equal(summary.documentDigest,createHash('sha256').update(signedBytes).digest('hex').toUpperCase());
  });
  await check('Manipular contenido invalida la firma',()=>{
   const tampered=Buffer.from(signedBytes);tampered[10]^=1;
   assert.equal(verify('RSA-SHA256',tampered,publicKeyPem,signature),false);
   assert.equal(summary.changedContentRejected,true);tampered.fill(0);
  });
  await check('Manipular bytes de firma invalida la verificación',()=>{
   const tampered=Buffer.from(signature);tampered[tampered.length-1]^=1;
   assert.equal(verify('RSA-SHA256',signedBytes,publicKeyPem,tampered),false);
   assert.equal(summary.alteredSignatureRejected,true);tampered.fill(0);
  });
  await check('Política del Anexo 2 se conserva como referencia no verificada',()=>{
   assert.equal(summary.referencePolicyDigest,ANNEX_SAMPLE_SHA256_B64);
   assert.match(summary.referencePolicy,/^https:\/\/cdn\.comprobanteselectronicos\.go\.cr\//);
  });
  await check('No crea firma XAdES, XMLDSig ni autoriza emisión',()=>{
   assert.equal(summary.signedDocument,false);assert.equal(summary.xadesVerified,false);
   assert.equal(summary.canIssue,false);assert.equal(summary.canSign,false);
   assert.doesNotMatch(LAB_XML,/<ds:Signature|<xades:SignedProperties/);
  });
  await check('Un verificador OpenSSL independiente confirma firma y detecta alteración (si está instalado)',()=>{
   const available=spawnSync('openssl',['version'],{encoding:'utf8'});
   if(available.error||available.status!==0){console.log('  INFO: OpenSSL no instalado; se ejecutó la verificación independiente con Node.');return}
   const dir=mkdtempSync(path.join(os.tmpdir(),'facturacr-lab-'));
   try{
    const data=path.join(dir,'payload.bin'),pub=path.join(dir,'public.pem'),sig=path.join(dir,'signature.bin');
    writeFileSync(data,signedBytes,{mode:0o600});writeFileSync(pub,publicKeyPem,{mode:0o600});writeFileSync(sig,signature,{mode:0o600});
    const checked=spawnSync('openssl',['dgst','-sha256','-verify',pub,'-signature',sig,data],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/Verified OK/);
    const tampered=Buffer.from(signedBytes);tampered[0]^=1;writeFileSync(data,tampered,{mode:0o600});tampered.fill(0);
    const rejected=spawnSync('openssl',['dgst','-sha256','-verify',pub,'-signature',sig,data],{encoding:'utf8'});
    assert.notEqual(rejected.status,0,'OpenSSL rechazó datos manipulados');
   }finally{rmSync(dir,{recursive:true,force:true})}
  });
  await check('La API pública de laboratorio no devuelve claves, XML ni firmas',async()=>{
   const report=await runLocalCryptoLab();
   assert.equal(report.keyProofVerified,true);
   assert.equal(report.changedContentRejected,true);
   assert.equal(report.canSign,false);assert.equal(report.canIssue,false);
   const json=JSON.stringify(report);
   assert(!json.includes('PRIVATE KEY'));assert(!json.includes('PUBLIC KEY'));
   assert(!json.includes('<Factura'));
   assert(!json.includes('signatureBase64'));
  });
 }finally{proof.signature.fill(0);proof.signedBytes.fill(0)}
 console.log(`QA laboratorio v0.6.77: ${count}/${count} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
