// QA real del ejecutable Electron empaquetado (Windows). No usa empresas ni datos del usuario.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const exe=path.join(root,'release','win-unpacked','FacturaCR.exe');
assert.ok(process.platform==='win32','Esta prueba necesita un ejecutable de Windows');
assert.ok(fs.existsSync(exe),'Primero debes ejecutar: npx electron-builder --win nsis --publish never');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-smoke-'));
const data=path.join(dir,'datos-aislados');
const result=path.join(dir,'resultado.json');
const screenshot=path.join(dir,'pantalla.png');
const evidence=path.join(root,'release','qa-evidence');
fs.mkdirSync(data,{recursive:true});
let child;
let timer;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  console.log('Iniciando Electron empaquetado con datos temporales.');
  child=spawn(exe,['--qa-smoke',`--qa-data-dir=${data}`,`--qa-result=${result}`,`--qa-screenshot=${screenshot}`],{
    cwd:root,windowsHide:false,stdio:'ignore'
  });
  const deadline=Date.now()+90000;
  let finished;
  const exitPromise=new Promise(resolve=>child.once('exit',(code,signal)=>{finished={code,signal};resolve(finished)}));
  while(Date.now()<deadline && !fs.existsSync(result) && !finished) await pause(500);
  if(!fs.existsSync(result))throw Error(`Electron no generó resultado QA en 90s. ${JSON.stringify(finished||{})}`);
  const report=JSON.parse(fs.readFileSync(result,'utf8'));
  assert.equal(report.success,true,JSON.stringify(report));
  assert.equal(report.health.ok,true);
  assert.ok(report.dom.visibleCharacters>100);
  assert.ok(report.dom.navButtons>=4);
  assert.ok(report.dom.preloadReports && report.dom.preloadPrinter && report.dom.preloadBackups);
  assert.deepEqual(report.security,{initialOwnerSetup:true,existingOwnerLogin:false,blockedBeforeSetup:true,blockedBeforeLogin:true,authenticatedOwner:true,commercialScreenAfterLogin:true});
  fs.mkdirSync(evidence,{recursive:true});
  fs.copyFileSync(result,path.join(evidence,'smoke-result.json'));
  if(fs.existsSync(screenshot))fs.copyFileSync(screenshot,path.join(evidence,'smoke-pantalla.png'));
  console.log('QA empaquetado OK: pantalla protegida, propietario de QA, login, menú, API y preload.');
  await Promise.race([exitPromise,pause(8000)]);
} 
main().catch(error=>{
  console.error('FALLÓ QA Electron empaquetado:',error.stack||error);
  process.exitCode=1;
  try{
    fs.mkdirSync(evidence,{recursive:true});
    if(fs.existsSync(result))fs.copyFileSync(result,path.join(evidence,'smoke-result.json'));
    if(fs.existsSync(screenshot))fs.copyFileSync(screenshot,path.join(evidence,'smoke-pantalla.png'));
  }catch(e){console.error('Error al guardar evidencia:',e.message)}
}).finally(()=>{
  if(child&&!child.killed){try{child.kill()}catch{}}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:12,retryDelay:250})}catch(e){console.error('Error limpieza temporal:',e.message)}
});
