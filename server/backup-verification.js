// FacturaCR: comprobación de integridad de una copia histórica sin restaurarla.
// Nunca se acepta una ruta del cliente: solo un nombre de la carpeta activa.
import {join,dirname} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';

export const BACKUP_FILE_PATTERN=/^FacturaCR_auto_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/;

export function backupFileForVerification(directory,filename){
 if(typeof filename!=='string'||!BACKUP_FILE_PATTERN.test(filename))
  throw Object.assign(Error('Selecciona una copia de seguridad válida del historial.'),{code:'INVALID_BACKUP_NAME'});
 let base,fileInfo;
 try{
  base=realpathSync(directory);
  const full=join(base,filename);
  fileInfo=lstatSync(full);
  if(fileInfo.isSymbolicLink()||!fileInfo.isFile())throw Error('not a regular file');
  // No seguir enlaces que apunten fuera de la carpeta actual.
  if(dirname(realpathSync(full))!==base)throw Error('outside directory');
  if(fileInfo.size<512)throw Error('file too small');
  return {file:full,bytes:fileInfo.size,mtimeMs:fileInfo.mtimeMs};
 }catch{
  throw Object.assign(Error('La copia no existe, no es un archivo SQLite válido o la unidad no está disponible.'),{code:'BACKUP_NOT_ACCESSIBLE'});
 }
}

export function verifyStoredBackup(directory,filename,openDatabase){
 const entry=backupFileForVerification(directory,filename);
 let db;
 try{
  db=openDatabase(entry.file);
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('integrity check failed');
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  for(const name of ['companies','clients','products','inventory_movements']){
   if(!tables.has(name))throw Error('missing required table');
  }
  return {ok:true,file:filename,bytes:entry.bytes,modifiedAt:new Date(entry.mtimeMs).toISOString(),checkedAt:new Date().toISOString()};
 }catch{
  throw Object.assign(Error('La copia no superó la verificación de integridad SQLite o no contiene la estructura básica de FacturaCR.'),{code:'BACKUP_INTEGRITY_FAILED'});
 }finally{
  if(db)try{db.close()}catch{} // No exponer errores de cierre al navegador.
 }
}
