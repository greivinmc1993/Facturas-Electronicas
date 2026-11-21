import React,{useState} from 'react';
// Controles de presentación de una sola vez. Nunca guardar en almacenamiento web.
export default function RecoverySecretsPanel({payload,onDone,title='Guarda tus códigos de emergencia'}){
 const [ack,setAck]=useState(false);
 if(!payload)return null;
 const codes=payload.recoveryCodes||[];
 const kit=payload.emergencyKit;
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
   <button type="button" className="secondary" onClick={()=>navigator.clipboard?.writeText(code).catch(()=>{})}>Copiar</button>
  </div>)}</div>}
  {kit&&<div className="recoveryKitContents">
   <strong>Kit extraordinario exclusivo del propietario</strong>
   <p>Guarda el archivo y su clave en lugares diferentes. Se necesitarán ambos para recuperar la cuenta del propietario si se pierden la contraseña y los tres códigos.</p>
   <div className="recoverySecretRow"><label>Clave extraordinaria<input readOnly autoComplete="off" value={kit.key} onFocus={e=>e.target.select()}/></label>
    <button type="button" className="secondary" onClick={()=>navigator.clipboard?.writeText(kit.key).catch(()=>{})}>Copiar clave</button></div>
   <button type="button" className="secondary" onClick={download}>Guardar archivo .fcr</button>
  </div>}
  <label className="recoveryAcknowledge"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> Confirmo que guardé los códigos y, cuando corresponde, el archivo y la clave extraordinaria.</label>
  <button type="button" disabled={!ack} onClick={onDone}>Ya guardé mis secretos</button>
 </section>;
}
