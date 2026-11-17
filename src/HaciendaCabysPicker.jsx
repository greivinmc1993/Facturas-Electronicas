import React,{useEffect,useRef,useState} from 'react';
/** Asistente de selección CAByS por código o descripción oficial, sin alterar IVA ni precio. */
export default function HaciendaCabysPicker({code='',onSelect=()=>{},companyId=null}){
 const [query,setQuery]=useState(''),[items,setItems]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false),[referenceOnly,setReferenceOnly]=useState(false);
 const requestRef=useRef(0),firstResult=useRef(null);
 useEffect(()=>{setQuery('');setItems([]);setBusy(false);setError('');setSearched(false);setReferenceOnly(false);requestRef.current++;},[companyId]);
 const term=query.trim();
 const isValid=term.length>=3&&(!/^\d+$/.test(term)||term.length===13);
 useEffect(()=>{
  const request=++requestRef.current;
  setError('');setSearched(false);setItems([]);setReferenceOnly(false);
  if(!companyId||!isValid){setBusy(false);return;}
  const controller=new AbortController();
  const timeout=setTimeout(async()=>{
   setBusy(true);
   try{
    const response=await fetch(`/api/companies/${encodeURIComponent(companyId)}/products/cabys-search?q=${encodeURIComponent(term)}`,{headers:{Accept:'application/json'},signal:controller.signal});
    const payload=await response.json();
    if(!response.ok)throw Error(payload.error||'No se pudo consultar Hacienda.');
    if(request===requestRef.current){setItems(Array.isArray(payload.items)?payload.items:[]);setReferenceOnly(payload.referenceOnly===true);setSearched(true);}
   }catch(err){if(request===requestRef.current&&err.name!=='AbortError')setError(err.message);}
   finally{if(request===requestRef.current)setBusy(false);}
  },650);
  return ()=>{clearTimeout(timeout);controller.abort();};
 },[companyId,term,isValid]);
 const choose=item=>{onSelect(item.code);setQuery('');setItems([]);setSearched(false);setReferenceOnly(false);setError('')};
 return <div className="haciendaCabysPicker">
  <div className="haciendaCabysHeader"><label htmlFor="product-cabys-search">Buscar CABYS oficial por descripción o código</label><span>Ministerio de Hacienda · consulta en línea</span></div>
  <input id="product-cabys-search" type="search" autoComplete="off" value={query} onChange={e=>setQuery(e.target.value)}
   onKeyDown={e=>{if(e.key==='ArrowDown'&&firstResult.current){e.preventDefault();firstResult.current.focus();}if(e.key==='Escape')setQuery('')}}
   placeholder="Ej. jugo de tomate o código de 13 dígitos" aria-label="Buscar CABYS por nombre o código"/>
  {term&&/^\d+$/.test(term)&&term.length!==13&&<small className="haciendaCabysInfo">Introduce los 13 dígitos completos para consultar por código, o busca por palabras.</small>}
  {term&&term.length<3&&<small className="haciendaCabysInfo">Escribe al menos 3 letras para buscar por descripción.</small>}
  {busy&&<p className="haciendaCabysInfo" role="status">Consultando el catálogo oficial de Hacienda…</p>}
  {referenceOnly&&items.length>0&&<p className="haciendaCabysWarning" role="status">Referencia pública encontrada, pero Hacienda no confirmó el código en la consulta en línea. Antes de emitir, verifica su vigencia en el catálogo del BCCR. No se cambiará la tarifa de IVA automáticamente.</p>}
  {items.length>0&&<div className="haciendaCabysResults" role="group" aria-label="Resultados CABYS de Hacienda">
    {items.map((item,i)=><button type="button" key={item.code} ref={i===0?firstResult:null} className="haciendaCabysResult" onClick={()=>choose(item)}>
     <strong>{item.code}</strong><span>{item.description}</span>{item.verification==='reference'&&<small>Referencia publicada · sin validación en línea</small>}{item.taxRate!==null&&<small>Impuesto catálogo: {item.taxRate}</small>}
    </button>)}
   </div>}
  {searched&&!items.length&&!busy&&<p className="haciendaCabysInfo" role="status">No se encontraron coincidencias para esta búsqueda. Prueba otra descripción o verifica el código.</p>}
  {error&&<p className="haciendaCabysWarning" role="alert">{error} El campo CABYS se puede completar manualmente.</p>}
  <div className="haciendaCabysFooter"><small>CABYS seleccionado: <b>{code||'Sin asignar'}</b>. La selección no modifica el IVA ni el precio; revisa la tarifa aplicable.</small>
   <div className="haciendaCabysLinks" aria-label="Fuentes oficiales de CABYS">
    <a href="https://api.hacienda.go.cr/fe/cabys/test" target="_blank" rel="noopener noreferrer" title="Abrir el buscador CABYS del Ministerio de Hacienda">Buscar en Hacienda <span aria-hidden="true">↗</span></a>
    <a href="https://www.bccr.fi.cr/content/dam/bccr/bccr-espanol/noticias/2025/2025-04-01-catalogo-de-bienes-servicios-1.xlsx" target="_blank" rel="noopener noreferrer" title="Abrir o descargar el archivo Excel oficial CABYS 2025 del BCCR">Catálogo BCCR (Excel) <span aria-hidden="true">↗</span></a>
    <a href="https://api.hacienda.go.cr/docs/" target="_blank" rel="noopener noreferrer" title="Documentación de la API oficial de Hacienda">API Hacienda <span aria-hidden="true">↗</span></a>
   </div></div>
 </div>;
}
