import React,{useEffect,useState} from 'react';
import {csvExcelBlob,csvSafeCell} from './csv-export.js';
import {auditLabels,auditCategories,auditCostaRica,auditDetail,auditActor,auditCompany,auditColumns,auditPdfHtml} from './audit-presentation.js';
export default function AuditPanel(){
 const [users,setUsers]=useState([]),[companies,setCompanies]=useState([]),[filters,setFilters]=useState({userId:'',companyId:'',category:'',from:'',to:''});
 const [page,setPage]=useState(1),[result,setResult]=useState({rows:[],total:0,pageSize:50}),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const update=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(1)};
 const refresh=async()=>{
  setLoading(true);setError('');
  try{const params=new URLSearchParams({...filters,page:String(page)});const response=await fetch('/api/auth/audit?'+params);const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la auditoría.');setResult(data)}catch(e){setError(e.message)}finally{setLoading(false)}
 };
 useEffect(()=>{Promise.all([fetch('/api/auth/audit/actors').then(r=>r.json()),fetch('/api/companies').then(r=>r.json())]).then(([u,c])=>{if(Array.isArray(u))setUsers(u);if(Array.isArray(c))setCompanies(c)}).catch(()=>{})},[]);
 useEffect(()=>{refresh()},[page,filters]);
 const exportCsv=()=>{
  const headers=['ID','Fecha Costa Rica','Responsable','Usuario','Empresa','Operación','Detalle claro'];
  const csv='sep=;\r\n'+[headers,...result.rows.map(auditColumns)].map(row=>row.map(csvSafeCell).join(';')).join('\r\n')+'\r\n';
  const blob=csvExcelBlob(csv),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`FacturaCR_auditoria_pagina_${page}.csv`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice('CSV preparado para Excel con acentos y caracteres correctos.');
 };
 const exportPdf=async()=>{
  setError('');setNotice('');setExporting(true);
  try{
   if(!window.facturacrReports?.savePdf)throw Error('La exportación PDF requiere la aplicación de escritorio FacturaCR.');
   const html=auditPdfHtml(result.rows,{total:result.total,page,filters,users,companies});
   const saved=await window.facturacrReports.savePdf(html,`FacturaCR_auditoria_pagina_${page}.pdf`,{landscape:true});
   if(!saved?.success&&!saved?.cancelled)throw Error(saved?.error||'No fue posible guardar la auditoría en PDF.');
   if(saved?.success)setNotice('PDF de auditoría guardado correctamente.');
  }catch(e){setError(e.message)}finally{setExporting(false)}
 };
 return <div className="auditWorkspace card">
  <div className="auditHead"><div><h3>Auditoría del propietario</h3><p className="hint">Registro claro de accesos, ventas, caja, usuarios e inventario. Solo el propietario puede consultarlo. Horarios en Costa Rica (UTC−6).</p></div>
   <div className="actions"><button className="secondary" type="button" onClick={refresh} disabled={loading}>Actualizar</button><button type="button" className="secondary" onClick={exportCsv} disabled={loading||!result.rows.length}>Exportar página CSV</button><button type="button" onClick={exportPdf} disabled={loading||exporting||!result.rows.length}>{exporting?'Preparando PDF…':'Guardar página PDF'}</button></div></div>
  <div className="auditFilters"><label>Tipo de movimiento<select value={filters.category} onChange={e=>update('category',e.target.value)}>{auditCategories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <label>Usuario<select value={filters.userId} onChange={e=>update('userId',e.target.value)}><option value="">Todos</option>{users.map(u=><option value={u.id} key={u.id}>{u.display_name} (@{u.username})</option>)}</select></label>
  <label>Empresa<select value={filters.companyId} onChange={e=>update('companyId',e.target.value)}><option value="">Todas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.trade_name||c.legal_name}</option>)}</select></label>
  <label>Desde (Costa Rica)<input type="date" value={filters.from} max={filters.to||undefined} onChange={e=>update('from',e.target.value)}/></label>
  <label>Hasta (Costa Rica)<input type="date" min={filters.from||undefined} value={filters.to} onChange={e=>update('to',e.target.value)}/></label></div>
  {error&&<p role="alert" className="authError">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  <div className="auditSummary"><strong>{loading?'Consultando…':`${result.total} eventos`}</strong><span>Los datos se muestran por páginas de {result.pageSize||50}. Cada exportación corresponde a la página visible.</span></div>
  <div className="auditTableWrap"><table><thead><tr><th>Fecha Costa Rica</th><th>Responsable</th><th>Empresa</th><th>Operación</th><th>Detalle</th></tr></thead><tbody>
   {result.rows.map(row=><tr key={row.id}><td><strong>{auditCostaRica(row.occurred_at)}</strong><small>UTC: {row.occurred_at}</small></td><td><strong>{auditActor(row)}</strong><small>@{row.username||`ID ${row.user_id||'sistema'}`}</small></td>
    <td>{auditCompany(row)}</td><td><strong>{auditLabels[row.event_type]||row.event_type}</strong></td><td>{auditDetail(row)}{row.target_username&&<small>Cuenta afectada: @{row.target_username}</small>}</td></tr>)}
   {!loading&&!result.rows.length&&<tr><td colSpan="5">No hay actividades para estos filtros.</td></tr>}
  </tbody></table></div>
  <div className="auditPagination"><span>Página {page} de {Math.max(1,Math.ceil(result.total/(result.pageSize||50)))}</span><div className="actions"><button className="secondary" type="button" onClick={()=>setPage(p=>p-1)} disabled={loading||page===1}>Anterior</button><button type="button" onClick={()=>setPage(p=>p+1)} disabled={loading||page*(result.pageSize||50)>=result.total}>Siguiente</button></div></div>
 </div>;
}
