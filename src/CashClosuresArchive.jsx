import React,{useEffect,useState} from 'react';
import {archiveCashClosure,fetchArchivedCashPdf,cashClosurePdfFilename,saveCashClosureToComputer} from './cash-closure-archive.mjs';
const money=n=>'₡'+(Number(n||0)/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function CashClosuresArchive({companyId,revision=0}){
 const [rows,setRows]=useState([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [folder,setFolder]=useState(null);
 const load=async(nextOffset=0,append=false,signal)=>{
  setLoading(true);setError('');
  try{
   const response=await fetch(`/api/companies/${companyId}/cash/closures?offset=${nextOffset}`,{signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo consultar el historial de cierres.');
   setRows(old=>append?[...old,...result.items.filter(s=>!old.some(x=>x.id===s.id))]:result.items);
   setOffset(result.nextOffset);setMore(result.hasMore);
  }catch(e){if(e.name!=='AbortError')setError(e.message)}finally{if(!signal?.aborted)setLoading(false)}
 };
 useEffect(()=>{const controller=new AbortController();setRows([]);setMore(false);load(0,false,controller.signal);return()=>controller.abort()},[companyId,revision]);
 const loadFolder=async()=>{if(window.facturacrReports?.cashClosureFolder){const result=await window.facturacrReports.cashClosureFolder();if(result?.success)setFolder(result)}};
 useEffect(()=>{loadFolder()},[companyId]);
 const run=async(fn)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const open=async(id)=>run(async()=>{
  if(!window.facturacrReports?.openCashClosurePdf)throw Error('La consulta de PDF requiere la aplicación de escritorio.');
  const blob=await fetchArchivedCashPdf(companyId,id);
  const raw=await blob.arrayBuffer();const bytes=new Uint8Array(raw);
  let ascii='';for(let i=0;i<bytes.length;i+=32768)ascii+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const result=await window.facturacrReports.openCashClosurePdf(btoa(ascii),Number(companyId),Number(id));
  if(!result?.success)throw Error(result?.error||'No se pudo abrir el PDF.');
  setNotice(`Se abrió el PDF del cierre #${id} con el visor de tu equipo.`);
 });
 const download=async(id)=>run(async()=>{
  const blob=await fetchArchivedCashPdf(companyId,id);
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=cashClosurePdfFilename(companyId,id);document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice(`Descarga solicitada para el cierre #${id}.`);
 });
 const create=async(id)=>run(async()=>{
  const saved=await archiveCashClosure(companyId,id);await load(0,false);
  if(saved.computerSaved)setNotice(`PDF del cierre #${id} archivado en SQLite y guardado en tu PC: ${saved.computerPath}`);
  else{setNotice(`PDF del cierre #${id} archivado en SQLite.`);setError('Copia en la PC pendiente: '+saved.computerError)}
 });
 const savePC=async(id)=>run(async()=>{
  const stored=await saveCashClosureToComputer(companyId,id);
  setNotice(stored.alreadyExists?'Ya existe la misma copia del cierre en: '+stored.path:'PDF guardado en tu computadora: '+stored.path);
 });
 const folderAction=async(action)=>run(async()=>{
  const handler=window.facturacrReports?.[action];if(!handler)throw Error('Esta opción requiere FacturaCR de escritorio.');
  const result=await handler();if(result?.cancelled)return;
  if(!result?.success)throw Error(result?.error||'No fue posible actualizar la carpeta.');
  await loadFolder();setNotice(action==='openCashClosureFolder'?'Carpeta de cierres abierta.':'Carpeta de cierres actualizada.');
 });
 return <section className="card cashClosureArchive" aria-label="Historial de PDF de cierres de caja">
  <div className="cashClosureArchiveHeading"><div><h3>Historial de PDF de cierres de caja</h3><p className="hint">Cada cierre se archiva en SQLite y se guarda como PDF en tu computadora, por mes y con el usuario y día en el nombre. Si la carpeta falla, puedes reintentar sin repetir el cierre.</p></div><button className="secondary" type="button" disabled={busy||loading} onClick={()=>load(0,false)}>Actualizar</button></div>
  <div className="cashClosureFolderSettings">
   <div className="cashClosureFolderDescription"><strong>Carpeta de PDF en esta computadora</strong><small title={folder?.directory||''}>{folder?.directory||'Documentos / FacturaCR / Cierres de caja'}</small></div>
   <div className="cashArchiveButtons">
    <button type="button" className="secondary" disabled={busy} onClick={()=>folderAction('chooseCashClosureFolder')}>Elegir carpeta</button>
    <button type="button" className="secondary" disabled={busy||folder?.mode==='default'} onClick={()=>folderAction('defaultCashClosureFolder')}>Usar Documentos</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>folderAction('openCashClosureFolder')}>Abrir carpeta</button>
   </div>
  </div>
  {error&&<p className="notice" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  <div className="cashArchiveTableWrap"><table><thead><tr><th>Sesión</th><th>Usuario</th><th>Cierre (UTC)</th><th>Contado</th><th>Diferencia</th><th>PDF archivado</th><th>Acciones</th></tr></thead><tbody>
   {rows.map(s=><tr key={s.id}><td>#{s.id}</td><td>{s.closing_username||'Usuario'}</td><td>{s.closed_at}</td><td>{money(s.counted_cents)}</td><td>{money(s.difference_cents)}</td><td><span className={s.pdf_created_at?'cashArchivedYes':'cashArchivedNo'}>{s.pdf_created_at?'Disponible':'Pendiente'}</span></td><td><div className="cashArchiveButtons">{s.pdf_created_at?<><button type="button" className="secondary" disabled={busy} onClick={()=>open(s.id)}>Consultar PDF</button><button type="button" className="secondary" disabled={busy} onClick={()=>download(s.id)}>Descargar PDF</button><button type="button" className="secondary" disabled={busy} onClick={()=>savePC(s.id)}>Guardar en PC</button></>:<button type="button" disabled={busy} onClick={()=>create(s.id)}>Generar PDF pendiente</button>}</div></td></tr>)}
   {!rows.length&&!loading&&<tr><td colSpan="7">Aún no hay cierres de caja registrados para esta empresa y usuario.</td></tr>}
  </tbody></table></div>
  <div className="cashArchiveFooter"><small>Los documentos permanecen en SQLite aunque se desconecte una unidad externa. «Guardar en PC» reconstruye la copia sin sobrescribir un archivo diferente.</small>{more&&<button type="button" className="secondary" disabled={busy||loading} onClick={()=>load(offset,true)}>Mostrar más cierres</button>}</div>
 </section>;
}
