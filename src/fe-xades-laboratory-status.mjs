/**
 * v0.6.92 — Estado legible del ENSAYO XAdESjs, sin recibir XML comercial.
 * Nunca transforma este reporte en autorización de firma o de emisión fiscal.
 */
const VARIANTS = Object.freeze(['simple','servicio','mercaderia']);
const SHA256 = /^[a-f0-9]{64}$/;
export function summarizeSyntheticXadesLab(result) {
 if (result?.success !== true) return Object.freeze({status:'LAB_UNAVAILABLE',
   message:'El ensayo XAdESjs no se completó. Ejecuta el QA del motor e inspecciona sus dependencias.',
   verified:0,alterations:0,nonFiscal:true,canSign:false,canIssue:false,canSend:false});
 const r = result.report;
 const verified = r?.integratedLabVerified === true && r?.nonFiscal === true &&
  r?.usesRealCertificate === false && r?.canSignFiscalXml === false &&
  r?.canIssue === false && r?.canSend === false &&
  r?.verifiedCount === 3 && r?.mutationsRejected === 6 &&
  Array.isArray(r?.results) && r.results.length === 3 &&
  VARIANTS.every((variant,i)=>r.results[i]?.variant === variant &&
   SHA256.test(r.results[i]?.sha256 ?? '') && r.results[i]?.references === 2 &&
   r.results[i]?.mutationsRejected === 2);
 return Object.freeze({status:verified?'LAB_VERIFIED':'LAB_UNVERIFIED',
  message:verified?'3 documentos FICTICIOS firmados y comprobados; 6 alteraciones rechazadas. No se firmó tu factura.':'El laboratorio devolvió resultados incompletos o inconsistentes: la comprobación no está aprobada.',
  verified:verified?3:0,alterations:verified?6:0,nonFiscal:true,
  canSign:false,canIssue:false,canSend:false});
}
export function signaturePreparationStatus({draftReady=false,xsdResult=null,labResult=null}={}) {
 const localPreSign= xsdResult?.preSignature?.status === 'ONLY_SIGNATURE_PENDING' &&
   xsdResult?.status === 'DOES_NOT_MATCH_LOCAL_XSD';
 const engine=labResult?.status === 'LAB_VERIFIED';
 return Object.freeze({
  draftReady:draftReady===true,
  localPreSign,
  engine,
  // Estas aprobaciones no están presentes; nunca se derivan de un laboratorio.
  certificateVerified:false,policyVerified:false,signedDocumentVerified:false,
  fiscalKeyVerified:false,officialXsdVerified:false,haciendaAccepted:false,
  canSignFiscalXml:false,canIssue:false,canSend:false,
  warning:'El laboratorio no utiliza certificados ni XML de usuarios; tampoco valida la política oficial, la firma de un comprobante ni Hacienda.'
 });
}
