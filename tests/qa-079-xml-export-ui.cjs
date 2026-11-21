'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const read=p=>readFileSync(path.join(__dirname,'..',p),'utf8').replace(/\r\n/g,'\n');
const ui=read('src/FeSignatureReadiness.jsx'),main=read('electron/main.cjs'),preload=read('electron/preload.cjs'),css=read('src/style.css');
let n=0;function check(title,fn){fn();n++;console.log('OK UI exportación 0.6.79:',title)}
check('Versión unificada 0.6.79',()=>{const p=require('../package.json'),l=require('../package-lock.json');assert.equal(p.version,'0.6.93');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version);assert.match(ui,/v0\.6\.93/)});
check('Control separado para guardar XML ficticio',()=>{assert.match(ui,/Guardar XML ficticio/);assert.match(ui,/Exportar XML de prueba para verificación independiente/)});
check('Se verifica firma y referencias antes de habilitar exportación',()=>{assert.match(ui,/!xmlReport\?\.signatureValid/);assert.match(ui,/!xmlReport\?\.documentReferenceVerified/);assert.match(ui,/!xmlReport\?\.signedPropertiesReferenceVerified/)});
check('El IPC no recibe rutas ni bytes del renderer',()=>{assert.match(preload,/saveXadesXmlDemo:\(\)=>ipcRenderer\.invoke\('facturacr:save-xades-xml-demo'\)/);assert.match(main,/facturacr:save-xades-xml-demo/);assert.match(main,/authorizedCertificateFrame\(event\)/)});
check('Se guarda mediante diálogo nativo con escritura exclusiva',()=>{const mod=read('electron/fe-xades-demo-export.cjs');assert.match(mod,/showSaveDialog/);assert.match(mod,/flag:'wx'/);assert.match(mod,/path\.basename\(filePath\)/)});
check('No se comunica la ruta física del XML guardado',()=>{const mod=read('electron/fe-xades-demo-export.cjs');assert.doesNotMatch(mod,/return \{success:true,.*path:filePath/);assert.match(mod,/sha256:/)});
check('El formulario reinicia el informe al cambiar empresa o certificado',()=>{assert.match(ui,/setXmlExport\(null\)/);assert.match(ui,/generation\.current/)});
check('Mensaje explícito de XML no fiscal en la interfaz',()=>{assert.match(ui,/No contiene tu clave \.p12 ni es una factura electrónica/);assert.match(ui,/Firma y envío bloqueados/)});
check('Estilos responsivos de exportación',()=>{assert.match(css,/\.feSignatureExportDemo\{/);assert.match(css,/@media\(max-width:640px\)\{\.feSignatureExportDemo/)});
console.log(`QA UI exportación 0.6.79: ${n}/${n} aprobadas`);
