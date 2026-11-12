// Verificación de respaldos con SQLite temporal real (Node 22) sin tocar datos comerciales.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {backupFileForVerification,verifyStoredBackup}=await import(pathToFileURL(path.join(__dirname,'../server/backup-verification.js')).href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa065-'));
 const directory=path.join(root,'copies');fs.mkdirSync(directory);
 const filename='FacturaCR_auto_2026-11-11T13-00-00.sqlite';
 const file=path.join(directory,filename);
 let passed=0;
 const check=(label,fn)=>{fn();passed++;console.log('OK Verificación:',label)};
 const openDatabase=file=>{
  const db=new DatabaseSync(file,{readOnly:true});
  return {pragma:(name)=>Object.values(db.prepare(`PRAGMA ${name}`).get())[0],prepare:sql=>db.prepare(sql),close:()=>db.close()};
 };
 try{
  const db=new DatabaseSync(file);
  for(const name of ['companies','clients','products','inventory_movements'])db.exec(`CREATE TABLE ${name}(id INTEGER PRIMARY KEY)`);
  db.exec('INSERT INTO companies(id) VALUES(1)');db.close();
  check('La copia válida se lee sin cambiar su contenido',()=>{
   const before=fs.readFileSync(file);
   const result=verifyStoredBackup(directory,filename,openDatabase);
   assert.equal(result.ok,true);assert.equal(result.file,filename);assert.ok(result.bytes>=512);assert.ok(result.checkedAt);
   assert.deepEqual(fs.readFileSync(file),before);
  });
  check('Se devuelven tamaño y fecha de la copia',()=>{const result=verifyStoredBackup(directory,filename,openDatabase);assert.ok(result.bytes>=1024);assert.ok(!Number.isNaN(new Date(result.modifiedAt).getTime()))});
  check('No acepta rutas relativas o traversal',()=>{for(const name of ['../'+filename,'../../facturacr.sqlite','C:\\secret.sqlite','/etc/passwd',''])assert.throws(()=>backupFileForVerification(directory,name),{code:'INVALID_BACKUP_NAME'})});
  check('Rechaza archivos ajenos al formato de respaldo',()=>assert.throws(()=>backupFileForVerification(directory,'otra-base.sqlite'),{code:'INVALID_BACKUP_NAME'}));
  check('Rechaza copias ausentes',()=>assert.throws(()=>backupFileForVerification(directory,'FacturaCR_auto_2020-01-01T00-00-00.sqlite'),{code:'BACKUP_NOT_ACCESSIBLE'}));
  check('Rechaza carpeta de respaldo inaccesible',()=>assert.throws(()=>backupFileForVerification(path.join(root,'missing'),filename),{code:'BACKUP_NOT_ACCESSIBLE'}));
  check('No acepta una carpeta con nombre de archivo válido',()=>{const f=path.join(directory,'FacturaCR_auto_2026-11-11T13-00-01.sqlite');fs.mkdirSync(f);assert.throws(()=>backupFileForVerification(directory,path.basename(f)),{code:'BACKUP_NOT_ACCESSIBLE'})});
  check('Detecta base de datos corrupta',()=>{const name='FacturaCR_auto_2026-11-11T13-00-02.sqlite';fs.writeFileSync(path.join(directory,name),Buffer.alloc(1024,7));assert.throws(()=>verifyStoredBackup(directory,name,openDatabase),{code:'BACKUP_INTEGRITY_FAILED'})});
  check('Rechaza respaldo sin las tablas de FacturaCR',()=>{const name='FacturaCR_auto_2026-11-11T13-00-03.sqlite',p=path.join(directory,name);const minimal=new DatabaseSync(p);minimal.exec('CREATE TABLE otra(id INTEGER)');minimal.close();assert.throws(()=>verifyStoredBackup(directory,name,openDatabase),{code:'BACKUP_INTEGRITY_FAILED'})});
  check('No deja conexiones SQLite abiertas después de error',()=>{const name='FacturaCR_auto_2026-11-11T13-00-04.sqlite',p=path.join(directory,name);fs.copyFileSync(file,p);let closed=false;assert.throws(()=>verifyStoredBackup(directory,name,()=>({pragma:()=>{throw Error('fallo')},close:()=>{closed=true}})),{code:'BACKUP_INTEGRITY_FAILED'});assert.equal(closed,true)});
  check('No sigue enlace simbólico hacia archivos arbitrarios',()=>{const alias=path.join(directory,'FacturaCR_auto_2026-11-11T13-00-05.sqlite');try{fs.symlinkSync(file,alias);assert.throws(()=>backupFileForVerification(directory,path.basename(alias)),{code:'BACKUP_NOT_ACCESSIBLE'})}catch(err){if(!['EPERM','EACCES'].includes(err.code))throw err}});
  check('Rechaza archivo menor a 512 bytes',()=>{const name='FacturaCR_auto_2026-11-11T13-00-06.sqlite';fs.writeFileSync(path.join(directory,name),'corrupto');assert.throws(()=>backupFileForVerification(directory,name),{code:'BACKUP_NOT_ACCESSIBLE'})});
  console.log(`QA verificación respaldos 0.6.65: ${passed}/${passed}`);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
