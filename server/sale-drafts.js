// Los borradores NO son ventas ni reservas de existencias. Se aíslan por usuario y empresa.
export function registerSaleDraftRoutes(app,getDb){
 const company=(req,res)=>{
   const id=Number(req.params.companyId);
   if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:'Empresa inválida.'});return null;}
   if(!getDb().prepare('SELECT id FROM companies WHERE id=?').get(id)){res.status(404).json({error:'Empresa inexistente.'});return null;}
   return id;
 };
 app.get('/api/companies/:companyId/sales/draft',(req,res)=>{
   const id=company(req,res);if(id===null)return;
   const row=getDb().prepare('SELECT draft_json,updated_at FROM sale_drafts WHERE user_id=? AND company_id=?').get(req.authUser.id,id);
   if(!row)return res.json({draft:null});
   try{res.json({draft:JSON.parse(row.draft_json),updatedAt:row.updated_at})}catch{res.json({draft:null})}
 });
 const writeDraft=(req,res)=>{
   const id=company(req,res);if(id===null)return;
   const d=req.body;
   if(!d||typeof d!=='object'||!Array.isArray(d.lines)||d.lines.length>200||!['contado','credito'].includes(d.saleType)||typeof d.discount!=='string'||String(JSON.stringify(d)).length>90000)return res.status(400).json({error:'Borrador inválido.'});
   if(!d.lines.length){getDb().prepare('DELETE FROM sale_drafts WHERE user_id=? AND company_id=?').run(req.authUser.id,id);return res.json({ok:true,empty:true});}
   if(!d.lines.every(l=>Number.isSafeInteger(l.id)&&l.id>0&&Number.isSafeInteger(l.quantity)&&l.quantity>0&&l.quantity<=100000))return res.status(400).json({error:'Cantidades del borrador inválidas.'});
   const stored={version:1,lines:d.lines.map(l=>({id:l.id,quantity:l.quantity})),clientId:String(d.clientId||'').slice(0,50),saleType:d.saleType,discount:d.discount.slice(0,40),cashTendered:String(d.cashTendered||'').slice(0,40),payments:Array.isArray(d.payments)?d.payments.slice(0,10).map(p=>({method:String(p.method||'').slice(0,60),amount:String(p.amount||'').slice(0,40)})):[]};
   getDb().prepare('INSERT INTO sale_drafts(user_id,company_id,draft_json) VALUES (?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET draft_json=excluded.draft_json,updated_at=CURRENT_TIMESTAMP').run(req.authUser.id,id,JSON.stringify(stored));
   res.json({ok:true});
 };
 app.put('/api/companies/:companyId/sales/draft',writeDraft);
 // En cierre normal, sendBeacon reduce el riesgo de perder el último cambio.
 app.post('/api/companies/:companyId/sales/draft/beacon',writeDraft);
 app.delete('/api/companies/:companyId/sales/draft',(req,res)=>{const id=company(req,res);if(id===null)return;getDb().prepare('DELETE FROM sale_drafts WHERE user_id=? AND company_id=?').run(req.authUser.id,id);res.json({ok:true});});
}
