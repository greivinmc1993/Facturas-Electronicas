/** FacturaCR v0.6.72 - Aritmética fiscal determinística en unidades de 1/100000 CRC.
 * No usa Number para dinero ni para las operaciones intermedias.
 * El precio introducido puede incluir IVA o ser una base sin IVA.
 * Los importes comerciales siguen cobrados en centavos; el asiento fiscal es de 5 decimales.
 * Las líneas de venta históricas (sin fotografía) NO se recalculan en la migración.
 */
export const FISCAL_SCALE=100000n;
export function parseFive(value,{allowNegative=false}={}){
  const str=String(value??'').trim();
  if(!/^-?\d+(?:\.\d{1,5})?$/.test(str))throw Error('El importe debe ser numérico, con hasta cinco decimales.');
  if(!allowNegative&&str.startsWith('-'))throw Error('El importe no puede ser negativo.');
  const [whole,frac='']=str.split('.');
  const negative=whole.startsWith('-');const absolute=negative?whole.slice(1):whole;
  const result=BigInt(absolute)*FISCAL_SCALE+BigInt(frac.padEnd(5,'0'));
  return negative?-result:result;
}
export function fiveString(value){
  const n=BigInt(value),negative=n<0n,abs=negative?-n:n;
  return `${negative?'-':''}${abs/FISCAL_SCALE}.${String(abs%FISCAL_SCALE).padStart(5,'0')}`;
}
export function roundRatio(n,d){
  n=BigInt(n);d=BigInt(d);if(d<=0n)throw Error('Divisor fiscal inválido.');
  return n<0n?-((-n+d/2n)/d):(n+d/2n)/d;
}
export function toCents(five){
  const cents=roundRatio(BigInt(five),1000n);
  if(cents<0n||cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('El importe supera el máximo permitido.');
  return Number(cents);
}
export function fromCents(cents){
  if(!Number.isSafeInteger(cents)||cents<0)throw Error('Centavos inválidos.');
  return BigInt(cents)*1000n;
}
export function rateBasis(rate){
  const v=parseFive(rate);
  if(v>100n*FISCAL_SCALE)throw Error('La tarifa de impuesto supera 100 %.');
  return roundRatio(v,1000n); // centésimas de porcentaje (13 -> 1300)
}
export function fiscalSale(lines,discountAmount='0'){
  if(!Array.isArray(lines)||!lines.length)throw Error('Agrega al menos un artículo.');
  if(lines.length>100)throw Error('Máximo 100 líneas.');
  const provisional=lines.map((row,i)=>{
    const quantity=Number(row.quantity);
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error(`Cantidad inválida en la línea ${i+1}.`);
    const price5=parseFive(row.price);const rate=rateBasis(row.tax_rate);
    const includes= row.price_includes_tax===true||row.price_includes_tax===1||row.price_includes_tax==='1';
    const qty=BigInt(quantity),listed5=price5*qty;
    const base5=includes?roundRatio(listed5*10000n,10000n+rate):listed5;
    const unit5=roundRatio(base5,qty);
    const unadjustedTax5=includes?listed5-base5:roundRatio(base5*rate,10000n);
    if(base5>100000000000000n)throw Error('Precio demasiado alto.');
    return {quantity,rate,includes,price5,unit5,base5,unadjustedTax5,listed5};
  });
  const subtotal5=provisional.reduce((s,l)=>s+l.base5,0n);
  const discount5=parseFive(discountAmount);
  if(discount5>subtotal5)throw Error('El descuento supera la base sin IVA.');
  const shares=provisional.map((l,index)=>{
    if(subtotal5===0n)return {index,amount:0n,remainder:0n};
    const numerator=discount5*l.base5;
    return {index,amount:numerator/subtotal5,remainder:numerator%subtotal5};
  });
  let undistributed=discount5-shares.reduce((sum,x)=>sum+x.amount,0n);
  // Método de restos mayores: asigna cada unidad restante de 0.00001
  // sin crear descuentos negativos ni favorecer sistemáticamente la última línea.
  for(const share of [...shares].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:(a.remainder>b.remainder?-1:1))){
    if(undistributed<=0n)break;
    if(share.amount<provisional[share.index].base5){share.amount++;undistributed--;}
  }
  if(undistributed!==0n)throw Error('No se pudo distribuir el descuento fiscal exactamente.');
  const detailed=provisional.map((l,i)=>{
    const discountLine5=shares[i].amount;
    const net5=l.base5-discountLine5;
    // Con descuento cero y precio IVA-incluido, preserva exactamente el precio final.
    // La tarifa/base derivadas solo difieren como máximo en una unidad de 1e-5 por redondeo.
    const tax5=l.includes&&discountLine5===0n?l.unadjustedTax5:roundRatio(net5*l.rate,10000n);
    const total5=net5+tax5;
    return {...l,discount5:discountLine5,net5,tax5,total5};
  });
  const sums={subtotal5,discount5,tax5:detailed.reduce((s,l)=>s+l.tax5,0n),total5:detailed.reduce((s,l)=>s+l.total5,0n)};
  // Los céntimos comerciales son la suma de los céntimos de cada línea,
  // para que cada línea siga conciliando con el total histórico de caja.
  const lineCents=detailed.map(l=>{
    const subtotal_cents=toCents(l.base5),discount_cents=toCents(l.discount5),total_cents=toCents(l.total5);
    // Los centavos contables deben cuadrar exactamente. El IVA tributario
    // no cambia: fiscal_tax_5 conserva el monto independiente de 5 decimales.
    const tax_cents=total_cents-subtotal_cents+discount_cents;
    if(tax_cents<0||Math.abs(tax_cents-toCents(l.tax5))>1)
      throw Error('No se pudo representar el IVA comercial con centavos sin perder coherencia.');
    return {subtotal_cents,discount_cents,tax_cents,total_cents};
  });
  const commercialTotalCents=toCents(sums.total5);
  return {lines:detailed,lineCents,...sums,commercialTotalCents};
}
export function fiscalSnapshot(row,calc){
  return {fiscal_unit_price_5:fiveString(calc.unit5),fiscal_subtotal_5:fiveString(calc.base5),
    fiscal_discount_5:fiveString(calc.discount5),fiscal_base_5:fiveString(calc.net5),
    fiscal_tax_5:fiveString(calc.tax5),fiscal_total_5:fiveString(calc.total5),
    fiscal_input_price_5:fiveString(calc.price5),fiscal_includes_tax:calc.includes?1:0,
    fiscal_calculation_version:'2'};
}
