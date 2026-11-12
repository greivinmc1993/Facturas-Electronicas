'use strict';
// Ensayo real de recuperación sobre una copia temporal con Node.js 22 SQLite.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {rehearseStoredBackup}=await import(pathToFileURL(path.join(__dirname,'../server/backup-rehearsal.js')).href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa066-'));
 const data=path.join(root,'data'),backups=path.join(root,'backups');fs.mkdirSync(data);fs.mkdirSync(backups);
 const filename='FacturaCR_auto_2026-11-12T10-00-00.sqlite';
 const source=path.join(backups,filename),current=path.join(data,'facturacr.sqlite');
 const defineDb=db=>{for(const table of ['companies','clients','products','inventory_movements','sales','quotations'])db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY${table==='companies'?', legal_name TEXT':''})`)};
 const active=new DatabaseSync(current);defineDb(active);active.exec("INSERT INTO companies(id,legal_name) VALUES(1,'Actual')");
 const original=new DatabaseSync(source);defineDb(original);original.exec("INSERT INTO companies(id,legal_name) VALUES(1,'Respaldo QA')");original.exec('INSERT INTO sales(id) VALUES(1)');original.close();
 const openClone=file=>{
  const database=new DatabaseSync(file,{readOnly:false});
  return {pragma:(q,opts={})=>{const row=database.prepare(`PRAGMA ${q}`).get();return opts.simple?Object.values(row||{})[0]:row},prepare:q=>database.prepare(q),exec:q=>database.exec(q),close:()=>database.close()};
 };
 const activeWrapper={prepare:q=>active.prepare(q)};
 const run=(file=filename)=>rehearseStoredBackup(backups,file,data,openClone,activeWrapper);
 let passed=0;
 const check=async(label,fn)=>{await fn();passed++;console.log('OK Ensayo 0.6.66:',label)};
 const noTemps=()=>assert.deepEqual(fs.readdirSync(data).filter(name=>name.startsWith('.facturacr-ensayo-')),[]);
 try{
  await check('El clon temporal abre, inicia transacción y cuenta datos',async()=>{
   const result=await run();assert.equal(result.ok,true);assert.equal(result.compatible,true);
   assert.equal(result.totals.companies,1);assert.equal(result.totals.sales,1);
   assert.deepEqual(result.companies,['Respaldo QA']);assert.equal(result.file,filename);
  });
  await check('No cambia nunca el respaldo de origen ni SQLite activo',async()=>{
   const sourceBefore=fs.readFileSync(source),dbBefore=fs.readFileSync(current);
   await run();assert.deepEqual(fs.readFileSync(source),sourceBefore);assert.deepEqual(fs.readFileSync(current),dbBefore);
   assert.equal(active.prepare('SELECT legal_name FROM companies WHERE id=1').get().legal_name,'Actual');
  });
  await check('El ensayo elimina todos sus archivos temporales al terminar',async()=>noTemps());
  await check('El nombre de archivo no puede salir de la carpeta',async()=>{
   await assert.rejects(run('../../facturacr.sqlite'),{code:'INVALID_BACKUP_NAME'});noTemps();
  });
  await check('Respaldo inexistente da error de acceso',async()=>{
   await assert.rejects(run('FacturaCR_auto_2025-01-01T00-00-00.sqlite'),{code:'BACKUP_NOT_ACCESSIBLE'});
  });
  await check('Una copia corrupta se rechaza y se limpia el temporal',async()=>{
   const f='FacturaCR_auto_2026-11-12T10-00-01.sqlite';fs.writeFileSync(path.join(backups,f),Buffer.alloc(4096,0x42));
   await assert.rejects(run(f),{code:'REHEARSAL_FAILED'});noTemps();
  });
  await check('No permite tablas principales ausentes',async()=>{
   const f='FacturaCR_auto_2026-11-12T10-00-02.sqlite',d=new DatabaseSync(path.join(backups,f));d.exec('CREATE TABLE companies(id INTEGER PRIMARY KEY,legal_name TEXT)');d.close();
   await assert.rejects(run(f),{code:'REHEARSAL_FAILED'});noTemps();
  });
  await check('No permite columnas desconocidas de versiones posteriores',async()=>{
   const f='FacturaCR_auto_2026-11-12T10-00-03.sqlite',d=new DatabaseSync(path.join(backups,f));defineDb(d);
   d.exec('ALTER TABLE companies ADD COLUMN solo_version_futura TEXT');d.close();
   await assert.rejects(run(f),{code:'REHEARSAL_FAILED'});noTemps();
  });
  await check('Un error de apertura de SQLite no deja temporales',async()=>{
   await assert.rejects(rehearseStoredBackup(backups,filename,data,()=>{throw Error('fallo de SQLite')},activeWrapper),{code:'REHEARSAL_FAILED'});
   noTemps();
  });
  await check('Se rechazan enlaces simbólicos en el historial',async()=>{
   const f='FacturaCR_auto_2026-11-12T10-00-04.sqlite';try{fs.symlinkSync(source,path.join(backups,f));await assert.rejects(run(f),{code:'BACKUP_NOT_ACCESSIBLE'})}
   catch(err){if(!['EPERM','EACCES'].includes(err.code))throw err}
  });
  await check('El historial conserva las copias válidas después del ensayo',async()=>{
   assert.ok(fs.statSync(source).size>512);assert.ok(fs.readdirSync(backups).includes(filename));noTemps();
  });
  console.log(`QA ensayo recuperación v0.6.66: ${passed}/${passed}`);
 }finally{active.close();fs.rmSync(root,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
