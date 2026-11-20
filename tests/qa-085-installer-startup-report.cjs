// Regression de seguridad: una excepción en el arranque empaquetado debe
// escribir el informe QA y no disparar nuevos laboratorios desde el catch.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8');
const start=main.indexOf("  } catch(err) {\n    console.error('No se pudo iniciar FacturaCR:',err);");
assert.ok(start>=0,'Falta manejo del error de arranque Electron');
const end=main.indexOf("\n});\napp.on('window-all-closed'",start);
assert.ok(end>start,'No se delimitó el manejo del error de arranque');
const failureBranch=main.slice(start,end);
assert.match(failureBranch,/await writeSmokeResult\(\{success:false,error:/);
assert.ok(!failureBranch.includes('runIntegratedXadesLab()'),'El catch no debe volver a ejecutar XAdESjs');
assert.ok(!failureBranch.includes('const lab='),'El catch no debe invocar un ensayo que pueda ocultar el fallo');
assert.match(failureBranch,/app\.quit\(\)/);
for(const filename of ['tests/qa-electron-empaquetado.cjs','tests/qa-instalacion-actualizacion.cjs','tests/qa-version-upgrade.cjs']){
 const source=fs.readFileSync(path.join(root,filename),'utf8');
 assert.match(source,/stdio:\['ignore','pipe','pipe'\]/,filename+' debe capturar stdout/stderr');
 assert.match(source,/electron\.log/,filename+' debe conservar un registro de diagnóstico');
}
console.log('OK QA manejo de errores de arranque y evidencia Electron: 4/4');
