'use strict';
/**
 * v0.6.93 - cotejo ORIENTATIVO de identificadores declarados en el asunto X.509.
 * No autentica al usuario, no comprueba titularidad, representación, CA ni revocación.
 * Nunca se usa como condición que permita firma o emisión.
 */
const IDENTIFIER_KEYS=new Set(['serialnumber','organizationidentifier','2.5.4.5','oid.2.5.4.5','2.5.4.97','oid.2.5.4.97']);

function normalizeIdentification(value){
 if(typeof value!=='string'||value.length>40)return null;
 const v=value.trim();
 if(!/^\d[\d\s.\-]*$/.test(v))return null;
 const digits=v.replace(/[^\d]/g,'');
 return /^\d{9,12}$/.test(digits)?digits:null;
}
function parseExplicitIdentifiers(subject){
 if(typeof subject!=='string'||subject.length>4000)return [];
 // Node X509Certificate.subject suele separar RDN por saltos de línea.
 // También reconocemos RDN separados por coma; nunca buscamos números del CN.
 const entries=subject.split(/\r?\n|,(?=\s*[A-Za-z][A-Za-z0-9.]*\s*=)/i);
 const found=[];
 for(const entry of entries){
  const m=/^\s*([^=]{1,65})\s*=\s*(.*?)\s*$/.exec(entry);
  if(!m||!IDENTIFIER_KEYS.has(m[1].trim().toLowerCase()))continue;
  let raw=m[2].trim();
  // Las políticas costarricenses presentan la cédula física como
  // CPF-0P-XXXX-XXXX (10 dígitos), aunque la ficha fiscal usa PXXXXXXXX
  // (9 dígitos). Reducir SOLO el cero de relleno de provincia en CPF.
  // Nunca suprimir ceros arbitrarios de una cédula jurídica, DIMEX o NITE.
  const cpf=/^CPF-0([1-9])-(\d{4})-(\d{4})$/i.exec(raw);
  if(cpf)raw=cpf[1]+cpf[2]+cpf[3];
  else raw=raw.replace(/^(?:(?:CPF|CEDULA|CÉDULA|ID|IDENTIFICACION|IDENTIFICACIÓN|CR)\s*[:#-]\s*)/i,'');
  const id=normalizeIdentification(raw);
  if(id)found.push(id);
 }
 return [...new Set(found)];
}
function matchCertificateToCompany(subject,companyIdentification){
 const expected=normalizeIdentification(companyIdentification);
 const base={canSign:false,canIssue:false,verifiedOwnership:false};
 if(!expected)return {...base,status:'INDETERMINATE',title:'Sin cotejo de identificación',detail:'La empresa no tiene un número nacional de 9 a 12 dígitos apto para esta comparación local.'};
 const ids=parseExplicitIdentifiers(subject);
 if(ids.length===0)return {...base,status:'INDETERMINATE',title:'Identificación no concluyente',detail:'El certificado no expone un identificador fiscal inequívoco en los atributos X.509 examinados. El nombre del titular por sí solo no demuestra coincidencia.'};
 if(ids.length>1)return {...base,status:'INDETERMINATE',title:'Varios identificadores declarados',detail:'El certificado contiene identificadores diferentes. Debes revisar el titular y la representación legal mediante fuentes autorizadas.'};
 if(ids[0]===expected)return {...base,status:'MATCH',title:'Coincidencia textual de identificación',detail:'El identificador explícito del asunto X.509 coincide con el registrado para la empresa. No verifica la autoridad emisora, titularidad legal ni autorización para firmar.'};
 return {...base,status:'MISMATCH',title:'Identificaciones diferentes',detail:'El identificador explícito del certificado no coincide con el de la empresa seleccionada. Revisa si corresponde al representante autorizado; no se permite emitir desde este diagnóstico.'};
}
module.exports={normalizeIdentification,parseExplicitIdentifiers,matchCertificateToCompany};
