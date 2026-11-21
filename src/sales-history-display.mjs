// Formato de historiales: nunca altera los registros comerciales ni sus asociaciones.
// SQLite CURRENT_TIMESTAMP usa UTC; los filtros de la interfaz usan la fecha LOCAL del equipo.
export function saleClientLabel(sale={}) {
  if(sale.document_mode==='TE')return 'Tiquete electrónico';
  if(sale.document_mode==='GENERICA')return 'Genérica';
  const name=String(sale.client_name||sale.client?.name||'').trim();
  if(name)return name;
  return sale.document_mode==='FE'?'Cliente no disponible':'Sin cliente registrado';
}
export function saleModeLabel(sale={}) {
  if(sale.document_mode==='FE')return 'Factura electrónica';
  if(sale.document_mode==='TE')return 'Tiquete electrónico';
  if(sale.document_mode==='GENERICA')return 'Genérica';
  return 'Histórica';
}
export function saleLocalDate(value) {
  const raw=String(value||'').trim();
  // SQLite almacena "YYYY-MM-DD HH:MM:SS" sin offset, siempre en UTC.
  const sqliteUtc=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  const withZone=/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
  if(sqliteUtc.test(raw)||withZone.test(raw)){
    const timestamp=sqliteUtc.test(raw)?raw.replace(' ','T')+'Z':raw;
    const date=new Date(timestamp);
    if(!Number.isNaN(date.getTime())){
      const pad=n=>String(n).padStart(2,'0');
      return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
    }
  }
  // Datos heredados incompletos: no inventar zona horaria.
  const valueDate=/^\d{4}-\d{2}-\d{2}/.exec(raw);
  return valueDate?valueDate[0]:'';
}

// Fecha visible coherente con el filtro local; la marca UTC original sigue en SQLite.
export function saleLocalDateTime(value) {
  const raw=String(value||'').trim();
  const sqliteUtc=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
  const withZone=/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
  if(sqliteUtc.test(raw)||withZone.test(raw)){
    const date=new Date(sqliteUtc.test(raw)?raw.replace(' ','T')+'Z':raw);
    if(!Number.isNaN(date.getTime()))return `${saleLocalDate(raw)} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }
  return raw;
}
