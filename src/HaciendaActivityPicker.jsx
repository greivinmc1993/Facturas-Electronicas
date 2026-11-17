import React,{useEffect,useMemo,useRef,useState} from 'react';
import {HACIENDA_ACTIVITY_EXCERPT,HACIENDA_ACTIVITY_SOURCE,searchHaciendaActivityExcerpt} from './hacienda-activity-catalog.js';

/** Búsqueda rápida por código o descripción, más padrón real bajo demanda.
 * El extracto local procede de Hacienda, pero NO cubre todas las actividades.
 * Solo /fe/registered-activities consulta códigos inscritos para esta empresa.
 */
export default function HaciendaActivityPicker({code='',onSelect=()=>{},companyId=null,allowRegisteredLookup=true,inputId='company-activity-search'}){
 const [query,setQuery]=useState(''),[registered,setRegistered]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const firstResult=useRef(null),requestRef=useRef(0);
 const term=query.trim()||String(code).trim();
 const suggestions=useMemo(()=>term.length>=2?searchHaciendaActivityExcerpt(term,8):[],[term]);
 const registeredMatches=useMemo(()=>{
  if(!Array.isArray(registered?.activities)||term.length<2)return [];
  const normal=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const q=normal(term);
  return registered.activities.filter(a=>normal(`${a.code} ${a.description}`).includes(q)).slice(0,8);
 },[registered,term]);
 useEffect(()=>{setRegistered(null);setError('');setQuery('');requestRef.current++;},[companyId]);
 const choose=item=>{onSelect(item.code);setQuery('')};
 const consult=async()=>{
  if(!allowRegisteredLookup||!companyId||busy)return;
  const request=++requestRef.current;
  setBusy(true);setError('');
  try{
   const response=await fetch(`/api/companies/${encodeURIComponent(companyId)}/fe/registered-activities`,{headers:{Accept:'application/json'}});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'No se pudo consultar Hacienda.');
   if(request===requestRef.current)setRegistered(payload);
  }catch(err){if(request===requestRef.current)setError(err.message)}
  finally{if(request===requestRef.current)setBusy(false)}
 };
 return <div className="companyFiscalActivityFinder">
   <div className="companyFiscalActivityFinderTop">
    <label htmlFor={inputId}>Buscar actividad por código o descripción</label>
    <span>Referencia CIIU4 · extracto de Hacienda</span>
   </div>
   <input id={inputId} type="search" autoComplete="off" value={query} onChange={event=>setQuery(event.target.value)}
    onKeyDown={event=>{if(event.key==='ArrowDown'&&firstResult.current){event.preventDefault();firstResult.current.focus()}if(event.key==='Escape')setQuery('')}}
    placeholder="Ej. 6201 o programación informática" aria-label="Buscar en el índice de actividades CIIU4"/>
   {term.length>=2&&<div className="companyFiscalActivitySuggestions" aria-live="polite">
    {allowRegisteredLookup&&registeredMatches.length>0&&<div className="companyFiscalActivityGroup"><strong>Inscritas para esta empresa según Hacienda</strong>{registeredMatches.map((item,index)=><button key={'rut-'+item.code} type="button" ref={index===0?firstResult:null} onClick={()=>choose(item)} className="companyFiscalActivityOption isRegistered"><span className="companyFiscalActivityCode">{item.code}</span><span>{item.description||'Actividad inscrita'}</span><small>RUT</small></button>)}</div>}
    {suggestions.length>0?<div className="companyFiscalActivityGroup"><strong>Coincidencias en el extracto público CIIU4</strong>{suggestions.map((item,index)=><button key={item.code} type="button" ref={registeredMatches.length===0&&index===0?firstResult:null} onClick={()=>choose(item)} className="companyFiscalActivityOption"><span className="companyFiscalActivityCode">{item.code}</span><span>{item.description}</span></button>)}</div>:
     registeredMatches.length===0&&<p className="companyFiscalActivityEmpty">No aparece en el extracto local de {HACIENDA_ACTIVITY_EXCERPT.length} actividades. Esto no demuestra que el código sea inválido; consulta el catálogo completo y tu RUT.</p>}
   </div>}
   <div className="companyFiscalActivityTools">
    {allowRegisteredLookup&&<button type="button" className="secondary" onClick={consult} disabled={!companyId||busy}>{busy?'Consultando Hacienda…':'Consultar mis actividades inscritas'}</button>}
    <a href={HACIENDA_ACTIVITY_SOURCE} target="_blank" rel="noopener noreferrer">Abrir listado de Hacienda</a>
   </div>
   {allowRegisteredLookup&&!companyId&&<small className="companyFiscalActivityInfo">Para consultar las actividades inscritas en Hacienda, guarda primero la empresa. La búsqueda del catálogo de referencia ya funciona sin Internet.</small>}
   {allowRegisteredLookup&&registered&&<p className="companyFiscalActivityInfo" role="status">{registered.activities.length>0?`Hacienda devolvió ${registered.activities.length} actividad(es) para esta empresa. Selecciona la que corresponda.`:'La consulta no devolvió actividades para la empresa. Comprueba tu inscripción en TRIBU-CR → Mis Datos → Actividades Económicas.'}</p>}
   {allowRegisteredLookup&&error&&<p className="companyFiscalActivityWarning" role="alert">{error} Puedes seguir escribiendo el código manualmente.</p>}
   <small className="companyFiscalActivityInfo">El índice es un extracto de la tabla oficial de correspondencias, no el padrón completo. Una coincidencia no confirma inscripción tributaria ni autorización para emitir XML.</small>
 </div>;
}
