// Verificación estática: QA empaquetado debe respetar el inicio de sesión real.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8');
const runner=fs.readFileSync(path.join(root,'tests/qa-electron-empaquetado.cjs'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/windows-installer.yml'),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log('OK',name)}
check('El smoke espera la pantalla de propietario antes del menú',()=>{
 assert.match(main,/needsSetup\?'Configurar propietario':'Iniciar sesión'/);
 assert.match(main,/authHeading===expectedHeading/);
 assert.match(main,/initial\.navButtons!==0/);
});
check('El servidor exige propietario y cookie autenticada',()=>{
 assert.match(main,/beforeLogin\.status!==428/);
 assert.match(main,/beforeLogin\.status!==401/);
 assert.match(main,/beforeLogin\.status!==401/);
 assert.match(main,/status\.body\.authenticated!==true/);
});
check('Crea propietario temporal mediante API normal, no bypass de pruebas',()=>{
 assert.match(main,/randomBytes\(20\)/);
 assert.match(main,/FACTURACR_QA_OWNER_PASSWORD/);
 assert.match(main,/request\('POST','\/api\/auth\/setup',owner\)/);
 assert.match(main,/request\('POST','\/api\/auth\/login'/);
 assert.match(main,/qaDataDir/);
 assert.doesNotMatch(main,/skipAuth|disableAuth|authBypass/);
});
check('La navegación comercial aparece solo después del login',()=>{
 assert.match(main,/await mainWindow\.loadURL/);
 assert.match(main,/d\.navButtons>=4&&d\.hasCompanyNavigation/);
 assert.match(main,/commercialScreenAfterLogin:true/);
 assert.match(main,/existingOwnerLogin:!needsSetup/);
});
check('La prueba exige las cinco etapas y captura evidencia en fallos',()=>{
 assert.match(runner,/report\.security/);
 assert.match(main,/Captura de fallo/);
});
check('Windows Actions ejecuta QA empaquetado y guarda evidencia',()=>{
 assert.match(workflow,/run: npm run qa:packaged/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/release\/qa-evidence\/\*/);
});
check('La reinstalación conserva propietario y usa contraseña efímera sin archivo',()=>{
 const upgrade=fs.readFileSync(path.join(root,'tests/qa-instalacion-actualizacion.cjs'),'utf8');
 assert.match(upgrade,/FACTURACR_QA_OWNER_PASSWORD:qaOwnerPassword/);
 assert.match(upgrade,/stage==='reinstalacion'/);
 assert.match(upgrade,/SELECT COUNT\(\*\) n FROM access_users WHERE is_owner=1/);
 assert.doesNotMatch(main,/qa-owner-credentials\.json/);
});
console.log(`QA contrato empaquetado: ${checks}/${checks} aprobadas`);
