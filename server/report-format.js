// Formatos compartidos por todos los reportes: UTF-8 BOM y datos tipados.
// Solo protegemos cadenas potencialmente interpretadas como fórmulas;
// los números negativos son números y NO requieren prefijo de apóstrofo.
export const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function csvCell(value,{identifier=false}={}){
  if(typeof value==='number'&&Number.isFinite(value))return '"'+String(value)+'"';
  const raw=String(value??'');
  // Reportes heredados: si una celda monetaria viene formateada con ₡,
  // convertirla a una cifra decimal para Excel sin modificar las etiquetas.
  // Admite espacios, separadores de miles y decimales regionales.
  const currency=raw.match(/^\s*([+-]?)\s*₡\s*([\d\s\u00a0\u202f.,]+)\s*$/);
  if(currency){
    const numberText=currency[2].replace(/[\s\u00a0\u202f]/g,'');
    const comma=numberText.lastIndexOf(','),dot=numberText.lastIndexOf('.');
    const decimalIndex=Math.max(comma,dot);
    let numeric;
    if(decimalIndex>=0 && numberText.length-decimalIndex-1===2){
      numeric=numberText.slice(0,decimalIndex).replace(/[.,]/g,'')+','+numberText.slice(decimalIndex+1);
    }else numeric=numberText.replace(/[.,]/g,'');
    return '"'+currency[1]+numeric+'"';
  }
  // Identificadores con ceros iniciales o muchos dígitos: Excel como texto.
  // La expresión es completamente numérica y nunca procede de una fórmula externa.
  if(identifier&&/^\d+$/.test(raw))return '"=""'+raw+'"""';
  if(/^-?\d+(?:[.,]\d+)?$/.test(raw)&&!identifier)return '"'+raw+'"';
  const unsafe=/^[\s\u0000-\u001f]*[=+@\-]/.test(raw);
  return '"'+(unsafe?"'":'')+raw.replace(/"/g,'""')+'"';
}
export function csvDocument(headers,rows,{identifiers=[]}={}){
  const line=(row)=>row.map((cell,i)=>csvCell(cell,{identifier:identifiers.includes(i)})).join(';');
  return '\uFEFFsep=;\r\n'+[headers,...rows].map(line).join('\r\n')+'\r\n';
}
export function reportHtml({title,company='',subtitle='',headers=[],rows=[],summary=[],note='',landscape=true}){
  const esc=htmlEscape;
  const cards=summary.length?`<section class="stats">${summary.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>`:'';
  const head=headers.map(h=>`<th>${esc(h)}</th>`).join('');
  const body=rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length||1}">Sin registros para los filtros seleccionados.</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
  @page{size:A4 ${landscape?'landscape':'portrait'};margin:12mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#213447;margin:0}header{border-bottom:3px solid #128677;padding-bottom:12px;margin-bottom:16px}h1{font-size:21px;margin:0 0 7px;color:#11665c}header strong{display:block;font-size:12px}header p{margin:7px 0;color:#556b7a;overflow-wrap:anywhere}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 15px}.stats>div{flex:1;min-width:145px;padding:11px;background:#eef8f4;border:1px solid #d5e8e0;border-radius:6px}.stats span{display:block;color:#536a72;font-size:9px}.stats b{display:block;font-size:14px;margin-top:5px;color:#125e55}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{text-align:left;background:#dff1eb;color:#164e46;font-size:9px;padding:7px 5px;overflow-wrap:anywhere}td{border-bottom:1px solid #dce7e5;padding:7px 5px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}tr{break-inside:avoid;page-break-inside:avoid}tbody tr:nth-child(even){background:#f7fbfa}footer{border-top:1px solid #dce7e5;margin-top:17px;padding-top:8px;color:#617586;font-size:9px}</style></head><body>
  <header><h1>${esc(title)}</h1><strong>${esc(company)}</strong><p>${esc(subtitle)}</p><p>Generado: ${esc(new Date().toLocaleString('es-CR'))}</p></header>${cards}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><footer>${esc(note||'Reporte comercial interno de FacturaCR. No constituye un comprobante electrónico de Hacienda.')}</footer></body></html>`;
}

// CSV de Excel en Windows: BOM UTF-16 LE. Excel reconoce la codificación
// al abrir con doble clic, también con caracteres acentuados y ₡.
// El nombre del archivo sigue siendo .csv; los importadores deben detectar BOM.
export function csvExcelBuffer(text){
  const content=String(text??'').replace(/^\uFEFF/,'');
  return Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(content,'utf16le')]);
}
