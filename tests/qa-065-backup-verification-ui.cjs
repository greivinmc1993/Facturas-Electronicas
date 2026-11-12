// Contrato del nuevo diagnóstico de copias almacenadas.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const jsx=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../src/style.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8');
const auth=fs.readFileSync(path.join(__dirname,'../server/auth.js'),'utf8');
let passed=0;
function check(label,fn){fn();passed++;console.log('OK Contrato 0.6.65:',label)}
const workspace=jsx.split('function BackupWorkspace(')[1].split('function App(')[0];
check('Historial incluye verificación voluntaria por archivo',()=>{assert.match(workspace,/Verificar integridad/);assert.match(workspace,/verifyBackup\(f\)/)});
check('Verificación usa POST y no restaura datos',()=>{assert.match(workspace,/api\/backups\/automatic\/verify/);assert.match(server,/verifyStoredBackup\(activeBackupDir\(\),req\.body\?\.file/)});
check('Solo el servidor abre el archivo, bajo autenticación global propietaria',()=>{assert.match(server,/new Database\(file,\{readonly:true,fileMustExist:true\}\)/);assert.match(auth,/Operación reservada al propietario/);assert.ok(server.indexOf('registerAuth(app,')<server.indexOf("app.post('/api/backups/automatic/verify'"))});
check('Errores y confirmaciones visibles y accesibles',()=>{assert.match(workspace,/backupVerifyFailure/);assert.match(workspace,/backupVerifySuccess/);assert.match(workspace,/role="status"/)});
check('El botón se desactiva durante la verificación',()=>assert.match(workspace,/disabled=\{busy\|\|!!verifyingFile\}/));
check('Resultados anteriores caducan al cambiar historial o carpeta',()=>assert.match(workspace,/setVerificationResults\(\{\}\).*autoBackup\?\.files,autoBackup\?\.directory/s));
check('El diseño se adapta a ventanas pequeñas',()=>{assert.match(css,/\.backupFileRow \.backupVerifyButton/);assert.match(css,/@media\(max-width:540px\)/)});
check('El historial evita declarar sin prueba que las copias siguen verificadas',()=>{assert.doesNotMatch(workspace,/Copia automática verificada/);assert.match(workspace,/estado actual sin comprobar/)});
console.log(`QA interfaz verificación 0.6.65: ${passed}/${passed}`);
