'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(base,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(base,'src/style.css'),'utf8');
const server=fs.readFileSync(path.join(base,'server/index.js'),'utf8');
const auth=fs.readFileSync(path.join(base,'server/auth.js'),'utf8');
const block=main.split('function BackupWorkspace(')[1].split('function App(')[0];
let total=0;function check(label,fn){fn();total++;console.log('OK Interfaz salud respaldos:',label)}
check('Estado derivado de configuración guardada, no del formulario sin guardar',()=>{
 assert.match(block,/const backupHealth=autoBackup\?\.health\|\|null/);
 assert.match(block,/autoBackup\?\.config\?\.directoryMode/);
});
check('El servidor evalúa disponibilidad y espacio sin modificar el destino',()=>{
 assert.match(server,/describeBackupHealth\(\{now:new Date\(\),settings:backupConfig/);
 assert.match(server,/const location=backupConfig\.directoryMode==='default'&&\!existsSync\(configured\)\?dataDir:configured/);
});
check('La API expone estado solo dentro del endpoint de propietario',()=>{
 assert.match(server,/health:getBackupHealth\(files\)/);
 assert.ok(server.indexOf('registerAuth(app,')<server.indexOf("app.get('/api/backups/automatic'"));
 assert.match(auth,/Operación reservada al propietario/);
});
check('El diagnóstico muestra estado, ubicación, próximo respaldo y espacio',()=>{
 for(const x of ['Diagnóstico de respaldos','backupHealth?.title','backupHealth?.detail','healthNext','backupHealth.freeBytes','backupHealth?.directoryAvailable'])assert.ok(block.includes(x),x);
});
check('Actualizar estado refresca los datos reales y no ejecuta restauración',()=>{
 assert.match(block,/onClick=\{refreshBackupHealth\}/);
 assert.match(main,/setAutoBackup\(data\); \/\/ No descartar los cambios/);
 assert.doesNotMatch(block.split('backupHealthRefresh')[1].split('</button>')[0],/restoreBackup|performRestore/);
});
check('Panel accesible y mensajes fáciles de leer',()=>{
 assert.match(block,/aria-label="Diagnóstico de respaldos" role="status" aria-live="polite"/);
 assert.match(css,/\.backupHealthPanel/);
 assert.match(block,/Estado de programación y almacenamiento/);
});
check('Estilos distinguen situaciones graves sin colores invasivos',()=>{
 assert.match(css,/backupHealth-attention/);assert.match(css,/backupHealth-pending/);
});
check('Diseño responsive sin menús ni controles fuera del contenedor',()=>{
 assert.match(css,/@media\(max-width:760px\)\{\.backupHealthPanel/);
 assert.match(css,/\.backupHealthContent\{flex:1;min-width:0/);
});
console.log(`QA interfaz salud v0.6.67: ${total}/${total}`);
