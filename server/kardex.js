import {csvCell,csvDocument,csvExcelBuffer,reportHtml} from './report-format.js';
import {movementCost,movementCostSummary} from './kardex-costs.js';
// Kardex global de inventario. Solo lectura; nunca modifica existencias.
const types=['all','entrada','salida','ajuste'];
const dateRE=/^\d{4}-\d{2}-\d{2}$/;
export function buildKardexFilters(query={}){
 const type=String(query.type||'all');
 const productId=String(query.productId||'').trim();
 const from=String(query.from||'').trim(),to=String(query.to||'').trim();
 const search=String(query.search||'').trim();
 const page=Number(query.page||1);
 if(!types.includes(type))throw Error('Tipo de movimiento inválido.');
 if(productId&&!/^[1-9]\d{0,12}$/.test(productId))throw Error('Artículo inválido.');
 for(const day of [from,to])if(day&&(!dateRE.test(day)||Number.isNaN(new Date(day+'T00:00:00Z').valueOf())||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day))throw Error('Fecha inválida.');
 if(from&&to&&from>to)throw Error('La fecha inicial no puede superar la final.');
 if(search.length>100)throw Error('Búsqueda demasiado larga.');
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw Error('Página inválida.');
 const params=[];let where='m.company_id=?';
 if(productId){where+=' AND m.product_id=?';params.push(Number(productId))}
 if(type!=='all'){where+=' AND m.movement_type=?';params.push(type)}
 if(from){where+=' AND m.created_at>=?';params.push(from+' 00:00:00')}
 if(to){where+=' AND m.created_at<?';params.push(new Date(new Date(to+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10)+' 00:00:00')}
 if(search){where+=' AND (p.description LIKE ? OR p.product_code LIKE ? OR m.reason LIKE ?)';params.push(...Array(3).fill('%'+search+'%'))}
 return {where,params,page,from,to,type,productId,search};
}
const BASE=`FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.company_id=m.company_id`;
const FIELDS=`m.id,m.created_at,m.product_id,p.description AS product_name,p.product_code,p.unit,p.is_deleted,m.movement_type,m.quantity,m.delta,m.stock_before,m.stock_after,m.reason,m.notes,m.unit_cost_cents`;
export function registerKardexRoutes(app,db){
 const core=(req,res)=>{
  const companyId=Number(req.params.companyId);
  if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId)){
   res.status(404).json({error:'Empresa no encontrada.'});return null;
  }
  try{const filters=buildKardexFilters(req.query);return {...filters,args:[companyId,...filters.params]}}
  catch(e){res.status(400).json({error:e.message});return null}
 };
 app.get('/api/companies/:companyId/inventory/kardex',(req,res)=>{
  const f=core(req,res);if(!f)return;
  const summary=db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN m.delta>0 THEN m.delta ELSE 0 END),0) AS increases,COALESCE(SUM(CASE WHEN m.delta<0 THEN -m.delta ELSE 0 END),0) AS decreases,COUNT(DISTINCT m.product_id) AS products ${BASE} WHERE ${f.where}`).get(...f.args);
  const limit=50,offset=(f.page-1)*limit;
  const valued=db.prepare(`SELECT
   COUNT(CASE WHEN m.unit_cost_cents IS NOT NULL AND m.unit_cost_cents>0 THEN 1 END) AS covered,
   COALESCE(SUM(CASE WHEN m.delta>0 AND m.unit_cost_cents>0 THEN ROUND(m.delta*m.unit_cost_cents) ELSE 0 END),0) AS incomingCents,
   COALESCE(SUM(CASE WHEN m.delta<0 AND m.unit_cost_cents>0 THEN ROUND(-m.delta*m.unit_cost_cents) ELSE 0 END),0) AS outgoingCents
   ${BASE} WHERE ${f.where}`).get(...f.args);
  Object.assign(summary,valued,{uncovered:summary.count-valued.covered});
  const rows=db.prepare(`SELECT ${FIELDS} ${BASE} WHERE ${f.where} ORDER BY m.id DESC LIMIT ? OFFSET ?`).all(...f.args,limit,offset).map(movementCost);
  res.json({rows,summary,page:f.page,pageSize:limit,totalPages:Math.max(1,Math.ceil(summary.count/limit))});
 });
 const reportRows=f=>db.prepare(`SELECT ${FIELDS} ${BASE} WHERE ${f.where} ORDER BY m.id DESC`).all(...f.args);
 const exportColumns=['ID','Fecha UTC','Artículo','SKU','Estado','Tipo','Cantidad','Variación','Existencia anterior','Existencia posterior','Unidad','Motivo','Observaciones','Costo unitario histórico CRC','Valor movimiento CRC','Cobertura de costo'];
 const exportRow=raw=>{const r=movementCost(raw);return [r.id,r.created_at,r.product_name,r.product_code,r.is_deleted?'Retirado':'Activo',r.movement_type,r.quantity,r.delta,r.stock_before,r.stock_after,r.unit,r.reason,r.notes,r.unitCostCents===null?'':(r.unitCostCents/100).toFixed(2),r.movementCostCents===null?'':(r.movementCostCents/100).toFixed(2),r.movementCostCents===null?'Sin costo histórico':'Con costo histórico']};
 app.get('/api/companies/:companyId/inventory/kardex/export.csv',(req,res)=>{
  const f=core(req,res);if(!f)return;
  res.setHeader('Content-Type','text/csv; charset=utf-16le');res.setHeader('Content-Disposition','attachment; filename="FacturaCR_kardex.csv"');
  res.write(csvExcelBuffer('sep=;\r\n'+exportColumns.map(h=>csvCell(h)).join(';')+'\r\n'));
  const stmt=db.prepare(`SELECT ${FIELDS} ${BASE} WHERE ${f.where} AND m.id<? ORDER BY m.id DESC LIMIT 500`);
  let lastId=Number.MAX_SAFE_INTEGER;
  for(;;){const batch=stmt.all(...f.args,lastId);if(!batch.length)break;
   for(const r of batch){const row=exportRow(r);res.write(Buffer.from(row.map((value,i)=>csvCell(value,{identifier:i===3})).join(';')+'\r\n','utf16le'))}
   lastId=batch[batch.length-1].id;if(batch.length<500)break;
  }res.end();
 });
 app.get('/api/companies/:companyId/inventory/kardex/export.html',(req,res)=>{
  const f=core(req,res);if(!f)return;
  const company=db.prepare('SELECT legal_name,trade_name,identification FROM companies WHERE id=?').get(Number(req.params.companyId));
  const summary=db.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(CASE WHEN m.delta>0 THEN m.delta ELSE 0 END),0) AS ins,COALESCE(SUM(CASE WHEN m.delta<0 THEN -m.delta ELSE 0 END),0) AS outs ${BASE} WHERE ${f.where}`).get(...f.args);
  const all=reportRows(f),costs=movementCostSummary(all);
  const rows=all.map(movementCost).map(r=>[r.id,r.created_at,r.product_name+' · '+(r.product_code||'Sin SKU'),r.movement_type,r.delta,r.stock_before,r.stock_after,r.unitCostCents===null?'Sin costo':(r.unitCostCents/100).toFixed(2),r.movementCostCents===null?'Sin valorar':(r.movementCostCents/100).toFixed(2),r.reason||'',r.notes||'']);
  const headers=['ID','Fecha UTC','Artículo / SKU','Tipo','Variación','Antes','Después','Costo unitario CRC','Valor movimiento CRC','Motivo','Observaciones'];
  res.type('html').send(reportHtml({title:'Kardex · Historial de inventario',company:company.trade_name||company.legal_name,subtitle:`Empresa ${company.identification||''} · Filtro ${f.search||'Todos'} · Tipo ${f.type} · Desde ${f.from||'inicio'} hasta ${f.to||'actualidad'} (UTC)`,headers,rows,summary:[['Movimientos',summary.n],['Unidades añadidas',summary.ins],['Unidades retiradas',summary.outs],['Valor entradas conocidas (₡)',(costs.incomingCents/100).toFixed(2)],['Valor salidas conocidas (₡)',(costs.outgoingCents/100).toFixed(2)],['Movimientos sin costo histórico',costs.uncovered]],note:'Valoración estimada al costo histórico conocido en CRC. Los movimientos previos a esta versión y los productos sin costo válido o en USD se muestran sin valorar. No equivale al flujo de caja ni a utilidad contable.'}));
 });
}
