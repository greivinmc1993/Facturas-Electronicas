// Presentación legible de la bitácora: nunca muestra JSON de la API al usuario.
export const auditLabels={
 'auth.owner_setup':'Creación de propietario','auth.login':'Inicio de sesión','auth.login_failed':'Intento fallido de acceso',
 'auth.logout':'Cierre de sesión','auth.lock':'Bloqueo de sesión','auth.password_change':'Cambio de contraseña',
 'auth.owner_assisted_recovery':'Recuperación administrada','auth.owner_recovered':'Recuperación del propietario',
 'auth.recovery_rotated':'Código de emergencia actualizado','users.create':'Usuario creado','users.update':'Usuario modificado',
 'users.deleted':'Perfil eliminado','users.company_access_revoked':'Acceso retirado','users.cashier_delegation':'Delegación de cajeros',
 'inventory.movement':'Movimiento de inventario','inventory.product_changed':'Artículo modificado',
 'sales.create':'Venta registrada','sales.void':'Venta anulada','sales.payment':'Pago de venta',
 'cash.operation':'Movimiento de caja','cash.expense':'Gasto de caja',
 'clients.changed':'Cliente modificado','quotations.changed':'Cotización modificada',
 'security.idle_lock_changed':'Tiempo de bloqueo actualizado'
};
export const auditCategories=[['','Todas las actividades'],['auth.','Accesos y seguridad'],['users.','Usuarios y permisos'],['sales.','Ventas y pagos'],['inventory.','Inventario y Kardex'],['cash.','Caja'],['clients.','Clientes'],['quotations.','Cotizaciones'],['security.','Configuración']];
export function auditCostaRica(value){
 if(!value)return 'Sin fecha';
 const raw=String(value).trim();
 const normalized=/(?:Z|[+-]\d\d:\d\d)$/i.test(raw)?raw:raw.replace(' ','T')+'Z';
 const d=new Date(normalized);
 return Number.isNaN(d.getTime())?raw:new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);
}
const words={entrada:'Entrada de mercadería',salida:'Salida de existencias',ajuste:'Ajuste por conteo físico'};
const scalar=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('es-CR',{maximumFractionDigits:2}):String(value??'');
export function auditDetail(row){
 const d=row.details&&typeof row.details==='object'?row.details:{};
 const account=row.target_username?`@${row.target_username}`:'la cuenta indicada';
 switch(row.event_type){
  case 'auth.login':return 'La persona inició sesión correctamente.';
  case 'auth.login_failed':return 'Se rechazó un intento de inicio de sesión.';
  case 'auth.logout':return 'La persona cerró su sesión.';
  case 'auth.lock':return 'La sesión se bloqueó.';
  case 'auth.owner_setup':return 'Se configuró la cuenta propietaria de esta instalación.';
  case 'auth.password_change':return 'La persona actualizó su contraseña.';
  case 'auth.owner_assisted_recovery':return `El propietario restableció el acceso de ${account}.`;
  case 'auth.owner_recovered':return 'Se recuperó la cuenta propietaria.';
  case 'users.create':return `Se creó el perfil ${account}.`;
  case 'users.update':return `Se actualizaron los datos o permisos de ${account}.`;
  case 'users.deleted':return `Se desactivó el perfil ${account}; se conserva su historial.`;
  case 'users.company_access_revoked':return `Se retiró a ${account} el acceso a una empresa.`;
  case 'users.cashier_delegation':return `Se modificó la delegación para administrar cajeros de ${account}.`;
  case 'inventory.movement':{
   const action=words[d.type]||'Movimiento de inventario';
   const name=row.product_name?`«${row.product_name}»${row.product_code?` (SKU ${row.product_code})`:''}`:`artículo #${d.productId||'sin identificar'}`;
   const quantity=d.quantity!==undefined&&d.quantity!==null?` · ${d.type==='ajuste'?'Existencia contada':'Cantidad'}: ${scalar(d.quantity)}`:'';
   const reason=String(d.reason||'').trim();
   return `${action} de ${name}${quantity}${reason?` · Motivo: ${reason}`:''}.`;
  }
  case 'inventory.product_changed':return 'Se actualizó el catálogo de artículos de la empresa.';
  case 'sales.create':return `Se registró una venta${row.object_id&&/^\d+$/.test(String(row.object_id))?` #${row.object_id}`:''}.`;
  case 'sales.void':return 'Se anuló una venta y se registró la operación.';
  case 'sales.payment':return 'Se registró un pago de una venta.';
  case 'cash.operation':return 'Se registró una apertura o un cierre de caja.';
  case 'cash.expense':return 'Se registró un gasto de caja.';
  case 'clients.changed':return 'Se creó o actualizó un cliente.';
  case 'quotations.changed':return 'Se creó o modificó una cotización.';
  case 'security.idle_lock_changed':return 'Se modificó el tiempo global de bloqueo automático.';
  default:return 'Operación registrada en el historial del sistema.';
 }
}
export function auditActor(row){return row.display_name||row.username||'Cuenta histórica';}
export function auditCompany(row){return row.trade_name||row.legal_name||(row.company_id?`Empresa #${row.company_id}`:'General');}
export function auditColumns(row){return [row.id,auditCostaRica(row.occurred_at),auditActor(row),row.username||'Sistema',auditCompany(row),auditLabels[row.event_type]||row.event_type,auditDetail(row)];}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function auditPdfHtml(rows,{total=rows.length,page=1,filters={},users=[],companies=[]}={}){
 const user=users.find(x=>String(x.id)===String(filters.userId));
 const company=companies.find(x=>String(x.id)===String(filters.companyId));
 const category=auditCategories.find(x=>x[0]===filters.category)?.[1]||'Todas las actividades';
 const scope=[`Tipo: ${category}`,`Usuario: ${user?.display_name||'Todos'}`,`Empresa: ${company?.trade_name||company?.legal_name||'Todas'}`,`Periodo: ${filters.from||'inicio'} a ${filters.to||'actualidad'}`].join(' · ');
 const body=rows.length?rows.map(r=>`<tr><td class="when">${escapeHtml(auditCostaRica(r.occurred_at))}</td><td><strong>${escapeHtml(auditActor(r))}</strong><small>@${escapeHtml(r.username||'Sistema')}</small></td><td>${escapeHtml(auditCompany(r))}</td><td><strong>${escapeHtml(auditLabels[r.event_type]||r.event_type)}</strong></td><td>${escapeHtml(auditDetail(r))}</td></tr>`).join(''):'<tr><td colspan="5">No hay eventos para estos filtros.</td></tr>';
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>FacturaCR | Auditoría del propietario</title><style>
 @page{size:A4 landscape;margin:14mm 12mm 15mm;}*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Arial,sans-serif;color:#183849;font-size:9.5px;line-height:1.45}
 .identity{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #087f70;padding-bottom:11px;margin-bottom:15px}
 .brand{color:#087f70;font-size:17px;font-weight:800;letter-spacing:.25px}.confidential{color:#516b78;font-size:9px;text-align:right}
 h1{color:#173a47;font-size:23px;margin:0 0 5px}.subtitle{font-size:11px;color:#657c86;margin:0 0 10px}
 .scope{border:1px solid #d5e8e4;background:#f3faf8;padding:10px 12px;border-radius:8px;margin:12px 0 15px;color:#2f6170}
 .stats{display:flex;gap:11px;margin:0 0 15px}.stats>div{border:1px solid #d9e9e8;background:#f5faf9;padding:10px 13px;min-width:140px;border-radius:7px}
 .stats strong{display:block;font-size:17px;color:#087f70}.stats span{color:#536c78;font-size:9px}
 table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#ddf0eb;color:#164c49;text-transform:uppercase;font-size:8.5px;letter-spacing:.25px;padding:9px 8px;text-align:left}
 th:nth-child(1){width:15%}th:nth-child(2){width:17%}th:nth-child(3){width:16%}th:nth-child(4){width:18%}th:nth-child(5){width:34%}
 td{padding:9px 8px;border-bottom:1px solid #e2ecec;vertical-align:top;overflow-wrap:anywhere}td small{display:block;color:#677e87;margin-top:2px}tbody tr:nth-child(even){background:#f6faf9}tr{break-inside:avoid;page-break-inside:avoid}
 .when{font-variant-numeric:tabular-nums}footer{border-top:1px solid #dbe8e6;color:#637781;margin-top:16px;padding-top:8px;font-size:9px}header{page-break-after:avoid}
 </style></head><body><header><div class="identity"><div class="brand">FacturaCR</div><div class="confidential">Documento interno · Uso exclusivo del propietario<br/>Hora local: Costa Rica (UTC-6)</div></div><h1>Auditoría del propietario</h1><p class="subtitle">Registro de actividad de usuarios, inventario, ventas, caja y seguridad</p></header><section class="scope">${escapeHtml(scope)}</section>
 <div class="stats"><div><span>Eventos con los filtros</span><strong>${escapeHtml(total)}</strong></div><div><span>Página exportada</span><strong>${escapeHtml(page)}</strong></div><div><span>Registros en este PDF</span><strong>${escapeHtml(rows.length)}</strong></div></div>
 <table><thead><tr><th>Fecha y hora</th><th>Responsable</th><th>Empresa</th><th>Operación</th><th>Detalle</th></tr></thead><tbody>${body}</tbody></table>
 <footer>Reporte de auditoría generado en FacturaCR · Incluye únicamente la página visible (hasta 50 registros). Los eventos históricos se conservan en SQLite.</footer></body></html>`;
}
