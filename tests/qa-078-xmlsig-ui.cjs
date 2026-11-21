'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const main=read('electron/main.cjs'),preload=read('electron/preload.cjs'),ui=read('src/FeSignatureReadiness.jsx'),css=read('src/style.css'),mod=read('electron/fe-xades-xml-lab.cjs');
let n=0;function check(name,fn){fn();n++;console.log('OK UI XMLDSig 0.6.78:',name)}
check('Nueva versión y metadatos 0.6.78',()=>{
 const p=require('../package.json'),l=require('../package-lock.json');
 assert.equal(p.version,'0.6.90');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version);
 assert.match(ui,/v0\.6\.90 · XAdESjs integrado en laboratorio/);
});
check('IPC expone únicamente operación sin argumentos',()=>{
 assert.match(preload,/runXadesXmlLab:\(\)=>ipcRenderer\.invoke\('facturacr:xades-xml-lab'\)/);
 assert.match(main,/ipcMain\.handle\('facturacr:xades-xml-lab',async event=>\{\s*if\(!authorizedCertificateFrame\(event\)\)/);
});
check('No admite ruta de certificado ni XML externo desde UI',()=>{
 assert.match(mod,/createXmlProof/);assert.doesNotMatch(mod,/readFileSync\(|readFile\(|https?\.request\(|fetch\(/);
 assert.match(mod,/SIMULACION_NO_FISCAL/);
});
check('El botón exige laboratorio previo, política y certificado comprobados',()=>{
 assert.match(ui,/labReport\?\.keyProofVerified&&policyReport\?\.matchesAnnexSample&&result\.keyPossession\?\.ok/);
 assert.match(ui,/!labReport\?\.keyProofVerified\|\|!policyReport\?\.matchesAnnexSample\|\|!result\?\.keyPossession\?\.ok/);
});
check('Estado se reinicia al cambiar de empresa o certificado',()=>{
 assert.match(ui,/setXmlReport\(null\);setXmlError\(''\);setXmlExport\(null\);setXmlExportError\(''\);setXmlChecking\(false\)/);
 assert.match(ui,/setXmlReport\(null\);setXmlError\(''\);setXmlExport\(null\);setXmlExportError\(''\);setSelecting\(true\)/);
});
check('Interfaz distingue XML sintético de comprobante fiscal',()=>{
 assert.match(ui,/XML de simulación fijo/);
 assert.match(ui,/no firma comprobantes fiscales/);
 assert.match(ui,/Firma y envío bloqueados/);
});
check('Botón no imprime ni envía a Hacienda',()=>{
 assert.doesNotMatch(mod,/ipcRenderer|axios|hacienda\.go\.cr\/recepcion|print-ticket/);
 assert.match(ui,/Ensayar firma XML ficticia/);
});
check('Estilos adaptables sin alterar controles anteriores',()=>{
 assert.match(css,/\.feSignatureXmlLab\{/);
 assert.match(css,/@media\(max-width:640px\)\{\.feSignatureXmlLab/);
});
console.log(`QA UI XMLDSig 0.6.78: ${n}/${n} aprobadas`);
