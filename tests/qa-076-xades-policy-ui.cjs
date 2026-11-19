'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),get=filename=>fs.readFileSync(path.join(root,filename),'utf8');
const ui=get('src/FeSignatureReadiness.jsx'),style=get('src/style.css'),preload=get('electron/preload.cjs'),main=get('electron/main.cjs');
let count=0;
function check(name,fn){fn();count++;console.log('OK v0.6.76 interfaz:',name)}
check('Nuevo botón local de cotejo con resultado y advertencia',()=>{
 assert.match(ui,/Política oficial XAdES-EPES/);
 assert.match(ui,/Examinar PDF y comparar huella/);
 assert.match(ui,/policyReport\.matchesAnnexSample/);
 assert.match(ui,/no una validación de vigencia ni una firma/);
});
check('El usuario no proporciona rutas al IPC y se usa diálogo nativo',()=>{
 assert.match(preload,/inspectXadesPolicy:\(\)=>ipcRenderer\.invoke\('facturacr:inspect-xades-policy'\)/);
 assert.match(main,/dialog\.showOpenDialog\(mainWindow/);
 assert.match(main,/authorizedCertificateFrame\(event\)/);
 assert.doesNotMatch(preload,/inspectXadesPolicy:\(path/);
});
check('Sigue bloqueado el envío y no hay función de firma real',()=>{
 assert.match(ui,/Firma y envío bloqueados/);
 assert.doesNotMatch(preload,/signXml|sendSignedInvoice|exportPrivateKey/);
 assert.doesNotMatch(main,/ipcMain\.handle\('facturacr:sign/);
});
check('La vista sigue utilizando dos campos y aceptar separado',()=>{
 assert.match(ui,/1\. Certificado digital/);
 assert.match(ui,/2\. Contraseña del certificado/);
 assert.match(ui,/Aceptar y verificar certificado/);
});
check('El botón es adaptable y muestra estados y errores',()=>{
 assert.match(style,/\.feSignaturePolicyHeading/);
 assert.match(style,/@media\(max-width:640px\)/);
 assert.match(ui,/policyChecking/);
 assert.match(ui,/policyError/);
});
check('Cambiar de empresa o certificado limpia datos de política',()=>{
 assert.match(ui,/setPolicyReport\(null\);setPolicyError\(''\);setPolicyChecking\(false\)/);
 assert.match(ui,/setPolicyReport\(null\);setPolicyError\(''\);setSelecting\(true\)/);
});
check('La huella no se promueve a lista de firma verificada',()=>{
 const gate=get('electron/fe-signature-gate.cjs');
 assert.match(gate,/key:'policy'.*ok:false/);
 assert.match(gate,/canSign:false,canIssue:false/);
});
console.log(`QA v0.6.76 interfaz: ${count}/${count} aprobadas`);
