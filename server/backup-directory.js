// Destino de respaldos: ruta local, validada y separada del directorio SQLite.
// El usuario escoge la carpeta mediante el cuadro nativo de Electron.
import {isAbsolute,join,relative,resolve} from 'node:path';
import {statSync,realpathSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

export function backupDirectoryFor(dataDir,config){
 return config?.directoryMode==='custom' ? config.customDirectory : join(dataDir,'automatic-backups');
}
function inside(parent,child){
 const rel=relative(parent,child);
 return !rel || (rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&!isAbsolute(rel));
}
export function checkCustomBackupDirectory(directory,dataDir,{probeWrite=true}={}){
 if(typeof directory!=='string'||!directory.trim()||directory!==directory.trim()||directory.length>1024||/[\x00-\x1f\x7f]/.test(directory)||!isAbsolute(directory))
  throw Error('Selecciona una carpeta local absoluta mediante el explorador de Windows.');
 const candidate=resolve(directory);
 let actual;
 try{
  if(!statSync(candidate).isDirectory())throw Error('La ruta no corresponde a una carpeta.');
  actual=realpathSync(candidate);
 }catch(err){
  if(/La ruta no corresponde/.test(err.message))throw err;
  throw Error('La carpeta seleccionada no existe o no está disponible. Selecciona una carpeta accesible.');
 }
 let dataActual;
 try{dataActual=realpathSync(dataDir)}catch{dataActual=resolve(dataDir)}
 // No permitir almacenar backups junto con la base viva, ni dentro/encima de la carpeta de datos.
 if(inside(dataActual,actual)||inside(actual,dataActual))
  throw Error('Elige una carpeta diferente de la que contiene la base de datos de FacturaCR.');
 if(probeWrite){
  const marker=join(actual,'.facturacr-verificacion-'+randomUUID());
  let handle;
  try{handle=openSync(marker,'wx',0o600)}
  catch{throw Error('No se puede escribir en la carpeta seleccionada. Verifica los permisos o la unidad externa.');}
  finally{if(handle!==undefined){closeSync(handle);unlinkSync(marker)}}
 }
 return candidate;
}
