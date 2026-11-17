/** Consulta del catálogo oficial CAByS de Hacienda para la ficha de productos.
 * API pública: https://api.hacienda.go.cr/docs/ — GET /fe/cabys?q=... o ?codigo=...
 * No se guarda información externa en SQLite ni se modifica la tarifa de IVA.
 */
export const HACIENDA_CABYS_URL='https://api.hacienda.go.cr/fe/cabys';
const CODE=/^\d{13}$/;
const clean=value=>String(value??'').trim();
export function validateCabysQuery(query){
 const value=clean(query).replace(/\s+/g,' ');
 if(value.length>80)throw Error('CABYS: escribe un máximo de 80 caracteres.');
 if(/^\d+$/.test(value)){
  if(!CODE.test(value))throw Error('Para consultar por código CABYS introduce exactamente 13 dígitos.');
  return {value,kind:'codigo'};
 }
 if(value.length<3)throw Error('Para buscar CABYS por descripción escribe al menos 3 caracteres.');
 if(/[\x00-\x1F\x7F]/.test(value))throw Error('La búsqueda contiene caracteres no permitidos.');
 return {value,kind:'q'};
}
export function normalizeCabysResults(payload){
 if(!payload||typeof payload!=='object')throw Error('Hacienda devolvió un catálogo CABYS no reconocido.');
 // Hacienda devuelve listas en cabys; los detalles por código pueden ser un objeto.
 const items=Array.isArray(payload)?payload:
  (Array.isArray(payload.cabys)?payload.cabys:
   Array.isArray(payload.resultados)?payload.resultados:
   Array.isArray(payload.results)?payload.results:
   Array.isArray(payload.data)?payload.data:
   payload.codigo||payload.code?[payload]:
   payload.cabys&&typeof payload.cabys==='object'?[payload.cabys]:null);
 if(!items)throw Error('Hacienda devolvió un catálogo CABYS con estructura no reconocida.');
 const seen=new Set(),out=[];
 for(const item of items.slice(0,50)){
  if(!item||typeof item!=='object')continue;
  const code=clean(item.codigo??item.code??item.codigoCABYS??item.codigoCabys??item.cabys);
  if(!CODE.test(code)||seen.has(code))continue;
  seen.add(code);
  const description=clean(item.descripcion??item.description??item.detalle??item.nombre).slice(0,280);
  const rate=item.impuesto??item.tarifa??item.taxRate??item.tax_rate??null;
  const taxRate=(typeof rate==='number'||typeof rate==='string')&&clean(rate)!==''?clean(rate).slice(0,20):null;
  out.push({code,description:description||'Bien o servicio del catálogo CAByS',taxRate});
 }
 return out.slice(0,12);
}
export function createCabysLookup({fetchImpl=globalThis.fetch,clock=()=>Date.now(),ttlMs=10*60_000}={}){
 const cache=new Map(),inFlight=new Map();
 return async query=>{
  const {value,kind}=validateCabysQuery(query);
  const cacheKey=kind+':'+value.toLocaleLowerCase('es');
  const now=clock();const cached=cache.get(cacheKey);
  if(cached&&cached.expires>now)return cached.data;
  if(inFlight.has(cacheKey))return inFlight.get(cacheKey);
  if(!fetchImpl)throw Error('No está disponible la consulta en línea del catálogo CABYS.');
  const request=(async()=>{
   const url=kind==='codigo'?`${HACIENDA_CABYS_URL}?codigo=${encodeURIComponent(value)}`:
    `${HACIENDA_CABYS_URL}?q=${encodeURIComponent(value)}&top=12`;
   let response;
   try{response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(7500),redirect:'error'});}
   catch{throw Error('No se pudo conectar al catálogo CABYS de Hacienda. Revisa Internet o intenta después.');}
   if(response.status===429)throw Error('Hacienda limitó temporalmente las búsquedas CABYS. Espera antes de volver a consultar.');
   if(response.status===404){const result={items:[],source:'api.hacienda.go.cr',cached:false};cache.set(cacheKey,{data:result,expires:clock()+ttlMs});return result;}
   if(!response.ok)throw Error(`La consulta CABYS de Hacienda no respondió correctamente (HTTP ${response.status}).`);
   const body=await response.text();
   if(body.length>350000)throw Error('La respuesta CABYS de Hacienda excede el tamaño permitido.');
   let payload;
   try{payload=JSON.parse(body)}catch{throw Error('Hacienda devolvió una respuesta CABYS ilegible.');}
   const result={items:normalizeCabysResults(payload),source:'api.hacienda.go.cr',cached:false};
   if(cache.size>=150)cache.clear();
   cache.set(cacheKey,{data:result,expires:clock()+ttlMs});
   return result;
  })();
  inFlight.set(cacheKey,request);
  try{return await request}finally{inFlight.delete(cacheKey)}
 };
}
