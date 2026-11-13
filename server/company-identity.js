// Validación local de identificación fiscal (Hacienda, comprobantes 4.4).
// Solo valida formato: NO certifica existencia en el RUT ni autoriza emisión.
export const COMPANY_ID_RULES=Object.freeze({
  '01':Object.freeze({label:'Cédula física',pattern:/^[1-9]\d{8}$/,hint:'9 dígitos, sin cero inicial ni guiones.',maxLength:9,placeholder:'Ej. 115460323'}),
  '02':Object.freeze({label:'Cédula jurídica',pattern:/^\d{10}$/,hint:'10 dígitos, sin guiones.',maxLength:10,placeholder:'Ej. 3101900123'}),
  '03':Object.freeze({label:'DIMEX',pattern:/^[1-9]\d{10,11}$/,hint:'11 o 12 dígitos, sin cero inicial ni guiones.',maxLength:12,placeholder:'11 o 12 dígitos'}),
  '04':Object.freeze({label:'NITE',pattern:/^\d{10}$/,hint:'10 dígitos, sin guiones.',maxLength:10,placeholder:'10 dígitos'}),
  '05':Object.freeze({label:'Extranjero no domiciliado',pattern:/^[A-Za-z0-9]{1,20}$/,hint:'De 1 a 20 caracteres alfanuméricos; aplicación restringida según tipo de comprobante.',maxLength:20,placeholder:'Identificación extranjera'})
});
export function validateCompanyIdentification(type,number,{allowUntyped=false}={}){
  const id=String(number??'').trim();
  const code=String(type??'').trim();
  if(!id)throw Error('El número de identificación de la empresa es obligatorio.');
  if(!code){
    // Compatibilidad de solicitudes históricas sin ficha fiscal: no convertir a tipo fiscal.
    if(allowUntyped&&/^\d{9,12}$/.test(id))return id;
    throw Error('Seleccione el tipo de identificación de la empresa.');
  }
  const rule=COMPANY_ID_RULES[code];
  if(!rule)throw Error('Seleccione un tipo de identificación válido.');
  if(!rule.pattern.test(id))throw Error(rule.label+': '+rule.hint);
  return id;
}
export const COMPANY_ACTIVITY_PATTERN=/^(?:\d{4}\.\d|\d{6})$/;
export function validateCompanyActivity(code){
 const value=String(code??'').trim();
 if(value&&!COMPANY_ACTIVITY_PATTERN.test(value))throw Error('Actividad económica (RUT): use el formato 4019.0 o un código histórico de 6 dígitos.');
 return value;
}
