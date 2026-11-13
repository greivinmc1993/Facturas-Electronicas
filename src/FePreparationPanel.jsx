import React,{useEffect,useState} from 'react';
import './style.css';
import CompanyFiscalFields,{EMPTY_COMPANY_FISCAL} from './CompanyFiscalFields.jsx';

const EMPTY=EMPTY_COMPANY_FISCAL;
export default function FePreparationPanel({company,onEditCompany,canEditProfile=false,refreshToken=0}){
 const [draft,setDraft]=useState(EMPTY),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 const companyId=company?.id;
 useEffect(()=>{
  if(!companyId)return;
  let active=true;
  setLoading(true);setReport(null);setError('');setSaved('');setDraft(EMPTY);
  fetch(`/api/companies/${companyId}/fe/preparation`).then(async response=>{
   const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la ficha fiscal.');
   if(active){setReport(data.report);setDraft({...EMPTY,...data.settings})}
  }).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[companyId,company?.legal_name,company?.identification,company?.address,company?.email,refreshToken]);
 const change=(field,value)=>{setDraft(prev=>({...prev,[field]:value}));setSaved('')};
 const save=async e=>{
  e.preventDefault();if(!companyId||saving)return;
  setSaving(true);setError('');setSaved('');
  try{
   const response=await fetch(`/api/companies/${companyId}/fe/preparation`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'No se pudo guardar la ficha fiscal.');
   setDraft({...EMPTY,...data.settings});setReport(data.report);setSaved('Ficha fiscal guardada en esta empresa. Aún no permite emitir comprobantes.');
  }catch(err){setError(err.message)}finally{setSaving(false)}
 };
 if(!companyId)return null;
 return <section className="fePreparation" aria-labelledby="fe-preparation-title">
  <header className="fePreparationHeader"><div><p className="companiesOverline">Próxima etapa · Hacienda Costa Rica</p><h3 id="fe-preparation-title">Preparación para factura electrónica 4.4</h3><p className="hint">Ficha fiscal independiente de {company.trade_name||company.legal_name}. Esta etapa organiza los datos para el futuro generador XML; todavía no emite ni firma documentos.</p></div><span className="fePreparationStage">Modo preparación</span></header>
  {loading?<p className="hint">Consultando datos fiscales y catálogo…</p>:<>
   {report&&<div className="fePreparationSummary"><div className="fePreparationProgress" role="status"><strong>{report.completed} / {report.total}</strong><small>comprobaciones locales completadas</small></div><div className="fePreparationCatalog"><strong>{report.catalog.total}</strong><small>artículos y servicios activos</small></div><div className="fePreparationCatalog"><strong>{report.catalog.missingCabys}</strong><small>sin CABYS válido de 13 dígitos</small></div></div>}
   {report&&<div className="fePreparationChecks" aria-label="Comprobaciones locales de preparación">{report.checks.map(check=><div key={check.key} className={'fePreparationCheck '+(check.ok?'isReady':'isPending')}><span aria-hidden="true">{check.ok?'✓':'!'}</span><span>{check.title}</span><small>{check.ok?'Registrado':'Pendiente'}</small></div>)}</div>}
   {canEditProfile?<div className="fePreparationForm fePreparationOwnerAction"><h4>Datos fiscales del emisor</h4><p className="hint">La ficha se completa y modifica desde Nueva empresa o Abrir perfil, junto con la dirección exacta y el código postal. El diagnóstico se actualiza después de guardar.</p><button type="button" className="secondary" onClick={onEditCompany}>Editar perfil y ficha fiscal</button></div>:
    <form className="fePreparationForm" onSubmit={save}><h4>Datos fiscales del emisor</h4><p className="hint">Como administrador puedes actualizar los datos fiscales de tu empresa. La dirección exacta y los datos generales los administra el propietario.</p>
      <CompanyFiscalFields value={draft} onChange={changes=>{setDraft(prev=>({...prev,...changes}));setSaved('')}} idPrefix="admin-fiscal"/>
      <div className="fePreparationActions"><button type="submit" disabled={saving}>{saving?'Guardando…':'Guardar ficha fiscal'}</button></div>
    </form>}
   {saved&&<p className="fePreparationSuccess" role="status">{saved}</p>}
   {error&&<p className="fePreparationError" role="alert">{error}</p>}
   <p className="fePreparationDisclaimer">Pendientes para emisión real: validación contra XSD y catálogos vigentes, numeración y clave, firma XAdES-EPES, credenciales y API de Hacienda, recepción y estados. Ningún dato se envía desde esta pantalla.</p>
  </>}
 </section>;
}
