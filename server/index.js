import {registerSaleDraftRoutes} from './sale-drafts.js';
import {registerAuth} from './auth.js';
import {ensureAccessSchema} from './access-schema.js';
import {registerCashRoutes,ensureCashSchema} from './cash.js';
import {csvCell as formattedCsvCell, csvDocument, csvExcelBuffer, reportHtml} from './report-format.js';
import { registerInventoryValuationRoutes } from './inventory-valuation.js';
import { buildInventoryAlerts } from './inventory-alerts.js';
import { registerKardexRoutes } from './kardex.js';
import { registerDashboardRoutes } from './dashboard.js';
import express from 'express';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, unlinkSync, renameSync, existsSync, rmSync, createWriteStream, statSync, statfsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

export async function startServer({ dataDir = join(process.cwd(), 'data'), port = 3001, staticDir = null } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const databasePath = join(dataDir, 'facturacr.sqlite');
  let db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const clientExtra = {
    trade_name:"TEXT NOT NULL DEFAULT ''", identification_type:"TEXT NOT NULL DEFAULT '01'",
    province:"TEXT NOT NULL DEFAULT ''", canton:"TEXT NOT NULL DEFAULT ''",
    district:"TEXT NOT NULL DEFAULT ''", address:"TEXT NOT NULL DEFAULT ''",
    activity_code:"TEXT NOT NULL DEFAULT ''", country_code:"TEXT NOT NULL DEFAULT '506'",
    phone_alt:"TEXT NOT NULL DEFAULT ''", preferred_payment:"TEXT NOT NULL DEFAULT ''", notes:"TEXT NOT NULL DEFAULT ''"
  };
  const productExtra = {
    product_code:"TEXT NOT NULL DEFAULT ''", image_data:"TEXT NOT NULL DEFAULT ''",
    tax_code:"TEXT NOT NULL DEFAULT '08'", unit:"TEXT NOT NULL DEFAULT 'Unid'",
    stock:"REAL NOT NULL DEFAULT 0", min_stock:"REAL NOT NULL DEFAULT 0",
    track_stock:"INTEGER NOT NULL DEFAULT 1", barcode:"TEXT NOT NULL DEFAULT ''",
    cost:"REAL NOT NULL DEFAULT 0", price_includes_tax:"INTEGER NOT NULL DEFAULT 0", notes:"TEXT NOT NULL DEFAULT ''"
  };
  function migrateDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name TEXT NOT NULL,
    identification TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  // Migración compatible con bases de datos existentes y respaldos antiguos.
  const companyColumns = db.prepare('PRAGMA table_info(companies)').all().map(c=>c.name);
  for (const field of ['trade_name','phone','email','address','website','social','avatar_color']) {
    if (!companyColumns.includes(field)) db.exec(`ALTER TABLE companies ADD COLUMN ${field} TEXT NOT NULL DEFAULT ''`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, identification TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, identification)
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('producto','servicio')),
    description TEXT NOT NULL, cabys TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL CHECK(price >= 0),
    currency TEXT NOT NULL CHECK(currency IN ('CRC','USD')),
    tax_rate REAL NOT NULL CHECK(tax_rate >= 0 AND tax_rate <= 100),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  // Migraciones no destructivas: conservan empresas, clientes y productos existentes.
  function addColumn(table, name, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  for (const [k,v] of Object.entries(clientExtra)) addColumn('clients',k,v);
  for (const [k,v] of Object.entries(productExtra)) addColumn('products',k,v);
  // Historial inmutable de entradas, salidas y ajustes, separado por empresa.
  db.exec(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('entrada','salida','ajuste')),
    quantity REAL NOT NULL CHECK(quantity > 0),
    delta REAL NOT NULL,
    stock_before REAL NOT NULL,
    stock_after REAL NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_product ON inventory_movements(company_id,product_id,created_at);`);
  // Solo los movimientos NUEVOS reciben costo histórico conocido al momento de su alta.
  // Un movimiento antiguo queda NULL: nunca estimarlo con el precio actual.
  addColumn('inventory_movements','unit_cost_cents','INTEGER');
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_cost_snapshot
    AFTER INSERT ON inventory_movements
    FOR EACH ROW WHEN NEW.unit_cost_cents IS NULL
    BEGIN
      UPDATE inventory_movements SET unit_cost_cents=(
        SELECT CASE WHEN p.currency='CRC' AND p.cost>0 AND p.cost<=100000000
          THEN CAST(ROUND(p.cost*100) AS INTEGER) ELSE NULL END
        FROM products p WHERE p.id=NEW.product_id AND p.company_id=NEW.company_id
      ) WHERE id=NEW.id;
    END;`);
  addColumn('products','alert_enabled','INTEGER NOT NULL DEFAULT 1');
  addColumn('products','is_deleted','INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS product_bulk_price_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    old_price REAL NOT NULL,
    new_price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    client_id INTEGER REFERENCES clients(id),
    sale_type TEXT NOT NULL CHECK(sale_type IN ('contado','credito')),
    status TEXT NOT NULL DEFAULT 'activa' CHECK(status IN ('activa','anulada')),
    currency TEXT NOT NULL DEFAULT 'CRC',
    subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
    paid_cents INTEGER NOT NULL, balance_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    annulled_at TEXT, annul_reason TEXT
  );
  CREATE TABLE IF NOT EXISTS sale_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    description TEXT NOT NULL, quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL, tax_rate REAL NOT NULL,
    discount_cents INTEGER NOT NULL, subtotal_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    method TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sales_company_date ON sales(company_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(company_id,client_id);`);
  // Costo histórico de la venta: NULL en registros anteriores o sin costo confiable.
  addColumn('sale_lines','unit_cost_cents','INTEGER');
  // Campos reservados para comprobantes realmente emitidos por Hacienda.
  addColumn('sales','fe_consecutivo',"TEXT NOT NULL DEFAULT ''");
  addColumn('sales','fe_clave',"TEXT NOT NULL DEFAULT ''");
  addColumn('sales','fe_estado',"TEXT NOT NULL DEFAULT ''");
  // Preferencias de impresión guardadas en SQLite para incluirlas en los respaldos.
  db.exec(`CREATE TABLE IF NOT EXISTS company_ticket_settings (
    company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // Cotizaciones: independientes de ventas, pagos y movimientos de inventario.
  db.exec(`CREATE TABLE IF NOT EXISTS company_quote_settings (
    company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    client_id INTEGER REFERENCES clients(id),
    client_name TEXT NOT NULL,
    client_identification TEXT NOT NULL DEFAULT '',
    client_email TEXT NOT NULL DEFAULT '',
    client_phone TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    valid_days INTEGER NOT NULL DEFAULT 15,
    logo_snapshot TEXT NOT NULL DEFAULT '',
    subtotal_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quotation_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    tax_rate REAL NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotations(company_id,id DESC);`);
  // v0.6.29: ampliar los datos congelados del receptor, sin alterar proformas anteriores.
  for (const [field, definition] of Object.entries({
    client_trade_name:"TEXT NOT NULL DEFAULT ''",
    client_identification_type:"TEXT NOT NULL DEFAULT ''",
    client_phone_alt:"TEXT NOT NULL DEFAULT ''",
    client_address:"TEXT NOT NULL DEFAULT ''"
  })) addColumn('quotations',field,definition);
  // Conservar el precio original de los conceptos para futuras ediciones.
  for (const [field, definition] of Object.entries({
    source_product_id:'INTEGER',
    input_price_cents:'INTEGER',
    input_includes_tax:'INTEGER'
  })) addColumn('quotation_lines',field,definition);
  // Los códigos internos se validan por empresa en las operaciones nuevas.
  ensureCashSchema(db);
  // Esquema inerte de acceso: no interfiere con las APIs hasta activar autenticación.
  ensureAccessSchema(db);
  }
  migrateDatabase();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'2mb'}));
  const authentication=registerAuth(app,()=>db);
  registerSaleDraftRoutes(app,()=>db);
  // Limpieza tolerante a archivos temporalmente bloqueados en Windows.
  // Nunca permitir que una excepción en callbacks de descarga termine Electron.
  async function cleanTempDir(dir) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); return; }
      catch (err) {
        if (attempt === 4) { console.warn('Limpieza temporal pendiente:', dir, err.message); return; }
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  app.get('/api/companies/:companyId/ticket-settings',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||companyId<1)return res.status(400).json({error:'Empresa inválida.'});
    const row=db.prepare('SELECT settings_json FROM company_ticket_settings WHERE company_id=?').get(companyId);
    if(!row)return res.json({saved:false,settings:null});
    try{return res.json({saved:true,settings:JSON.parse(row.settings_json)})}
    catch{return res.status(500).json({error:'Configuración de impresión dañada.'})}
  });
  app.put('/api/companies/:companyId/ticket-settings',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    const settings=req.body;
    if(!settings||typeof settings!=='object'||Array.isArray(settings))return res.status(400).json({error:'Configuración inválida.'});
    const raw=JSON.stringify(settings);
    if(raw.length>450000||typeof settings.logo!=='string'||settings.logo.length>380000)return res.status(400).json({error:'Configuración demasiado grande o logotipo inválido.'});
    try{
      db.prepare(`INSERT INTO company_ticket_settings(company_id,settings_json,updated_at)
        VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET
        settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP`).run(companyId,raw);
      return res.json({ok:true});
    }catch(e){return res.status(500).json({error:'No se pudieron guardar los ajustes: '+e.message})}
  });
  // Automatic backups are stored outside the SQLite file, using SQLite's online backup API.
  const automaticDir=join(dataDir,'automatic-backups');
  const backupConfigPath=join(dataDir,'automatic-backup-settings.json');
  const backupDefaults={enabled:false,frequency:'daily',time:'20:00',keep:14};
  const loadBackupConfig=()=>{
    try {const raw=JSON.parse(readFileSync(backupConfigPath,'utf8'));return {...backupDefaults,...raw};}
    catch{return {...backupDefaults}}
  };
  let backupConfig=loadBackupConfig();
  let backupBusy=false;
  let lastBackupError='';
  const backupFiles=()=>{
    if(!existsSync(automaticDir))return [];
    return readdirSync(automaticDir).filter(f=>/^FacturaCR_auto_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse();
  };
  const backupDue=()=>{
    if(!backupConfig.enabled)return false;
    const now=new Date();
    const [hour,minute]=backupConfig.time.split(':').map(Number);
    const scheduled=new Date(now);scheduled.setHours(hour,minute,0,0);
    if(now<scheduled)return false;
    const latest=backupFiles()[0];if(!latest)return true;
    const datePart=latest.slice('FacturaCR_auto_'.length,-'.sqlite'.length);
    const last=new Date(datePart.replace(/T(\d{2})-(\d{2})-(\d{2})$/,'T$1:$2:$3'));
    if(Number.isNaN(last.getTime()))return true;
    if(backupConfig.frequency==='daily')return last.toDateString()!==now.toDateString();
    if(backupConfig.frequency==='weekly'){
      const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));return last<start;
    }
    return last.getFullYear()!==now.getFullYear()||last.getMonth()!==now.getMonth();
  };
  const runAutoBackup=async(force=false)=>{
    if(backupBusy||(!force&&!backupDue()))return {created:false};
    backupBusy=true;
    try{
      mkdirSync(automaticDir,{recursive:true});
      const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      const target=join(automaticDir,`FacturaCR_auto_${stamp}.sqlite`);
      await db.backup(target);
      const check=new Database(target,{readonly:true,fileMustExist:true});
      try{if(check.pragma('integrity_check',{simple:true})!=='ok')throw Error('Falló la verificación de integridad.');}finally{check.close()}
      const files=backupFiles();
      for(const f of files.slice(backupConfig.keep))try{unlinkSync(join(automaticDir,f))}catch(e){console.warn('Retención:',e.message)}
      lastBackupError='';return {created:true,file:target.split(/[\\/]/).pop()};
    }catch(e){lastBackupError=e.message;console.error('Respaldo automático:',e);throw e}
    finally{backupBusy=false}
  };
  const backupTimer=setInterval(()=>{void runAutoBackup().catch(()=>{})},60000);
  backupTimer.unref?.();
  // At launch, catch up on a missed scheduled backup when the program was closed.
  setTimeout(()=>{void runAutoBackup().catch(()=>{})},2500).unref?.();
  app.get('/api/backups/automatic',(_req,res)=>res.json({config:backupConfig,files:backupFiles(),directory:automaticDir,lastError:lastBackupError,busy:backupBusy}));
  app.put('/api/backups/automatic', (req,res)=>{
    const {enabled,frequency,time,keep}=req.body||{};
    if(typeof enabled!=='boolean'||!['daily','weekly','monthly'].includes(frequency)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isInteger(keep)||keep<1||keep>365)return res.status(400).json({error:'Configuración de respaldos inválida.'});
    backupConfig={enabled,frequency,time,keep};
    try{writeFileSync(backupConfigPath,JSON.stringify(backupConfig,null,2));res.json({ok:true,config:backupConfig})}
    catch(e){res.status(500).json({error:'No se pudieron guardar las preferencias: '+e.message})}
  });
  app.post('/api/backups/automatic/run',async(_req,res)=>{
    try{res.json(await runAutoBackup(true))}catch(e){res.status(500).json({error:e.message})}
  });
  // Backups: use SQLite's online backup API (safe with WAL enabled).
  // Restoration is deliberately restricted to a complete, validated SQLite file.
  app.get('/api/backups/download', async (_req,res)=>{
    const dir=mkdtempSync(join(tmpdir(),'facturacr-backup-'));
    const snapshot=join(dir,'facturacr.sqlite');
    try {
      await db.backup(snapshot);
      const date=new Date().toISOString().replace(/[:.]/g,'-');
      res.download(snapshot,`FacturaCR_respaldo_${date}.sqlite`,err=>{
        // El stream de Windows puede mantener el archivo abierto unos instantes.
        void cleanTempDir(dir);
        if(err&&!res.headersSent)res.status(500).json({error:'No se pudo descargar el respaldo.'});
      });
    } catch(err) {
      await cleanTempDir(dir);
      console.error('Backup:',err);
      if(!res.headersSent)res.status(500).json({error:'No se pudo crear el respaldo.'});
    }
  });
  app.get('/api/health',(_req,res)=>res.json({ok:true,version:APP_VERSION,backups:true}));
  app.get('/api/backups/status',(_req,res)=>{
    try {
      const fs=statfsSync(dataDir);
      const dbBytes=statSync(databasePath).size;
      const wal=databasePath+'-wal';
      res.json({databaseBytes:dbBytes,walBytes:existsSync(wal)?statSync(wal).size:0,freeBytes:Number(fs.bavail)*Number(fs.bsize),totalBytes:Number(fs.blocks)*Number(fs.bsize)});
    } catch(err){res.status(500).json({error:'No se pudo consultar el espacio de almacenamiento.'})}
  });
  // Inspección previa: NO reemplaza datos ni modifica la base activa.
  // El respaldo se recibe en un temporal, se comprueba y se elimina siempre.
  app.post('/api/backups/inspect',async(req,res)=>{
    if(!String(req.headers['content-type']||'').startsWith('application/octet-stream'))
      return res.status(415).json({error:'Selecciona un archivo SQLite válido.'});
    const declared=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(declared)||declared<512)
      return res.status(400).json({error:'No se pudo determinar el tamaño del respaldo.'});
    const fs=statfsSync(dataDir);
    const free=Number(fs.bavail)*Number(fs.bsize);
    if(free<declared+20*1024*1024)
      return res.status(507).json({error:'No hay espacio suficiente para inspeccionar el respaldo.'});
    const dir=mkdtempSync(join(dataDir,'.inspect-'));
    const candidate=join(dir,'candidate.sqlite');
    try{
      await pipeline(req,createWriteStream(candidate,{flags:'wx',mode:0o600}));
      if(statSync(candidate).size!==declared)throw Error('El respaldo recibido está incompleto.');
      const test=new Database(candidate,{readonly:true,fileMustExist:true});
      let snapshot;
      try{
        if(test.pragma('integrity_check',{simple:true})!=='ok')throw Error('El respaldo no pasó la prueba de integridad.');
        const tables=new Set(test.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
        for(const table of ['companies','clients','products','inventory_movements']){
          if(!tables.has(table))throw Error('El archivo no corresponde a una versión compatible de FacturaCR.');
          const actual=new Set(test.prepare(`PRAGMA table_info(${table})`).all().map(col=>col.name));
          const expected=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(col=>col.name));
          if([...actual].some(col=>!expected.has(col)))throw Error('El respaldo contiene columnas de una versión más nueva ('+table+'). Actualiza FacturaCR.');
        }
        const count=(connection,table)=>tables.has(table)?connection.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n:0;
        snapshot={companies:count(test,'companies'),clients:count(test,'clients'),products:count(test,'products'),sales:count(test,'sales'),quotations:count(test,'quotations'),companyNames:test.prepare('SELECT legal_name FROM companies ORDER BY id LIMIT 8').all().map(row=>row.legal_name)};
      }finally{test.close()}
      const currentCount=(table)=>db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      return res.json({ok:true,compatible:true,sizeBytes:declared,backup:snapshot,current:{companies:currentCount('companies'),clients:currentCount('clients'),products:currentCount('products'),sales:currentCount('sales'),quotations:currentCount('quotations')}});
    }catch(err){
      console.warn('Inspección de respaldo rechazada:',err.message);
      if(!res.headersSent)return res.status(400).json({error:'No se pudo inspeccionar el respaldo: '+err.message});
    }finally{await cleanTempDir(dir)}
  });
  // Recibir restauraciones en disco, por streaming, sin límite fijo de 100/512 MB.
  // Se conserva un margen de espacio libre para la copia previa y la restauración.
  app.post('/api/backups/restore',async(req,res)=>{
    if(!String(req.headers['content-type']||'').startsWith('application/octet-stream'))
      return res.status(415).json({error:'Seleccione un archivo SQLite válido.'});
    const declared=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(declared)||declared<512)
      return res.status(400).json({error:'No se pudo determinar el tamaño del respaldo.'});
    const dbSize=statSync(databasePath).size;
    const fs=statfsSync(dataDir);
    const free=Number(fs.bavail)*Number(fs.bsize);
    if(free < declared + dbSize*2 + 100*1024*1024)
      return res.status(507).json({error:'Espacio insuficiente para restaurar y proteger los datos actuales. Libere espacio en el disco.'});
    const dir=mkdtempSync(join(dataDir,'.restore-'));
    const candidate=join(dir,'candidate.sqlite');
    const previous=join(dataDir,`facturacr_antes_restaurar_${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
    let closed=false, oldMoved=false;
    try {
      await pipeline(req,createWriteStream(candidate,{flags:'wx',mode:0o600}));
      if(statSync(candidate).size!==declared)throw Error('El archivo recibido está incompleto.');
      const test=new Database(candidate,{readonly:true,fileMustExist:true});
      try {
        const integrity=test.pragma('integrity_check',{simple:true});
        if(integrity!=='ok')throw Error('El respaldo no pasó la verificación de integridad.');
        const tables=test.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
        if(!['companies','clients','products','inventory_movements'].every(t=>tables.includes(t)))throw Error('El respaldo no pertenece a una versión compatible de FacturaCR.');
        for(const t of ['companies','clients','products','inventory_movements']) {
          test.prepare(`SELECT * FROM ${t} LIMIT 1`).all();
          const actual=new Set(test.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name));
          const expected=new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name));
          if([...actual].some(col=>!expected.has(col)))throw Error('Este respaldo contiene campos de una versión más nueva ('+t+'). Actualiza FacturaCR antes de restaurarlo.');
        }
      }finally{test.close()}
      // Preserve a consistent copy of current data BEFORE attempting replacement.
      await db.backup(previous);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();closed=true;
      renameSync(databasePath,join(dir,'old.sqlite'));oldMoved=true;
      renameSync(candidate,databasePath);
      db=new Database(databasePath);
      db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');
      migrateDatabase(); // Actualiza el esquema de respaldos anteriores sin perder registros.
      authentication.invalidateSessions(); // El respaldo puede cambiar las credenciales.
      res.json({ok:true,previousBackup:previous.split(/[\\/]/).pop(),message:'Respaldo restaurado. La aplicación recargará los datos.'});
    }catch(err){
      console.error('Restore:',err);
      if(closed){
        try {
          if(oldMoved){
            try{db?.close()}catch{}
            if(existsSync(databasePath))unlinkSync(databasePath);
            renameSync(join(dir,'old.sqlite'),databasePath);
          }
          db=new Database(databasePath);db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');
        }catch(recoveryErr){console.error('Recovery failed:',recoveryErr)}
      }
      res.status(400).json({error:'No se pudo restaurar: '+err.message});
    }finally{await cleanTempDir(dir)}
  });
  const companyColors=['#2563eb','#0891b2','#0f766e','#7c3aed','#d97706','#dc5265'];
  app.get('/api/companies', (req,res) => {const rows=db.prepare('SELECT id,legal_name,identification,trade_name,phone,email,address,website,social,avatar_color FROM companies ORDER BY id DESC').all();res.json(req.authUser.is_owner?rows:rows.filter(c=>!!db.prepare('SELECT 1 FROM access_company_roles WHERE user_id=? AND company_id=?').get(req.authUser.id,c.id)))});
  app.post('/api/companies',(req,res)=>{
    const legal_name = String(req.body?.legal_name ?? '').trim();
    const identification = String(req.body?.identification ?? '').trim();
    const extra = Object.fromEntries(['trade_name','phone','email','address','website','social'].map(k=>[k,String(req.body?.[k]??'').trim()]));
    const avatar_color=companyColors.includes(req.body?.avatar_color)?req.body.avatar_color:companyColors[0];
    if(Object.values(extra).some(v=>v.length>300))return res.status(400).json({error:'Los datos adicionales no pueden superar 300 caracteres.'});
    if (!legal_name || legal_name.length > 160 || !/^\d{9,12}$/.test(identification)) {
      return res.status(400).json({error:'Ingrese una razón social (máx. 160 caracteres) y una identificación de 9 a 12 dígitos.'});
    }
    try {
      const result = db.prepare('INSERT INTO companies(legal_name,identification,trade_name,phone,email,address,website,social,avatar_color) VALUES (?,?,?,?,?,?,?,?,?)').run(legal_name,identification,...Object.values(extra),avatar_color);
      res.status(201).json({id:Number(result.lastInsertRowid),legal_name,identification,...extra,avatar_color});
    } catch (err) {
      if (err.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({error:'La identificación ya está registrada.'});
      console.error(err);
      res.status(500).json({error:'No se pudo guardar la empresa.'});
    }
  });
  app.put('/api/companies/:id', (req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Empresa inválida.'});
    const previous=db.prepare('SELECT * FROM companies WHERE id=?').get(id);
    if(!previous)return res.status(404).json({error:'Empresa no encontrada.'});
    const fields=['legal_name','identification','trade_name','phone','email','address','website','social','avatar_color'];
    const values=Object.fromEntries(fields.map(k=>[k,String(req.body?.[k]??previous[k]??'').trim()]));
    if(!companyColors.includes(values.avatar_color))return res.status(400).json({error:'El color seleccionado no es válido.'});
    if(!values.legal_name||values.legal_name.length>160||!/^[0-9]{9,12}$/.test(values.identification)||fields.slice(2,8).some(k=>values[k].length>300))return res.status(400).json({error:'Revise los datos de la empresa.'});
    try{
      db.prepare(`UPDATE companies SET ${fields.map(k=>k+'=?').join(',')} WHERE id=?`).run(...fields.map(k=>values[k]),id);
      res.json(db.prepare('SELECT * FROM companies WHERE id=?').get(id));
    }catch(err){res.status(err.code?.startsWith('SQLITE_CONSTRAINT')?409:500).json({error:'No se pudo actualizar la empresa.'});}
  });
  // All records are scoped to an existing company. Parameters are bound in SQL.
  const configs = {
    clients: {
      columns: ['name','identification','email','phone',...Object.keys(clientExtra)],
      parse(body) {
        const v = {};
        for (const key of this.columns) v[key] = String(body?.[key] ?? '').trim();
        if (!v.name || v.name.length > 100) throw Error('Indique nombre o razón social (máximo 100 caracteres).');
        if (!['01','02','03','04','05'].includes(v.identification_type)) throw Error('Seleccione un tipo de identificación válido.');
        const digits = v.identification;
        if (!/^[0-9A-Za-z]{3,20}$/.test(digits)) throw Error('Identificación inválida (sin guiones).');
        if (v.identification_type==='01' && !/^\d{9}$/.test(digits)) throw Error('La cédula física requiere 9 dígitos.');
        if (v.identification_type==='02' && !/^\d{10}$/.test(digits)) throw Error('La cédula jurídica requiere 10 dígitos.');
        if (v.email && (v.email.length>160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))) throw Error('Correo inválido.');
        if (v.preferred_payment && !['01','02','03','04','05','06','07','99'].includes(v.preferred_payment)) throw Error('Medio de pago no válido.');
        if (v.activity_code && !/^(?:\d{4}\.\d|\d{6})$/.test(v.activity_code)) throw Error('Actividad económica: use el formato 3333.3 (se aceptan códigos anteriores de 6 dígitos).');
        if (v.province && !/^[1-7]$/.test(v.province)) throw Error('Provincia inválida.');
        if (v.canton && !/^\d{2}$/.test(v.canton)) throw Error('Cantón: use 2 dígitos.');
        if (v.district && !/^\d{2}$/.test(v.district)) throw Error('Distrito: use 2 dígitos.');
        if (v.address.length>160 || v.trade_name.length>80 || v.notes.length>500) throw Error('Uno de los campos de texto supera el máximo permitido.');
        if (v.phone.length>20 || v.phone_alt.length>20 || !/^\d{1,3}$/.test(v.country_code)) throw Error('Revise teléfonos y código de país.');
        return v;
      }
    },
    products: {
      columns: ['kind','description','cabys','price','currency','tax_rate',...Object.keys(productExtra),'alert_enabled'],
      parse(body) {
        const v={};
        for(const key of this.columns) v[key]=String(body?.[key] ?? '').trim();
        if (!['producto','servicio'].includes(v.kind) || !v.description || v.description.length>250) throw Error('Revise tipo y descripción.');
        if (v.cabys && !/^\d{13}$/.test(v.cabys)) throw Error('CABYS debe contener 13 dígitos.');
        if (!['CRC','USD'].includes(v.currency)) throw Error('Moneda inválida.');
        const tariffs={'01':0,'02':1,'03':2,'04':4,'05':0,'06':4,'07':8,'08':13,'09':0.5,'10':0,'11':0};
        if (!(v.tax_code in tariffs)) throw Error('Seleccione una tarifa de IVA válida.');
        v.tax_rate=tariffs[v.tax_code];
        v.price_includes_tax = v.price_includes_tax==='1'?1:0;
        for (const k of ['price','stock','min_stock','cost']) {
          const n=Number(v[k]);
          if (!Number.isFinite(n) || n<0 || n>1e12) throw Error('Revise precio, costo y existencias.');
          if (['stock','min_stock'].includes(k) && !Number.isSafeInteger(n)) throw Error('Las existencias y el mínimo deben ser números enteros.');
          v[k]=n;
        }
        if (!/^[a-zA-Z0-9_.-]{0,40}$/.test(v.product_code)) throw Error('Código interno: máximo 40 caracteres, sin espacios.');
        if (v.unit.length>20 || v.barcode.length>60 || v.notes.length>500) throw Error('Revise unidad, código de barras y notas.');
        v.track_stock = v.kind==='servicio'?0:(v.track_stock==='0'?0:1);
        v.alert_enabled = v.alert_enabled==='0'?0:1;
        if (v.image_data && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.image_data) || v.image_data.length>950000)) throw Error('Imagen inválida o demasiado grande (máximo aproximado 700 KB).');
        return v;
      }
    }
  };
  const catalogColumns=['kind','product_code','barcode','description','cabys','price','cost','currency','tax_code','unit','stock','min_stock','track_stock','alert_enabled','notes'];
  const ivaRateLabel=product=>`${Number(product.tax_rate||0).toLocaleString('es-CR',{maximumFractionDigits:2})}%`;
  // Excel en Costa Rica usa normalmente punto y coma como separador regional.
  // CSV UTF-16 LE con BOM y sep=; para abrir directamente en Excel Windows.
  const csvEscape=formattedCsvCell;
  // Excel convierte automáticamente identificadores largos en notación científica.
  // Solo los identificadores formados por dígitos se representan como texto en Excel.
  // Se limita estrictamente a dígitos para no introducir fórmulas arbitrarias en CSV.
  const excelIdentifier=value=>{
    const str=String(value??'');
    return /^\d+$/.test(str) ? '=\"'+str+'\"' : str;
  };
  const csvLine=(values,identifierIndices=[])=>values.map((v,i)=>formattedCsvCell(v,{identifier:identifierIndices.includes(i)})).join(';')+'\r\n';
  // CSV para Excel de Windows en configuración regional española.
  // El CSV usa UTF-16 LE para conservar acentos y símbolos en Excel Windows.
  const csvEncoding=req=>'utf-16le';
  const csvBytes=(text)=>csvExcelBuffer(text);

  app.get('/api/companies/:companyId/products/export.html',(req,res)=>{
    const companyId=Number(req.params.companyId);
    const company=db.prepare('SELECT legal_name,trade_name FROM companies WHERE id=?').get(companyId);
    if(!company)return res.status(404).json({error:'Empresa no encontrada.'});
    const products=db.prepare('SELECT description,product_code,barcode,kind,stock,min_stock,unit,price,cost,currency FROM products WHERE company_id=? AND is_deleted=0 ORDER BY description COLLATE NOCASE').all(companyId);
    const rows=products.map(p=>[p.description,p.product_code||'',p.barcode||'',p.kind,p.kind==='producto'?p.stock:'—',p.min_stock,p.unit,p.price,p.cost,p.currency]);
    res.type('html').send(reportHtml({title:'Catálogo de productos y servicios',company:company.trade_name||company.legal_name,subtitle:'Artículos activos y servicios registrados. Los importes son valores del catálogo.',headers:['Artículo','SKU','Barras','Tipo','Existencias','Mínimo','Unidad','Precio','Costo','Moneda'],rows,summary:[['Artículos y servicios',rows.length]],note:'Precios y costos según catálogo actual. No constituye comprobante electrónico.'}));
  });
  app.get('/api/companies/:companyId/products/export.csv',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    const products=db.prepare('SELECT * FROM products WHERE company_id=? AND is_deleted=0 ORDER BY id').all(companyId);
    const catalogLabels=['Tipo','Código / SKU','Código de barras','Producto / descripción','CABYS','Precio de venta','Costo','Moneda','Código IVA','IVA (%)','Unidad','Existencias','Existencias mínimas','Controla existencias','Alerta habilitada','Observaciones'];
    const encoding=csvEncoding(req);
    res.setHeader('Content-Type',`text/csv; charset=${encoding}`);
    res.setHeader('Content-Disposition','attachment; filename="FacturaCR_catalogo_excel.csv"');
    res.send(csvBytes('sep=;\r\n'+csvLine(catalogLabels)+products.map(product=>csvLine(catalogColumns.flatMap((k,i)=>i===9?[ivaRateLabel(product),product[k]]:[product[k]]),[1,2,4,8])).join(''),encoding));
  });
  // Actualización masiva separada de la importación: vista previa y aplicación atómica.
  // Nunca crea artículos; exige identificadores únicos y versiones originales vigentes.
  const prepareBulkUpdate=(companyId,payload)=>{
    const rows=payload?.rows, updatePrice=payload?.updatePrice===true, updateStock=payload?.updateStock===true, updateCabys=payload?.updateCabys===true;
    if(!updatePrice&&!updateStock&&!updateCabys)throw Error('Selecciona precios, existencias, CABYS o una combinación.');
    if(!Array.isArray(rows)||rows.length<1||rows.length>2000)throw Error('Selecciona de 1 a 2000 artículos.');
    const getCode=db.prepare('SELECT * FROM products WHERE company_id=? AND is_deleted=0 AND product_code=?');
    const getBarcode=db.prepare('SELECT * FROM products WHERE company_id=? AND is_deleted=0 AND barcode=?');
    const seen=new Set();const prepared=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i];if(!r||typeof r!=='object'||Array.isArray(r))throw Error(`Fila ${i+2}: datos inválidos.`);
      const code=String(r.product_code??'').trim(),barcode=String(r.barcode??'').trim();
      if(!code&&!barcode)throw Error(`Fila ${i+2}: falta código/SKU o código de barras.`);
      const codeMatches=code?getCode.all(companyId,code):[];
      const barcodeMatches=barcode?getBarcode.all(companyId,barcode):[];
      if(codeMatches.length>1||barcodeMatches.length>1)throw Error(`Fila ${i+2}: código duplicado en el catálogo.`);
      if(code&&barcode&&codeMatches.length&&barcodeMatches.length&&codeMatches[0].id!==barcodeMatches[0].id)throw Error(`Fila ${i+2}: SKU y código de barras pertenecen a artículos diferentes.`);
      const product=codeMatches[0]||barcodeMatches[0];
      if(!product)throw Error(`Fila ${i+2}: artículo no encontrado (${code||barcode}).`);
      if(code&&product.product_code!==code || barcode&&product.barcode!==barcode)throw Error(`Fila ${i+2}: el identificador no coincide con el artículo.`);
      if(seen.has(product.id))throw Error(`Fila ${i+2}: el artículo aparece más de una vez.`);
      seen.add(product.id);
      let price=product.price,stock=product.stock,cabys=product.cabys;
      if(updatePrice){
        if(r.price===undefined||String(r.price).trim()==='')throw Error(`Fila ${i+2}: falta el precio.`);
        price=Number(r.price);
        if(!Number.isFinite(price)||price<0||price>1e12)throw Error(`Fila ${i+2}: precio inválido.`);
      }
      if(updateStock){
        if(product.kind!=='producto'||!Number(product.track_stock))throw Error(`Fila ${i+2}: el artículo no controla existencias.`);
        if(r.stock===undefined||String(r.stock).trim()==='')throw Error(`Fila ${i+2}: faltan las existencias.`);
        stock=Number(r.stock);
        if(!Number.isSafeInteger(stock)||stock<0||stock>1e12)throw Error(`Fila ${i+2}: existencias inválidas (unidades enteras).`);
      }
      if(updateCabys){
        if(r.cabys===undefined)throw Error(`Fila ${i+2}: falta la columna CABYS.`);
        cabys=String(r.cabys).trim();
        if(!/^\d{13}$/.test(cabys))throw Error(`Fila ${i+2}: CABYS debe contener exactamente 13 dígitos. Revisa que Excel no lo haya convertido a número.`);
      }
      prepared.push({id:product.id,description:product.description,product_code:product.product_code,barcode:product.barcode,
        old_price:product.price,new_price:price,old_stock:product.stock,new_stock:stock,old_cabys:product.cabys,new_cabys:cabys,
        priceChanged:updatePrice&&price!==product.price,stockChanged:updateStock&&stock!==product.stock,cabysChanged:updateCabys&&cabys!==product.cabys,
        // Valores de referencia para confirmar sin pisar cambios concurrentes.
        expected_price:r.expected_price,expected_stock:r.expected_stock,expected_cabys:r.expected_cabys});
    }
    return prepared;
  };
  app.post('/api/companies/:companyId/products/bulk-update/preview',(req,res)=>{
    const id=Number(req.params.companyId);
    if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM companies WHERE id=?').get(id))return res.status(404).json({error:'Empresa no encontrada.'});
    try{const rows=prepareBulkUpdate(id,req.body);res.json({rows,changed:rows.filter(r=>r.priceChanged||r.stockChanged||r.cabysChanged).length});}
    catch(e){res.status(400).json({error:e.message})}
  });
  app.post('/api/companies/:companyId/products/bulk-update/apply',(req,res)=>{
    const id=Number(req.params.companyId);
    if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM companies WHERE id=?').get(id))return res.status(404).json({error:'Empresa no encontrada.'});
    try{
      const tx=db.transaction(()=>{
        const rows=prepareBulkUpdate(id,req.body);
        // Si cambió algún valor desde la vista previa, cancela toda la operación.
        for(const r of rows){
          if(r.expected_price===undefined||r.expected_stock===undefined||
             Number(r.expected_price)!==r.old_price||Number(r.expected_stock)!==r.old_stock||
             r.expected_cabys===undefined||String(r.expected_cabys)!==r.old_cabys)
            throw Error(`El artículo «${r.description}» cambió desde la vista previa. Revisa el CSV nuevamente.`);
        }
        const update=db.prepare('UPDATE products SET price=?,stock=?,cabys=? WHERE company_id=? AND id=? AND is_deleted=0');
        const logPrice=db.prepare('INSERT INTO product_bulk_price_changes(company_id,product_id,old_price,new_price) VALUES (?,?,?,?)');
        const logMovement=db.prepare('INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason) VALUES (?,?,?,?,?,?,?,?)');
        let priceChanges=0,stockChanges=0,cabysChanges=0;
        for(const r of rows){
          if(!r.priceChanged&&!r.stockChanged&&!r.cabysChanged)continue;
          const result=update.run(r.new_price,r.new_stock,r.new_cabys,id,r.id);
          if(result.changes!==1)throw Error('No se pudo actualizar '+r.description);
          if(r.priceChanged){logPrice.run(id,r.id,r.old_price,r.new_price);priceChanges++}
          if(r.stockChanged){const delta=r.new_stock-r.old_stock;
            logMovement.run(id,r.id,'ajuste',Math.abs(delta),delta,r.old_stock,r.new_stock,'Actualización masiva CSV');stockChanges++}
          if(r.cabysChanged)cabysChanges++;
        }
        return {ok:true,processed:rows.length,priceChanges,stockChanges,cabysChanges};
      });
      res.json(tx());
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.post('/api/companies/:companyId/products/import',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    const rows=req.body?.rows;
    if(!Array.isArray(rows)||rows.length===0||rows.length>2000)return res.status(400).json({error:'Importa entre 1 y 2000 artículos por lote.'});
    try {
      const validated=rows.map((row,index)=>{
        try {
          const v={kind:'producto',product_code:'',barcode:'',description:'',cabys:'',price:'0',cost:'0',currency:'CRC',tax_code:'08',unit:'Unid',stock:'0',min_stock:'0',track_stock:'1',alert_enabled:'1',notes:'',image_data:'',price_includes_tax:'1',...row};
          // Nunca importar imágenes en este flujo; se añaden desde el formulario.
          v.image_data='';
          return configs.products.parse(v);
        }catch(e){throw Error('Fila '+(index+2)+': '+e.message)}
      });
      const codes=new Set();
      for(const item of validated){
        if(!item.product_code)continue;
        if(codes.has(item.product_code))throw Error('Código duplicado dentro del archivo: '+item.product_code);
        codes.add(item.product_code);
        if(db.prepare('SELECT id FROM products WHERE company_id=? AND product_code=?').get(companyId,item.product_code))throw Error('El código '+item.product_code+' ya existe. La importación no reemplaza artículos existentes.');
      }
      const cols=configs.products.columns;
      const insert=db.prepare(`INSERT INTO products(company_id,${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})`);
      const movement=db.prepare('INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason) VALUES (?,?,?,?,?,?,?,?)');
      const tx=db.transaction(()=>{
        for(const item of validated){
          const result=insert.run(companyId,...cols.map(k=>item[k]));
          if(item.kind==='producto'&&item.track_stock&&item.stock>0)movement.run(companyId,result.lastInsertRowid,'entrada',item.stock,item.stock,0,item.stock,'Importación inicial del catálogo');
        }
      });
      tx();res.status(201).json({ok:true,imported:validated.length});
    }catch(e){res.status(400).json({error:e.message})}
  });
  for (const [table, config] of Object.entries(configs)) {
    const prefix = `/api/companies/:companyId/${table}`;
    const company = req => {
      const id = Number(req.params.companyId);
      return Number.isSafeInteger(id) && id > 0 && db.prepare('SELECT id FROM companies WHERE id=?').get(id) ? id : null;
    };
    app.get(prefix, (req,res) => {
      const id = company(req);
      if (!id) return res.status(404).json({error:'Empresa no encontrada.'});
      const rows=db.prepare(`SELECT * FROM ${table} WHERE company_id=? ${table==='products'?'AND is_deleted=0':''} ORDER BY id DESC`).all(id);
      // El cajero ve el precio de venta, nunca el costo de compra ni notas internas.
      const cashier=table==='products'&&!req.authUser?.is_owner&&db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=?').get(req.authUser.id,id)?.role==='cashier';
      res.json(cashier?rows.map(({cost,notes,...product})=>product):rows);
    });
    app.post(prefix, (req,res) => {
      const id = company(req);
      if (!id) return res.status(404).json({error:'Empresa no encontrada.'});
      try {
        const item = config.parse(req.body);
        const cols = config.columns;
        // La existencia inicial se registra como movimiento de apertura.
        if (table==='products' && item.kind==='producto' && item.track_stock && item.stock>0) {
          const tx=db.transaction(()=>{
            const result=db.prepare(`INSERT INTO ${table} (company_id,${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})`).run(id,...cols.map(c=>item[c]));
            db.prepare('INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason) VALUES (?,?,?,?,?,?,?,?)').run(id,result.lastInsertRowid,'entrada',item.stock,item.stock,0,item.stock,'Inventario inicial');
            return result;
          });
          const result=tx();
          return res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(result.lastInsertRowid,id));
        }
        const result = db.prepare(`INSERT INTO ${table} (company_id,${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})`).run(id,...cols.map(c=>item[c]));
        res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(result.lastInsertRowid,id));
      } catch(err) {
        res.status(err.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 400).json({error:err.code?.startsWith('SQLITE_CONSTRAINT') ? 'Ya existe un registro con esa identificación.' : err.message});
      }
    });
    app.put(`${prefix}/:itemId`, (req,res) => {
      const id = company(req), itemId = Number(req.params.itemId);
      if (!id) return res.status(404).json({error:'Empresa no encontrada.'});
      if (!Number.isSafeInteger(itemId) || !db.prepare(`SELECT id FROM ${table} WHERE id=? AND company_id=?`).get(itemId,id)) return res.status(404).json({error:'Registro no encontrado.'});
      try {
        const item = config.parse(req.body), cols = config.columns;
        if(table==='products') {
          const old=db.prepare('SELECT * FROM products WHERE id=? AND company_id=?').get(itemId,id);
          if(item.stock!==old.stock) return res.status(400).json({error:'Las existencias se modifican únicamente mediante entradas, salidas o ajustes en el historial.'});
          if(old.kind==='producto' && item.kind==='servicio' && db.prepare('SELECT id FROM inventory_movements WHERE product_id=? LIMIT 1').get(itemId)) return res.status(400).json({error:'No se puede convertir a servicio un producto con historial de inventario.'});
        }
        db.prepare(`UPDATE ${table} SET ${cols.map(c=>c+'=?').join(',')} WHERE id=? AND company_id=?`).run(...cols.map(c=>item[c]),itemId,id);
        res.json(db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(itemId,id));
      } catch(err) {
        res.status(err.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 400).json({error:err.code?.startsWith('SQLITE_CONSTRAINT') ? 'Ya existe un registro con esa identificación.' : err.message});
      }
    });
    app.delete(`${prefix}/:itemId`, (req,res) => {
      const id = company(req), itemId = Number(req.params.itemId);
      if (!id) return res.status(404).json({error:'Empresa no encontrada.'});
      if (!Number.isSafeInteger(itemId)) return res.status(404).json({error:'Registro no encontrado.'});
      if(table==='products'){const result=db.prepare('UPDATE products SET is_deleted=1 WHERE id=? AND company_id=? AND is_deleted=0').run(itemId,id);return res.status(result.changes?204:404).end();}
      const result = db.prepare(`DELETE FROM ${table} WHERE id=? AND company_id=?`).run(itemId,id);
      res.status(result.changes ? 204 : 404).end();
    });
  }
  // Alertas consolidadas por empresa; no cambia existencias ni crea movimientos.
  app.get('/api/companies/:companyId/inventory/alerts',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    const products=db.prepare(`SELECT id,product_code,description,unit,kind,stock,min_stock,track_stock,alert_enabled,is_deleted,cost,currency
      FROM products WHERE company_id=? AND is_deleted=0 AND kind='producto' AND track_stock=1 AND alert_enabled=1
      AND stock<=min_stock ORDER BY stock,description COLLATE NOCASE`).all(companyId);
    res.json(buildInventoryAlerts(products));
  });
  app.get('/api/companies/:companyId/inventory/alerts/export.html',(req,res)=>{
    const companyId=Number(req.params.companyId),company=db.prepare('SELECT legal_name,trade_name FROM companies WHERE id=?').get(companyId);
    if(!company)return res.status(404).json({error:'Empresa no encontrada.'});
    const products=db.prepare(`SELECT id,product_code,description,unit,kind,stock,min_stock,track_stock,alert_enabled,is_deleted,cost,currency FROM products WHERE company_id=? AND is_deleted=0 AND kind='producto' AND track_stock=1 AND alert_enabled=1 AND stock<=min_stock ORDER BY stock,description COLLATE NOCASE`).all(companyId);
    const {rows,summary}=buildInventoryAlerts(products);
    const vals=rows.map(x=>[x.code,x.description,x.status,x.stock,x.minimum,x.suggested,x.unit,x.estimatedCostCRC===null?'Sin costo CRC':x.estimatedCostCRC]);
    res.type('html').send(reportHtml({title:'Plan de reposición del inventario',company:company.trade_name||company.legal_name,subtitle:'Alertas de existencias bajas y productos agotados. Cantidades sugeridas, sin registrar compras.',headers:['SKU','Producto','Estado','Existencias','Mínimo','Reponer','Unidad','Costo estimado CRC'],rows:vals,summary:[['Artículos por reponer',summary.total],['Agotados',summary.out],['Unidades sugeridas',summary.suggestedUnits],['Costo conocido CRC',summary.estimatedCostCRC]],note:'Costo estimado parcial si hay productos sin costo válido en colones. No modifica inventario.'}));
  });
  registerKardexRoutes(app,db);
  registerInventoryValuationRoutes(app,db);
  // Movimientos: la API calcula el saldo dentro de una transacción SQLite.
  app.get('/api/companies/:companyId/inventory/movements',(req,res)=>{
    const companyId=Number(req.params.companyId), productId=Number(req.query.productId);
    if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId)) return res.status(404).json({error:'Empresa no encontrada.'});
    if(!Number.isSafeInteger(productId)||productId<1) return res.status(400).json({error:'Seleccione un producto.'});
    res.json(db.prepare('SELECT * FROM inventory_movements WHERE company_id=? AND product_id=? ORDER BY id DESC LIMIT 300').all(companyId,productId));
  });
  // Exportación completa del historial, incluidos artículos retirados del catálogo.
  app.get('/api/companies/:companyId/inventory/movements/export.html',(req,res)=>{
    const companyId=Number(req.params.companyId),status=String(req.query.status||'all'),sort=String(req.query.sort||'az');
    const company=db.prepare('SELECT legal_name,trade_name FROM companies WHERE id=?').get(companyId);
    if(!company)return res.status(404).json({error:'Empresa no encontrada.'});
    if(!['all','active','deleted'].includes(status)||!['az','za','newest','oldest'].includes(sort))return res.status(400).json({error:'Filtro u ordenamiento inválido.'});
    const where=status==='active'?' AND p.is_deleted=0':status==='deleted'?' AND p.is_deleted=1':'';
    const order={az:'p.description COLLATE NOCASE ASC, m.id DESC',za:'p.description COLLATE NOCASE DESC, m.id DESC',newest:'m.id DESC',oldest:'m.id ASC'}[sort];
    const entries=db.prepare(`SELECT m.id,m.created_at,p.description,p.product_code,p.is_deleted,m.movement_type,m.quantity,m.delta,m.stock_before,m.stock_after,m.reason,m.notes FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.company_id=m.company_id WHERE m.company_id=?${where} ORDER BY ${order}`).all(companyId);
    const rows=entries.map(r=>[r.id,r.created_at,r.description+' · '+(r.product_code||'Sin SKU'),r.is_deleted?'Retirado':'Activo',r.movement_type,r.delta,r.stock_before,r.stock_after,r.reason||'',r.notes||'']);
    res.type('html').send(reportHtml({title:'Movimientos de inventario',company:company.trade_name||company.legal_name,subtitle:`Estado ${status} · Orden ${sort} · Fechas en UTC`,headers:['ID','Fecha UTC','Artículo / SKU','Estado','Tipo','Variación','Antes','Después','Motivo','Observaciones'],rows,summary:[['Movimientos',rows.length]]}));
  });
  app.get('/api/companies/:companyId/inventory/movements/export.csv',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    const status=String(req.query.status||'all');
    const sort=String(req.query.sort||'az');
    if(!['all','active','deleted'].includes(status)||!['az','za','newest','oldest'].includes(sort))return res.status(400).json({error:'Filtro u ordenamiento inválido.'});
    const where=status==='active'?' AND p.is_deleted=0':status==='deleted'?' AND p.is_deleted=1':'';
    const order={az:'p.description COLLATE NOCASE ASC, m.id DESC',za:'p.description COLLATE NOCASE DESC, m.id DESC',newest:'m.id DESC',oldest:'m.id ASC'}[sort];
    const rows=db.prepare(`SELECT m.id, m.created_at, p.description, p.product_code, p.barcode, p.is_deleted, m.movement_type, m.quantity, m.delta, m.stock_before, m.stock_after, m.reason, m.notes FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.company_id=m.company_id WHERE m.company_id=?${where} ORDER BY ${order}`).all(companyId);
    const headers=['ID movimiento','Fecha','Artículo','Código / SKU','Código de barras','Estado','Tipo','Cantidad','Cambio','Existencias antes','Existencias después','Motivo','Observaciones'];
    const encoding=csvEncoding(req);
    res.setHeader('Content-Type',`text/csv; charset=${encoding}`);
    res.setHeader('Content-Disposition','attachment; filename="FacturaCR_movimientos_excel.csv"');
    res.write(csvBytes('sep=;\r\n'+csvLine(headers),encoding));
    for(const r of rows){
      const values=[r.id,r.created_at,r.description,r.product_code,r.barcode,r.is_deleted?'Eliminado':'Activo',r.movement_type,r.quantity,r.delta,r.stock_before,r.stock_after,r.reason,r.notes];
      res.write(Buffer.from(csvLine(values,[3,4]),'utf16le'));
    }
    res.end();
  });
  app.post('/api/companies/:companyId/inventory/movements',(req,res)=>{
    const companyId=Number(req.params.companyId), productId=Number(req.body?.product_id);
    const type=String(req.body?.movement_type??''),quantity=Number(req.body?.quantity);
    const reason=String(req.body?.reason??'').trim(),notes=String(req.body?.notes??'').trim();
    if(!Number.isSafeInteger(companyId)||companyId<1||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId)) return res.status(404).json({error:'Empresa no encontrada.'});
    if(!Number.isSafeInteger(productId)||productId<1||!['entrada','salida','ajuste'].includes(type)||!Number.isSafeInteger(quantity)||quantity<(type==='ajuste'?0:1)||quantity>1e9||reason.length<5||reason.length>120||notes.length>500) return res.status(400).json({error:'Revise producto, tipo, cantidad (los ajustes permiten cero), motivo de al menos 5 caracteres y observaciones.'});
    try {
      const tx=db.transaction(()=>{
        const product=db.prepare('SELECT * FROM products WHERE company_id=? AND id=? AND is_deleted=0').get(companyId,productId);
        if(!product||product.kind!=='producto'||!product.track_stock) throw Error('Este artículo no controla existencias.');
        const before=Number(product.stock);
        if(!Number.isSafeInteger(before)) throw Error('Este artículo tiene existencias decimales de una versión anterior. Regulariza su inventario antes de registrar movimientos.');
        // Ajuste significa establecer el saldo final a la cantidad indicada.
        const after=type==='ajuste'?quantity:before+(type==='entrada'?quantity:-quantity);
        if(!Number.isSafeInteger(after)||after>1e9) throw Error('La cantidad final excede el límite permitido.');
        if(after<0) throw Error('No hay existencias suficientes para realizar la salida.');
        const delta=after-before;
        if(delta===0) throw Error('El ajuste no cambia las existencias.');
        db.prepare('UPDATE products SET stock=? WHERE company_id=? AND id=?').run(after,companyId,productId);
        // En ajustes a saldo cero, la columna histórica quantity exige > 0.
        // Guardar la magnitud de la variación preserva el esquema y refleja la salida real;
        // stock_after conserva el saldo final solicitado (cero).
        const loggedQuantity=type==='ajuste'&&quantity===0?Math.abs(delta):quantity;
        const result=db.prepare('INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason,notes) VALUES (?,?,?,?,?,?,?,?,?)').run(companyId,productId,type,loggedQuantity,delta,before,after,reason,notes);
        return db.prepare('SELECT * FROM inventory_movements WHERE id=?').get(result.lastInsertRowid);
      });
      res.status(201).json(tx());
    }catch(err){res.status(400).json({error:err.message});}
  });
  // POS interno: los comprobantes NO son facturas electrónicas de Hacienda.
  const cents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Monto inválido.');return Math.round((n+Number.EPSILON)*100)};
  const saleCompany=req=>{
    const id=Number(req.params.companyId);
    if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM companies WHERE id=?').get(id))throw Error('Empresa no encontrada.');
    return id;
  };
  const paymentLabels=['Efectivo','Tarjeta','SINPE Móvil','Transferencia bancaria','Cheque','Otros'];
  registerCashRoutes(app,db,saleCompany);
  app.get('/api/companies/:companyId/sales',(req,res)=>{
    try{
      const companyId=saleCompany(req),q=String(req.query.q||'').trim().slice(0,120);
      const rows=db.prepare(`SELECT s.*,c.name AS client_name FROM sales s LEFT JOIN clients c ON c.id=s.client_id
       WHERE s.company_id=? AND (?='' OR CAST(s.id AS TEXT) LIKE ? OR c.name LIKE ? OR s.created_at LIKE ?)
       ORDER BY s.id DESC LIMIT 500`).all(companyId,q,`%${q}%`,`%${q}%`,`%${q}%`);
      res.json(rows);
    }catch(e){res.status(400).json({error:e.message})}
  });
  // Dashboard de reportes, filtros y exportaciones: consultas SQL de solo lectura por empresa.
  registerDashboardRoutes(app,db,saleCompany);
  // Ajustes reutilizables de proformas; no es necesario configurar el logo cada vez.
  const quoteDefaults={valid_days:15,show_logo:true,logo:'',terms:'Precios sujetos a disponibilidad. Esta cotización no constituye factura ni reserva de inventario.'};
  app.get('/api/companies/:companyId/quote-settings',(req,res)=>{
    try{
      const companyId=saleCompany(req);
      const row=db.prepare('SELECT settings_json FROM company_quote_settings WHERE company_id=?').get(companyId);
      const saved=row?JSON.parse(row.settings_json):{};
      const ticket=db.prepare('SELECT settings_json FROM company_ticket_settings WHERE company_id=?').get(companyId);
      let logo='';
      if(ticket){try{const data=JSON.parse(ticket.settings_json);if(typeof data.logo==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(data.logo))logo=data.logo;}catch{}}
      res.json({settings:{...quoteDefaults,...saved},company_logo:logo});
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.put('/api/companies/:companyId/quote-settings',(req,res)=>{
    try{
      const companyId=saleCompany(req),body=req.body||{};
      const days=Number(body.valid_days),terms=String(body.terms||'').trim();
      if(!Number.isSafeInteger(days)||days<1||days>365||terms.length>1500||typeof body.show_logo!=='boolean')throw Error('Revisa los ajustes de cotización.');
      const logo=typeof body.logo==='string'?body.logo:'';
      if(logo.length>360000||(logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(logo)))throw Error('El logotipo debe ser una imagen PNG, JPG o WebP de menos de 250 KB.');
      const settings={valid_days:days,show_logo:body.show_logo,terms,logo};
      db.prepare(`INSERT INTO company_quote_settings(company_id,settings_json) VALUES(?,?) ON CONFLICT(company_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP`).run(companyId,JSON.stringify(settings));
      res.json({ok:true,settings});
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.get('/api/companies/:companyId/quotations',(req,res)=>{
    try{
      const companyId=saleCompany(req);
      res.json(db.prepare('SELECT id,created_at,title,client_name,total_cents,valid_days FROM quotations WHERE company_id=? ORDER BY id DESC LIMIT 300').all(companyId));
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.get('/api/companies/:companyId/quotations/:quoteId',(req,res)=>{
    try{
      const companyId=saleCompany(req),id=Number(req.params.quoteId);
      if(!Number.isSafeInteger(id)||id<1)throw Error('Cotización inválida.');
      const quote=db.prepare('SELECT * FROM quotations WHERE id=? AND company_id=?').get(id,companyId);
      if(!quote)return res.status(404).json({error:'Cotización no encontrada.'});
      res.json({...quote,lines:db.prepare('SELECT * FROM quotation_lines WHERE quotation_id=? ORDER BY id').all(id)});
    }catch(e){res.status(400).json({error:e.message})}
  });
  // Eliminar exclusivamente la proforma de esta empresa y sus líneas, sin tocar ventas ni inventario.
  app.delete('/api/companies/:companyId/quotations/:quoteId',(req,res)=>{
    try{
      const companyId=saleCompany(req),id=Number(req.params.quoteId);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Número de proforma inválido.'});
      const deleted=db.transaction(()=>{
        const quote=db.prepare('SELECT id FROM quotations WHERE id=? AND company_id=?').get(id,companyId);
        if(!quote)return false;
        db.prepare('DELETE FROM quotation_lines WHERE quotation_id=?').run(id);
        db.prepare('DELETE FROM quotations WHERE id=? AND company_id=?').run(id,companyId);
        return true;
      })();
      if(!deleted)return res.status(404).json({error:'Proforma no encontrada en esta empresa.'});
      res.json({ok:true,id});
    }catch(e){res.status(400).json({error:e.message})}
  });
  // Crear y editar cotizaciones sin crear ventas ni mover existencias.
  function saveQuotation(req,res,edit=false){
    try{
      const companyId=saleCompany(req),body=req.body||{};
      const quoteId=edit?Number(req.params.quoteId):null;
      const previous=edit?db.prepare('SELECT * FROM quotations WHERE id=? AND company_id=?').get(quoteId,companyId):null;
      if(edit&&(!Number.isSafeInteger(quoteId)||quoteId<1||!previous))return res.status(404).json({error:'Cotización no encontrada en esta empresa.'});
      const oldLines=edit?db.prepare('SELECT * FROM quotation_lines WHERE quotation_id=?').all(quoteId):[];
      const clientId=body.client_id===null||body.client_id===''||body.client_id===undefined?null:Number(body.client_id);
      const client=clientId?db.prepare('SELECT * FROM clients WHERE id=? AND company_id=?').get(clientId,companyId):null;
      if(clientId&&!client)throw Error('Cliente no pertenece a esta empresa.');
      const clientName=client?.name||String(body.client_name||'').trim()||'Consumidor final';
      if(clientName.length>160)throw Error('Nombre de cliente demasiado largo.');
      const title=String(body.title||'').trim(),notes=String(body.notes||'').trim();
      if(title.length>160||notes.length>1500)throw Error('Título u observaciones demasiado largos.');
      const settingsRow=db.prepare('SELECT settings_json FROM company_quote_settings WHERE company_id=?').get(companyId);
      const settings={...quoteDefaults,...(settingsRow?JSON.parse(settingsRow.settings_json):{})};
      const days=edit?previous.valid_days:Number(settings.valid_days);
      if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>100)throw Error('Agrega de 1 a 100 conceptos.');
      let subtotal=0,tax=0,total=0;
      const lines=body.lines.map(row=>{
        const quantity=Number(row.quantity);
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('Cantidad inválida.');
        let description,price,rate,includes,sourceId=null;
        let old=null;
        if(edit&&row.existing_line_id!==null&&row.existing_line_id!==undefined){
          old=oldLines.find(line=>line.id===Number(row.existing_line_id));
          if(!old)throw Error('Una línea no pertenece a esta proforma. Recarga y vuelve a editar.');
          description=String(row.description||old.description).trim();
          rate=Number(old.tax_rate);
          includes=old.input_includes_tax===null
            ?old.quantity>0&&old.total_cents%old.quantity===0
            :old.input_includes_tax===1;
          price=old.input_price_cents!==null
            ?Number(old.input_price_cents)/100
            :includes?Number(old.total_cents)/100/Number(old.quantity):Number(old.unit_price_cents)/100;
          sourceId=old.source_product_id;
        }else if(row.product_id!==null&&row.product_id!==''&&row.product_id!==undefined){
          const id=Number(row.product_id);
          const product=db.prepare('SELECT * FROM products WHERE id=? AND company_id=? AND is_deleted=0').get(id,companyId);
          if(!product)throw Error('Uno de los artículos ya no está disponible.');
          if(product.currency!=='CRC')throw Error('Solo se permiten cotizaciones en colones.');
          description=String(product.description);price=Number(product.price);rate=Number(product.tax_rate);includes=Number(product.price_includes_tax)===1;
          sourceId=id;
        }else{
          description=String(row.description||'').trim();price=Number(row.price);rate=Number(row.tax_rate);includes=row.price_includes_tax===true;
        }
        if(!description||description.length>250)throw Error('Describe cada concepto (máx. 250 caracteres).');
        if(!Number.isFinite(price)||price<0||price>1e9||!Number.isFinite(rate)||rate<0||rate>100)throw Error('Precio o tarifa de IVA inválidos.');
        let base,iva,unit,lineTotal;
        if(old&&quantity===old.quantity){
          // No alterar importes históricos si solo cambian cliente, descripción o notas.
          unit=old.unit_price_cents;base=old.subtotal_cents;iva=old.tax_cents;lineTotal=old.total_cents;
        }else{
          const gross=includes?Math.round(price)*100*quantity:null;
          unit=Math.round((includes?price/(1+rate/100):price))*100;
          base=unit*quantity;
          iva=includes?gross-base:Math.round(base*rate/10000)*100;
          lineTotal=base+iva;
        }
        if(!Number.isSafeInteger(lineTotal)||lineTotal<0||lineTotal>1e12||iva<0)throw Error('Importe inválido.');
        subtotal+=base;tax+=iva;total+=lineTotal;
        return {description,quantity,unit,rate,base,iva,lineTotal,sourceId,inputPriceCents:Math.round(price*100),includes:includes?1:0};
      });
      if(total<=0||total>1e12)throw Error('El total de la cotización debe ser positivo.');
      const ticket=db.prepare('SELECT settings_json FROM company_ticket_settings WHERE company_id=?').get(companyId);
      let logo='';
      if(edit){logo=previous.logo_snapshot;}else if(settings.show_logo){
        if(typeof settings.logo==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(settings.logo)&&settings.logo.length<360000)logo=settings.logo;
        else if(ticket){try{const data=JSON.parse(ticket.settings_json);if(typeof data.logo==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(data.logo)&&data.logo.length<380000)logo=data.logo;}catch{}}
      }
      const freeField=(field,max)=>String(body[field]||'').trim().slice(0,max);
      const clientFields={
        identification:client?(client.identification||''):freeField('client_identification',30),
        email:client?(client.email||''):freeField('client_email',160),
        phone:client?(client.phone||''):freeField('client_phone',40),
        trade:client?(client.trade_name||''):freeField('client_trade_name',160),
        identType:client?(client.identification_type||''):freeField('client_identification_type',10),
        phoneAlt:client?(client.phone_alt||''):freeField('client_phone_alt',40),
        address:client?(client.address||''):freeField('client_address',350)
      };
      const updated=db.transaction(()=>{
        let id;
        if(edit){
          id=quoteId;
          db.prepare(`UPDATE quotations SET client_id=?,client_name=?,client_identification=?,client_email=?,client_phone=?,client_trade_name=?,client_identification_type=?,client_phone_alt=?,client_address=?,title=?,notes=?,subtotal_cents=?,tax_cents=?,total_cents=? WHERE id=? AND company_id=?`)
            .run(clientId,clientName,clientFields.identification,clientFields.email,clientFields.phone,clientFields.trade,clientFields.identType,clientFields.phoneAlt,clientFields.address,title,notes,subtotal,tax,total,id,companyId);
          db.prepare('DELETE FROM quotation_lines WHERE quotation_id=?').run(id);
        }else{
          const result=db.prepare(`INSERT INTO quotations(company_id,client_id,client_name,client_identification,client_email,client_phone,client_trade_name,client_identification_type,client_phone_alt,client_address,title,notes,terms,valid_days,logo_snapshot,subtotal_cents,tax_cents,total_cents)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(companyId,clientId,clientName,clientFields.identification,clientFields.email,clientFields.phone,clientFields.trade,clientFields.identType,clientFields.phoneAlt,clientFields.address,title,notes,settings.terms,days,logo,subtotal,tax,total);
          id=Number(result.lastInsertRowid);
        }
        const stmt=db.prepare('INSERT INTO quotation_lines(quotation_id,description,quantity,unit_price_cents,tax_rate,subtotal_cents,tax_cents,total_cents,source_product_id,input_price_cents,input_includes_tax) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        for(const line of lines)stmt.run(id,line.description,line.quantity,line.unit,line.rate,line.base,line.iva,line.lineTotal,line.sourceId,line.inputPriceCents,line.includes);
        return {id,total_cents:total,updated:edit};
      })();
      res.status(edit?200:201).json(updated);
    }catch(e){res.status(400).json({error:e.message})}
  }
  app.post('/api/companies/:companyId/quotations',(req,res)=>saveQuotation(req,res,false));
  app.put('/api/companies/:companyId/quotations/:quoteId',(req,res)=>saveQuotation(req,res,true));
  // Histórico completo de créditos y abonos, limitado a la empresa solicitada.
  app.get('/api/companies/:companyId/credit-history',(req,res)=>{
    try{
      const companyId=saleCompany(req);
      const rows=db.prepare(`SELECT s.id,s.client_id,COALESCE(c.name,'Cliente sin nombre') AS client_name,
        s.created_at,s.status,s.total_cents,s.paid_cents,s.balance_cents,s.annulled_at,
        (SELECT COUNT(*) FROM sale_payments p WHERE p.sale_id=s.id) AS payment_count
        FROM sales s LEFT JOIN clients c ON c.id=s.client_id
        WHERE s.company_id=? AND s.sale_type='credito' ORDER BY s.id DESC`).all(companyId);
      res.json(rows);
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.get('/api/companies/:companyId/credit-history/payments',(req,res)=>{
    try{
      const companyId=saleCompany(req);
      const rows=db.prepare(`SELECT p.id,p.sale_id,p.created_at,p.method,p.amount_cents,
        COALESCE(c.name,'Cliente sin nombre') AS client_name,s.status
        FROM sale_payments p JOIN sales s ON s.id=p.sale_id
        LEFT JOIN clients c ON c.id=s.client_id
        WHERE s.company_id=? AND s.sale_type='credito'
        ORDER BY p.created_at DESC,p.id DESC`).all(companyId);
      res.json(rows);
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.get('/api/companies/:companyId/sales/export.csv',(req,res)=>{
    try{
      const companyId=saleCompany(req);
      const rows=db.prepare(`SELECT s.*,COALESCE(c.name,'Consumidor final') AS client_name FROM sales s LEFT JOIN clients c ON c.id=s.client_id WHERE s.company_id=? ORDER BY s.id DESC`).all(companyId);
      const columns=['Venta','Fecha','Cliente','Tipo','Estado','Subtotal CRC','Descuento CRC','Impuesto CRC','Total CRC','Pagado CRC','Saldo CRC','Motivo anulación'];
      const cell=formattedCsvCell;
      const csv='sep=;\r\n'+[columns,...rows.map(r=>[r.id,r.created_at,r.client_name,r.sale_type,r.status,r.subtotal_cents/100,r.discount_cents/100,r.tax_cents/100,r.total_cents/100,r.paid_cents/100,r.balance_cents/100,r.annul_reason||''])].map(row=>row.map(cell).join(';')).join('\r\n');
      res.setHeader('Content-Type','text/csv; charset=utf-16le');res.setHeader('Content-Disposition','attachment; filename="FacturaCR_ventas.csv"');res.send(csvExcelBuffer(csv));
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.get('/api/companies/:companyId/sales/:saleId',(req,res)=>{
    try{
      const companyId=saleCompany(req),id=Number(req.params.saleId);
      const sale=db.prepare('SELECT * FROM sales WHERE id=? AND company_id=?').get(id,companyId);
      if(!sale)return res.status(404).json({error:'Venta no encontrada.'});
      const client=sale.client_id?db.prepare('SELECT name,trade_name,identification_type,identification,email,phone,address,province,canton,district FROM clients WHERE id=? AND company_id=?').get(sale.client_id,companyId):null;
      res.json({...sale,client,lines:db.prepare('SELECT * FROM sale_lines WHERE sale_id=? ORDER BY id').all(id),payments:db.prepare('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY id').all(id)});
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.post('/api/companies/:companyId/sales',(req,res)=>{
    try{
      const companyId=saleCompany(req),body=req.body||{};
      const saleType=String(body.sale_type||'');
      if(!['contado','credito'].includes(saleType))throw Error('Tipo de venta inválido.');
      const clientId=body.client_id==null||body.client_id===''?null:Number(body.client_id);
      if(saleType==='credito'&&!clientId)throw Error('Las ventas a crédito requieren un cliente registrado.');
      if(clientId&&!db.prepare('SELECT id FROM clients WHERE id=? AND company_id=?').get(clientId,companyId))throw Error('Cliente no pertenece a esta empresa.');
      if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100)throw Error('Agrega entre 1 y 100 líneas.');
      if(!Array.isArray(body.payments)||body.payments.length>10)throw Error('Pagos inválidos.');
      const requestedDiscount=Number(body.discount??0);
      if(!Number.isFinite(requestedDiscount)||requestedDiscount<0)throw Error('El descuento debe ser un importe válido y no negativo.');
      const discount=Math.round(cents(requestedDiscount)/100)*100;
      const unique=new Set(body.lines.map(l=>String(l.product_id)));
      if(unique.size!==body.lines.length)throw Error('Hay artículos duplicados en el carrito. Agrupa las cantidades.');
      const result=db.transaction(()=>{
        let subtotal=0,tax=0;
        const lines=body.lines.map(row=>{
          const productId=Number(row.product_id),quantity=Number(row.quantity);
          if(!Number.isSafeInteger(productId)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('Artículo o cantidad inválidos.');
          const product=db.prepare('SELECT * FROM products WHERE id=? AND company_id=? AND is_deleted=0').get(productId,companyId);
          if(!product)throw Error('Un artículo no existe o fue eliminado.');
          if(product.currency!=='CRC')throw Error(`«${product.description}» está en USD. Configura su precio en CRC antes de venderlo.`);
          const includesTax=Number(product.price_includes_tax)===1;
          const rate=Number(product.tax_rate);
          const rawUnit=includesTax?Math.round(cents(product.price)/(1+rate/100)):cents(product.price);
          const unit=Math.round(rawUnit/100)*100,lineSubtotal=unit*quantity;
          if(!Number.isSafeInteger(lineSubtotal)||lineSubtotal>1e12)throw Error('Importe demasiado grande.');
          // El precio marcado "IVA incluido" es el importe final prometido al cliente.
          // Al redondear por separado base e IVA pueden perderse ₡1 o más por cantidad.
          // Conservamos la base en colones enteros y asignamos la diferencia al IVA,
          // sin cambiar precios de productos ni ventas históricas.
          const grossLine=includesTax?Math.round(cents(product.price)/100)*100*quantity:null;
          if(grossLine!==null&&(!Number.isSafeInteger(grossLine)||grossLine>1e12))throw Error('Importe demasiado grande.');
          const unadjustedTax=Math.round(lineSubtotal*rate/10000)*100;
          const taxRoundingAdjustment=includesTax?grossLine-lineSubtotal-unadjustedTax:0;
          subtotal+=lineSubtotal;
          return {product,quantity,unit,lineSubtotal,taxRoundingAdjustment};
        });
        if(discount>subtotal)throw Error('El descuento supera el subtotal.');
        // Descuento proporcional por línea, con remanente asignado a la última.
        let distributed=0;
        const detailed=lines.map((line,i)=>{
          const part=i===lines.length-1?discount-distributed:Math.floor(discount*line.lineSubtotal/subtotal/100)*100;
          distributed+=part;
          // El ajuste de redondeo corresponde al precio ANTES del descuento.
          // Se prorratea con la base restante: si se descuenta la totalidad de la
          // base imponible, el IVA y su ajuste pasan a ₡0 (sin residuos de ₡1).
          const remainingBase=line.lineSubtotal-part;
          const roundedTax=Math.round(remainingBase*Number(line.product.tax_rate)/10000)*100;
          const adjustedRounding=remainingBase>0&&line.lineSubtotal>0
            ?Math.round(line.taxRoundingAdjustment*remainingBase/line.lineSubtotal/100)*100:0;
          const lineTax=Math.max(0,roundedTax+adjustedRounding);
          tax+=lineTax;
          return {...line,discount:part,lineTax,lineTotal:line.lineSubtotal-part+lineTax};
        });
        const total=subtotal-discount+tax;
        if(!Number.isSafeInteger(total)||total<=0)throw Error('El total debe ser positivo.');
        const payments=body.payments.map(pay=>{
          const method=String(pay.method||''),amount=Math.round(cents(pay.amount)/100)*100;
          if(!paymentLabels.includes(method)||amount<1)throw Error('Método o importe de pago inválido.');
          return {method,amount};
        });
        const paid=payments.reduce((sum,p)=>sum+p.amount,0);
        if(paid>total)throw Error('Los pagos no pueden superar el total. Registra únicamente el importe aplicado a la venta.');
        if(saleType==='contado'&&paid!==total)throw Error('En contado, los pagos deben cubrir exactamente el total.');
        if(saleType==='credito'&&paid===total)throw Error('Una venta completamente pagada debe registrarse como contado.');
        for(const line of detailed){
          const p=line.product;
          if(p.kind==='producto'&&Number(p.track_stock)===1){
            const before=Number(p.stock);
            if(!Number.isSafeInteger(before)||before<line.quantity)throw Error(`Existencias insuficientes o decimales en «${p.description}».`);
            const after=before-line.quantity;
            db.prepare('UPDATE products SET stock=? WHERE id=? AND company_id=?').run(after,p.id,companyId);
            db.prepare(`INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason,notes)
             VALUES (?,?,?,?,?,?,?,?,?)`).run(companyId,p.id,'salida',line.quantity,-line.quantity,before,after,'Venta POS','Descuento automático de inventario');
          }
        }
        const id=Number(db.prepare(`INSERT INTO sales(company_id,client_id,sale_type,subtotal_cents,discount_cents,tax_cents,total_cents,paid_cents,balance_cents)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(companyId,clientId,saleType,subtotal,discount,tax,total,paid,total-paid).lastInsertRowid);
        const addLine=db.prepare(`INSERT INTO sale_lines(sale_id,product_id,description,quantity,unit_price_cents,tax_rate,discount_cents,subtotal_cents,tax_cents,total_cents,unit_cost_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        // Captura el costo al vender, no el costo actual del catálogo. No estimar históricos.
        for(const l of detailed){
          const cost=Number(l.product.cost);
          const historicalCost=l.product.currency==='CRC'&&Number.isFinite(cost)&&cost>0&&cost<=1e10
            ?Math.round(cost*100):null;
          addLine.run(id,l.product.id,l.product.description,l.quantity,l.unit,l.product.tax_rate,l.discount,l.lineSubtotal,l.lineTax,l.lineTotal,historicalCost);
        }
        const addPayment=db.prepare('INSERT INTO sale_payments(sale_id,method,amount_cents) VALUES (?,?,?)');
        for(const pay of payments)addPayment.run(id,pay.method,pay.amount);
        // Una venta confirmada elimina su borrador en la misma transacción.
        if(req.authUser?.id)db.prepare('DELETE FROM sale_drafts WHERE user_id=? AND company_id=?').run(req.authUser.id,companyId);
        return {id,total_cents:total,balance_cents:total-paid};
      })();
      res.status(201).json(result);
    }catch(e){res.status(400).json({error:e.message})}
  });
  // Abonos: siempre en una transacción; no alteran las líneas ni el inventario.
  app.post('/api/companies/:companyId/sales/:saleId/payments',(req,res)=>{
    try {
      const companyId=saleCompany(req),saleId=Number(req.params.saleId);
      const method=String(req.body?.method||'');
      const requestedAmount=Math.round(cents(req.body?.amount)/100)*100;
      if(!paymentLabels.includes(method)||requestedAmount<=0)throw Error('Selecciona un método y un importe positivo.');
      const result=db.transaction(()=>{
        const sale=db.prepare('SELECT * FROM sales WHERE id=? AND company_id=?').get(saleId,companyId);
        if(!sale||sale.status!=='activa'||sale.sale_type!=='credito')throw Error('La venta a crédito no está activa.');
        // Permite liquidar el último colón visible aunque la base antigua conserve céntimos.
        const settle=req.body?.settle_balance===true;
        if(settle && requestedAmount!==Math.round(sale.balance_cents/100)*100)throw Error('El saldo cambió. Actualiza la venta.');
        const amount=settle?sale.balance_cents:requestedAmount;
        if(sale.balance_cents<=0||amount>sale.balance_cents)throw Error('El abono supera el saldo pendiente.');
        db.prepare('INSERT INTO sale_payments(sale_id,method,amount_cents) VALUES (?,?,?)').run(saleId,method,amount);
        db.prepare('UPDATE sales SET paid_cents=paid_cents+?,balance_cents=balance_cents-? WHERE id=?').run(amount,amount,saleId);
        return {id:saleId,balance_cents:sale.balance_cents-amount};
      })();
      res.json(result);
    }catch(e){res.status(400).json({error:e.message})}
  });
  app.post('/api/companies/:companyId/sales/:saleId/annul',(req,res)=>{
    try{
      const companyId=saleCompany(req),saleId=Number(req.params.saleId),reason=String(req.body?.reason||'').trim();
      if(reason.length<5||reason.length>300)throw Error('Indica un motivo de anulación (5 a 300 caracteres).');
      const result=db.transaction(()=>{
        const sale=db.prepare('SELECT * FROM sales WHERE id=? AND company_id=?').get(saleId,companyId);
        if(!sale)throw Error('Venta no encontrada.');
        if(sale.status!=='activa')throw Error('La venta ya fue anulada.');
        const lines=db.prepare('SELECT * FROM sale_lines WHERE sale_id=?').all(saleId);
        for(const line of lines){
          const p=db.prepare('SELECT * FROM products WHERE id=? AND company_id=?').get(line.product_id,companyId);
          if(p&&p.kind==='producto'&&Number(p.track_stock)===1){
            const before=Number(p.stock),after=before+line.quantity;
            if(!Number.isSafeInteger(before))throw Error('Inventario con existencias decimales: regulariza antes de anular.');
            db.prepare('UPDATE products SET stock=? WHERE id=?').run(after,p.id);
            db.prepare(`INSERT INTO inventory_movements(company_id,product_id,movement_type,quantity,delta,stock_before,stock_after,reason,notes)
             VALUES (?,?,?,?,?,?,?,?,?)`).run(companyId,p.id,'entrada',line.quantity,line.quantity,before,after,'Anulación de venta POS',`Venta #${saleId}: ${reason}`);
          }
        }
        db.prepare("UPDATE sales SET status='anulada',annulled_at=CURRENT_TIMESTAMP,annul_reason=? WHERE id=?").run(reason,saleId);
        return {ok:true};
      })();res.json(result);
    }catch(e){res.status(400).json({error:e.message})}
  });
  // Compatibilidad con interfaz anterior que consulta /api/companies/:id/backups.
  // El respaldo sigue siendo global (todas las empresas), no por empresa.
  app.get('/api/companies/:companyId/backups',(req,res)=>{
    const companyId=Number(req.params.companyId);
    if(!Number.isSafeInteger(companyId)||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))return res.status(404).json({error:'Empresa no encontrada.'});
    try{const fs=statfsSync(dataDir);const wal=databasePath+'-wal';res.json({databaseBytes:statSync(databasePath).size,walBytes:existsSync(wal)?statSync(wal).size:0,freeBytes:Number(fs.bavail)*Number(fs.bsize),totalBytes:Number(fs.blocks)*Number(fs.bsize),scope:'all-companies'});}
    catch{res.status(500).json({error:'No se pudo consultar el almacenamiento.'});}
  });
  app.use('/api',(req,res)=>res.status(404).json({error:`Ruta de API no disponible: ${req.method} ${req.originalUrl}. Comprueba que el instalador y el servidor sean de la misma versión.`,route:req.originalUrl}));
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (_req,res) => res.sendFile(join(staticDir,'index.html')));
  }
  const httpServer = await new Promise((resolve,reject)=>{
    const s = app.listen(port,'127.0.0.1',()=>resolve(s));
    s.on('error',reject);
  });
  return {port:httpServer.address().port, close:()=>new Promise(resolve=>{clearInterval(backupTimer);httpServer.close(()=>{db.close();resolve();})})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().then(({port})=>console.log(`API local: http://127.0.0.1:${port}`)).catch(err=>{console.error(err);process.exitCode=1;});
}
