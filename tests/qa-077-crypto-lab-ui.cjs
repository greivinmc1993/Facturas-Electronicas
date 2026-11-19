'use strict';
const {readFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const main=read('electron/main.cjs'),preload=read('electron/preload.cjs'),ui=read('src/FeSignatureReadiness.jsx'),css=read('src/style.css'),mod=read('electron/fe-xades-crypto-lab.cjs');
let count=0;function check(title,fn){fn();count++;console.log('OK v0.6.77 UI:',title)}
check('La versión del panel coincide con 0.6.78',()=>assert(ui.includes('v0.6.78 · Prototipo XMLDSig/XAdES-EPES de laboratorio')));
check('El bridge del laboratorio solo ofrece una operación sin argumentos',()=>assert.match(preload,/runXadesCryptoLab:\(\)=>ipcRenderer\.invoke\('facturacr:xades-crypto-lab'\)/));
check('IPC exige ventana y frame principal autorizados',()=>assert.match(main,/ipcMain\.handle\('facturacr:xades-crypto-lab',async event=>\{\s*if\(!authorizedCertificateFrame\(event\)\)/));
check('No solicita claves ni XML externos para la prueba',()=>{
 assert.match(mod,/const LAB_XML=/);assert.match(mod,/generateKeyPairAsync\('rsa'/);
 assert.doesNotMatch(mod,/readFileSync|readFile\(|fetch\(|https?\.request\(/);
});
check('El laboratorio requiere política comprobada y prueba de clave',()=>assert.match(ui,/!policyReport\?\.matchesAnnexSample\|\|!result\?\.keyPossession\?\.ok/));
check('Borra el diagnóstico al cambiar de empresa o certificado',()=>{
 assert.match(ui,/setLabReport\(null\);setLabError\(''\);setLabChecking\(false\)/);
 assert.match(ui,/setPolicyReport\(null\);setPolicyError\(''\);setLabReport\(null\)/);
});
check('Interfaz identifica XML ficticio y emisión bloqueada',()=>{
 assert.match(ui,/clave ficticia y XML de simulación/);
 assert.match(ui,/No crea una factura firmada ni una firma XAdES-EPES/);
 assert.match(ui,/Emisión bloqueada/);
});
check('Botón y tarjetas usan estilos responsivos',()=>{
 assert.match(css,/\.feSignatureCryptoLabHeader/);
 assert.match(css,/@media\(max-width:640px\)\{\.feSignatureCryptoLabHeader button\{width:100%/);
});
console.log(`QA UI laboratorio v0.6.77: ${count}/${count} aprobadas`);
