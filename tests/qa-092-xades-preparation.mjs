import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeSyntheticXadesLab,signaturePreparationStatus} from '../src/fe-xades-laboratory-status.mjs';
let total=0;
function check(title,fn){fn();total++;console.log('OK v0.6.92: '+title)}
const variants=['simple','servicio','mercaderia'];
const result={success:true,report:{integratedLabVerified:true,nonFiscal:true,usesRealCertificate:false,
 canSignFiscalXml:false,canIssue:false,canSend:false,verifiedCount:3,mutationsRejected:6,
 results:variants.map(variant=>({variant,sha256:'a'.repeat(64),references:2,mutationsRejected:2}))}};
check('Laboratorio XAdESjs completo reconoce 3 firmas y 6 alteraciones',()=>{
 const r=summarizeSyntheticXadesLab(result);assert.equal(r.status,'LAB_VERIFIED');assert.equal(r.verified,3);assert.equal(r.alterations,6);
 assert.equal(r.canIssue,false);assert.equal(r.canSign,false);assert.equal(r.canSend,false)
});
check('Laboratorio ausente no indica aprobado',()=>assert.equal(summarizeSyntheticXadesLab(null).status,'LAB_UNAVAILABLE'));
check('Error de laboratorio no se presenta como aprobado',()=>assert.equal(summarizeSyntheticXadesLab({success:false,error:'ruta privada'}).status,'LAB_UNAVAILABLE'));
check('Resultado incompleto queda bloqueado',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,verifiedCount:2}}).status,'LAB_UNVERIFIED'));
check('Falla una referencia no se considera firmado',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,results:result.report.results.map((x,i)=>i===0?{...x,references:1}:x)}}).status,'LAB_UNVERIFIED'));
check('Se rechaza alteración no detectada',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,mutationsRejected:5}}).status,'LAB_UNVERIFIED'));
check('Un certificado real supuesto impide tratar el laboratorio como válido',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,usesRealCertificate:true}}).status,'LAB_UNVERIFIED'));
check('Una bandera de emisión positiva impide aprobar el ensayo',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,canIssue:true}}).status,'LAB_UNVERIFIED'));
check('Se exigen huellas SHA-256 para los tres ensayos',()=>assert.equal(summarizeSyntheticXadesLab({success:true,report:{...result.report,results:[{...result.report.results[0],sha256:'mal'},...result.report.results.slice(1)]}}).status,'LAB_UNVERIFIED'));
check('Borrador sin XSD local no se marca listo',()=>assert.equal(signaturePreparationStatus({draftReady:true}).localPreSign,false));
check('Solo falta Signature se registra como diagnóstico, no como homologación',()=>{
 const s=signaturePreparationStatus({draftReady:true,xsdResult:{status:'DOES_NOT_MATCH_LOCAL_XSD',preSignature:{status:'ONLY_SIGNATURE_PENDING'}},labResult:summarizeSyntheticXadesLab(result)});
 assert.equal(s.localPreSign,true);assert.equal(s.engine,true);assert.equal(s.officialXsdVerified,false);assert.equal(s.canIssue,false);
});
check('Errores de XSD adicionales impiden el estado de pre-firma',()=>{
 assert.equal(signaturePreparationStatus({xsdResult:{status:'DOES_NOT_MATCH_LOCAL_XSD',preSignature:{status:'OTHER_XSD_ERRORS'}}}).localPreSign,false);
});
check('Coincidencia con XSD arbitrario no suple validación oficial',()=>assert.equal(signaturePreparationStatus({xsdResult:{status:'MATCHES_LOCAL_XSD'}}).officialXsdVerified,false));
check('Nunca se habilita firma fiscal ni envío con evidencia simulada',()=>{
 const s=signaturePreparationStatus({draftReady:true,xsdResult:{status:'DOES_NOT_MATCH_LOCAL_XSD',preSignature:{status:'ONLY_SIGNATURE_PENDING'}},labResult:summarizeSyntheticXadesLab(result)});
 for(const k of ['certificateVerified','policyVerified','signedDocumentVerified','fiscalKeyVerified','haciendaAccepted','canSignFiscalXml','canIssue','canSend'])assert.equal(s[k],false,k);
});
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const preload=readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const main=readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
check('La UI presenta ensayo de laboratorio y bloqueos explícitos',()=>{
 assert.match(ui,/Preparación de firma XAdES-EPES/);assert.match(ui,/Firma fiscal: bloqueada · Envío: bloqueado/);
 assert.match(ui,/signLabResult/);assert.match(css,/feXadesPreparation/)
});
check('La UI invoca el laboratorio sin adjuntar XML o certificado',()=>{
 assert.match(ui,/window\.facturacrSignature\.runIntegratedXadesLab\(\)/);
 assert.match(preload,/runIntegratedXadesLab:\(\)=>ipcRenderer\.invoke\('facturacr:xades-integrated-lab'\)/);
 assert.match(main,/ipcMain\.handle\('facturacr:xades-integrated-lab',async event=>/);
});
check('El laboratorio XAdESjs mantiene controles de origen de ventana y concurrencia',()=>{
 assert.match(main,/if\(!authorizedCertificateFrame\(event\)\)return/);
 assert.match(main,/if\(integratedXadesRunning\)return/)
});
check('El proyecto se identifica como v0.6.92',()=>{
 const p=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const l=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
 assert.equal(p.version,'0.6.92');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version)
});
console.log(`QA preparación XAdES v0.6.92: ${total}/${total} controles aprobados. SOLO laboratorio, sin firmas fiscales.`);
