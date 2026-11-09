import React,{useEffect,useRef,useState} from 'react';
const currency=n=>'₡'+(Number(n||0)/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
const categories=['Compra menor','Transporte','Servicios','Mantenimiento','Otros'];
export default function CashPanel({companyId,company,isCashier=false}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [opening,setOpening]=useState('0'),[openingNote,setOpeningNote]=useState('');
 const [expense,setExpense]=useState({category:'Compra menor',description:'',amount:''});
 const [counted,setCounted]=useState(''),[closingNote,setClosingNote]=useState('');
 const [confirmClose,setConfirmClose]=useState(false),[selected,setSelected]=useState('');
 const submitting=useRef(false);
 const fetchCash=async(signal)=>{
   const r=await fetch(`/api/companies/${companyId}/cash`,{signal});const j=await r.json();
   if(!r.ok)throw Error(j.error||'No se pudo consultar la caja.');return j;
 };
 useEffect(()=>{
   setData(null);setError('');setNotice('');setSelected('');setConfirmClose(false);
   if(!companyId)return;
   const ctrl=new AbortController();setLoading(true);
   fetchCash(ctrl.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!ctrl.signal.aborted)setLoading(false)});
   return()=>ctrl.abort();
 },[companyId]);
 const refresh=async()=>{if(!companyId||busy)return;setLoading(true);setError('');try{setData(await fetchCash())}catch(e){setError(e.message)}finally{setLoading(false)}};
 const post=async(path,body,success)=>{
   if(busy||submitting.current)return;submitting.current=true;setBusy(true);setError('');setNotice('');
   try{
     const r=await fetch(`/api/companies/${companyId}/cash/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
     const j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo completar la operación.');
     setData(j);setSelected('');setConfirmClose(false);setNotice(success);
     if(path==='expenses')setExpense({category:'Compra menor',description:'',amount:''});
     if(path==='close'){setCounted('');setClosingNote('')}
   }catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}
 };
 const active=data?.active;
 const chosen=data?.history?.find(x=>String(x.id)===selected)||active||data?.history?.[0];
 const exp=chosen?.id===data?.selected_id?data?.expenses||[]:[];
 const exportReport=async(format)=>{
   if(!chosen||busy)return;setBusy(true);setError('');
   try{
    const path=`/api/companies/${companyId}/cash/export.${format==='pdf'?'html':'csv'}?sessionId=${chosen.id}`;
    const r=await fetch(path);if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.error||'No se pudo generar el reporte.')}
    const filename=`FacturaCR_caja_empresa_${companyId}_sesion_${chosen.id}`;
    if(format==='pdf'){
      if(!window.facturacrReports?.savePdf)throw Error('El PDF requiere la versión de escritorio de FacturaCR.');
      const result=await window.facturacrReports.savePdf(await r.text(),filename+'.pdf',{landscape:true});
      if(!result?.success&&!result?.cancelled)throw Error(result?.error||'Error al guardar el PDF.');
      if(result?.success)setNotice('Reporte PDF guardado correctamente.');
    }else{
      const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=filename+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setNotice('CSV generado.');
    }
   }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 if(!companyId)return <section className="card">Selecciona una empresa para administrar su caja.</section>;
 const total=active?.summary;
 return <div className="cashWorkspace">
   <section className="card cashHero"><div><small className="cashEyebrow">CONTROL DE EFECTIVO · DATOS LOCALES</small><h3>Caja y gastos · {company?.trade_name||company?.legal_name||'Empresa'}</h3><p className="hint">Controla el efectivo de una sesión: fondo inicial + cobros en efectivo de ventas activas − gastos registrados. Tarjetas y SINPE se mantienen fuera de este cálculo.</p></div><button type="button" className="secondary" disabled={loading||busy} onClick={refresh}>↻ Actualizar</button></section>
   {error&&<p className="notice" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   {loading&&!data&&<p className="hint">Cargando caja…</p>}
   {active?<>
     <section className="cashMetrics">
      <article><small>Fondo inicial</small><strong>{currency(active.opening_cents)}</strong></article>
      <article><small>Cobros en efectivo</small><strong className="cashPositive">{currency(total?.received_cents)}</strong><small>{total?.received_count||0} movimiento(s)</small></article>
      <article><small>Gastos en efectivo</small><strong className="cashNegative">−{currency(total?.expense_cents)}</strong><small>{total?.expense_count||0} gasto(s)</small></article>
      <article><small>Efectivo esperado</small><strong>{currency(total?.expected_cents)}</strong></article>
     </section>
     <section className="cashColumns">{!isCashier&&<div className="card"><h3>Registrar gasto</h3><p className="hint">Solo gastos pagados en efectivo desde la caja abierta; no se descuenta inventario.</p>
      <form onSubmit={e=>{e.preventDefault();post('expenses',expense,'Gasto registrado en esta sesión.')}}>
       <label className="field">Categoría<select value={expense.category} onChange={e=>setExpense(p=>({...p,category:e.target.value}))}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
       <label className="field">Descripción<input required minLength="3" maxLength="250" value={expense.description} onChange={e=>setExpense(p=>({...p,description:e.target.value}))} placeholder="Ej.: Compra de bolsas"/></label>
       <label className="field">Monto en colones (₡)<input required type="number" min="0.01" max="1000000000" step="0.01" value={expense.amount} onChange={e=>setExpense(p=>({...p,amount:e.target.value}))} placeholder="Ej.: 1500"/></label>
       <button disabled={busy} type="submit">{busy?'Procesando…':'Registrar gasto'}</button>
      </form>
     </div>}<div className="card"><h3>Cerrar caja</h3><p className="hint">Cuenta físicamente el dinero antes de cerrar. La diferencia se guarda y no modifica las ventas.</p>
      <form onSubmit={e=>{e.preventDefault();setConfirmClose(true)}}>
       <label className="field">Efectivo contado (₡)<input required type="number" min="0" max="1000000000" step="0.01" value={counted} onChange={e=>setCounted(e.target.value)} placeholder="Importe contado"/></label>
       <label className="field">Observaciones (opcional)<textarea maxLength="300" rows="2" value={closingNote} onChange={e=>setClosingNote(e.target.value)}/></label>
       <button type="submit" className="secondary" disabled={busy}>Revisar cierre</button>
      </form>
      {confirmClose&&<div className="cashConfirm" role="group" aria-label="Confirmar cierre"><strong>Confirmar cierre de caja</strong><p>Esperado: {currency(total?.expected_cents)} · Contado: {currency(Number(counted)*100)} · Diferencia: {currency(Number(counted)*100-(total?.expected_cents||0))}</p><div className="actions"><button type="button" disabled={busy} onClick={()=>post('close',{counted_amount:counted,note:closingNote},'Caja cerrada correctamente. La diferencia quedó guardada.')}>Confirmar cierre</button><button type="button" className="secondary" disabled={busy} onClick={()=>setConfirmClose(false)}>Cancelar</button></div></div>}
     </div></section>
   </>:data?.otherCashOpen?<section className="card cashOpening"><h3>Caja ocupada</h3><p>Hay una caja abierta por otro usuario. No puedes operar ni cerrar su turno. Contacta al supervisor.</p></section>:<section className="card cashOpening"><h3>Abrir nueva caja</h3><p className="hint">Ingresa el fondo físico con el que empiezas el turno. Solo puede existir una caja abierta por empresa.</p>
     <form onSubmit={e=>{e.preventDefault();post('open',{opening_amount:opening,note:openingNote},'Caja abierta correctamente.')}}>
      <label className="field">Fondo inicial en efectivo (₡)<input required type="number" min="0" max="1000000000" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label>
      <label className="field">Nota de apertura (opcional)<textarea maxLength="300" rows="2" value={openingNote} onChange={e=>setOpeningNote(e.target.value)}/></label>
      <button disabled={busy} type="submit">{busy?'Procesando…':'Abrir caja'}</button>
     </form></section>}
   {data?.history?.length>0&&<section className="card"><div className="cashHistoryHeading"><div><h3>Sesiones y reportes</h3><p className="hint">El historial guarda cierres y diferencias; los cobros se calculan sobre ventas que siguen activas.</p></div>{!isCashier&&<div className="actions"><button className="secondary" type="button" disabled={busy} onClick={()=>exportReport('csv')}>Exportar CSV</button><button type="button" disabled={busy} onClick={()=>exportReport('pdf')}>Guardar PDF</button></div>}</div>
    <label className="field">Sesión<select value={selected||String(active?.id||data.history[0].id)} onChange={e=>setSelected(e.target.value)}>{data.history.map(s=><option key={s.id} value={s.id}>#{s.id} · {s.status} · {s.opened_at} UTC</option>)}</select></label>
    <div className="cashSessionStats"><span>Apertura: {chosen?.opened_at} UTC</span><span>Estado: <strong>{chosen?.status}</strong></span>{chosen?.status==='cerrada'&&<><span>Contado: <strong>{currency(chosen.counted_cents)}</strong></span><span>Diferencia guardada: <strong>{currency(chosen.difference_cents)}</strong></span></>}</div>
    {chosen?.id!==data.selected_id?<p className="hint">Selecciona la sesión activa o la última sesión para consultar los gastos en pantalla. Las exportaciones incluyen los gastos de cualquier sesión seleccionada.</p>:<div className="movementHistory"><table><thead><tr><th>Fecha UTC</th><th>Categoría</th><th>Descripción</th><th>Importe</th></tr></thead><tbody>{exp.map(e=><tr key={e.id}><td>{e.created_at}</td><td>{e.category}</td><td>{e.description}</td><td>{currency(e.amount_cents)}</td></tr>)}{!exp.length&&<tr><td colSpan="4">Sin gastos registrados en esta sesión.</td></tr>}</tbody></table></div>}
   </section>}
   <p className="hint">Nota: anulaciones posteriores pueden cambiar el cálculo de cobros históricos activos. El importe y la diferencia de cierre se conservan como fotografía al cerrar. Para una conciliación contable completa deben registrarse también devoluciones de efectivo.</p>
 </div>;
}
