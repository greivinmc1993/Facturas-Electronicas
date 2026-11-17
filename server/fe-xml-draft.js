// FacturaCR 0.6.71: BORRADOR XML 4.4 exclusivamente informativo y de solo lectura.
// La clave y el consecutivo son deliberadamente ficticios. NO validar, firmar ni enviar.
import {validateCompanyIdentification} from './company-identity.js';

const XML_NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
const VALID_TAX_RATES=new Map([[0,null],[1,'02'],[2,'03'],[4,'04'],[13,'08']]);
function cleanXml(value){
  return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function tag(name,value,depth=1){return `${'  '.repeat(depth)}<${name}>${cleanXml(value)}</${name}>`;}
function money(value){if(!Number.isSafeInteger(value)||value<0)throw Error('Los montos históricos de esta venta no son válidos.');return (value/100).toFixed(5);}
function timestampCR(when){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(when).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-06:00`;
}
function requireText(issues,value,label,valid){if(!valid(String(value??'')))issues.push(label);}
function validateReceptor(client,issues){
  if(!client){issues.push('Cliente: esta venta no tiene receptor registrado. Selecciona una venta con cliente identificado.');return}
  requireText(issues,client.name,'Cliente: falta el nombre del receptor.',v=>v.trim().length>=2);
  requireText(issues,client.identification_type,'Cliente: falta tipo de identificación.',v=>/^(01|02|03|04)$/.test(v));
  requireText(issues,client.identification,'Cliente: identificación sin formato válido.',v=>!!v.trim());
  if(client.identification_type&&client.identification){try{validateCompanyIdentification(client.identification_type,client.identification)}catch{issues.push('Cliente: la identificación no corresponde al tipo de documento.')}}
}
export function createFeXmlDraft({company,fiscal,sale,client,lines,generatedAt=new Date()}={}){
  const issues=[],warnings=[];
  if(!company||!sale||!Array.isArray(lines))throw Error('No hay datos suficientes para construir el borrador.');
  if(sale.status!=='activa')issues.push('Venta: no se generan borradores de ventas anuladas.');
  if(sale.sale_type!=='contado')issues.push('Condición de venta: por ahora se admiten solo ventas de contado; las de crédito requieren plazo fiscal.');
  if(sale.currency!=='CRC')issues.push('Moneda: esta etapa admite únicamente ventas históricas en CRC.');
  requireText(issues,company.legal_name,'Empresa: falta razón social.',v=>v.trim().length>=2);
  requireText(issues,company.email,'Empresa: falta un correo válido.',v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  requireText(issues,company.address,'Empresa: falta la dirección exacta.',v=>v.trim().length>=5);
  if(!fiscal)issues.push('Empresa: falta completar la ficha fiscal.');
  const f=fiscal||{};
  try{validateCompanyIdentification(f.identification_type,company.identification)}catch{issues.push('Empresa: tipo y número de identificación incompatibles o incompletos.');}
  // No reinterpretar actividades antiguas del RUT (p. ej. 4019.0) como códigos actuales.
  if(!/^\d{6}$/.test(String(f.activity_code||'')))issues.push('Actividad económica: el XML requiere 6 dígitos vigentes del RUT; no se convierte automáticamente 4019.0.');
  if(!/^[1-7]$/.test(String(f.province||''))||!/^[0-9]{2}$/.test(String(f.canton||''))||!/^[0-9]{2}$/.test(String(f.district||'')))issues.push('Empresa: falta provincia, cantón o distrito de la ficha fiscal.');
  validateReceptor(client,issues);
  if(!lines.length||lines.length>100)issues.push('Venta: se requieren entre 1 y 100 líneas de detalle.');
  let subtotal=0,discount=0,tax=0,total=0;
  const detailed=lines.map((line,index)=>{
    const suffix=`Línea ${index+1}`;
    const cabys=String(line.cabys??'').trim(),description=String(line.description??'');
    if(!/^\d{13}$/.test(cabys))issues.push(`${suffix}: falta el CAByS de 13 dígitos en el producto vinculado.`);
    if(description.trim().length<3||description.length>200)issues.push(`${suffix}: descripción fuera del rango de 3 a 200 caracteres.`);
    if(!Number.isSafeInteger(line.quantity)||line.quantity<=0)issues.push(`${suffix}: cantidad inválida.`);
    if(!Number.isSafeInteger(line.unit_price_cents)||line.unit_price_cents<0)issues.push(`${suffix}: precio histórico inválido.`);
    if(!VALID_TAX_RATES.has(Number(line.tax_rate)))issues.push(`${suffix}: tarifa de IVA ${line.tax_rate} % pendiente de codificación en esta etapa.`);
    for(const field of ['subtotal_cents','discount_cents','tax_cents','total_cents'])if(!Number.isSafeInteger(line[field])||line[field]<0)issues.push(`${suffix}: importe histórico ${field} inválido.`);
    if(Number.isSafeInteger(line.subtotal_cents)&&Number.isSafeInteger(line.discount_cents)&&Number.isSafeInteger(line.tax_cents)&&Number.isSafeInteger(line.total_cents)){
      if(line.subtotal_cents-line.discount_cents+line.tax_cents!==line.total_cents)issues.push(`${suffix}: base, descuento, IVA y total no concilian.`);
      subtotal+=line.subtotal_cents;discount+=line.discount_cents;tax+=line.tax_cents;total+=line.total_cents;
    }
    return {...line,cabys,taxCode:VALID_TAX_RATES.get(Number(line.tax_rate)),description};
  });
  if(!Number.isSafeInteger(sale.subtotal_cents)||!Number.isSafeInteger(sale.discount_cents)||!Number.isSafeInteger(sale.tax_cents)||!Number.isSafeInteger(sale.total_cents)||
    subtotal!==sale.subtotal_cents||discount!==sale.discount_cents||tax!==sale.tax_cents||total!==sale.total_cents){
      issues.push('Venta: las sumas históricas de líneas no coinciden con los totales registrados.');
  }
  if(!Number.isFinite(new Date(generatedAt).getTime()))issues.push('Fecha de vista previa inválida.');
  warnings.push('La clave y el consecutivo son ceros ficticios: NO utilizarlos para emitir ni para validar ante Hacienda.');
  warnings.push('Los CAByS se consultan del catálogo ACTUAL; la venta antigua no guarda una copia histórica del código.');
  warnings.push('Pendiente: XSD oficial 4.4, catálogos RUT/CAByS, tipos de descuento, firma XAdES-EPES, numeración fiscal y envío.');
  if(issues.length)return {version:'4.4',mode:'draft-only',ready:false,issues,warnings,xml:null};
  // Redondeo: se toman exclusivamente centavos históricos de la venta, nunca se recalcula IVA.
  const escLines=detailed.map((l,i)=>{
    const quantity=Number(l.quantity),sub=l.subtotal_cents-l.discount_cents;
    return [
      '    <LineaDetalle>',tag('NumeroLinea',i+1,3),tag('CodigoCABYS',l.cabys,3),
      tag('Cantidad',quantity.toFixed(3),3),tag('UnidadMedida','Unid',3),tag('Detalle',l.description,3),
      tag('PrecioUnitario',money(l.unit_price_cents),3),tag('MontoTotal',money(l.subtotal_cents),3),
      ...(l.discount_cents>0?['      <Descuento>',tag('MontoDescuento',money(l.discount_cents),4),
         tag('CodigoDescuento','99',4),tag('CodigoDescuentoOTRO','Descuento comercial interno',4),
         tag('NaturalezaDescuento','Descuento comercial aplicado en la venta',4),'      </Descuento>']:[]),
      tag('SubTotal',money(sub),3),
      ...(l.tax_cents>0?['      <Impuesto>',tag('Codigo','01',4),tag('CodigoTarifaIVA',l.taxCode,4),tag('Tarifa',Number(l.tax_rate).toFixed(2),4),tag('Monto',money(l.tax_cents),4),'      </Impuesto>']:[]),
      tag('ImpuestoNeto',money(l.tax_cents),3),tag('MontoTotalLinea',money(l.total_cents),3),'    </LineaDetalle>'
    ].join('\n');
  });
  const taxable=detailed.filter(l=>l.tax_cents>0),exempt=detailed.filter(l=>l.tax_cents===0);
  const sum=rows=>rows.reduce((a,l)=>a+l.subtotal_cents-l.discount_cents,0);
  const isService=l=>/^[5-9]/.test(l.cabys);
  const rowsBy=(arr,p)=>sum(arr.filter(p));
  const totalGravado=sum(taxable),totalExento=sum(exempt);
  const xml=[
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- FacturaCR 0.6.71 | BORRADOR DE PRUEBA: NO FIRMADO, NO AUTORIZADO, NO ENVIAR A HACIENDA -->',
    `<FacturaElectronica xmlns="${XML_NAMESPACE}">`,
    tag('Clave','0'.repeat(50)),tag('NumeroConsecutivo','0'.repeat(20)),tag('FechaEmision',timestampCR(new Date(generatedAt))),
    tag('ProveedorSistemas',company.identification),tag('CodigoActividadEmisor',f.activity_code),
    '  <Emisor>',tag('Nombre',company.legal_name,2),'    <Identificacion>',tag('Tipo',f.identification_type,3),tag('Numero',company.identification,3),'    </Identificacion>',
    '    <Ubicacion>',tag('Provincia',f.province,3),tag('Canton',f.canton,3),tag('Distrito',f.district,3),tag('OtrasSenas',company.address,3),'    </Ubicacion>',
    tag('CorreoElectronico',company.email,2),'  </Emisor>',
    '  <Receptor>',tag('Nombre',client.name,2),'    <Identificacion>',tag('Tipo',client.identification_type,3),tag('Numero',client.identification,3),'    </Identificacion>',
    ...(client.email?[tag('CorreoElectronico',client.email,2)]:[]),'  </Receptor>',
    tag('CondicionVenta','01'),
    '  <DetalleServicio>',...escLines,'  </DetalleServicio>',
    '  <ResumenFactura>','    <CodigoTipoMoneda>',tag('CodigoMoneda','CRC',3),tag('TipoCambio','1.00000',3),'    </CodigoTipoMoneda>',
    tag('TotalServGravados',money(rowsBy(taxable,isService)),2),tag('TotalServExentos',money(rowsBy(exempt,isService)),2),
    tag('TotalMercanciasGravadas',money(rowsBy(taxable,l=>!isService(l))),2),tag('TotalMercanciasExentas',money(rowsBy(exempt,l=>!isService(l))),2),
    tag('TotalGravado',money(totalGravado),2),tag('TotalExento',money(totalExento),2),
    tag('TotalVenta',money(subtotal),2),tag('TotalDescuentos',money(discount),2),tag('TotalVentaNeta',money(subtotal-discount),2),
    tag('TotalImpuesto',money(tax),2),tag('TotalComprobante',money(total),2),'  </ResumenFactura>',
    '</FacturaElectronica>',''
  ].join('\n');
  return {version:'4.4',mode:'draft-only',ready:true,issues:[],warnings,xml,
    totals:{subtotalCents:subtotal,discountCents:discount,taxCents:tax,totalCents:total},saleId:sale.id};
}
