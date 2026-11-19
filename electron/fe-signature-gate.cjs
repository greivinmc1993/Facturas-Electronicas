'use strict';
/**
 * v0.6.75 — Barrera de seguridad de emisión.
 * Estas comprobaciones nunca habilitan la firma o el envío. El XML 4.4 actual
 * es un borrador con clave y consecutivo sintéticos. Una futura integración
 * deberá sustituir explícitamente el motor y su verificador XAdES, así como
 * validaciones fiscales y XSD con pruebas independientes.
 */
const POLICY_REQUIREMENTS=Object.freeze({
 profile:'XAdES-EPES v1.3.2 o superior',
 packaging:'ENVELOPED',
 publicKey:'RSA 2048 o 4096',
 signatureDigest:'SHA-256 o SHA-512',
 allowedMethods:Object.freeze(['RSA-SHA256','RSA-SHA512']),
 officialReference:'Anexo 2, estructuras de comprobantes electrónicos 4.4'
});
function signatureReadiness(report){
 const checked=!!report&&typeof report==='object';
 const checks=[
  {key:'p12',title:'Certificado PKCS#12 legible y vigente',ok:checked&&report.technicallyReady===true},
  {key:'keyProof',title:'Prueba local de correspondencia de clave privada',ok:checked&&report.keyPossession?.ok===true},
  {key:'trust',title:'Cadena de confianza y revocación verificadas',ok:false},
  {key:'identity',title:'Titular habilitado para la empresa ante Hacienda',ok:false},
  {key:'policy',title:'Política XAdES-EPES oficial identificada y validada',ok:false},
  {key:'xsd',title:'XML validado contra XSD oficial 4.4 y con numeración fiscal real',ok:false},
  {key:'engine',title:'Motor de firma XAdES y verificador independiente auditados',ok:false},
  {key:'hacienda',title:'Pruebas de aceptación en ambiente de Hacienda',ok:false}
 ];
 return {
  profile:POLICY_REQUIREMENTS.profile,packaging:POLICY_REQUIREMENTS.packaging,
  checks,canSign:false,canIssue:false,
  note:'El borrador XML contiene identificadores sintéticos. La inspección y el ensayo TLS no firman XML ni autorizan emisión.'
 };
}
module.exports={signatureReadiness,POLICY_REQUIREMENTS};
