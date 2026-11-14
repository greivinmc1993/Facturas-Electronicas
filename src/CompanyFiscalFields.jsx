import React,{useEffect,useState} from 'react';

// Las etiquetas se muestran como nombres; los valores conservan el código necesario
// para el futuro XML 4.4 (provincia 1, cantón 2 y distrito 2 dígitos).
export const EMPTY_COMPANY_FISCAL={identification_type:'',activity_code:'',province:'',canton:'',district:'',branch:'',terminal:'',postal_code:''};
const PROVINCES={'1':'San José','2':'Alajuela','3':'Cartago','4':'Heredia','5':'Guanacaste','6':'Puntarenas','7':'Limón'};
const GEO_BASE='https://ubicaciones-cr.ryze-cr.workers.dev';
const pad2=value=>String(value).padStart(2,'0');
export const postalFromLocation=({province='',canton='',district=''})=>province&&canton&&district?`${province}${canton}${district}`:'';

function useGeoCatalog(path){
 const [result,setResult]=useState({items:{},loading:false,error:''});
 useEffect(()=>{
  if(!path){setResult({items:{},loading:false,error:''});return}
  let active=true;
  const key='facturacr_geo_'+path;
  try{
   const cached=JSON.parse(localStorage.getItem(key)||'null');
   if(cached&&typeof cached==='object'&&!Array.isArray(cached)&&Object.keys(cached).length){setResult({items:cached,loading:false,error:''});return}
  }catch{}
  const controller=new AbortController();
  setResult({items:{},loading:true,error:''});
  fetch(GEO_BASE+path,{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('Catálogo no disponible');
   const data=await response.json();
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Catálogo no válido');
   try{localStorage.setItem(key,JSON.stringify(data))}catch{}
   if(active)setResult({items:data,loading:false,error:''});
  }).catch(err=>{
   if(active&&err.name!=='AbortError')setResult({items:{},loading:false,error:'No fue posible consultar los nombres. Conéctate a Internet para cargar el catálogo por primera vez.'});
  });
  return ()=>{active=false;controller.abort()};
 },[path]);
 return result;
}
const TYPES=[['','Seleccionar tipo'],['01','Cédula física'],['02','Cédula jurídica'],['03','DIMEX'],['04','NITE'],['05','Identificación extranjera (comprobar aplicabilidad)']];
const optionRows=(rows)=>Object.entries(rows).sort((a,b)=>Number(a[0])-Number(b[0]));
export default function CompanyFiscalFields({value=EMPTY_COMPANY_FISCAL,onChange=()=>{},idPrefix='company-fe',showIdentificationType=true,errors={}}){
 const fiscal={...EMPTY_COMPANY_FISCAL,...value};
 const cantonPath=fiscal.province?`/provincia/${Number(fiscal.province)}/cantones.json`:null;
 const districtPath=fiscal.province&&fiscal.canton?`/provincia/${Number(fiscal.province)}/canton/${Number(fiscal.canton)}/distritos.json`:null;
 const cantons=useGeoCatalog(cantonPath),districts=useGeoCatalog(districtPath);
 const set=(field)=>(e)=>onChange({[field]:e.target.value});
 const postal=postalFromLocation(fiscal);
 const cantonOptions=optionRows(cantons.items),districtOptions=optionRows(districts.items);
 const cantonMissing=fiscal.canton&&!cantonOptions.some(([code])=>pad2(code)===fiscal.canton);
 const districtMissing=fiscal.district&&!districtOptions.some(([code])=>pad2(code)===fiscal.district);
 return <div className="companyFiscalFields">
  <div className="companyFiscalSectionTitle"><strong>Datos fiscales y ubicación de la empresa</strong><small>Preparación XML 4.4 · Selecciona las ubicaciones por nombre. Los códigos se conservan internamente.</small></div>
  <div className="companyFiscalGrid">
   {showIdentificationType&&<label className="field" htmlFor={idPrefix+'-type'}>Tipo de identificación<select id={idPrefix+'-type'} value={fiscal.identification_type} onChange={set('identification_type')}>{TYPES.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>}
   <label className={'field'+(errors.activity_code?' companyFieldHasError':'')} htmlFor={idPrefix+'-activity'}>Actividad económica (RUT)<input aria-invalid={!!errors.activity_code} id={idPrefix+'-activity'} type="text" inputMode="decimal" pattern="([0-9]{4}\.[0-9]|[0-9]{6})" maxLength={6} placeholder="Ej. 4019.0" value={fiscal.activity_code} onChange={set('activity_code')}/>{errors.activity_code&&<small className="companyFieldError">{errors.activity_code}</small>}</label>
   <label className={'field'+(errors.province?' companyFieldHasError':'')} htmlFor={idPrefix+'-province'}>Provincia<select aria-invalid={!!errors.province} id={idPrefix+'-province'} value={fiscal.province} onChange={e=>onChange({province:e.target.value,canton:'',district:'',postal_code:''})}><option value="">Seleccionar provincia</option>{optionRows(PROVINCES).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select>{errors.province&&<small className="companyFieldError">{errors.province}</small>}</label>
   <label className={'field'+(errors.canton?' companyFieldHasError':'')} htmlFor={idPrefix+'-canton'}>Cantón<select aria-invalid={!!errors.canton} id={idPrefix+'-canton'} value={fiscal.canton} disabled={!fiscal.province||cantons.loading} onChange={e=>onChange({canton:e.target.value,district:'',postal_code:''})}><option value="">{cantons.loading?'Cargando cantones…':'Seleccionar cantón'}</option>{cantonMissing&&<option value={fiscal.canton}>Cantón guardado (código {fiscal.canton})</option>}{cantonOptions.map(([code,label])=><option key={code} value={pad2(code)}>{label}</option>)}</select>{errors.canton&&<small className="companyFieldError">{errors.canton}</small>}</label>
   <label className={'field'+(errors.district?' companyFieldHasError':'')} htmlFor={idPrefix+'-district'}>Distrito<select aria-invalid={!!errors.district} id={idPrefix+'-district'} value={fiscal.district} disabled={!fiscal.canton||districts.loading} onChange={e=>onChange({district:e.target.value,postal_code:''})}><option value="">{districts.loading?'Cargando distritos…':'Seleccionar distrito'}</option>{districtMissing&&<option value={fiscal.district}>Distrito guardado (código {fiscal.district})</option>}{districtOptions.map(([code,label])=><option key={code} value={pad2(code)}>{label}</option>)}</select>{errors.district&&<small className="companyFieldError">{errors.district}</small>}</label>
   <label className={'field'+(errors.postal_code?' companyFieldHasError':'')} htmlFor={idPrefix+'-postal'}>Código postal<input id={idPrefix+'-postal'} type="text" aria-invalid={!!errors.postal_code} readOnly value={postal} placeholder="Se completa al elegir distrito" title="Código de 5 dígitos calculado con provincia, cantón y distrito"/>{errors.postal_code&&<small className="companyFieldError">{errors.postal_code}</small>}</label>
  </div>
  {(cantons.error||districts.error)&&<p className="companyFiscalGeoWarning" role="status">{cantons.error||districts.error} Se respetan los códigos ya guardados.</p>}
  <p className="hint companyFiscalHint">Actividad económica: use el dato registrado en el RUT, por ejemplo 4019.0. El XML 4.4 exige validar un código de seis dígitos vigente en Hacienda; no se convertirá automáticamente el código con punto. El código postal se calcula automáticamente. Estos datos son preparatorios: aún no se firman ni envían comprobantes a Hacienda.</p>
 </div>;
}
