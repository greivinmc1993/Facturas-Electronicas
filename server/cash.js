import {csvDocument,csvExcelBuffer,reportHtml} from './report-format.js';

// Caja operativa: registra sesiones, gastos reales en efectivo y cobros de ventas activas.
// No transforma ventas a crédito en efectivo hasta que existan pagos Efectivo registrados.
export function ensureCashSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    opening_cents INTEGER NOT NULL CHECK(opening_cents>=0),
    opening_payment_id INTEGER NOT NULL DEFAULT 0,
    closing_payment_id INTEGER,
    status TEXT NOT NULL DEFAULT 'abierta' CHECK(status IN ('abierta','cerrada')),
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    counted_cents INTEGER,
    expected_cents INTEGER,
    difference_cents INTEGER,
    opening_note TEXT NOT NULL DEFAULT '',
    closing_note TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_only_one_open ON cash_sessions(company_id) WHERE status='abierta';
  CREATE INDEX IF NOT EXISTS idx_cash_company ON cash_sessions(company_id,id DESC);
  CREATE TABLE IF NOT EXISTS cash_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cash_expenses_session ON cash_expenses(session_id,id DESC);`);
}

export function registerCashRoutes(app,db,companyFromRequest){
  ensureCashSchema(db);
  const asMoney=value=>{
    if(typeof value!=='number'&&typeof value!=='string')throw Error('Monto inválido.');
    const raw=String(value).trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Ingresa un monto en colones con máximo dos decimales.');
    const [whole,fraction='']=raw.split('.');
    const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(cents)||cents>100000000000)throw Error('Monto fuera del límite permitido.');
    return cents;
  };
  const note=(value,limit)=>{
    const text=String(value??'').trim();
    if(text.length>limit)throw Error('El texto excede el máximo permitido.');
    return text;
  };
  const getSession=(companyId,id)=>db.prepare('SELECT * FROM cash_sessions WHERE company_id=? AND id=?').get(companyId,id);
  const current=(companyId)=>db.prepare("SELECT * FROM cash_sessions WHERE company_id=? AND status='abierta'").get(companyId);
  const summary=(session)=>{
    const received=db.prepare(`SELECT COALESCE(SUM(p.amount_cents),0) AS cents, COUNT(*) AS entries
      FROM sale_payments p JOIN sales s ON s.id=p.sale_id
      WHERE s.company_id=? AND s.status='activa' AND p.method='Efectivo'
        AND p.id > ? AND (? IS NULL OR p.id <= ?)` ).get(session.company_id,session.opening_payment_id,session.closing_payment_id,session.closing_payment_id);
    const spent=db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents, COUNT(*) AS entries FROM cash_expenses WHERE company_id=? AND session_id=?').get(session.company_id,session.id);
    return {received_cents:received.cents,received_count:received.entries,expense_cents:spent.cents,expense_count:spent.entries,
      expected_cents:session.opening_cents+received.cents-spent.cents};
  };
  const payload=(companyId)=>{
    const active=current(companyId),rows=db.prepare('SELECT * FROM cash_sessions WHERE company_id=? ORDER BY id DESC LIMIT 20').all(companyId);
    const enriched=rows.map(s=>({...s,summary:summary(s)}));
    const selected=active||rows[0]||null;
    const expenses=selected?db.prepare('SELECT * FROM cash_expenses WHERE company_id=? AND session_id=? ORDER BY id DESC LIMIT 100').all(companyId,selected.id):[];
    return {active:active?{...active,summary:summary(active)}:null,history:enriched,expenses,selected_id:selected?.id||null};
  };
  const route=(fn)=>(req,res)=>{try{fn(req,res)}catch(e){res.status(400).json({error:e.message})}};
  app.get('/api/companies/:companyId/cash',route((req,res)=>res.json(payload(companyFromRequest(req)))));
  app.post('/api/companies/:companyId/cash/open',route((req,res)=>{
    const id=companyFromRequest(req),opening=asMoney(req.body?.opening_amount),openingNote=note(req.body?.note,300);
    const created=db.transaction(()=>{
      if(current(id))throw Error('Esta empresa ya tiene una caja abierta.');
      const watermark=db.prepare('SELECT COALESCE(MAX(p.id),0) AS id FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE s.company_id=?').get(id).id;
      return db.prepare('INSERT INTO cash_sessions(company_id,opening_cents,opening_note,opening_payment_id) VALUES(?,?,?,?)').run(id,opening,openingNote,watermark).lastInsertRowid;
    })();
    res.status(201).json({id:created,...payload(id)});
  }));
  const categories=['Compra menor','Transporte','Servicios','Mantenimiento','Otros'];
  app.post('/api/companies/:companyId/cash/expenses',route((req,res)=>{
    const id=companyFromRequest(req),category=String(req.body?.category||''),description=note(req.body?.description,250),amount=asMoney(req.body?.amount);
    if(!categories.includes(category)||description.length<3||amount<=0)throw Error('Selecciona una categoría, una descripción y un importe positivo.');
    const expense=db.transaction(()=>{
      const s=current(id);if(!s)throw Error('Abre una caja antes de registrar un gasto en efectivo.');
      return db.prepare('INSERT INTO cash_expenses(company_id,session_id,category,description,amount_cents) VALUES(?,?,?,?,?)').run(id,s.id,category,description,amount).lastInsertRowid;
    })();
    res.status(201).json({id:expense,...payload(id)});
  }));
  app.post('/api/companies/:companyId/cash/close',route((req,res)=>{
    const id=companyFromRequest(req),counted=asMoney(req.body?.counted_amount),closingNote=note(req.body?.note,300);
    const record=db.transaction(()=>{
      const s=current(id);if(!s)throw Error('No hay una caja abierta para cerrar.');
      const watermark=db.prepare('SELECT COALESCE(MAX(p.id),0) AS id FROM sale_payments p JOIN sales v ON v.id=p.sale_id WHERE v.company_id=?').get(id).id;
      const totals=summary({...s,closing_payment_id:watermark});
      db.prepare("UPDATE cash_sessions SET status='cerrada',closed_at=CURRENT_TIMESTAMP,counted_cents=?,expected_cents=?,difference_cents=?,closing_note=?,closing_payment_id=? WHERE id=? AND company_id=? AND status='abierta'")
        .run(counted,totals.expected_cents,counted-totals.expected_cents,closingNote,watermark,s.id,id);
      return {...s,...totals,counted_cents:counted,difference_cents:counted-totals.expected_cents};
    })();
    res.json({closed:record,...payload(id)});
  }));
  const report=(req,res,format)=>{
    const id=companyFromRequest(req),sessionId=Number(req.query.sessionId),s=Number.isSafeInteger(sessionId)&&sessionId>0?getSession(id,sessionId):current(id)||db.prepare('SELECT * FROM cash_sessions WHERE company_id=? ORDER BY id DESC LIMIT 1').get(id);
    if(!s)return res.status(404).json({error:'No hay registros de caja para exportar.'});
    const company=db.prepare('SELECT * FROM companies WHERE id=?').get(id);
    const totals=summary(s);
    const exp=db.prepare('SELECT created_at,category,description,amount_cents FROM cash_expenses WHERE company_id=? AND session_id=? ORDER BY id').all(id,s.id);
    const headers=['Fecha UTC','Categoría','Descripción','Gasto CRC'];
    const rows=exp.map(e=>[e.created_at,e.category,e.description,(e.amount_cents/100).toFixed(2)]);
    const money=n=>'₡'+(Number(n)/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const stats=[['Fondo inicial',money(s.opening_cents)],['Cobros efectivos de ventas activas',money(totals.received_cents)],['Gastos registrados',money(totals.expense_cents)],['Esperado al cierre',money(s.status==='cerrada'?s.expected_cents:totals.expected_cents)],['Estado',s.status]];
    if(s.status==='cerrada')stats.push(['Efectivo contado',money(s.counted_cents)],['Diferencia',money(s.difference_cents)]);
    if(format==='csv'){
      const records=[['Sesión',s.id],['Empresa',company.trade_name||company.legal_name],['Fecha apertura UTC',s.opened_at],['Fecha cierre UTC',s.closed_at||'Abierta'],...stats,['',''],headers,...rows];
      res.setHeader('Content-Type','text/csv; charset=utf-16le');res.setHeader('Content-Disposition',`attachment; filename="FacturaCR_caja_${id}_${s.id}.csv"`);return res.send(csvExcelBuffer(csvDocument([],records)));
    }
    res.type('html').send(reportHtml({title:'Reporte de caja y gastos',company:company.trade_name||company.legal_name,subtitle:`Sesión #${s.id} · Apertura UTC: ${s.opened_at} · ${s.closed_at?`Cierre UTC: ${s.closed_at}`:'Abierta'}`,headers,rows,summary:stats,note:'Los cobros en efectivo se calculan a partir de pagos de ventas actualmente activas. No es un estado contable ni incluye métodos de pago electrónicos. No sustituye un arqueo físico.'}));
  };
  app.get('/api/companies/:companyId/cash/export.csv',route((req,res)=>report(req,res,'csv')));
  app.get('/api/companies/:companyId/cash/export.html',route((req,res)=>report(req,res,'html')));
}
