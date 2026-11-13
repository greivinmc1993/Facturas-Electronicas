'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(base,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(base,'src/style.css'),'utf8');
let count=0;
const check=(name,fn)=>{fn();count++;console.log('OK Avisos interfaz v0.6.69:',name)};
const effect=main.split('// Aviso para el propietario al entrar a Empresas o Dashboard.')[1].split('const sizeLabel=')[0];
const markup=main.split('<main>{securityPanel}')[1].split('{message&&')[0];
check('Únicamente el propietario consulta las alertas',()=>assert.match(effect,/if\(!account\?\.isOwner \|\| !\['companies','dashboard'\]\.includes\(tab\)\)return/));
check('Una solicitud GET al entrar a Empresas o Dashboard sin temporizadores adicionales',()=>{
 assert.equal((effect.match(/api\('\/api\/backups\/automatic'\)/g)||[]).length,1);
 assert.doesNotMatch(effect,/setInterval|setTimeout|method:'POST'|method:'PUT'/);
 assert.match(effect,/\},\[tab,account\?\.isOwner\]\)/);
});
check('Se ignoran respuestas tardías tras cambiar de módulo',()=>{
 assert.match(effect,/if\(active\)setOwnerBackupNotice/);
 assert.match(effect,/return \(\)=>\{active=false;\}/);
});
check('Error de consulta no muestra un falso estado correcto',()=>assert.match(effect,/catch\(\(\)=>\{\s*if\(active\)setOwnerBackupNotice\(getOwnerBackupCheckFailure\(\)\)/));
check('Panel restringido a propietario y dos pantallas, accesible por teclado',()=>{
 assert.match(markup,/account\?\.isOwner&&\['companies','dashboard'\]\.includes\(tab\)&&ownerBackupNotice/);
 assert.match(markup,/role=\{ownerBackupNotice\.severity==='warning'\?'alert':'status'\}/);
 assert.match(markup,/button type="button" className="secondary ownerBackupNoticeAction"/);
});
check('Botón lleva al módulo existente sin disparar operaciones de escritura',()=>{
 assert.match(markup,/onClick=\{\(\)=>setTab\('backups'\)\}/);
 assert.doesNotMatch(markup,/saveAutoBackup\(|restoreBackup\(|method:'POST'/);
});
check('Estilos de aviso mantienen ancho y adaptación del contenido',()=>{
 assert.match(css,/\.ownerBackupNotice\{display:flex;align-items:center/);
 assert.match(css,/\.ownerBackupNoticeBody\{flex:1 1 auto;min-width:0/);
 assert.match(css,/@container facturacr-workspace \(max-width: 660px\)/);
});
check('Se mantiene el monitor original cada 60 segundos solo en Respaldos',()=>{
 assert.match(main,/if\(tab!=='backups'\|\|!account\?\.isOwner\)return/);
 assert.match(main,/monitor\.start\(\{immediate:true\}\)/);
 assert.match(main,/backupHealthMonitorRef\.current=monitor/);
});
console.log(`QA interfaz avisos v0.6.69: ${count}/${count} aprobadas`);
