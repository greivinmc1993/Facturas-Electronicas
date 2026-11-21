// v0.6.88: regresión de la estructura de Seguridad y controles compactos.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const main=read('src/main.jsx');
const css=read('src/style.css');
const secrets=read('src/RecoverySecretsPanel.jsx');
const password=read('src/PasswordInput.jsx');
let total=0;
function check(message, fn) { fn();total++;console.log('OK',message); }
check('El panel se inyecta dentro de main y no antes de layout',()=>{
 assert.match(main,/function App\(\{account,securityPanel,recoveryCodeCard,recoveryMessageCard\}\)/);
 assert.match(main,/<main>\{recoveryCodeCard\}\{recoveryMessageCard\}\{securityPanel\}/);
 assert.doesNotMatch(main,/\{hasSession&&recoveryCodeCard\}\s*\{hasSession&&recoveryMessage/);
});
check('Los secretos permanecen disponibles en el acceso sin sesión',()=>{
 assert.match(main,/\(!hasSession\|\|sessionUser\?\.passwordChangeRequired\)&&recoveryCodeCard/);
});
check('La entrega se enfoca automáticamente al generar códigos',()=>{
 assert.match(main,/if\(!recoverySecrets\|\|locked\)return/);
 assert.match(main,/document\.querySelector\('\.secureRoot \.recoverySecretsPanel'\)\?\.scrollIntoView/);
});
check('Los secretos no aparecen en la aplicación bloqueada',()=>{
 assert.match(main,/recoveryCodeCard=\{!locked\?recoveryCodeCard:null\}/);
});
check('El panel cabe en su contenedor sin forzar el lateral',()=>{
 assert.match(css,/\.secureRoot \.layout>main>\.recoverySecretsPanel\{/);
 assert.match(css,/width:min\(100%,960px\);max-width:100%;min-width:0/);
});
check('Las filas de códigos usan una retícula con botón uniforme',()=>{
 assert.match(css,/\.recoverySecretsPanel \.recoverySecretRow\{[^}]*grid-template-columns:minmax\(0,1fr\) 126px/s);
 assert.match(css,/\.recoverySecretsPanel \.recoverySecretRow button\.recoverySecretButton\{[^}]*width:126px;min-width:126px;max-width:126px/s);
 assert.ok(secrets.includes('className="secondary recoverySecretButton" onClick={()=>navigator.clipboard?.writeText(code)')); 
 assert.ok(secrets.includes('className="secondary recoverySecretButton" onClick={()=>navigator.clipboard?.writeText(kit.key)')); 
});
check('El kit conserva descarga independiente y el PDF de códigos',()=>{
 assert.match(secrets,/className="secondary recoveryKitDownload" onClick=\{download\}/);
 assert.match(secrets,/Guardar mis 3 códigos en PDF/);
});
check('El hover no altera posición de Mostrar ni Copiar',()=>{
 assert.match(css,/\.secureRoot \.passwordInputControl>button\.passwordInputToggle\{/);
 assert.match(css,/transform:none!important/);
 assert.match(css,/\.secureRoot \.recoverySecretsPanel button:not\(:disabled\):is\(:hover,:active\)/);
 assert.match(password,/aria-pressed=\{visible\}/);
});
check('Solo los botones submit de Seguridad reciben mínimos grandes',()=>{
 assert.match(css,/\.ownerRecoveryTools form > button\[type="submit"\]/);
 assert.doesNotMatch(css,/\.ownerRecoveryTools form button\{min-height:44px/);
});
check('CSS móvil apila filas y conserva ancho de acciones',()=>{
 assert.match(css,/@media\(max-width:680px\)\{[\s\S]*?\.recoverySecretsPanel \.recoverySecretRow\{grid-template-columns:minmax\(0,1fr\)/);
});
check('Sin cambios fiscales ni contraseñas en el control visual',()=>{
 assert.doesNotMatch(secrets,/localStorage|sessionStorage/);
 assert.match(secrets,/onDone/);
});
console.log(`QA v0.6.88 estilos de recuperación: ${total}/${total}`);
