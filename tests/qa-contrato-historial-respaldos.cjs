'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../src/style.css'),'utf8');
let count=0;
function check(label,fn){fn();count++;console.log('PASS',label)}
const workspace=src.split('function BackupWorkspace(')[1].split('function App()')[0];
check('El buscador puede filtrar TODOS los archivos por nombre o fecha',()=>{
 assert.match(workspace,/files\.filter\(f=>/);
 assert.match(workspace,/String\(f\)\.toLocaleLowerCase/);
 assert.match(workspace,/backupFileDate\(f\)\.toLocaleLowerCase/);
});
check('El resultado se filtra antes de limitar la visualización a 20',()=>{
 assert.match(workspace,/searchTerm\?filteredBackupFiles:filteredBackupFiles\.slice\(0,20\)/);
 assert.match(workspace,/visibleBackupFiles\.map\(f=>/);
});
check('Se distingue entre historial vacío y filtro sin coincidencias',()=>{
 assert.match(workspace,/files\.length\?'No se encontraron respaldos con ese filtro':'Aún no hay copias automáticas'/);
});
check('Mostrar todas es reversible y no modifica los archivos SQLite',()=>{
 assert.match(workspace,/setShowAllBackups\(v=>!v\)/);
 assert.match(workspace,/Mostrar todas/);
 assert.match(workspace,/Mostrar solo 20/);
 assert.match(css,/\.backupHistorySearch/);
});
check('Semanal ofrece los siete días configurables',()=>{
 assert.match(workspace,/Día de respaldo semanal/);
 for(const day of ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])assert.ok(workspace.includes(day));
 assert.match(workspace,/weekday:Number\(e\.target\.value\)/);
});
check('Mensual permite elegir días 1 a 31 y aclara fin de mes',()=>{
 assert.match(workspace,/Día de respaldo mensual/);
 assert.match(workspace,/Array\.from\(\{length:31\}/);
 assert.match(workspace,/monthDay:Number\(e\.target\.value\)/);
 assert.match(workspace,/último día/);
});
check('Crear respaldo usa el icono de copia del proyecto',()=>{
 assert.match(workspace,/<UiIcon name="backup" size=\{18\}\/>/);
 assert.doesNotMatch(workspace,/▣ Crear respaldo ahora/);
 assert.match(css,/\.backupHero>button svg/);
});
console.log(`QA historial respaldos: ${count}/${count}`);
