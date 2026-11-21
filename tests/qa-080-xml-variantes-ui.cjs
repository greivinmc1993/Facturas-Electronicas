'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const read=(f)=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const ui=read('src/FeSignatureReadiness.jsx');const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');const css=read('src/style.css');const lab=read('electron/fe-xades-xml-lab.cjs');
let n=0;function check(name,fn){fn();n++;console.log('OK UI 0.6.80:',name)}
check('Versión alineada con metadatos',()=>{
 const p=require('../package.json'),l=require('../package-lock.json');
 assert.equal(p.version,'0.6.90');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version);
 assert.match(ui,/v0\.6\.90/);
});
check('Se presenta botón independiente de prueba sintética',()=>{
 assert.match(ui,/Probar 3 variantes de XML/);assert.match(ui,/Tres estructuras XML ficticias|tres estructuras XML ficticias|tres estructuras XML sintéticas|tres estructuras XML/);
});
check('Se exige aprobación previa de certificado, política y XML sintético',()=>{
 assert.match(ui,/!xmlReport\?\.signatureValid/);
 assert.match(ui,/!policyReport\?\.matchesAnnexSample/);
 assert.match(ui,/!result\?\.keyPossession\?\.ok/);
 assert.match(ui,/!labReport\?\.keyProofVerified/);
});
check('Electron solo acepta llamada sin datos del renderer y verifica frame',()=>{
 assert.match(preload,/runXadesXmlVariants:\(\)=>ipcRenderer\.invoke\('facturacr:xades-xml-variants'\)/);
 assert.match(main,/ipcMain\.handle\('facturacr:xades-xml-variants',async event=>/);
 assert.match(main,/if\(!authorizedCertificateFrame\(event\)\)/);
});
check('El reporte no incluye XML, rutas, P12 ni clave privada',()=>{
 assert.match(lab,/usesRealCertificate:false/);assert.match(lab,/canIssue:false/);
 assert.match(lab,/for\(const variant of Object\.keys\(DEMO_VARIANTS\)\)/);
});
check('Se reinicia el estado al cambiar empresa y al seleccionar certificado',()=>{
 assert.match(ui,/setVariantsReport\(null\)/);assert.match(ui,/generation\.current/);
});
check('Aspecto responsivo',()=>{assert.match(css,/\.feSignatureVariantLab\{/);assert.match(css,/@media\(max-width:640px\)\{\.feSignatureVariantLab/)});
check('Firma y envío siguen bloqueados',()=>{assert.match(ui,/Firma y envío bloqueados/);assert.doesNotMatch(preload,/sendToHacienda|signRealFiscal/)});
console.log(`QA UI 0.6.80: ${n}/${n} aprobadas`);
