'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(base,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(base,'src/style.css'),'utf8');
const block=main.split('function App(')[1].split('const sizeLabel=')[0];
let count=0;
function check(title,fn){fn();count++;console.log('OK Pantalla monitor v0.6.68:',title)}
check('Monitor se monta únicamente con Respaldos abierto y cuenta propietaria',()=>{
 assert.match(block,/if\(tab!=='backups'\|\|!account\?\.isOwner\)return;/);
 assert.match(block,/monitor\.start\(\{immediate:true\}\)/);
});
check('Al salir de Respaldos detiene temporizador y cancela listener de visibilidad',()=>{
 assert.match(block,/return \(\)=>\{document\.removeEventListener\('visibilitychange',onVisible\);monitor\.stop\(\)/);
 assert.match(block,/\},\[tab,account\?\.isOwner\]\)/);
});
check('Evita consultas automáticas con ventana oculta o durante otra copia',()=>{
 assert.match(block,/isBusy:\(\)=>backupBusyRef\.current/);
 assert.match(block,/isVisible:\(\)=>document\.visibilityState!=='hidden'/);
});
check('Monitor consulta las APIs existentes con sesión y en solo lectura',()=>{
 assert.match(block,/api\('\/api\/backups\/automatic'\)/);
 assert.match(block,/api\('\/api\/backups\/status'\)/);
 assert.doesNotMatch(block.split('fetchSnapshot:async()=>{')[1].split('onSnapshot:')[0],/method:'PUT'|method:'POST'|restoreBackup|saveAutoBackup/);
});
check('Conserva el formulario con cambios pendientes y resultados ya verificados',()=>{
 assert.match(block,/setAutoBackup\(prev=>mergeBackupHealthSnapshot\(prev,backup\)\)/);
 assert.match(block,/if\(initialConfigurationPending\)\{setAutoConfig\(backup.config\);initialConfigurationPending=false;\}/);
 assert.doesNotMatch(block.split('onSnapshot:')[1].split('onFailure:')[0],/setAutoConfig\(backup.config\)\s*;(?!initialConfigurationPending)/);
});
check('Botón manual comparte solicitud de actualización con monitor',()=>{
 assert.match(block,/backupHealthMonitorRef\.current\.check\(\{manual:true\}\)/);
 assert.match(main,/onClick=\{refreshBackupHealth\}/);
});
check('Presenta intervalo y última fecha consultada, sin falsas confirmaciones',()=>{
 assert.match(main,/Actualización automática cada 60 segundos/);
 assert.match(main,/backupHealthCheckedAt\.toLocaleTimeString/);
 assert.match(main,/No se pudo completar la última consulta/);
});
check('Se mantiene el sistema visual y el formulario responsive existente',()=>{
 assert.match(css,/\.backupHealthPanel \.backupHealthMonitorInfo/);
 assert.match(css,/\.backupHealthPanel \.backupHealthMonitorWarning/);
 assert.match(main,/backupDestinationChoices/);
});
console.log(`QA interfaz monitor v0.6.68: ${count}/${count} aprobadas`);
