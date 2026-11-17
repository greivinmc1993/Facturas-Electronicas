import {parseFive,fiveString,roundRatio} from './fiscal-precision.js';
// FacturaCR 0.6.71: BORRADOR XML 4.4 exclusivamente informativo y de solo lectura.
// La clave y el consecutivo son deliberadamente ficticios. NO validar, firmar ni enviar.
import {COMPANY_ACTIVITY_PATTERN,validateCompanyIdentification} from './company-identity.js';

const XML_NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
const VALID_TAX_RATES=new Map([[0,null],[1,'02'],[2,'03'],[4,'04'],[13,'08']]);
const PAYMENT_CODES=new Map([['Efectivo','01'],['Tarjeta','02'],['Cheque','03'],['Transferencia bancaria','04'],['SINPE Móvil','06'],['Otros','99']]);
// El cálculo usa 5 decimales y aritmética entera: nunca se redondea el IVA al colón
// para "hacer cuadrar" una venta POS histórica cuyo precio pudo incluir IVA.
function centsToFive(cents){return BigInt(cents)*1000n;}
function taxToFive(baseCents,rate){return BigInt(baseCents)*BigInt(rate)*10n;}
function five(value){
  const v=BigInt(value),negative=v<0n,abs=negative?-v:v;
  return `${negative?'-':''}${abs/100000n}.${String(abs%100000n).padStart(5,'0')}`;
}
function two(cents){return (Number(cents)/100).toFixed(2);}

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
export function createFeXmlDraft({company,fiscal,sale,client,lines,payments=[],generatedAt=new Date()}={}){
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
  // El codigo de actividad es TEXTO. CIIU4 admite XXXX.X (seis caracteres, no seis dígitos).
  // Aceptamos además los seis dígitos históricos que la ficha fiscal ya conserva, sin conversión.
  // La pertenencia real al RUT se verificará por separado antes de habilitar emisión.
  const activityCode=String(f.activity_code??'').trim();
  if(!COMPANY_ACTIVITY_PATTERN.test(activityCode))issues.push('Actividad económica: indica el código inscrito en el RUT con formato 4019.0 (XXXX.X) o un código histórico de seis dígitos.');
  if(!/^[1-7]$/.test(String(f.province||''))||!/^[0-9]{2}$/.test(String(f.canton||''))||!/^[0-9]{2}$/.test(String(f.district||'')))issues.push('Empresa: falta provincia, cantón o distrito de la ficha fiscal.');
  validateReceptor(client,issues);
  if(!lines.length||lines.length>100)issues.push('Venta: se requieren entre 1 y 100 líneas de detalle.');
  // Los medios de pago deben venir de sale_payments; no se infieren por la condición contado.
  if(!Array.isArray(payments))payments=[];
  const groupedPayments=new Map();
  for(const pay of payments){
    const method=String(pay?.method||'');
    if(!PAYMENT_CODES.has(method)){issues.push(`Medio de pago: «${method}» no tiene código fiscal configurado.`);continue}
    if(!Number.isSafeInteger(pay.amount_cents)||pay.amount_cents<=0){issues.push(`Medio de pago: importe inválido en «${method}».`);continue}
    const code=PAYMENT_CODES.get(method);
    groupedPayments.set(code,{code,amount:(groupedPayments.get(code)?.amount||0)+pay.amount_cents,other:code==='99'?'Otro medio de pago registrado':null});
  }
  if(groupedPayments.size<1)issues.push('Medio de pago: la venta de contado no tiene pagos históricos registrados.');
  if(groupedPayments.size>4)issues.push('Medio de pago: Hacienda permite hasta cuatro tipos de pago por comprobante.');
  const paymentSum=[...groupedPayments.values()].reduce((sum,p)=>sum+p.amount,0);
  if(Number.isSafeInteger(sale.total_cents)&&paymentSum!==sale.total_cents)issues.push(`Medio de pago: pagos registrados ₡${two(paymentSum)}; total de venta ₡${two(sale.total_cents)}. No se inventan pagos para igualarlos.`);
  let subtotal=0,discount=0,tax=0,total=0;
  const detailed=lines.map((line,index)=>{
    const suffix=`Línea ${index+1}`;
    const cabys=String(line.cabys??'').trim(),description=String(line.description??'');
    if(!/^\d{13}$/.test(cabys))issues.push(`${suffix}: falta el CAByS de 13 dígitos en el producto vinculado.`);
    if(description.trim().length<3||description.length>200)issues.push(`${suffix}: descripción fuera del rango de 3 a 200 caracteres.`);
    if(!Number.isSafeInteger(line.quantity)||line.quantity<=0)issues.push(`${suffix}: cantidad inválida.`);
    if(!Number.isSafeInteger(line.unit_price_cents)||line.unit_price_cents<0)issues.push(`${suffix}: precio histórico inválido.`);
    const fiscalNew=String(line.fiscal_calculation_version||'')==='2';
    if(!fiscalNew&&Number.isSafeInteger(line.unit_price_cents)&&Number.isSafeInteger(line.quantity)&&Number.isSafeInteger(line.subtotal_cents)&&line.unit_price_cents*line.quantity!==line.subtotal_cents)issues.push(`${suffix}: cantidad × precio unitario no coincide con el monto de la línea.`);
    if(!VALID_TAX_RATES.has(Number(line.tax_rate)))issues.push(`${suffix}: tarifa de IVA ${line.tax_rate} % pendiente de codificación en esta etapa.`);
    if(!['producto','servicio'].includes(line.kind))issues.push(`${suffix}: falta el tipo de artículo (producto o servicio) de la venta.`);
    for(const field of ['subtotal_cents','discount_cents','tax_cents','total_cents'])if(!Number.isSafeInteger(line[field])||line[field]<0)issues.push(`${suffix}: importe histórico ${field} inválido.`);
    if(Number.isSafeInteger(line.subtotal_cents)&&Number.isSafeInteger(line.discount_cents)&&Number.isSafeInteger(line.tax_cents)&&Number.isSafeInteger(line.total_cents)){
      if(line.subtotal_cents-line.discount_cents+line.tax_cents!==line.total_cents)issues.push(`${suffix}: base, descuento, IVA y total no concilian.`);
      subtotal+=line.subtotal_cents;discount+=line.discount_cents;tax+=line.tax_cents;total+=line.total_cents;
    }
    const baseCents=Number(line.subtotal_cents)-Number(line.discount_cents);
    const rate=Number(line.tax_rate);
    let calculatedTax5=null;
    if(Number.isSafeInteger(baseCents)&&baseCents>=0&&VALID_TAX_RATES.has(rate)){
      calculatedTax5=taxToFive(baseCents,rate);
      if(!fiscalNew&&Number.isSafeInteger(line.tax_cents)&&calculatedTax5!==centsToFive(line.tax_cents)){
        issues.push(`${suffix}: IVA registrado ₡${two(line.tax_cents)} no coincide con base ₡${two(baseCents)} × ${rate}% = ₡${five(calculatedTax5)}. Revisa el precio con IVA incluido y la base histórica; no se modifica la venta.`);
      }
    }
    let fiscal=null;
    if(fiscalNew){
      const keys=['unit_price','subtotal','discount','base','tax','total','input_price'];
      try{
        fiscal=Object.fromEntries(keys.map(k=>[k,parseFive(line['fiscal_'+k+'_5'])]));
        // Un único renglón comercial: la base IVA incluido se calcula sobre el total
        // real, y el unitario XML se redondea a cinco decimales. La diferencia entre
        // ambos solo puede ser el residuo matemático de ese redondeo (0.00001 CRC/tick).
        // Nunca se corrige mediante una segunda línea, descuento ficticio o IVA alterado.
        if(Number.isSafeInteger(line.quantity)&&line.quantity>0){
          const qty=BigInt(line.quantity),expectedUnit=roundRatio(fiscal.subtotal,qty);
          const residual=fiscal.unit_price*qty-fiscal.subtotal;
          const absoluteResidual=residual<0n?-residual:residual;
          if(fiscal.unit_price!==expectedUnit||absoluteResidual*2n>qty){
            issues.push(`${suffix}: precio unitario y monto total no corresponden a un redondeo unitario de cinco decimales. No se altera la venta.`);
          }else if(residual!==0n){
            warnings.push(`${suffix}: residuo de redondeo unitario de ₡${five(absoluteResidual)} (cinco decimales, una sola línea). Pendiente de validar la aceptación en Hacienda.`);
          }
          // Sin descuentos, el total que el comercio cobró con IVA incluido
          // debe ser exactamente el precio de entrada por la cantidad.
          if(Number(line.fiscal_includes_tax)===1&&fiscal.discount===0n&&fiscal.input_price*qty!==fiscal.total){
            issues.push(`${suffix}: el total fiscal no conserva el precio final con IVA incluido registrado.`);
          }
        }
        const expectedTax=roundRatio(fiscal.base*BigInt(Math.round(rate*100)),10000n);
        if(fiscal.subtotal-fiscal.discount!==fiscal.base||fiscal.base+fiscal.tax!==fiscal.total)
          issues.push(`${suffix}: la fotografía fiscal almacenada no concilia (base, descuento, impuesto y total).`);
        if(fiscal.tax!==expectedTax && (fiscal.tax>expectedTax?fiscal.tax-expectedTax:expectedTax-fiscal.tax)>1n)
          issues.push(`${suffix}: IVA fiscal no corresponde a la base y tarifa, incluso considerando el último decimal.`);
        // La capa comercial persiste centavos, puede diferir hasta 1 centavo
        // de la representación fiscal de cinco decimales por redondeo visible.
        for(const [key,column] of [['subtotal','subtotal_cents'],['discount','discount_cents'],['tax','tax_cents'],['total','total_cents']]){
          if(Math.abs(Number(roundRatio(fiscal[key],1000n))-Number(line[column]))>1)
            issues.push(`${suffix}: fotografía fiscal ${key} no corresponde al importe comercial guardado.`);
        }
      }catch(err){issues.push(`${suffix}: fotografía fiscal inválida: ${err.message}`);fiscal=null}
    }
    return {...line,cabys,taxCode:VALID_TAX_RATES.get(rate),description,baseCents,calculatedTax5,fiscal};
  });
  if(!Number.isSafeInteger(sale.subtotal_cents)||!Number.isSafeInteger(sale.discount_cents)||!Number.isSafeInteger(sale.tax_cents)||!Number.isSafeInteger(sale.total_cents)||
    subtotal!==sale.subtotal_cents||discount!==sale.discount_cents||tax!==sale.tax_cents||total!==sale.total_cents){
      issues.push('Venta: las sumas históricas de líneas no coinciden con los totales registrados.');
  }
  if(!Number.isFinite(new Date(generatedAt).getTime()))issues.push('Fecha de vista previa inválida.');
  warnings.push('La clave y el consecutivo son ceros ficticios: NO utilizarlos para emitir ni para validar ante Hacienda.');
  warnings.push('Actividad económica: solo se comprobó el formato; no se ha confirmado que esté vigente e inscrita para esta empresa en el RUT de Hacienda.');
  warnings.push('Los CAByS de prueba no se verifican contra catálogo: queda pendiente su comprobación oficial.');
  warnings.push('Mercancía o servicio se toma de la ficha del producto, no de los primeros dígitos de un CAByS ficticio.');
  warnings.push('ProveedorSistemas utiliza por ahora la identificación del emisor; debe verificarse la identidad real del proveedor antes de emitir.');
  warnings.push('Pendiente: validación contra XSD 4.4, RUT/CAByS reales, firma XAdES-EPES, numeración fiscal y envío.');
  if(issues.length)return {version:'4.4',mode:'draft-only',ready:false,issues,warnings,xml:null};
  // Si hay un desajuste entre bases y tributos históricos, se rechaza el borrador:
  // es inseguro cambiar la base o el precio acordado sin información histórica adicional.
  const escLines=detailed.map((l,i)=>{
    const sub=l.baseCents,amountTax=l.fiscal?.tax??(l.calculatedTax5||0n);
    const amountSubtotal=l.fiscal?.subtotal??centsToFive(l.subtotal_cents),
      amountDiscount=l.fiscal?.discount??centsToFive(l.discount_cents),
      amountBase=l.fiscal?.base??centsToFive(sub),
      amountTotal=l.fiscal?.total??(centsToFive(sub)+amountTax);
    const unitPrice=l.fiscal?.unit_price??centsToFive(l.unit_price_cents);
    return [
      '    <LineaDetalle>',tag('NumeroLinea',i+1,3),tag('CodigoCABYS',l.cabys,3),
      tag('Cantidad',Number(l.quantity).toFixed(3),3),tag('UnidadMedida',l.unit||'Unid',3),tag('Detalle',l.description,3),
      tag('PrecioUnitario',five(unitPrice),3),tag('MontoTotal',five(amountSubtotal),3),
      ...(amountDiscount>0n?['      <Descuento>',tag('MontoDescuento',five(amountDiscount),4),
         tag('CodigoDescuento','99',4),tag('CodigoDescuentoOTRO','Descuento comercial interno',4),
         tag('NaturalezaDescuento','Descuento comercial aplicado en la venta',4),'      </Descuento>']:[]),
      tag('SubTotal',five(amountBase),3),
      ...(Number(l.tax_rate)>0?[tag('BaseImponible',five(amountBase),3),
        '      <Impuesto>',tag('Codigo','01',4),tag('CodigoTarifaIVA',l.taxCode,4),
        tag('Tarifa',Number(l.tax_rate).toFixed(2),4),tag('Monto',five(amountTax),4),'      </Impuesto>']:[]),
      tag('ImpuestoAsumidoEmisorFabrica','0.00000',3),tag('ImpuestoNeto',five(amountTax),3),
      tag('MontoTotalLinea',five(amountTotal),3),'    </LineaDetalle>'
    ].join('\n');
  });
  const taxable=detailed.filter(l=>Number(l.tax_rate)>0),exempt=detailed.filter(l=>Number(l.tax_rate)===0);
  const sum=rows=>rows.reduce((a,l)=>a+(l.fiscal?l.fiscal.base:centsToFive(l.baseCents)),0n);
  // El catálogo CAByS se validará más adelante. Su prefijo NO autoriza a
  // convertir arbitrariamente una bebida en un servicio.
  const isService=l=>l.kind==='servicio';
  const rowsBy=(arr,p)=>sum(arr.filter(p));
  const totalGravado=sum(taxable),totalExento=sum(exempt);
  const taxBreakdown=new Map();
  for(const line of taxable){
    const key='01:'+line.taxCode;
    taxBreakdown.set(key,(taxBreakdown.get(key)||0n)+(line.fiscal?.tax??line.calculatedTax5));
  }
  const breakdownXml=[...taxBreakdown.entries()].map(([key,value])=>{
    const [,rateCode]=key.split(':');
    return ['    <TotalDesgloseImpuesto>',tag('Codigo','01',3),tag('CodigoTarifaIVA',rateCode,3),
      tag('TotalMontoImpuesto',five(value),3),'    </TotalDesgloseImpuesto>'].join('\n');
  });
  const fiscalSummary={
    subtotal:detailed.reduce((acc,l)=>acc+(l.fiscal?.subtotal??centsToFive(l.subtotal_cents)),0n),
    discount:detailed.reduce((acc,l)=>acc+(l.fiscal?.discount??centsToFive(l.discount_cents)),0n),
    tax:detailed.reduce((acc,l)=>acc+(l.fiscal?.tax??centsToFive(l.tax_cents)),0n),
    total:detailed.reduce((acc,l)=>acc+(l.fiscal?.total??centsToFive(l.total_cents)),0n)
  };
  const paymentXml=[...groupedPayments.values()].map(p=>[
    '    <MedioPago>',tag('TipoMedioPago',p.code,3),
    ...(p.other?[tag('MedioPagoOtros',p.other,3)]:[]),
    tag('TotalMedioPago',money(p.amount),3),'    </MedioPago>'
  ].join('\n'));
  const xml=[
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- FacturaCR 0.6.72 | BORRADOR DE PRUEBA: NO FIRMADO, NO AUTORIZADO, NO ENVIAR A HACIENDA -->',
    `<FacturaElectronica xmlns="${XML_NAMESPACE}">`,
    tag('Clave','0'.repeat(50)),tag('ProveedorSistemas',company.identification),tag('CodigoActividadEmisor',activityCode),
    ...(COMPANY_ACTIVITY_PATTERN.test(String(client.activity_code||''))?[tag('CodigoActividadReceptor',client.activity_code)]:[]),
    tag('NumeroConsecutivo','0'.repeat(20)),tag('FechaEmision',timestampCR(new Date(generatedAt))),
    '  <Emisor>',tag('Nombre',company.legal_name,2),'    <Identificacion>',tag('Tipo',f.identification_type,3),tag('Numero',company.identification,3),'    </Identificacion>',
    ...(company.trade_name?.trim()?[tag('NombreComercial',company.trade_name.trim(),2)]:[]),
    '    <Ubicacion>',tag('Provincia',f.province,3),tag('Canton',f.canton,3),tag('Distrito',f.district,3),tag('OtrasSenas',company.address,3),'    </Ubicacion>',
    tag('CorreoElectronico',company.email,2),'  </Emisor>',
    '  <Receptor>',tag('Nombre',client.name,2),'    <Identificacion>',tag('Tipo',client.identification_type,3),tag('Numero',client.identification,3),'    </Identificacion>',
    ...(/^[1-7]$/.test(String(client.province||''))&&/^\d{2}$/.test(String(client.canton||''))&&/^\d{2}$/.test(String(client.district||''))&&String(client.address||'').trim().length>=5?[
      '    <Ubicacion>',tag('Provincia',client.province,3),tag('Canton',client.canton,3),tag('Distrito',client.district,3),tag('OtrasSenas',client.address,3),'    </Ubicacion>']:[]),
    ...(client.email?[tag('CorreoElectronico',client.email,2)]:[]),'  </Receptor>',
    tag('CondicionVenta','01'),
    '  <DetalleServicio>',...escLines,'  </DetalleServicio>',
    '  <ResumenFactura>','    <CodigoTipoMoneda>',tag('CodigoMoneda','CRC',3),tag('TipoCambio','1.00000',3),'    </CodigoTipoMoneda>',
    tag('TotalServGravados',five(rowsBy(taxable,isService)),2),tag('TotalServExentos',five(rowsBy(exempt,isService)),2),
    tag('TotalMercanciasGravadas',five(rowsBy(taxable,l=>!isService(l))),2),tag('TotalMercanciasExentas',five(rowsBy(exempt,l=>!isService(l))),2),
    tag('TotalGravado',five(totalGravado),2),tag('TotalExento',five(totalExento),2),
    tag('TotalVenta',five(fiscalSummary.subtotal),2),tag('TotalDescuentos',five(fiscalSummary.discount),2),tag('TotalVentaNeta',five(fiscalSummary.subtotal-fiscalSummary.discount),2),
    ...breakdownXml,tag('TotalImpuesto',five(fiscalSummary.tax),2),...paymentXml,
    tag('TotalComprobante',five(fiscalSummary.total),2),'  </ResumenFactura>',
    '</FacturaElectronica>',''
  ].join('\n');
  return {version:'4.4',mode:'draft-only',ready:true,issues:[],warnings,xml,
    totals:{subtotalCents:subtotal,discountCents:discount,taxCents:tax,totalCents:total},saleId:sale.id};
}
