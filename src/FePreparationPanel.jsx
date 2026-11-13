import React,{useEffect,useState} from 'react';
import './style.css';

const EMPTY={identification_type:'',activity_code:'',province:'',canton:'',district:'',branch:'',terminal:''};
const identifierOptions=[['','Seleccionar tipo'],['01','Cédula física'],['02','Cédula jurídica'],['03','DIMEX'],['04','NITE'],['05','Identificación extranjera (verificar aplicabilidad)']];
export default function FePreparationPanel({company,onEditCompany,canEditProfile=false}){
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
 },[companyId,company?.legal_name,company?.identification,company?.address,company?.email]);
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
 const set=field=>e=>change(field,e.target.value);
 return <section className="fePreparation" aria-labelledby="fe-preparation-title">
  <header className="fePreparationHeader"><div><p className="companiesOverline">Próxima etapa · Hacienda Costa Rica</p><h3 id="fe-preparation-title">Preparación para factura electrónica 4.4</h3><p className="hint">Ficha fiscal independiente de {company.trade_name||company.legal_name}. Esta etapa organiza los datos para el futuro generador XML; todavía no emite ni firma documentos.</p></div><span className="fePreparationStage">Modo preparación</span></header>
  {loading?<p className="hint">Consultando datos fiscales y catálogo…</p>:<>
   {report&&<div className="fePreparationSummary"><div className="fePreparationProgress" role="status"><strong>{report.completed} / {report.total}</strong><small>comprobaciones locales completadas</small></div><div className="fePreparationCatalog"><strong>{report.catalog.total}</strong><small>artículos y servicios activos</small></div><div className="fePreparationCatalog"><strong>{report.catalog.missingCabys}</strong><small>sin CABYS válido de 13 dígitos</small></div></div>}
   {report&&<div className="fePreparationChecks" aria-label="Comprobaciones locales de preparación">{report.checks.map(check=><div key={check.key} className={'fePreparationCheck '+(check.ok?'isReady':'isPending')}><span aria-hidden="true">{check.ok?'✓':'!'}</span><span>{check.title}</span><small>{check.ok?'Registrado':'Pendiente'}</small></div>)}</div>}
   <form className="fePreparationForm" onSubmit={save}><h4>Datos fiscales del emisor</h4><p className="hint">Registra los datos correspondientes a la empresa real. La actividad debe estar inscrita en el RUT; completar el formulario no verifica automáticamente su validez ante Hacienda.</p>
    <div className="fePreparationFields">
     <label className="field">Tipo de identificación<select value={draft.identification_type} onChange={set('identification_type')}>{identifierOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label className="field">Actividad económica (RUT) <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6 dígitos" value={draft.activity_code} onChange={set('activity_code')}/></label>
     <label className="field">Provincia (código)<select value={draft.province} onChange={e=>{setDraft(prev=>({...prev,province:e.target.value,canton:'',district:''}));setSaved('')}}><option value="">Seleccionar provincia</option>{[['1','San José'],['2','Alajuela'],['3','Cartago'],['4','Heredia'],['5','Guanacaste'],['6','Puntarenas'],['7','Limón']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
     <label className="field">Cantón (código de 2 dígitos)<input type="text" inputMode="numeric" pattern="[0-9]{2}" maxLength={2} placeholder="Ej. 01" value={draft.canton} onChange={set('canton')}/></label>
     <label className="field">Distrito (código de 2 dígitos)<input type="text" inputMode="numeric" pattern="[0-9]{2}" maxLength={2} placeholder="Ej. 01" value={draft.district} onChange={set('district')}/></label>
     <label className="field">Código de sucursal (3 dígitos)<input type="text" inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="Ej. 001" value={draft.branch} onChange={set('branch')}/></label>
     <label className="field">Código de terminal (5 dígitos)<input type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="Ej. 00001" value={draft.terminal} onChange={set('terminal')}/></label>
    </div>
    <div className="fePreparationActions">{canEditProfile&&<button type="button" className="secondary" onClick={onEditCompany}>Completar datos generales</button>}<button type="submit" disabled={saving}>{saving?'Guardando…':'Guardar ficha fiscal'}</button></div>
   </form>
   {saved&&<p className="fePreparationSuccess" role="status">{saved}</p>}
   {error&&<p className="fePreparationError" role="alert">{error}</p>}
   <p className="fePreparationDisclaimer">Pendientes para emisión real: validación contra XSD y catálogos vigentes, numeración y clave, firma XAdES-EPES, credenciales y API de Hacienda, recepción y estados. Ningún dato se envía desde esta pantalla.</p>
  </>}
 </section>;
}
