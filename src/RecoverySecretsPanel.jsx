import React,{useEffect,useState} from 'react';
import {buildRecoveryCodesPdfHtml,recoveryCodesPdfFilename} from './recovery-codes-pdf.mjs';
// Controles de presentación de una sola vez. Nunca guardar en almacenamiento web.
export default function RecoverySecretsPanel({payload,onDone,title='Guarda tus códigos de emergencia',accountLabel=''}){
 const [ack,setAck]=useState(false);
 const [savingPdf,setSavingPdf]=useState(false);
 const [pdfMessage,setPdfMessage]=useState('');
 useEffect(()=>{setPdfMessage('');setAck(false)},[payload]);
 if(!payload)return null;
 const codes=payload.recoveryCodes||[];
 const kit=payload.emergencyKit;
 const saveCodesPdf=async()=>{
  if(savingPdf)return;
  setPdfMessage('');setSavingPdf(true);
  try{
   if(!window.facturacrReports?.savePdf)throw Error('Para guardar el PDF utiliza la aplicación de escritorio FacturaCR.');
   const html=buildRecoveryCodesPdfHtml(codes,{accountLabel});
   const saved=await window.facturacrReports.savePdf(html,recoveryCodesPdfFilename(),{landscape:false});
   if(saved?.success)setPdfMessage('PDF guardado. Verifica el archivo y guárdalo fuera de este equipo. No está cifrado.');
   else if(saved?.cancelled)setPdfMessage('Guardado cancelado. Los códigos siguen visibles en esta pantalla.');
   else throw Error(saved?.error||'No se pudo guardar el PDF.');
  }catch(error){setPdfMessage(error?.message||'No se pudo guardar el PDF.')}
  finally{setSavingPdf(false)}
 };
 const download=()=>{
  if(!kit?.fileContent)return;
  const blob=new Blob([kit.fileContent],{type:'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=kit.fileName||'FacturaCR-Rescate.fcr';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="recoverySecretsPanel" aria-label="Entrega única de secretos de recuperación" role="region">
  <strong>{title}</strong>
  <p>Estos secretos se muestran una sola vez. Guarda los tres códigos fuera de este equipo. Cada código solo sirve para una recuperación.</p>
  {codes.length>0&&<div className="recoveryCodesGrid">{codes.map((code,i)=><div className="recoverySecretRow" key={i}>
   <label>Código {i+1}<input readOnly autoComplete="off" value={code} onFocus={e=>e.target.select()}/></label>
   <button type="button" className="secondary recoverySecretButton" onClick={()=>navigator.clipboard?.writeText(code).catch(()=>{})}>Copiar</button>
  </div>)}</div>}
  {codes.length===3&&<div className="recoveryPdfActions">
   <button type="button" className="secondary" disabled={savingPdf} onClick={saveCodesPdf}>{savingPdf?'Guardando PDF…':'Guardar mis 3 códigos en PDF'}</button>
   <p className="hint">El PDF no está cifrado: conserva el archivo en un lugar seguro. Nunca incluye la clave ni el archivo extraordinarios del propietario.</p>
   {pdfMessage&&<p className="recoveryPdfFeedback" role="status" aria-live="polite">{pdfMessage}</p>}
  </div>}
  {kit&&<div className="recoveryKitContents">
   <strong>Kit extraordinario exclusivo del propietario</strong>
   <p>Guarda el archivo y su clave en lugares diferentes. Se necesitarán ambos para recuperar la cuenta del propietario si se pierden la contraseña y los tres códigos.</p>
   <div className="recoverySecretRow"><label>Clave extraordinaria<input readOnly autoComplete="off" value={kit.key} onFocus={e=>e.target.select()}/></label>
    <button type="button" className="secondary recoverySecretButton" onClick={()=>navigator.clipboard?.writeText(kit.key).catch(()=>{})}>Copiar clave</button></div>
   <button type="button" className="secondary recoveryKitDownload" onClick={download}>Guardar archivo .fcr</button>
  </div>}
  <label className="recoveryAcknowledge"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> Confirmo que guardé los códigos y, cuando corresponde, el archivo y la clave extraordinaria.</label>
  <button type="button" className="recoverySecretsDone" disabled={!ack} onClick={onDone}>Ya guardé mis secretos</button>
 </section>;
}
