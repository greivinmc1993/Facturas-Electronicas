'use strict';
// Destinos de respaldos en filesystem temporal real, sin tocar datos del usuario.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {backupDirectoryFor,checkCustomBackupDirectory}=await import(pathToFileURL(path.join(__dirname,'../server/backup-directory.js')).href);
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa064-folder-'));
 const data=path.join(base,'datos');const selected=path.join(base,'resguardos');const missing=path.join(base,'ausente');
 fs.mkdirSync(data);fs.mkdirSync(selected);
 let passed=0;
 const check=(label,fn)=>{fn();passed++;console.log('OK Destino 0.6.64:',label)};
 try{
  check('El destino predeterminado continúa en automatic-backups',()=>assert.equal(backupDirectoryFor(data,{directoryMode:'default'}),path.join(data,'automatic-backups')));
  check('El destino personalizado es el seleccionado, no un subdirectorio oculto',()=>assert.equal(backupDirectoryFor(data,{directoryMode:'custom',customDirectory:selected}),selected));
  check('Directorio diferente y escribible es aceptado',()=>assert.equal(checkCustomBackupDirectory(selected,data),selected));
  check('No queda archivo de comprobación',()=>assert.deepEqual(fs.readdirSync(selected),[]));
  check('Ruta relativa no se acepta',()=>assert.throws(()=>checkCustomBackupDirectory('Copias\nmalas',data),/carpeta local absoluta/));
  check('Ruta vacía no se acepta',()=>assert.throws(()=>checkCustomBackupDirectory('',data),/carpeta local absoluta/));
  check('Unidad o carpeta que no existe se rechaza',()=>assert.throws(()=>checkCustomBackupDirectory(missing,data),/no existe/));
  check('Directorio activo de SQLite no se puede utilizar',()=>assert.throws(()=>checkCustomBackupDirectory(data,data),/diferente/));
  check('Subdirectorio de la base activa no se puede utilizar',()=>{const sub=path.join(data,'sub');fs.mkdirSync(sub);assert.throws(()=>checkCustomBackupDirectory(sub,data),/diferente/)});
  check('Directorio padre de la base activa no se puede utilizar',()=>assert.throws(()=>checkCustomBackupDirectory(base,data),/diferente/));
  check('No se puede guardar el respaldo en un archivo',()=>{const file=path.join(base,'archivo');fs.writeFileSync(file,'ok');assert.throws(()=>checkCustomBackupDirectory(file,data),/no corresponde/)});
  check('Archivos existentes en la carpeta no se modifican',()=>{const file=path.join(selected,'respaldo-viejo.sqlite');fs.writeFileSync(file,'histórico');checkCustomBackupDirectory(selected,data);assert.equal(fs.readFileSync(file,'utf8'),'histórico')});
  check('Enlace simbólico hacia SQLite se rechaza',()=>{const link=path.join(base,'enlace-a-datos');try{fs.symlinkSync(data,link,'dir');assert.throws(()=>checkCustomBackupDirectory(link,data),/diferente/)}catch(e){if(e.code!=='EPERM'&&e.code!=='EACCES')throw e}});
  const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
  const desktop=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
  check('Electron abre un selector de carpetas real',()=>{assert.match(desktop,/dialog\.showOpenDialog/);assert.match(desktop,/openDirectory/);assert.match(preload,/facturacr:choose-backups-folder/)});
  check('Electron abre la carpeta realmente guardada, no la fija',()=>assert.match(desktop,/server\?\.getBackupDirectory/));
  console.log(`QA rutas de respaldo 0.6.64: ${passed}/${passed} aprobadas`);
 }finally{fs.rmSync(base,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
