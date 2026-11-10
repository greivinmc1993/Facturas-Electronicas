// QA Windows: instalación NSIS, reinstalación y desinstalación en rutas TEMP AISLADAS.
// No prueba ni elimina una instalación existente de FacturaCR, ni usa datos personales.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const release=path.join(root,'release');
const evidence=path.join(release,'qa-evidence');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'){
 console.error('Por seguridad, este ensayo de instalación está permitido solamente en runners efímeros de GitHub Actions para Windows.');
 process.exit(1);
}
const installers=fs.readdirSync(release).filter(f=>/\.exe$/i.test(f) && /Setup|Instalador|FacturaCR/i.test(f));
assert.equal(installers.length,1,'Se esperaba exactamente un instalador NSIS en release/: '+installers.join(', '));
const installer=path.join(release,installers[0]);
const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa-upgrade-'));
const installDir=path.join(tempRoot,'aplicacion');
const userData=path.join(tempRoot,'datos-sqlite');
const marker='QA_INSTALL_UPGRADE_'+process.pid+'_'+Date.now();
// Se mantiene solo en memoria del runner temporal para autenticar ambas aperturas.
const qaOwnerPassword='QaSeguro1234'+randomBytes(20).toString('hex');
const dbFile=path.join(userData,'facturacr.sqlite');
const report={version:require('../package.json').version,installer:installers[0],checks:[],passed:false};
fs.mkdirSync(userData,{recursive:true});
fs.mkdirSync(evidence,{recursive:true});
const exe=path.join(installDir,'FacturaCR.exe');
const uninstaller=path.join(installDir,'Uninstall FacturaCR.exe');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(executable,args,timeoutMs=180000){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,cwd:root,stdio:'ignore'});
  let finished=false;
  const timeout=setTimeout(()=>{if(!finished){child.kill();reject(Error(`Tiempo excedido: ${path.basename(executable)}`))}},timeoutMs);
  child.once('error',err=>{if(!finished){finished=true;clearTimeout(timeout);reject(err)}});
  child.once('exit',(code,signal)=>{if(!finished){finished=true;clearTimeout(timeout);code===0?resolve():reject(Error(`Falló ${path.basename(executable)}: salida=${code}, señal=${signal}`))}});
 });
}
async function smoke(stage){
 const json=path.join(tempRoot,stage+'.json');
 const png=path.join(tempRoot,stage+'.png');
 const child=spawn(exe,['--qa-smoke',`--qa-data-dir=${userData}`,`--qa-result=${json}`,`--qa-screenshot=${png}`],{
   windowsHide:false,cwd:root,stdio:'ignore',env:{...process.env,FACTURACR_QA_OWNER_PASSWORD:qaOwnerPassword}
 });
 let exited=false;
 child.once('exit',()=>{exited=true});
 const deadline=Date.now()+90000;
 try{
  while(Date.now()<deadline&&!fs.existsSync(json)&&!exited)await pause(400);
  assert.ok(fs.existsSync(json),`No se generó el informe de arranque: ${stage}`);
  const data=JSON.parse(fs.readFileSync(json,'utf8'));
  assert.equal(data.success,true,JSON.stringify(data));
  assert.equal(data.health?.ok,true);
  assert.equal(data.health?.version,report.version);
  assert.ok(data.dom?.navButtons>=4,'No se encontró menú React');
  assert.equal(data.security?.initialOwnerSetup,stage==='primera-instalacion',
    'Solo la primera instalación debe configurar propietario');
  assert.equal(data.security?.existingOwnerLogin,stage==='reinstalacion',
    'La reinstalación debe entrar por el login sin recrear al propietario');
  assert.equal(data.security?.authenticatedOwner,true);
  assert.equal(data.security?.commercialScreenAfterLogin,true);
  report.checks.push({step:'arranque-'+stage,ok:true});
 }finally{
  // Conservar evidencia incluso cuando falla una aserción de la interfaz.
  try{
   if(fs.existsSync(json))fs.copyFileSync(json,path.join(evidence,'upgrade-'+stage+'.json'));
   if(fs.existsSync(png))fs.copyFileSync(png,path.join(evidence,'upgrade-'+stage+'.png'));
  }catch(e){console.error('No se pudo guardar la evidencia del arranque:',e.message)}
  // Electron escribe su resultado antes de salir; darle tiempo para cerrar SQLite.
  const closeDeadline=Date.now()+10000;
  while(!exited&&Date.now()<closeDeadline)await pause(200);
  if(!exited)child.kill();
 }
}
async function main(){
 console.log('QA instalación y actualización NSIS, perfil SQLite completamente temporal.');
 // NSIS admite /S silencioso y /D=directorio como ÚLTIMO parámetro.
 await run(installer,['/S',`/D=${installDir}`]);
 assert.ok(fs.existsSync(exe),'No apareció FacturaCR.exe dentro de la instalación temporal');
 report.checks.push({step:'instalacion-silenciosa',ok:true});
 await smoke('primera-instalacion');
 assert.ok(fs.existsSync(dbFile),'No apareció la base SQLite temporal');
 const Database=require('better-sqlite3');
 let db=new Database(dbFile);
 try{
  db.prepare('INSERT INTO companies (legal_name,identification,trade_name) VALUES (?,?,?)').run('Empresa prueba actualización',marker,'Cliente QA');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM companies WHERE identification=?').get(marker).n,1);
 }finally{db.close()}
 report.checks.push({step:'registro-sqlite-persistente',ok:true});
 // Simula reinstalar una versión del mismo paquete sobre una instalación ya existente.
 // NO equivale a validar una migración entre dos versiones distintas.
 await run(installer,['/S',`/D=${installDir}`]);
 assert.ok(fs.existsSync(exe),'No apareció el ejecutable tras reinstalar');
 await smoke('reinstalacion');
 db=new Database(dbFile,{readonly:true,fileMustExist:true});
 try{
  assert.equal(db.prepare('SELECT COUNT(*) n FROM companies WHERE identification=?').get(marker).n,1,'La reinstalación eliminó el registro');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_users WHERE is_owner=1').get().n,1,
    'La reinstalación duplicó o eliminó al propietario');
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok','La base SQLite quedó dañada');
 }finally{db.close()}
 report.checks.push({step:'reinstalacion-conserva-empresa-y-db-integra',ok:true});
 assert.ok(fs.existsSync(uninstaller),'Falta el desinstalador NSIS: '+uninstaller);
 await run(uninstaller,['/S']);
 // El desinstalador nunca debería borrar el directorio userData en este escenario.
 db=new Database(dbFile,{readonly:true,fileMustExist:true});
 try{assert.equal(db.prepare('SELECT COUNT(*) n FROM companies WHERE identification=?').get(marker).n,1)}
 finally{db.close()}
 report.checks.push({step:'desinstalacion-conserva-datos',ok:true});
 report.passed=true;
 console.log('QA NSIS correcto: instalación, apertura, datos SQLite, reinstalación y desinstalación.');
}
main().catch(err=>{report.error=String(err.stack||err);console.error('FALLÓ QA de actualización:',report.error);process.exitCode=1})
.finally(()=>{
 try{fs.writeFileSync(path.join(evidence,'upgrade-install-report.json'),JSON.stringify(report,null,2))}catch(e){console.error('No se pudo guardar evidencia',e.message)}
 // Solo eliminar el directorio nuevo que la prueba creó en TEMP.
 try{fs.rmSync(tempRoot,{recursive:true,force:true,maxRetries:10,retryDelay:250})}catch(e){console.error('No se pudo borrar el entorno temporal:',e.message)}
});
