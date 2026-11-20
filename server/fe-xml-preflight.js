/**
 * Comprobaciones aritméticas y estructurales del XML que GENERA FacturaCR.
 * No es un parser XML genérico ni un validador XSD. No acepta documentos externos.
 * Ningún resultado de este módulo autoriza firma, numeración o envío a Hacienda.
 */
const NS='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
const FIVE=/^(0|[1-9]\d*)\.\d{5}$/;
const THREE=/^(0|[1-9]\d*)\.\d{3}$/;
const HEADER=['Clave','ProveedorSistemas','CodigoActividadEmisor','NumeroConsecutivo','FechaEmision','Emisor','Receptor','CondicionVenta','DetalleServicio','ResumenFactura'];
const digits=(s,scale)=>{const [a,b]=s.split('.');return BigInt(a)*scale+BigInt(b)};
const lineAt=(xml,fragment)=>{const n=xml.indexOf(fragment);return n<0?null:1+xml.slice(0,n).split('\n').length-1};
const tagValue=(xml,tag)=>{
  const m=xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));return m?m[1]:null;
};
export function preflightFe44Draft(xml,{expectedLines}={}){
  const findings=[];
  const report=(severity,field,fragment,message)=>findings.push({severity,field,line:lineAt(xml,fragment),message});
  if(typeof xml!=='string'||xml.length>2_000_000||xml.length<200){
    return {kind:'draft-preflight',schema:'NOT_VALIDATED',signature:'NOT_VALIDATED',ok:false,findings:[{severity:'error',field:'XML',line:null,message:'Borrador XML vacío o fuera de tamaño esperado.'}]};
  }
  if(!xml.includes(`<FacturaElectronica xmlns="${NS}">`))report('error','FacturaElectronica','<FacturaElectronica','El elemento principal no utiliza el espacio de nombres FE 4.4 esperado.');
  if(!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))report('error','XML','<FacturaElectronica','Falta la declaración XML UTF-8.');
  let prior=-1;
  for(const name of HEADER){
    const position=xml.indexOf(`<${name}>`);
    if(position<0){report('error',name,'<FacturaElectronica',`Falta el elemento ${name}.`);continue}
    if(position<prior)report('error',name,`<${name}>`,`El elemento ${name} aparece fuera del orden básico del borrador FE 4.4.`);
    prior=position;
  }
  const key=tagValue(xml,'Clave'),consecutive=tagValue(xml,'NumeroConsecutivo');
  if(key!=='0'.repeat(50)||consecutive!=='0'.repeat(20))report('error','Clave / NumeroConsecutivo','<Clave>','El borrador no debe usar claves fiscales reales en esta etapa de ensayo.');
  if(/<(?:ds:)?Signature(?:\s|>)/.test(xml))report('error','Signature','<Signature','La firma XML no pertenece a esta etapa de borrador sin autorización.');
  const rows=[...xml.matchAll(/<LineaDetalle>([\s\S]*?)<\/LineaDetalle>/g)];
  if(!rows.length||rows.length>100)report('error','DetalleServicio','<DetalleServicio>','Se esperan de una a cien líneas comerciales.');
  if(expectedLines!=null && rows.length!==expectedLines)report('error','DetalleServicio','<DetalleServicio>','La cantidad de líneas XML no coincide con la venta original.');
  let documentTotal=0n,lineTaxTotal=0n,subtotalTotal=0n,discountTotal=0n;
  for(let n=0;n<rows.length;n++){
    const piece=rows[n][1],full=rows[n][0],field=`DetalleServicio.LineaDetalle[${n+1}]`;
    const fail=(tag,message)=>report('error',`${field}.${tag}`,full,message);
    if(tagValue(piece,'NumeroLinea')!==String(n+1))fail('NumeroLinea','Numeración de línea discontinua.');
    if(!/^\d{13}$/.test(tagValue(piece,'CodigoCABYS')||''))fail('CodigoCABYS','El código CAByS no contiene trece dígitos.');
    const moneyValues={};
    for(const t of ['PrecioUnitario','MontoTotal','SubTotal','ImpuestoNeto','MontoTotalLinea']){
      const v=tagValue(piece,t);if(!FIVE.test(v||'')){fail(t,`Monto ${t} ausente o sin cinco decimales.`);continue}
      moneyValues[t]=digits(v,100000n);
    }
    const q=tagValue(piece,'Cantidad');
    if(!THREE.test(q||'')||digits(q,1000n)<=0n)fail('Cantidad','Cantidad ausente o fuera del formato del borrador.');
    if(Object.keys(moneyValues).length!==5||!THREE.test(q||''))continue;
    const quantity=digits(q,1000n);
    const difference=moneyValues.PrecioUnitario*quantity-moneyValues.MontoTotal*1000n;
    const absDifference=difference<0n?-difference:difference;
    if(absDifference>quantity/2n)fail('MontoTotal','El residuo unitario supera la media unidad del último decimal del precio unitario.');
    const discountBlock=piece.match(/<Descuento>([\s\S]*?)<\/Descuento>/);
    const discount=discountBlock?tagValue(discountBlock[1],'MontoDescuento'):null;
    if(discount!=null&&!FIVE.test(discount))fail('MontoDescuento','El descuento debe tener cinco decimales.');
    const discountAmount=discount!=null&&FIVE.test(discount)?digits(discount,100000n):0n;
    if(moneyValues.MontoTotal-discountAmount!==moneyValues.SubTotal)fail('SubTotal','Subtotal no coincide con monto de línea menos descuento.');
    const taxBlock=piece.match(/<Impuesto>([\s\S]*?)<\/Impuesto>/);
    const taxValue=taxBlock?tagValue(taxBlock[1],'Monto'):null;
    if(taxValue!=null&&!FIVE.test(taxValue))fail('Impuesto.Monto','Impuesto sin cinco decimales.');
    const taxAmount=taxValue!=null&&FIVE.test(taxValue)?digits(taxValue,100000n):0n;
    if(moneyValues.ImpuestoNeto!==taxAmount)fail('ImpuestoNeto','ImpuestoNeto no concilia con el impuesto de esta línea.');
    if(moneyValues.SubTotal+taxAmount!==moneyValues.MontoTotalLinea)fail('MontoTotalLinea','MontoTotalLinea no concilia con SubTotal + IVA.');
    documentTotal+=moneyValues.MontoTotalLinea;lineTaxTotal+=taxAmount;
    subtotalTotal+=moneyValues.MontoTotal;discountTotal+=discountAmount;
  }
  const summaryMatch=xml.match(/<ResumenFactura>([\s\S]*?)<\/ResumenFactura>/);
  if(summaryMatch){
    const summary=summaryMatch[1];
    for(const [tag,expected] of [['TotalComprobante',documentTotal],['TotalImpuesto',lineTaxTotal],['TotalVenta',subtotalTotal],['TotalDescuentos',discountTotal]]){
      const v=tagValue(summary,tag);if(!FIVE.test(v||'')){report('error',`ResumenFactura.${tag}`,`<${tag}>`,`${tag} ausente o sin cinco decimales.`);continue}
      if(digits(v,100000n)!==expected)report('error',`ResumenFactura.${tag}`,`<${tag}>`,`${tag} no coincide con la suma de líneas generadas.`);
    }
  }
  report('notice','Firma y XSD', '<FacturaElectronica', 'Prevalidación local únicamente: XML sin firma, clave ni consecutivo fiscal; esquema XSD oficial no comprobado.');
  return {kind:'draft-preflight',schema:'NOT_VALIDATED',signature:'NOT_VALIDATED',ok:!findings.some(f=>f.severity==='error'),findings};
}
