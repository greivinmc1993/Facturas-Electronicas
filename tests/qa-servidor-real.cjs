// Smoke QA con dependencias REALES de Express + better-sqlite3.
// Ejecutar después de npm ci: npm run qa:real-server
// Crea archivos solo en una carpeta temporal que elimina al terminar.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa-nativo-'));
let server;
let checks=0;
async function test(name,fn){await fn();checks++;console.log('OK',name)}
async function main(){
 const {startServer}=await import(pathToFileURL(path.join(root,'server/index.js')).href);
 server=await startServer({dataDir:dir,port:0});
 const base=`http://127.0.0.1:${server.port}`;
 // El servidor real exige crear el propietario e iniciar sesión ANTES de
 // permitir operaciones comerciales; la cookie es efímera, solo para este QA.
 let sessionCookie='';
 const authorizedHeaders=()=>sessionCookie?{cookie:sessionCookie}:{};
 const request=async(method,url,body)=>{
  const options={method,headers:authorizedHeaders()};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
  const res=await fetch(base+url,options);
  return {status:res.status,body:await res.json(),headers:res.headers};
 };
 await test('HTTP health responde versión actual',async()=>{
  const r=await request('GET','/api/health');
  const expected=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  assert.equal(r.status,200);assert.equal(r.body.version,expected);assert.equal(r.body.ok,true);
 });
 await test('Sin propietario, la API comercial exige configuración inicial',async()=>{
  const r=await request('GET','/api/companies');
  assert.equal(r.status,428);assert.equal(r.body.code,'OWNER_SETUP_REQUIRED');
 });
 await test('Cuenta propietaria temporal creada solo para esta prueba',async()=>{
  const r=await request('POST','/api/auth/setup',{
   username:'qa_propietario',displayName:'Propietario de QA',password:'ClaveTemporalQA12345'
  });
  assert.equal(r.status,201,JSON.stringify(r.body));
  const state=await request('GET','/api/auth/status');
  assert.equal(state.status,200);assert.equal(state.body.setupRequired,false);
 });
 await test('Sin cookie, el acceso a operaciones comerciales está protegido',async()=>{
  const r=await request('GET','/api/companies');
  assert.equal(r.status,401);assert.equal(r.body.code,'AUTH_REQUIRED');
 });
 await test('Login real devuelve cookie HttpOnly de propietario y habilita API',async()=>{
  const r=await request('POST','/api/auth/login',{username:'qa_propietario',password:'ClaveTemporalQA12345'});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.user.isOwner,true);
  const setCookie=r.headers.get('set-cookie')||'';
  assert.match(setCookie,/^facturacr_session=[a-f0-9]{64};/);
  assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
  sessionCookie=setCookie.split(';',1)[0];
  const companies=await request('GET','/api/companies');
  assert.equal(companies.status,200,JSON.stringify(companies.body));
 });
 await test('Cambiar contraseña por HTTP invalida sesiones antiguas y mantiene la actual',async()=>{
  const second=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'qa_propietario',password:'ClaveTemporalQA12345'})});
  assert.equal(second.status,200);
  const otherCookie=(second.headers.get('set-cookie')||'').split(';',1)[0];
  assert.match(otherCookie,/^facturacr_session=/);
  const changed=await request('POST','/api/auth/password-change',{
    oldPassword:'ClaveTemporalQA12345',newPassword:'ClavePropietarioQA67890'
  });
  assert.equal(changed.status,200,JSON.stringify(changed.body));
  const oldState=await fetch(base+'/api/auth/status',{headers:{cookie:otherCookie}}).then(r=>r.json());
  assert.equal(oldState.authenticated,false);
  const activeState=await request('GET','/api/auth/status');
  assert.equal(activeState.body.authenticated,true);
  const invalid=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'qa_propietario',password:'ClaveTemporalQA12345'})});
  assert.equal(invalid.status,401);
  const valid=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'qa_propietario',password:'ClavePropietarioQA67890'})});
  assert.equal(valid.status,200);
 });
 // La v0.6.88 entrega tres códigos personales FCR2, no el antiguo FCR1 único.
 // Los secretos viven solo en esta prueba y no se imprimen en registros de CI.
 let recoveryCodes=[];
 await test('HTTP real rota tres códigos FCR2 con autenticación y contraseña actual',async()=>{
  const status=await request('GET','/api/auth/recovery/status');
  assert.equal(status.status,200);assert.equal(status.body.configured,true);
  assert.equal(status.body.remaining,3);assert.equal(status.body.total,3);
  const unauthorized=await fetch(base+'/api/auth/recovery/rotate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'ClavePropietarioQA67890'})});
  assert.equal(unauthorized.status,401);
  const wrong=await request('POST','/api/auth/recovery/rotate',{password:'IncorrectaSegura12345'});
  assert.equal(wrong.status,403);
  const r=await request('POST','/api/auth/recovery/rotate',{password:'ClavePropietarioQA67890'});
  assert.equal(r.status,200,JSON.stringify({status:r.status,error:r.body.error}));
  assert.equal(r.body.ok,true);assert.equal(r.body.remaining,3);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.ok(Array.isArray(r.body.recoveryCodes));
  assert.equal(r.body.recoveryCodes.length,3);
  for(const code of r.body.recoveryCodes){
   assert.match(code,/^FCR2-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/);
  }
  assert.equal(new Set(r.body.recoveryCodes).size,3);
  assert.equal(r.body.recoveryCode,undefined); // La API ya no entrega un código FCR1.
  recoveryCodes=r.body.recoveryCodes;
 });
 await test('HTTP real consume un código FCR2, impide reutilizarlo y revoca sesiones',async()=>{
  const old=sessionCookie;
  const reset=await fetch(base+'/api/auth/recovery/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'qa_propietario',recoveryCode:recoveryCodes[0],newPassword:'ClaveRecuperadaQA12345'})});
  assert.equal(reset.status,200);
  const result=await reset.json();
  assert.equal(result.ok,true);assert.equal(result.remaining,2);
  assert.equal(result.recoveryCode,undefined);
  assert.equal(result.recoveryCodes,undefined); // Recuperar con un código no revela los otros dos.
  assert.equal((await request('GET','/api/auth/status')).body.authenticated,false);
  const used=await request('POST','/api/auth/recovery/reset',{username:'qa_propietario',recoveryCode:recoveryCodes[0],newPassword:'OtraClaveQA12345'});
  assert.equal(used.status,403);
  const oldSession=await fetch(base+'/api/auth/status',{headers:{cookie:old}}).then(r=>r.json());
  assert.equal(oldSession.authenticated,false);
  const r=await request('POST','/api/auth/login',{username:'qa_propietario',password:'ClaveRecuperadaQA12345'});
  assert.equal(r.status,200);sessionCookie=(r.headers.get('set-cookie')||'').split(';',1)[0];
  assert.match(sessionCookie,/^facturacr_session=/);
  const state=await request('GET','/api/auth/recovery/status');
  assert.equal(state.status,200);assert.equal(state.body.configured,true);
  assert.equal(state.body.remaining,2);assert.equal(state.body.total,3);
  recoveryCodes=[];
 });
 await test('SQLite nativo crea empresa y la recupera por HTTP',async()=>{
  const r=await request('POST','/api/companies',{legal_name:'Comercio temporal QA',identification:'123456789'});
  assert.equal(r.status,201,JSON.stringify(r.body));
  const list=await request('GET','/api/companies');
  assert.equal(list.status,200);assert.equal(list.body.length,1);
  assert.equal(list.body[0].identification,'123456789');
 });
 await test('API real rechaza identificación empresarial duplicada',async()=>{
  const r=await request('POST','/api/companies',{legal_name:'Duplicado',identification:'123456789'});
  assert.equal(r.status,409,JSON.stringify(r.body));
 });
 await test('Servidor informa espacio de respaldo sobre carpeta temporal',async()=>{
  const r=await request('GET','/api/backups/status');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.ok(r.body.databaseBytes>0);
 });
 await test('Datos temporales persistidos en SQLite',async()=>{
  const Database=require('better-sqlite3');
  const db=new Database(path.join(dir,'facturacr.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companies').get().n,1);
      assert.equal(db.pragma('integrity_check',{simple:true}),'ok');}
  finally{db.close()}
 });
 await test('Respaldo descargable es SQLite íntegro y contiene la empresa',async()=>{
  const response=await fetch(base+'/api/backups/download',{headers:authorizedHeaders()});
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0,16).toString('ascii'),'SQLite format 3\0');
  const backupPath=path.join(dir,'qa-backup-descargado.sqlite');
  fs.writeFileSync(backupPath,bytes);
  const Database=require('better-sqlite3');
  const backup=new Database(backupPath,{readonly:true,fileMustExist:true});
  try{
   assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');
   assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM companies').get().n,1);
  }finally{backup.close()}
 });
 await test('Respaldo automático crea un archivo SQLite válido en carpeta temporal',async()=>{
  const res=await request('POST','/api/backups/automatic/run');
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.created,true);
  const status=await request('GET','/api/backups/automatic');
  assert.equal(status.status,200);
  assert.ok(status.body.files.includes(res.body.file));
  const Database=require('better-sqlite3');
  const file=path.join(dir,'automatic-backups',res.body.file);
  const backup=new Database(file,{readonly:true,fileMustExist:true});
  try{assert.equal(backup.pragma('integrity_check',{simple:true}),'ok')}
  finally{backup.close()}
 });
 await test('Inspección previa acepta copia SQLite válida sin reemplazar los datos',async()=>{
  const backupPath=path.join(dir,'qa-backup-descargado.sqlite');
  const bytes=fs.readFileSync(backupPath);
  const response=await fetch(base+'/api/backups/inspect',{method:'POST',headers:{...authorizedHeaders(),'content-type':'application/octet-stream','content-length':String(bytes.length)},body:bytes});
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.compatible,true);
  assert.equal(result.backup.companies,1);
  assert.equal(result.current.companies,1);
  assert.equal(result.backup.companyNames[0],'Comercio temporal QA');
  const after=await request('GET','/api/companies');
  assert.equal(after.body[0].identification,'123456789');
 });
 await test('Inspección rechaza archivo inválido sin eliminar las empresas',async()=>{
  const bytes=Buffer.alloc(2048,0x42);
  const response=await fetch(base+'/api/backups/inspect',{method:'POST',headers:{...authorizedHeaders(),'content-type':'application/octet-stream','content-length':String(bytes.length)},body:bytes});
  assert.equal(response.status,400);
  const after=await request('GET','/api/companies');
  assert.equal(after.body.length,1);
 });
 await test('Inspección no deja archivos temporales tras validar o rechazar',async()=>{
  const remaining=fs.readdirSync(dir).filter(f=>f.startsWith('.inspect-'));
  assert.deepEqual(remaining,[]);
 });
 await test('Restauración inválida se rechaza sin alterar los datos',async()=>{
  const before=fs.statSync(path.join(dir,'facturacr.sqlite')).size;
  const invalid=Buffer.alloc(1024,0x41);
  const response=await fetch(base+'/api/backups/restore',{method:'POST',headers:{...authorizedHeaders(),'content-type':'application/octet-stream','content-length':String(invalid.length)},body:invalid});
  assert.equal(response.status,400);
  const r=await request('GET','/api/companies');
  assert.equal(r.status,200);assert.equal(r.body.length,1);
  const Database=require('better-sqlite3');
  const db=new Database(path.join(dir,'facturacr.sqlite'),{readonly:true});
  try{assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
  finally{db.close()}
  assert.ok(fs.statSync(path.join(dir,'facturacr.sqlite')).size>=before);
 });
 await test('Dashboard nuevo responde con ceros para empresa sin ventas',async()=>{
  const r=await request('GET','/api/companies/1/dashboard?from=2026-01-01&to=2026-12-31');
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.summary.revenue_cents,0);
  assert.equal(r.body.summary.sale_count,0);assert.equal(r.body.top_products.length,0);
 });
 await test('Dashboard rechaza fechas imposibles y acceso a empresa ajena',async()=>{
  let r=await request('GET','/api/companies/1/dashboard?from=2026-02-30&to=2026-03-01');assert.equal(r.status,400);
  r=await request('GET','/api/companies/99/dashboard?from=2026-01-01&to=2026-01-31');assert.equal(r.status,400);
 });
 await test('Dashboard agrega ventas, anulaciones, créditos y líneas sin límite del historial',async()=>{
  const Database=require('better-sqlite3');
  const db=new Database(path.join(dir,'facturacr.sqlite'));
  try{
   const product=db.prepare("INSERT INTO products(company_id,kind,description,price,currency,tax_rate) VALUES(1,'producto','Servicio QA',1000,'CRC',13)").run().lastInsertRowid;
   const add=db.prepare('INSERT INTO sales(company_id,sale_type,status,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
   const id=add.run(1,'contado','activa',100000,0,13000,113000,113000,0,'2026-03-15 12:30:00').lastInsertRowid;
   db.prepare('INSERT INTO sale_lines(sale_id,product_id,description,quantity,unit_price_cents,tax_rate,discount_cents,subtotal_cents,tax_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,product,'Servicio QA',1,100000,13,0,100000,13000,113000);
   db.prepare('INSERT INTO sale_payments(sale_id,method,amount_cents,created_at) VALUES(?,?,?,?)').run(id,'Efectivo',113000,'2026-03-15 12:30:00');
   add.run(1,'credito','activa',200000,0,26000,226000,100000,126000,'2026-03-16 08:00:00');
   add.run(1,'contado','anulada',900000,0,117000,1017000,0,0,'2026-03-16 08:00:00');
  }finally{db.close()}
  const r=await request('GET','/api/companies/1/dashboard?from=2026-03-01&to=2026-03-31');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.summary.sale_count,2);assert.equal(r.body.summary.annulled_count,1);
  assert.equal(r.body.summary.revenue_cents,339000);assert.equal(r.body.outstanding.balance_cents,126000);
  assert.equal(r.body.daily.length,2);assert.equal(r.body.top_products[0].units,1);
  assert.equal(r.body.payment_methods[0].amount_cents,113000);
 });
 await test('Dashboard filtra por fecha y no mezcla empresas',async()=>{
  const r=await request('GET','/api/companies/1/dashboard?from=2026-03-15&to=2026-03-15');
  assert.equal(r.status,200);assert.equal(r.body.summary.sale_count,1);
  assert.equal(r.body.summary.revenue_cents,113000);
  const other=await request('POST','/api/companies',{legal_name:'Empresa QA 2',identification:'987654321'});
  assert.equal(other.status,201);
  const separate=await request('GET',`/api/companies/${other.body.id}/dashboard?from=2026-03-01&to=2026-03-31`);
  assert.equal(separate.status,200);assert.equal(separate.body.summary.revenue_cents,0);
 });
 await test('Respaldos semanal y mensual conservan el día seleccionado',async()=>{
  const weekly=await request('PUT','/api/backups/automatic',{enabled:false,frequency:'weekly',time:'21:45',keep:10,weekday:0,monthDay:31});
  assert.equal(weekly.status,200,JSON.stringify(weekly.body));
  assert.equal(weekly.body.config.weekday,0);
  const saved=await request('GET','/api/backups/automatic');
  assert.equal(saved.status,200);assert.equal(saved.body.config.monthDay,31);
  const monthly=await request('PUT','/api/backups/automatic',{enabled:false,frequency:'monthly',time:'17:00',keep:10,weekday:5,monthDay:29});
  assert.equal(monthly.status,200,JSON.stringify(monthly.body));
  assert.equal(monthly.body.config.monthDay,29);
  const disk=JSON.parse(fs.readFileSync(path.join(dir,'automatic-backup-settings.json'),'utf8'));
  assert.equal(disk.weekday,5);assert.equal(disk.monthDay,29);
  const invalid=await request('PUT','/api/backups/automatic',{enabled:false,frequency:'monthly',time:'17:00',keep:10,weekday:5,monthDay:32});
  assert.equal(invalid.status,400);
  const after=await request('GET','/api/backups/automatic');
  assert.equal(after.body.config.monthDay,29);
 });
 await test('Se rechaza configuración de respaldo fuera de rango',async()=>{
  const r=await request('PUT','/api/backups/automatic',{enabled:true,frequency:'daily',time:'25:90',keep:0});
  assert.equal(r.status,400);
 });
 await test('Dashboard avanzado con SQLite nativo: filtros y pagos de empresa',async()=>{
  const base='/api/companies/1/dashboard?from=2026-03-01&to=2026-03-31';
  let r=await request('GET',base);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.summary.sale_count,2);assert.equal(r.body.summary.annulled_count,1);
  assert.equal(r.body.summary.revenue_cents,339000);assert.equal(r.body.summary.collected_cents,113000);
  r=await request('GET',base+'&method=Efectivo');assert.equal(r.status,200);
  assert.equal(r.body.summary.sale_count,1);assert.equal(r.body.summary.revenue_cents,113000);
  r=await request('GET',base+'&status=anuladas');assert.equal(r.status,200);
  assert.equal(r.body.summary.revenue_cents,0);assert.equal(r.body.sales_count,1);
  r=await request('GET',base+'&type=credito');assert.equal(r.status,200);
  assert.equal(r.body.summary.sale_count,1);assert.equal(r.body.outstanding.balance_cents,126000);
 });
 await test('Dashboard avanzado exporta CSV completo y HTML imprimible',async()=>{
  const endpoint='/api/companies/1/dashboard/';
  const query='from=2026-03-01&to=2026-03-31&kind=detallado';
  let response=await fetch(`${base}${endpoint}export.csv?${query}`,{headers:authorizedHeaders()});
  assert.equal(response.status,200);const csvBytes=Buffer.from(await response.arrayBuffer());const csv=csvBytes[0]===255&&csvBytes[1]===254?csvBytes.subarray(2).toString('utf16le'):csvBytes.toString('utf8');
  assert.ok(csv.includes('Número venta'));assert.ok(csv.includes('Servicio QA'));
  response=await fetch(`${base}${endpoint}export.html?${query}`,{headers:authorizedHeaders()});
  assert.equal(response.status,200);const html=await response.text();
  assert.ok(html.includes('Detalle completo de ventas filtradas'));assert.ok(html.includes('Servicio QA')===false||html.includes('Reporte comercial'));
 });
 // Regresión real: cada cajero puede vender, consultar y reimprimir SUS ventas,
 // pero no utilizar la caja ni consultar las ventas de otro usuario.
 await test('Cajeros: caja obligatoria, venta persistida, historial propio y tiquete accesible',async()=>{
  const Database=require('better-sqlite3');
  const db=new Database(path.join(dir,'facturacr.sqlite'));
  let productId;
  try{productId=Number(db.prepare("INSERT INTO products(company_id,kind,description,price,currency,tax_rate) VALUES(1,'servicio','Servicio turno QA',1000,'CRC',0)").run().lastInsertRowid)}
  finally{db.close()}
  const newSale={sale_type:'contado',document_mode:'GENERICA',discount:'0',lines:[{product_id:productId,quantity:1}],payments:[{method:'Efectivo',amount:'1000'}]};
  const closed=await request('POST','/api/companies/1/sales',newSale);
  assert.equal(closed.status,400,JSON.stringify(closed.body));
  assert.match(closed.body.error,/abrir una caja/i);
  const operators=[];
  for(const [username,password] of [['qa_cajero_a','CajeroQAAcceso123'],['qa_cajero_b','CajeroQAOtro1234']]){
   const created=await request('POST','/api/auth/users',{username,displayName:username.replaceAll('_',' '),password,companyId:1,role:'cashier'});
   assert.equal(created.status,201,JSON.stringify(created.body));
   const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
   assert.equal(login.status,200);
   const cookie=(login.headers.get('set-cookie')||'').split(';',1)[0];
   assert.match(cookie,/^facturacr_session=/);
   const change=await fetch(base+'/api/auth/password-change',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({oldPassword:password,newPassword:password+'Nueva'})});
   assert.equal(change.status,200,await change.text());
   operators.push({userId:created.body.id,cookie});
  }
  const as=async(operator,method,url,body)=>{
   const options={method,headers:{cookie:operator.cookie}};
   if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
   const response=await fetch(base+url,options);
   return {status:response.status,body:await response.json()};
  };
  const [a,b]=operators;
  const ownerCash=await request('POST','/api/companies/1/cash/open',{opening_amount:'0'});
  assert.equal(ownerCash.status,201,JSON.stringify(ownerCash.body));
  const otherTurn=await as(a,'POST','/api/companies/1/sales',newSale);
  assert.equal(otherTurn.status,400,JSON.stringify(otherTurn.body));
  assert.match(otherTurn.body.error,/otro usuario/i);
  const ownerClosed=await request('POST','/api/companies/1/cash/close',{counted_amount:'0'});
  assert.equal(ownerClosed.status,200,JSON.stringify(ownerClosed.body));
  const aCash=await as(a,'POST','/api/companies/1/cash/open',{opening_amount:'0'});
  assert.equal(aCash.status,201,JSON.stringify(aCash.body));
  const createdSale=await as(a,'POST','/api/companies/1/sales',newSale);
  assert.equal(createdSale.status,201,JSON.stringify(createdSale.body));
  const saleId=createdSale.body.id;
  const myHistory=await as(a,'GET','/api/companies/1/sales');
  assert.equal(myHistory.status,200,JSON.stringify(myHistory.body));
  assert.ok(myHistory.body.some(row=>row.id===saleId));
  const myDetail=await as(a,'GET',`/api/companies/1/sales/${saleId}`);
  assert.equal(myDetail.status,200,JSON.stringify(myDetail.body));
  assert.equal(myDetail.body.lines.length,1);
  assert.equal(myDetail.body.payments[0].method,'Efectivo');
  const bHistory=await as(b,'GET','/api/companies/1/sales');
  assert.equal(bHistory.status,200,JSON.stringify(bHistory.body));
  assert.equal(bHistory.body.some(row=>row.id===saleId),false);
  const bDetail=await as(b,'GET',`/api/companies/1/sales/${saleId}`);
  assert.equal(bDetail.status,404);
  const bSale=await as(b,'POST','/api/companies/1/sales',newSale);
  assert.equal(bSale.status,400,JSON.stringify(bSale.body));
  const settings=await as(a,'PUT','/api/companies/1/ticket-settings',{logo:'',autoPrint:true});
  assert.equal(settings.status,200,JSON.stringify(settings.body));
  const ownerHistory=await request('GET','/api/companies/1/sales');
  assert.equal(ownerHistory.status,200);
  assert.ok(ownerHistory.body.some(row=>row.id===saleId));
  const checkDb=new Database(path.join(dir,'facturacr.sqlite'),{readonly:true});
  try{
   const saved=checkDb.prepare('SELECT created_by_user_id,cash_session_id FROM sales WHERE id=?').get(saleId);
   assert.equal(saved.created_by_user_id,a.userId);
   assert.equal(Number(saved.cash_session_id),Number(aCash.body.id));
   assert.equal(checkDb.pragma('integrity_check',{simple:true}),'ok');
  }finally{checkDb.close()}
 });
 console.log(`QA servidor REAL: ${checks}/${checks} pruebas aprobadas`);
}
main().catch(err=>{console.error('QA servidor REAL falló:',err.stack||err);process.exitCode=1})
.finally(async()=>{
 if(server){try{await server.close()}catch(e){console.error('Cierre:',e);process.exitCode=1}}
 try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:150})}
 catch(e){console.error('No se pudo eliminar el directorio temporal:',e.message);process.exitCode=1}
});
