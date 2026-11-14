// Validación previa para las ventanas Nueva empresa / Editar empresa.
// Mismas reglas de identificación que utiliza el servidor; no reemplaza la validación del API.
import {COMPANY_ID_RULES,COMPANY_ACTIVITY_PATTERN} from '../server/company-identity.js';

export const COMPANY_FIELD_TITLES=Object.freeze({
 legal_name:'Razón social',identification_type:'Tipo de identificación',identification:'Número de identificación',
 phone:'Teléfono',trade_name:'Nombre comercial',email:'Correo electrónico',address:'Dirección exacta',
 activity_code:'Actividad económica (RUT)',province:'Provincia',canton:'Cantón',district:'Distrito',
 postal_code:'Código postal',website:'Sitio web',social:'Redes sociales'
});
export const COMPANY_FIELD_DOM_IDS=Object.freeze({
 legal_name:'company-legal-name',identification_type:'company-identity-type',identification:'company-identity-number',
 phone:'company-phone',trade_name:'company-trade-name',email:'company-email',address:'company-address',
 activity_code:'company-modal-fiscal-activity',province:'company-modal-fiscal-province',
 canton:'company-modal-fiscal-canton',district:'company-modal-fiscal-district',
 postal_code:'company-modal-fiscal-postal',website:'company-website',social:'company-social'
});

export function validateCompanyForm(form){
 const errors={};
 const str=k=>String(form?.[k]??'').trim();
 const fiscal=form?.fe_preparation||{};
 const name=str('legal_name');
 if(!name)errors.legal_name='Escribe la razón social o el nombre de la empresa.';
 else if(name.length>160)errors.legal_name='La razón social admite como máximo 160 caracteres.';
 const type=String(fiscal.identification_type??'').trim();
 const rule=COMPANY_ID_RULES[type];
 if(!rule)errors.identification_type='Selecciona el tipo de identificación de la empresa.';
 const number=str('identification');
 if(!number)errors.identification='Ingresa el número de identificación; es obligatorio.';
 else if(rule&&!rule.pattern.test(number))errors.identification=`${rule.label}: ${rule.hint}`;
 else if(!rule&&(!/^[\dA-Za-z]{1,20}$/.test(number)))errors.identification='El número contiene caracteres no permitidos.';
 for(const [key,max] of [['phone',300],['trade_name',300],['email',300],['address',160],['website',300],['social',300]]){
  if(str(key).length>max)errors[key]=`${COMPANY_FIELD_TITLES[key]}: máximo ${max} caracteres.`;
 }
 if(str('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str('email')))
  errors.email='Escribe un correo válido, por ejemplo empresa@dominio.com.';
 const activity=String(fiscal.activity_code??'').trim();
 if(activity&&!COMPANY_ACTIVITY_PATTERN.test(activity))
  errors.activity_code='Utiliza el formato 4019.0 o un código histórico de seis dígitos.';
 const formats={province:/^[1-7]$/,canton:/^\d{2}$/,district:/^\d{2}$/};
 for(const [key,pattern] of Object.entries(formats)){
  const value=String(fiscal[key]??'').trim();
  if(value&&!pattern.test(value))errors[key]=`${COMPANY_FIELD_TITLES[key]}: selecciona una opción válida.`;
 }
 const p=String(fiscal.province??''),c=String(fiscal.canton??''),d=String(fiscal.district??'');
 if(c&&!p)errors.province='Selecciona una provincia antes de elegir cantón.';
 if(d&&!c)errors.canton='Selecciona un cantón antes de elegir distrito.';
 const expected=p&&c&&d?p+c+d:'';
 const postal=String(fiscal.postal_code??'');
 if(postal&&postal!==expected)errors.postal_code='El código postal no coincide con la provincia, cantón y distrito. Vuelve a seleccionar el distrito.';
 return errors;
}

export function companyServerErrorField(message,field){
 if(field&&Object.hasOwn(COMPANY_FIELD_TITLES,field))return field;
 const value=String(message||'');
 if(/tipo de identificaci[oó]n|seleccione el tipo/i.test(value))return 'identification_type';
 if(/número de identificación|cédula|DIMEX|NITE|identificación ya|identificaci[oó]n ya/i.test(value))return 'identification';
 if(/actividad econ[oó]mica/i.test(value))return 'activity_code';
 if(/c[oó]digo postal/i.test(value))return 'postal_code';
 if(/provincia/i.test(value))return 'province';
 if(/cant[oó]n/i.test(value))return 'canton';
 if(/distrito/i.test(value))return 'district';
 if(/raz[oó]n social/i.test(value))return 'legal_name';
 if(/correo/i.test(value))return 'email';
 if(/direcci[oó]n/i.test(value))return 'address';
 return null;
}
