// FacturaCR v0.6.70. Preparación fiscal local para futuros generadores XML 4.4.
// Este módulo NO emite, firma, valida XSD ni transmite comprobantes a Hacienda.
export const FE_PREPARATION_EMPTY=Object.freeze({
  identification_type:'',activity_code:'',province:'',canton:'',district:'',
  branch:'',terminal:''
});
const PATTERNS=Object.freeze({
  identification_type:/^(?:01|02|03|04|05)$/,
  activity_code:/^\d{6}$/,
  province:/^[1-7]$/,
  canton:/^\d{2}$/,
  district:/^\d{2}$/,
  branch:/^\d{3}$/,
  terminal:/^\d{5}$/
});
const NAMES={identification_type:'Tipo de identificación',activity_code:'Actividad económica',province:'Provincia',canton:'Cantón',district:'Distrito',branch:'Sucursal',terminal:'Terminal'};
export function parseFePreparation(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('La ficha fiscal debe ser un objeto.');
  const extra=Object.keys(input).filter(key=>!Object.hasOwn(FE_PREPARATION_EMPTY,key));
  if(extra.length)throw Error('La ficha fiscal contiene campos no admitidos.');
  const result={};
  for(const key of Object.keys(FE_PREPARATION_EMPTY)){
    if(typeof input[key]!=='string'&&input[key]!==undefined)throw Error(NAMES[key]+': dato inválido.');
    const value=String(input[key]??'').trim();
    if(value&&!PATTERNS[key].test(value))throw Error(NAMES[key]+': formato inválido.');
    result[key]=value;
  }
  return result;
}
export function describeFePreparation(company,settings={},catalog={}){
  const s={...FE_PREPARATION_EMPTY,...settings},c=company||{};
  const total=Number(catalog.total)||0,missingCabys=Number(catalog.missingCabys)||0;
  const validIdent=/^\d{9,12}$/.test(String(c.identification||''));
  const checks=[
    {key:'legal_name',title:'Razón social registrada',ok:!!String(c.legal_name||'').trim(),place:'perfil'},
    {key:'identification',title:'Número de identificación',ok:validIdent,place:'perfil'},
    {key:'identification_type',title:'Tipo de identificación',ok:!!s.identification_type,place:'fiscal'},
    {key:'activity_code',title:'Actividad económica (6 dígitos)',ok:!!s.activity_code,place:'fiscal'},
    {key:'location',title:'Ubicación: provincia, cantón y distrito',ok:!!(s.province&&s.canton&&s.district),place:'fiscal'},
    {key:'address',title:'Dirección del establecimiento',ok:!!String(c.address||'').trim(),place:'perfil'},
    {key:'email',title:'Correo de la empresa',ok:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email||'')),place:'perfil'},
    {key:'branch',title:'Código de sucursal (3 dígitos)',ok:!!s.branch,place:'fiscal'},
    {key:'terminal',title:'Código de terminal (5 dígitos)',ok:!!s.terminal,place:'fiscal'},
    {key:'cabys',title:'CAByS de artículos y servicios',ok:total>0&&missingCabys===0,place:'productos'}
  ];
  return {version:'4.4',scope:'preparation-only',canEmit:false,checks,
    completed:checks.filter(x=>x.ok).length,total:checks.length,
    missing:checks.filter(x=>!x.ok).map(x=>x.title),
    catalog:{total,missingCabys},
    explanation:'Diagnóstico local de preparación: no valida el padrón RUT, los códigos CAByS ni los XSD; no constituye autorización para emitir facturas electrónicas.'};
}
