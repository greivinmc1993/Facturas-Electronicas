'use strict';
/**
 * FacturaCR v0.6.77 — Laboratorio RSA-SHA256 (NO ES XMLDSig/XAdES).
 * Prueba aislada, sin certificado del contribuyente y sin emisión.
 * Firma únicamente un XML SINTÉTICO fijo usando una clave RSA de 2048 bits
 * generada y descartada en memoria. Un verificador independiente puede
 * comprobar la firma con la clave pública devuelta a pruebas, jamás a React.
 * NO produce ds:Signature, SignedProperties, canonicalización ni XML fiscal.
 */
const {
 createHash, generateKeyPair, sign, verify, constants, randomBytes
}=require('node:crypto');
const {promisify}=require('node:util');
const {ANNEX_SAMPLE_SHA256_B64,POLICY_URL}=require('./fe-xades-policy.cjs');
const generateKeyPairAsync=promisify(generateKeyPair);
const LAB_XML='<?xml version="1.0" encoding="UTF-8"?><FacturaCRLaboratorio><Tipo>SIMULACION_NO_FISCAL</Tipo><Monto>100.00</Monto></FacturaCRLaboratorio>';

async function createLabProof(){
 const {privateKey,publicKey}=await generateKeyPairAsync('rsa',{
  modulusLength:2048,publicExponent:0x10001
 });
 // Las claves son objetos criptográficos nativos efímeros: no se exporta PEM privado.
 const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
 {
  const nonce=randomBytes(16).toString('hex');
  // Cada XML ficticio contiene un desafío aleatorio; los bytes firmados
  // constituyen XML bien formado, aunque NO están canonicalizados.
  const signedBytes=Buffer.from(LAB_XML.replace('</FacturaCRLaboratorio>',`<EnsayoId>${nonce}</EnsayoId></FacturaCRLaboratorio>`),'utf8');
  const signature=sign('RSA-SHA256',signedBytes,{key:privateKey,padding:constants.RSA_PKCS1_PADDING});
  const verified=verify('RSA-SHA256',signedBytes,{
   key:publicKeyPem,padding:constants.RSA_PKCS1_PADDING
  },signature);
  const changed=Buffer.from(signedBytes);
  changed[changed.length-1]^=1;
  const tamperRejected=!verify('RSA-SHA256',changed,{
   key:publicKeyPem,padding:constants.RSA_PKCS1_PADDING
  },signature);
  const corrupted=Buffer.from(signature);
  corrupted[0]^=1;
  const signatureTamperRejected=!verify('RSA-SHA256',signedBytes,{
   key:publicKeyPem,padding:constants.RSA_PKCS1_PADDING
  },corrupted);
  corrupted.fill(0);changed.fill(0);
  if(!verified||!tamperRejected||!signatureTamperRejected)
   throw Error('La prueba criptográfica local no superó los controles de integridad.');
  const summary={
   status:'laboratorio-correcto',method:'RSA-SHA256',rsaBits:2048,
   documentDigest:createHash('sha256').update(signedBytes).digest('hex').toUpperCase(),
   keyProofVerified:verified,changedContentRejected:tamperRejected,
   alteredSignatureRejected:signatureTamperRejected,
   referencePolicy:POLICY_URL,referencePolicyDigest:ANNEX_SAMPLE_SHA256_B64,
   signedDocument:false,xadesVerified:false,canSign:false,canIssue:false,
   note:'Ensayo sobre XML sintético con clave ficticia RSA. NO realiza XMLDSig, canonicalización, SignedProperties, firma del certificado real ni envío a Hacienda.'
  };
  // Testeable con OpenSSL de forma independiente; SOLO exportación interna.
  return {summary,publicKeyPem,signedBytes,signature};
 }
}
async function runLocalCryptoLab(){
 const proof=await createLabProof();
 try{return proof.summary;}
 finally{proof.signedBytes.fill(0);proof.signature.fill(0);}
}
module.exports={LAB_XML,createLabProof,runLocalCryptoLab};
