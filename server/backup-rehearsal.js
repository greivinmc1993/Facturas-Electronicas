// FacturaCR: ensayo de lectura de recuperación en un archivo temporal, nunca sobre SQLite activo.
// Solo el servidor elige la carpeta de trabajo. El cliente solo proporciona el nombre del historial.
import {join} from 'node:path';
import {mkdtempSync,statfsSync,statSync} from 'node:fs';
import {copyFile,rm} from 'node:fs/promises';
import {backupFileForVerification} from './backup-verification.js';

const CORE_TABLES=['companies','clients','products','inventory_movements'];
const REPORT_TABLES=['companies','clients','products','sales','quotations'];

export async function rehearseStoredBackup(directory,filename,workspaceDir,openDatabase,activeDb){
 // Reutiliza la protección de nombres, ruta real y rechazo de enlaces simbólicos.
 const source=backupFileForVerification(directory,filename);
 const space=statfsSync(workspaceDir);
 const available=Number(space.bavail)*Number(space.bsize);
 if(!Number.isFinite(available)||available<source.bytes+20*1024*1024){
  throw Object.assign(Error('No hay suficiente espacio libre para ensayar la recuperación en una copia temporal.'),{code:'REHEARSAL_NO_SPACE'});
 }
 let temporaryDirectory=null,isolated=null;
 try{
  temporaryDirectory=mkdtempSync(join(workspaceDir,'.facturacr-ensayo-'));
  const isolatedFile=join(temporaryDirectory,'ensayo.sqlite');
  await copyFile(source.file,isolatedFile);
  if(statSync(isolatedFile).size!==source.bytes)throw Error('La copia temporal está incompleta.');
  // Apertura en modo escritura EXCLUSIVAMENTE del clon: emula el acceso SQLite al restaurar.
  isolated=openDatabase(isolatedFile);
  if(isolated.pragma('integrity_check',{simple:true})!=='ok')throw Error('Fallo de integridad SQLite.');
  const tables=new Set(isolated.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  for(const name of CORE_TABLES){
   if(!tables.has(name))throw Error('Falta una tabla principal.');
   const columns=new Set(isolated.prepare(`PRAGMA table_info(${name})`).all().map(row=>row.name));
   const supported=new Set(activeDb.prepare(`PRAGMA table_info(${name})`).all().map(row=>row.name));
   if([...columns].some(col=>!supported.has(col)))throw Error('El respaldo requiere una versión más nueva de FacturaCR.');
  }
  // La conexión clonada debe poder activar WAL y abrir una transacción antes de recuperar.
  isolated.pragma('journal_mode = WAL');
  isolated.exec('BEGIN IMMEDIATE; ROLLBACK;');
  const totals={};
  for(const name of REPORT_TABLES){
   totals[name]=tables.has(name)?Number(isolated.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n):0;
  }
  const companies=isolated.prepare('SELECT legal_name FROM companies ORDER BY id LIMIT 6').all().map(row=>String(row.legal_name||'').slice(0,100));
  return {ok:true,compatible:true,file:filename,bytes:source.bytes,checkedAt:new Date().toISOString(),totals,companies};
 }catch(err){
  if(err?.code==='REHEARSAL_NO_SPACE')throw err;
  throw Object.assign(Error('No fue posible ensayar la recuperación. El respaldo puede estar dañado o ser incompatible con esta versión de FacturaCR.'),{code:'REHEARSAL_FAILED'});
 }finally{
  if(isolated)try{isolated.close()}catch{}
  if(temporaryDirectory){
   // En Windows un antivirus puede retener archivos; la eliminación reintenta sin tocar SQLite activo.
   try{await rm(temporaryDirectory,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
   catch(err){console.warn('Limpieza del ensayo de respaldo:',err.message)}
  }
 }
}
