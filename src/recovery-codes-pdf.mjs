// v0.6.88: documento de entrega personal. Nunca se guarda en servidor ni en SQLite.
// Solo se usa durante la visualización única de los códigos.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const CODE_PATTERN=/^FCR2-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/;

export function buildRecoveryCodesPdfHtml(recoveryCodes,{accountLabel='',issuedAt=new Date()}={}){
 if(!Array.isArray(recoveryCodes)||recoveryCodes.length!==3||!recoveryCodes.every(code=>typeof code==='string'&&CODE_PATTERN.test(code))){
  throw Error('Solo se permite exportar tres códigos de recuperación nuevos y válidos.');
 }
 const date=issuedAt instanceof Date?issuedAt:new Date(issuedAt);
 if(!Number.isFinite(date.getTime()))throw Error('Fecha inválida.');
 const printedAt=escapeHtml(new Intl.DateTimeFormat('es-CR',{dateStyle:'long',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(date));
 const account=String(accountLabel||'').trim();
 const identity=account?`<div class="meta">Cuenta: <strong>${escapeHtml(account.slice(0,100))}</strong></div>`:'';
 const rows=recoveryCodes.map((code,i)=>`<section class="code"><div class="codeNumber">CÓDIGO ${i+1} DE 3</div><div class="value">${escapeHtml(code)}</div></section>`).join('');
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>FacturaCR - Códigos privados de recuperación</title><style>
 @page{size:A4 portrait;margin:16mm 16mm 17mm}
 *{box-sizing:border-box}body{font:13px/1.55 Arial,Helvetica,sans-serif;color:#233341;margin:0;background:#fff}
 header{border-bottom:3px solid #16776e;padding:0 0 15px;margin:0 0 21px}
 .brand{font-size:12px;letter-spacing:1.5px;font-weight:700;color:#17665e}
 h1{font-size:24px;line-height:1.25;margin:10px 0 9px}p{margin:8px 0}.meta{font-size:12px;color:#526677;margin-top:9px}
 .sensitive{border:1px solid #dfa65d;background:#fff8eb;padding:10px 13px;border-radius:8px;font-weight:700;margin:0 0 18px}
 .code{border:1px solid #cbdcd8;border-radius:8px;margin:0 0 12px;padding:14px 16px;break-inside:avoid;page-break-inside:avoid}
 .codeNumber{font-size:11px;letter-spacing:1px;font-weight:700;color:#376f69;margin-bottom:7px}
 .value{font:700 13px/1.7 Consolas,'Liberation Mono',monospace;overflow-wrap:anywhere;word-break:break-word;letter-spacing:.1px}
 .advice{background:#f0f7f6;border:1px solid #d2e5e1;border-radius:8px;padding:12px 16px;margin-top:18px}
 ol{padding-left:19px;margin:6px 0}li{padding:4px 0}
 footer{font-size:10px;color:#62747c;margin-top:20px;border-top:1px solid #d7e4e2;padding-top:11px}
 </style></head><body><header><div class="brand">FACTURACR · SEGURIDAD DE CUENTA</div><h1>Mis 3 códigos de recuperación</h1><div class="meta">Generado: ${printedAt} · Hora de Costa Rica</div>${identity}</header>
 <div class="sensitive">DOCUMENTO CONFIDENCIAL · Cada código permite recuperar la contraseña una sola vez.</div>
 ${rows}
 <div class="advice"><strong>Instrucciones de seguridad</strong><ol><li>Guarda este PDF o su copia impresa en un lugar privado, preferiblemente fuera de la computadora.</li><li>Si pierdes tu contraseña, utiliza un código desde «Recuperar mi cuenta con código de emergencia».</li><li>Cuando regeneres códigos, este documento quedará obsoleto.</li><li>El PDF no está cifrado. No lo compartas por correo, mensajería ni lo guardes en carpetas sincronizadas sin protección.</li></ol></div>
 <footer>Este documento contiene códigos personales, no contraseñas ni la clave del kit extraordinario. FacturaCR no guarda una copia del PDF.</footer>
 </body></html>`;
}

export function recoveryCodesPdfFilename(issuedAt=new Date()){
 const date=issuedAt instanceof Date?issuedAt:new Date(issuedAt);
 if(!Number.isFinite(date.getTime()))throw Error('Fecha inválida.');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 return `FacturaCR_codigos_recuperacion_${day}.pdf`;
}
