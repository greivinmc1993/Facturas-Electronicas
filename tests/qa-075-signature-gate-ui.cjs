'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('src/FeSignatureReadiness.jsx'),css=read('src/style.css'),manager=read('electron/fe-certificate-selection.cjs'),main=read('electron/main.cjs');
let count=0;function test(name,fn){fn();count++;console.log('OK v0.6.75 UI:',name)}
test('Muestra progreso y el estado bloqueado de firma y envío',()=>{assert.match(ui,/Preparación XAdES-EPES/);assert.match(ui,/Firma y envío bloqueados/);assert.match(ui,/result\.signatureReadiness\.checks\.map/)});
test('La nueva comprobación se ejecuta solo dentro de Electron',()=>{assert.match(manager,/await proof\(bytes,passphrase\)/);assert.match(manager,/inspector===inspectP12/);assert.doesNotMatch(ui,/await proveP12PrivateKey/)});
test('El proceso del navegador nunca recibe P12, clave privada o archivo',()=>{assert.doesNotMatch(read('electron/preload.cjs'),/getP12|exportPrivateKey|signXml/);assert.doesNotMatch(main,/ipcMain\.handle\('facturacr:sign/)});
test('La interfaz conserva Examinar, contraseña, Aceptar y bloqueo sin Vite ni Electron',()=>{assert.match(ui,/onClick=\{choose\}/);assert.match(ui,/onClick=\{accept\}/);assert.match(ui,/No se solicitan contraseñas desde el navegador web/)});
test('Hay estilos adaptables en pantalla pequeña',()=>{assert.match(css,/\.feSignatureProgress ul/);assert.match(css,/@media\(max-width:640px\)/)});
console.log(`QA v0.6.75 UI: ${count}/${count} aprobadas`);
