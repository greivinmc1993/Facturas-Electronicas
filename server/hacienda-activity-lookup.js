/**
 * Consulta puntual y explícita de actividades INSCRITAS según Hacienda.
 * No equivale al catálogo completo. No guarda identificaciones en logs ni
 * solicita información al teclear. El servidor consulta su empresa registrada.
 * https://api.hacienda.go.cr/docs/ — GET /fe/ae?identificacion=...
 */
export const HACIENDA_TAXPAYER_URL='https://api.hacienda.go.cr/fe/ae';
const ACTIVITY_CODE=/^(?:\d{4}\.\d|\d{6})$/;
const normalizeText=value=>String(value??'').trim();
export function parseRegisteredActivities(payload){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.actividades))throw Error('Hacienda devolvió un listado de actividades no reconocido.');
 const found=[],unique=new Set();
 for(const row of payload.actividades){
  if(!row||typeof row!=='object')continue;
  const code=normalizeText(row.codigo??row.codigoActividad??row.codigo_actividad??row.codSubClase);
  if(!ACTIVITY_CODE.test(code)||unique.has(code))continue;
  unique.add(code);
  const description=normalizeText(row.descripcion??row.descripcionActividad??row.nombre??row.actividad??row.desSubClase).slice(0,220);
  found.push({code,description});
 }
 return found.slice(0,60);
}
export function createRegisteredActivitiesLookup({fetchImpl=globalThis.fetch,clock=()=>Date.now(),ttlMs=10*60_000}={}){
 const cache=new Map();
 return async function lookup(identification){
  const id=String(identification??'').replace(/\D/g,'');
  if(!/^\d{9,12}$/.test(id))throw Error('La identificación guardada debe contener entre 9 y 12 dígitos.');
  const now=clock(),hit=cache.get(id);
  if(hit&&now<hit.expires)return hit.data;
  if(!fetchImpl)throw Error('No está disponible la consulta en línea de Hacienda.');
  let response;
  try{
   response=await fetchImpl(`${HACIENDA_TAXPAYER_URL}?identificacion=${encodeURIComponent(id)}`,{
    method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),redirect:'error'
   });
  }catch{throw Error('No fue posible conectar con Hacienda. Comprueba Internet e inténtalo más tarde.');}
  if(response.status===429)throw Error('Hacienda limitó las consultas temporalmente. Inténtalo más tarde.');
  if(response.status===404)throw Error('Hacienda no encontró la identificación registrada.');
  if(!response.ok)throw Error(`Hacienda no respondió correctamente (HTTP ${response.status}).`);
  const text=await response.text();
  if(text.length>200000)throw Error('La respuesta de Hacienda excedió el tamaño esperado.');
  let data;
  try{data=JSON.parse(text)}catch{throw Error('Hacienda devolvió datos que no pueden interpretarse.');}
  const activities=parseRegisteredActivities(data);
  const result={activities,checkedAt:new Date(now).toISOString(),source:'api.hacienda.go.cr',registered:activities.length>0};
  if(cache.size>100)cache.clear();
  cache.set(id,{data:result,expires:now+ttlMs});
  return result;
 }
}
