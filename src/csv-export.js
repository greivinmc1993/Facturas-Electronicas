// Archivo CSV legible por Excel Windows (UTF-16 LE + BOM + sep=;).
// No modifica los datos; permite importar de vuelta detectando el BOM.
export function csvExcelBlob(text){
 const source=String(text??'').replace(/^\uFEFF/,'');
 const bytes=new Uint8Array(2+source.length*2);bytes[0]=255;bytes[1]=254;
 for(let i=0;i<source.length;i++){const code=source.charCodeAt(i);bytes[2+i*2]=code&255;bytes[3+i*2]=code>>8;}
 return new Blob([bytes],{type:'text/csv;charset=utf-16le'});
}
export function decodeCatalogCsv(bytes){
 const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(raw[0]===255&&raw[1]===254)return new TextDecoder('utf-16le').decode(raw);
 if(raw[0]===254&&raw[1]===255)return new TextDecoder('utf-16be').decode(raw);
 if(raw[0]===239&&raw[1]===187&&raw[2]===191)return new TextDecoder('utf-8').decode(raw);
 // Sin BOM: compatibilidad con los CSV antiguos en Excel en español.
 return new TextDecoder('windows-1252').decode(raw);
}

// Exportaciones locales: números editables en Excel y protección de fórmulas
// en campos de texto introducidos por clientes, sin alterar signos negativos.
export function csvSafeCell(value){
 const raw=String(value??'');
 if(typeof value==='number'&&Number.isFinite(value))return '"'+raw+'"';
 const dangerous=/^[\s\u0000-\u001f]*[=+@\-]/.test(raw);
 return '"'+(dangerous?"'":'')+raw.replace(/"/g,'""')+'"';
}
