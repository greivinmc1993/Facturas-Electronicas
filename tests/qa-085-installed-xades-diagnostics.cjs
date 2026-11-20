/** Verificación offline de registros del XAdESjs dentro del NSIS (sin permisos fiscales). */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n');
const pkg=require('../package.json');
const verify=[];
const test=(label,fn)=>{fn();verify.push(label)};
test('Motor documenta etapa al fallar importaciones',()=>{
 const lab=read('electron/fe-xades-integrated-lab.mjs');
 assert.match(lab,/FACTURACR_XADES_DEPENDENCIES/);
 assert.match(lab,/load-specialized-libraries/);
 assert.match(lab,/FACTURACR_XADES_VARIANT/);
 assert.match(lab,/labStage=variant/);
});
test('Electron informa causa únicamente en QA',()=>{
 const main=read('electron/main.cjs');
 assert.match(main,/if\(qaSmoke\)\{[\s\S]*?qaDiagnostic:diagnostic/);
 assert.match(main,/console\.error\('QA XAdESjs instalado/);
 assert.match(main,/return \{success:false,error:message\};/);
});
test('No se desactiva prueba de firma en paquete',()=>{
 const main=read('electron/main.cjs');
 assert.match(main,/lab\.report\?\.verifiedCount!==3/);
 assert.match(main,/lab\.report\?\.mutationsRejected!==6/);
 assert.match(main,/lab\.report\?\.canIssue!==false/);
});
test('Dependencias ESM y archivos propios ubicados fuera de ASAR',()=>{
 const globs=pkg.build.asarUnpack;
 for(const needed of ['electron/fe-xades-*-lab.mjs','node_modules/xadesjs/**/*',
  'node_modules/xmldsigjs/**/*','node_modules/xml-core/**/*',
  'node_modules/@xmldom/xmldom/**/*','node_modules/xpath/**/*',
  'node_modules/better-sqlite3/**/*']) assert(globs.includes(needed),needed);
});
test('Prueba NSIS verifica identidad ASAR',()=>{
 const up=read('tests/qa-instalacion-actualizacion.cjs');
 assert.match(up,/integridad-asar-instalado/);
 assert.match(up,/assert\.equal\(installedHash,sourceHash/);
 assert.match(up,/await smoke\('primera-instalacion'\)/);
});
test('La evidencia no utiliza certificados personales',()=>{
 const p=read('electron/fe-xades-integrated-lab.mjs');
 assert.match(p,/usesRealCertificate:false/);
 assert.match(p,/canSignFiscalXml:false,canIssue:false,canSend:false/);
});
console.log(`QA v0.6.85 diagnóstico instalado ASAR, fallos y aislamiento: ${verify.length}/${verify.length}`);

(async()=>{
 const {pathToFileURL}=require('node:url');
 const mod=await import(pathToFileURL(path.join(root,'electron/fe-xades-integrated-lab.mjs')).href);
 await assert.rejects(
  mod.runIntegratedSyntheticSuite({loadLibraries:async()=>{throw Error('Fallo de importación simulado')}}),
  e=>e.code==='FACTURACR_XADES_DEPENDENCIES'&&e.labStage==='load-specialized-libraries'&&
   /Fallo de importación simulado/.test(e.message)
 );
 await assert.rejects(
  mod.runIntegratedSyntheticSuite({loadLibraries:async()=>({}),runTrial:async variant=>{throw Error('Fallo RSA simulado')}}),
  e=>e.code==='FACTURACR_XADES_VARIANT'&&e.labStage==='simple'&&
   /Fallo RSA simulado/.test(e.message)
 );
 console.log('QA propagación de fallos simulados por etapa: 2/2');
})().catch(error=>{console.error(error);process.exitCode=1});
