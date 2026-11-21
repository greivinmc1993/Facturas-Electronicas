// El PDF inmutable archivado en SQLite es la fuente de verdad. Una segunda
// copia independiente se guarda en Documentos mediante Electron.
const base=(companyId,sessionId)=>`/api/companies/${Number(companyId)}/cash/closures/${Number(sessionId)}`;
const safeId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
async function metadata(companyId,sessionId){
 if(!safeId(companyId)||!safeId(sessionId))throw Error('Identificadores del cierre inválidos.');
 const response=await fetch(base(companyId,sessionId)+'/metadata',{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'No se pudieron consultar los datos del cierre.');
 return data;
}
function toBase64(arrayBuffer){
 const bytes=new Uint8Array(arrayBuffer);let result='';
 for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(result);
}
export async function fetchArchivedCashPdf(companyId,sessionId){
 const response=await fetch(base(companyId,sessionId)+'/pdf',{cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'El PDF de este cierre no está disponible.');}
 return await response.blob();
}
export async function saveCashClosureToComputer(companyId,sessionId){
 if(!window.facturacrReports?.saveCashClosureCopy)throw Error('La copia automática requiere la aplicación de escritorio Electron.');
 const meta=await metadata(companyId,sessionId);
 if(!meta.sha256)throw Error('El cierre todavía no tiene un PDF archivado.');
 const blob=await fetchArchivedCashPdf(companyId,sessionId);
 const result=await window.facturacrReports.saveCashClosureCopy({
  companyId:Number(companyId),sessionId:Number(sessionId),closedAt:meta.closedAt,
  closingUsername:meta.closingUsername,sha256:meta.sha256,pdfBase64:toBase64(await blob.arrayBuffer())
 });
 if(!result?.success)throw Error(result?.error||'No se pudo guardar el PDF en la computadora.');
 return result;
}
export async function archiveCashClosure(companyId,sessionId){
 if(!window.facturacrReports?.renderCashClosurePdf)throw Error('El PDF automático requiere FacturaCR de escritorio.');
 const id=Number(sessionId);
 if(!safeId(id))throw Error('Sesión inválida.');
 const meta=await metadata(companyId,id);
 let alreadyArchived=!!meta.sha256;
 if(!alreadyArchived){
  const response=await fetch(base(companyId,id)+'/report.html',{cache:'no-store'});
  if(!response.ok)throw Error('No fue posible preparar el reporte PDF del cierre.');
  const rendered=await window.facturacrReports.renderCashClosurePdf(await response.text());
  if(!rendered?.success)throw Error(rendered?.error||'No fue posible producir el PDF.');
  const stored=await fetch(base(companyId,id)+'/pdf',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfBase64:rendered.pdfBase64})
  });
  const result=await stored.json().catch(()=>({}));
  if(!stored.ok||!result.saved)throw Error(result.error||'No se pudo archivar el PDF en SQLite.');
  alreadyArchived=!!result.alreadyArchived;
 }
 try{
  const computer=await saveCashClosureToComputer(companyId,id);
  return {saved:true,alreadyArchived,computerSaved:true,computerPath:computer.path,computerAlreadyExists:computer.alreadyExists};
 }catch(e){
  // No revierte un cierre ya guardado ni un PDF archivado en SQLite.
  return {saved:true,alreadyArchived,computerSaved:false,computerError:e.message};
 }
}
export function cashClosurePdfFilename(companyId,sessionId){
 return `FacturaCR_Cierre_Caja_E${Number(companyId)}_S${Number(sessionId)}.pdf`;
}
