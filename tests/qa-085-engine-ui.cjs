/** QA offline UI y permisos. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('src/FeSignatureReadiness.jsx','utf8');
const preload=fs.readFileSync('electron/preload.cjs','utf8');
const main=fs.readFileSync('electron/main.cjs','utf8');
const checks=[
 ()=>assert.match(ui,/v0\.6\.89 · XAdESjs integrado en laboratorio/),
 ()=>assert.match(ui,/Probar motor integrado XAdESjs/),
 ()=>assert.match(ui,/Ensayo integrado de XAdESjs \(solo demostración\)/),
 ()=>assert.match(ui,/runIntegratedXadesLab/),
 ()=>assert.match(ui,/verifiedCount!==3/),
 ()=>assert.match(ui,/mutationsRejected!==6/),
 ()=>assert.match(ui,/no utiliza el certificado \.p12/),
 ()=>assert.match(preload,/runIntegratedXadesLab:\(\)=>ipcRenderer\.invoke\('facturacr:xades-integrated-lab'\)/),
 ()=>assert.match(main,/let integratedXadesRunning=false/),
 ()=>assert.match(main,/authorizedCertificateFrame\(event\)/),
 ()=>assert.match(main,/await import\('\.\/fe-xades-integrated-lab\.mjs'\)/),
 ()=>assert.doesNotMatch(main,/handle\('facturacr:xades-integrated-lab',async\(event,/),
 ()=>assert.match(ui,/no autoriza emisión/),
];
checks.forEach(fn=>fn());console.log(`QA v0.6.85 interfaz y aislamiento: ${checks.length}/${checks.length} aprobadas`);
