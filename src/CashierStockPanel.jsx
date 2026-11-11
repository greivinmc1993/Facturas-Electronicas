import React,{useCallback,useEffect,useState} from 'react';
import {useConfirm} from './ConfirmProvider.jsx';

// Kardex operativo: registro y consulta de existencias, nunca costos ni valoración.
const initialFilters={search:'',productId:'',type:'all',from:'',to:''};
const fmt=n=>Number(n||0).toLocaleString('es-CR',{maximumFractionDigits:2});
async function jsonFrom(response){const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar el inventario.');return data;}
export default function CashierStockPanel({companyId}){
 const confirmAction=useConfirm();
 const [products,setProducts]=useState([]),[productId,setProductId]=useState(''),[kind,setKind]=useState('entrada');
 const [quantity,setQuantity]=useState(''),[reason,setReason]=useState('Ingreso de mercadería'),[notes,setNotes]=useState('');
 const [filters,setFilters]=useState(initialFilters),[page,setPage]=useState(1),[history,setHistory]=useState(null),[revision,setRevision]=useState(0);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const loadProducts=useCallback(async()=>{
  if(!companyId){setProducts([]);return []}
  const data=await jsonFrom(await fetch(`/api/companies/${companyId}/products`,{cache:'no-store'}));
  const rows=data.filter(p=>p.kind==='producto'&&Number(p.track_stock)===1&&!p.is_deleted);
  setProducts(rows);return rows;
 },[companyId]);
 useEffect(()=>{setProducts([]);setProductId('');setHistory(null);setFilters(initialFilters);setPage(1);setError('');setMessage('');loadProducts().catch(e=>setError(e.message));},[companyId,loadProducts]);
 useEffect(()=>{
  if(!companyId)return;
  const controller=new AbortController();setLoading(true);
  const params=new URLSearchParams({...filters,page:String(page)});
  fetch(`/api/companies/${companyId}/inventory/kardex/operativo?${params}`,{signal:controller.signal,cache:'no-store'})
   .then(jsonFrom).then(setHistory).catch(e=>{if(e.name!=='AbortError')setError(e.message)})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[companyId,filters,page,revision]);
 const product=products.find(x=>x.id===Number(productId));
 const before=Number(product?.stock||0),amount=Number(quantity);
 const valid=quantity.trim()!==''&&Number.isSafeInteger(amount)&&amount>=(kind==='ajuste'?0:1)&&amount<=1e9;
 const after=product&&valid?(kind==='entrada'?before+amount:amount):null;
 const canSave=!!product&&valid&&after!==before&&after<=1e9&&reason.trim().length>=5&&reason.trim().length<=120;
 const refresh=async()=>{
  setError('');setMessage('');setLoading(true);
  try{await loadProducts();setRevision(n=>n+1);setMessage('Inventario y movimientos actualizados correctamente.');}
  catch(e){setError(e.message)}finally{setLoading(false)}
 };
 const submit=async e=>{
  e.preventDefault();setError('');setMessage('');
  if(!canSave)return setError('Selecciona un artículo, una cantidad válida y un motivo de al menos 5 caracteres.');
  if(!await confirmAction(`${kind==='entrada'?'Entrada de mercadería':'Ajuste por conteo físico'}: ${product.description}. Existencia final: ${after}.`,{title:'Confirmar movimiento de inventario',confirmLabel:'Registrar movimiento'}))return;
  setBusy(true);
  try{
   const recorded=await jsonFrom(await fetch(`/api/companies/${companyId}/inventory/movements`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:product.id,movement_type:kind,quantity:amount,reason:reason.trim(),notes:notes.trim()})
   }));
   setMessage(`Movimiento #${recorded.id} registrado. Existencia final: ${fmt(recorded.stock_after)} unidades.`);
   setQuantity('');setNotes('');await loadProducts();setPage(1);setRevision(n=>n+1);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const update=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(1)};
 const exportReport=async format=>{
  if(!companyId||exporting)return;setError('');setMessage('');setExporting(true);
  const params=new URLSearchParams(filters);
  try{
   const extension=format==='pdf'?'html':'csv';
   const response=await fetch(`/api/companies/${companyId}/inventory/kardex/operativo/export.${extension}?${params}`);
   if(!response.ok){const d=await response.json().catch(()=>({}));throw Error(d.error||'No se pudo exportar el reporte.');}
   const filename=`FacturaCR_Kardex_Operativo_${companyId}`;
   if(format==='pdf'){
    if(!window.facturacrReports?.savePdf)throw Error('El guardado del PDF requiere abrir FacturaCR en Electron.');
    const saved=await window.facturacrReports.savePdf(await response.text(),filename+'.pdf',{landscape:true});
    if(!saved?.success&&!saved?.cancelled)throw Error(saved?.error||'No se pudo guardar el PDF.');
    if(saved?.success)setMessage('Reporte PDF guardado correctamente.');
   }else{
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename+'.csv';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('CSV de movimientos preparado para Excel.');
   }
  }catch(e){setError(e.message)}finally{setExporting(false)}
 };
 if(!companyId)return <section className="card">Selecciona una empresa para consultar el Kardex operativo.</section>;
 const rows=history?.rows||[],summary=history?.summary||{count:0,increases:0,decreases:0,products:0};
 return <div className="cashierKardexWorkspace">
  <section className="card cashierKardexIntro">
   <div><small className="kardexEyebrow">INVENTARIO OPERATIVO</small><h3>Kardex · Movimientos</h3><p className="hint">Registra entradas, ajusta las unidades del conteo físico, revisa el historial y genera reportes. Los costos y la valoración permanecen reservados.</p></div>
   <button type="button" className="secondary" onClick={refresh} disabled={loading||busy}>{loading?'Actualizando…':'Actualizar inventario y movimientos'}</button>
  </section>
  {message&&<p className="notice" role="status">{message}</p>}{error&&<p role="alert" className="authError">{error}</p>}
  <section className="card cashierInventory"><h3>Registrar movimiento</h3>
   <form onSubmit={submit}><div className="cashierInventoryGrid">
    <label>Artículo<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Seleccionar producto…</option>{products.map(x=><option key={x.id} value={x.id}>{x.description} · {x.product_code||'sin SKU'}</option>)}</select></label>
    <label>Operación<select value={kind} onChange={e=>{setKind(e.target.value);setReason(e.target.value==='entrada'?'Ingreso de mercadería':'Conteo físico')}}><option value="entrada">Entrada de mercadería (+)</option><option value="ajuste">Ajustar existencias (conteo final)</option></select></label>
    <label>{kind==='ajuste'?'Unidades contadas (saldo final)':'Unidades recibidas'}<input type="number" min={kind==='ajuste'?'0':'1'} max="1000000000" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label>Motivo<input required minLength={5} maxLength={120} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   </div><label>Observaciones o referencia<input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Factura de proveedor, conteo de estantería…"/></label>
   <div className="inventoryAdjustmentPreview"><strong>Comprobar antes de registrar</strong><span>Existencia actual: <b>{product?fmt(before):'—'}</b></span><span>Variación: <b>{after===null?'—':(after-before>0?'+':'')+fmt(after-before)}</b></span><span>Existencia final: <b>{after===null?'—':fmt(after)}</b></span></div>
   <div className="actions"><button type="submit" disabled={busy||!canSave}>{busy?'Guardando…':'Registrar movimiento'}</button></div>
   </form>
  </section>
  <section className="card cashierKardexHistory">
   <div className="cashierKardexHistoryHead"><div><h3>Historial y reportes</h3><p className="hint">Solo movimientos de inventario, sin importes de compra. Los filtros también se aplican a CSV y PDF.</p></div><div className="actions"><button className="secondary" disabled={exporting||loading} type="button" onClick={()=>exportReport('csv')}>Exportar CSV</button><button disabled={exporting||loading} type="button" onClick={()=>exportReport('pdf')}>{exporting?'Preparando…':'Guardar PDF'}</button></div></div>
   <div className="cashierKardexStats"><article><span>Movimientos</span><strong>{fmt(summary.count)}</strong></article><article><span>Unidades añadidas</span><strong>+{fmt(summary.increases)}</strong></article><article><span>Unidades retiradas</span><strong>−{fmt(summary.decreases)}</strong></article><article><span>Artículos</span><strong>{fmt(summary.products)}</strong></article></div>
   <div className="cashierKardexFilters"><label>Buscar artículo, SKU o motivo<input value={filters.search} maxLength={100} placeholder="Buscar movimiento…" onChange={e=>update('search',e.target.value)}/></label>
   <label>Artículo<select value={filters.productId} onChange={e=>update('productId',e.target.value)}><option value="">Todos</option>{products.map(p=><option key={p.id} value={p.id}>{p.description}</option>)}</select></label>
   <label>Tipo<select value={filters.type} onChange={e=>update('type',e.target.value)}><option value="all">Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas de ventas</option><option value="ajuste">Ajustes</option></select></label>
   <label>Desde<input type="date" max={filters.to||undefined} value={filters.from} onChange={e=>update('from',e.target.value)}/></label>
   <label>Hasta<input type="date" min={filters.from||undefined} value={filters.to} onChange={e=>update('to',e.target.value)}/></label>
   <button type="button" className="secondary" onClick={()=>{setFilters(initialFilters);setPage(1)}}>Limpiar filtros</button></div>
   <div className="auditTableWrap"><table><thead><tr><th>Fecha UTC</th><th>Artículo / SKU</th><th>Operación</th><th>Variación</th><th>Antes</th><th>Después</th><th>Motivo</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.created_at}</td><td><strong>{r.product_name}</strong><small>{r.product_code||'Sin SKU'}</small></td><td>{r.movement_type==='entrada'?'Entrada':r.movement_type==='ajuste'?'Ajuste':'Salida'}</td><td><strong>{r.delta>0?'+':''}{fmt(r.delta)}</strong></td><td>{fmt(r.stock_before)}</td><td>{fmt(r.stock_after)}</td><td>{r.reason}{r.notes&&<small>{r.notes}</small>}</td></tr>)}{!loading&&!rows.length&&<tr><td colSpan="7">No hay movimientos con estos filtros.</td></tr>}</tbody></table></div>
   <div className="auditPagination"><span>{loading?'Consultando…':`${summary.count} movimiento(s) · Página ${page} de ${history?.totalPages||1}`}</span><div className="actions"><button type="button" className="secondary" disabled={page<=1||loading} onClick={()=>setPage(x=>x-1)}>Anterior</button><button type="button" className="secondary" disabled={page>=(history?.totalPages||1)||loading} onClick={()=>setPage(x=>x+1)}>Siguiente</button></div></div>
  </section>
 </div>;
}
