'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const frontend=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'server/auth.js'),'utf8');
const workspace=frontend.split('function BackupWorkspace(')[1].split('function App(')[0];
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('OK Interfaz 0.6.66:',name)};
check('Historial incluye ensayo voluntario y accesible por copia',()=>{assert.match(workspace,/Ensayar recuperación/);assert.match(workspace,/rehearseBackup\(f\)/);assert.match(workspace,/aria-label=\{`Ensayar recuperación de/)});
check('El ensayo invoca API POST protegida y no la restauración',()=>{assert.match(workspace,/api\/backups\/automatic\/rehearse/);assert.match(server,/rehearseStoredBackup\(activeBackupDir\(\),req\.body\?\.file,dataDir/);assert.doesNotMatch(workspace.split('const rehearseBackup=async')[1].split('const latest=')[0],/api\/backups\/restore/)});
check('No permite acciones paralelas mientras se ensaya',()=>{assert.match(workspace,/disabled=\{busy\|\|!!verifyingFile\|\|!!rehearsingFile\}/);assert.match(server,/let rehearsalBusy=false/)});
check('Resultados incluyen resumen y aclaración de límites',()=>{for(const term of ['totals.companies','totals.clients','totals.products','totals.sales','totals.quotations','Los datos activos no se modificaron','No sustituye una restauración completa'])assert.ok(workspace.includes(term),term)});
check('Resultados antiguos se limpian al cambiar de carpeta',()=>assert.match(workspace,/setVerificationResults\(\{\}\);setRehearsalResults\(\{\}\).*autoBackup\?\.files,autoBackup\?\.directory/s));
check('Nueva API queda bajo el control propietario existente',()=>{assert.ok(server.indexOf('registerAuth(app,')<server.indexOf("app.post('/api/backups/automatic/rehearse'"));assert.match(auth,/Operación reservada al propietario/)});
check('El diseño conserva estados y adaptación móvil',()=>{assert.match(css,/\.backupFileRow \.backupFileActions/);assert.match(css,/\.backupRehearsalSuccess/);assert.match(css,/@media\(max-width:460px\)/)});
check('El botón original de verificar integridad permanece',()=>{assert.match(workspace,/verifyBackup\(f\)/);assert.match(workspace,/Verificar integridad/)});
check('Ambos botones tienen etiquetas independientes del icono',()=>{
 assert.match(workspace,/backupVerifyButton[\s\S]{0,330}?>\s*<UiIcon name="shield" size=\{16\}\/>\s*<span className="backupActionLabel">/);
 assert.match(workspace,/backupRehearseButton[\s\S]{0,330}?>\s*<UiIcon name="backup" size=\{16\}\/>\s*<span className="backupActionLabel">/);
});
check('Ambas acciones ocupan columnas iguales en la fila',()=>{
 assert.match(css,/\.backupFileRow \.backupFileActions\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
 assert.match(css,/\.backupFileRow \.backupFileActions button\s*\{[^}]*width:100%[^}]*min-height:46px/s);
});
check('Iconos y textos quedan centrados y no se parten en dos líneas',()=>{
 assert.match(css,/\.backupFileRow \.backupFileActions button svg\s*\{[^}]*width:16px;height:16px/s);
 assert.match(css,/\.backupFileRow \.backupFileActions \.backupActionLabel\s*\{[^}]*white-space:nowrap/s);
});
check('El ancho del panel gobierna el cambio de fila y el apilamiento',()=>{
 assert.match(css,/container-name:backup-history-row;container-type:inline-size/);
 assert.match(css,/@container backup-history-row \(max-width:840px\)/);
 assert.match(css,/@container backup-history-row \(max-width:390px\)/);
});
check('Los controles conservan sus callbacks, bloqueo y nombres accesibles',()=>{
 assert.match(workspace,/onClick=\{\(\)=>verifyBackup\(f\)\} aria-label=/);
 assert.match(workspace,/onClick=\{\(\)=>rehearseBackup\(f\)\} aria-label=/);
 assert.equal((workspace.match(/disabled=\{busy\|\|!!verifyingFile\|\|!!rehearsingFile\}/g)||[]).length,2);
});
console.log(`QA interfaz recuperación v0.6.66: ${passed}/${passed}`);
