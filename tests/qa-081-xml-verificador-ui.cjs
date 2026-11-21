'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const ui=read('src/FeSignatureReadiness.jsx');
const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');
const verifier=read('electron/fe-xades-demo-verifier.cjs');
let count=0;function test(description,fn){fn();count++;console.log('OK v0.6.81 interfaz:',description)}
test('Nueva versión en interfaz y archivos de proyecto',()=>{
 const p=require('../package.json'),l=require('../package-lock.json');
 assert.equal(p.version,'0.6.90');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version);
 assert.match(ui,/v0\.6\.90/);
});
test('Verificación del XML guardado tiene botón real y respuesta visible',()=>{
 assert.match(ui,/Verificar XML ficticio guardado/);
 assert.match(ui,/onClick=\{verifyExportedXml\}/);
 assert.match(ui,/xmlLocalVerification\?\.valid|xmlLocalVerification\.valid/);
});
test('Se indica claramente el alcance no fiscal en UI',()=>{
 assert.match(ui,/No acepta facturas de Hacienda ni XML ajenos al laboratorio/);
 assert.match(ui,/Firma y envío bloqueados/);
});
test('Preload no recibe rutas ni bytes arbitrarios',()=>{
 assert.match(preload,/verifyXadesXmlDemo:\(\)=>ipcRenderer\.invoke\('facturacr:verify-xades-xml-demo'\)/);
});
test('Electron protege IPC con el frame principal',()=>{
 assert.match(main,/ipcMain\.handle\('facturacr:verify-xades-xml-demo',async event=>\{/);
 assert.match(main,/if\(!authorizedCertificateFrame\(event\)\)/);
});
test('Solo Electron abre el selector nativo y retorna un resumen',()=>{
 assert.match(main,/showOpenDialog:opts=>dialog\.showOpenDialog\(mainWindow,opts\)/);
 assert.match(main,/openFile:\(filename,flags\)=>fs\.open\(filename,flags\)/);
 assert.match(verifier,/path\.basename\(filePath\)/);
 assert.match(verifier,/canSignFiscalXml:false,canIssue:false,canSend:false/);
});
test('Se rechazan archivos ajenos a las plantillas y referencias externas',()=>{
 assert.match(verifier,/signatureXml!==expected/);
 assert.match(verifier,/crypto\.verify\('RSA-SHA256'/);
 assert.match(verifier,/fsFlags\.O_NOFOLLOW/);
});
test('Al cambiar empresa se limpia el diagnóstico previo',()=>{
 assert.match(ui,/setXmlLocalVerification\(null\);setXmlLocalVerificationError\(''\)/);
 assert.match(ui,/generation\.current/);
});
test('La firma fiscal y el envío continúan deshabilitados',()=>{
 assert.doesNotMatch(preload,/signRealFiscal|sendToHacienda/);
 assert.match(verifier,/canIssue:false/);
});
console.log(`QA UI v0.6.81: ${count}/${count} aprobadas`);
