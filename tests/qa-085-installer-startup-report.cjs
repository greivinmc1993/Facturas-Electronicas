// Regression de seguridad: una excepción en el arranque empaquetado debe
// escribir el informe QA y no disparar nuevos laboratorios desde el catch.
// Compatible con los finales de línea LF (Linux) y CRLF (Windows/Git).
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const normalizeEol=text=>text.replace(/\r\n?/g,'\n');
const main=normalizeEol(fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8'));
function startupFailureBranch(text){
 const source=normalizeEol(text);
 const start=source.indexOf("  } catch(err) {\n    console.error('No se pudo iniciar FacturaCR:',err);");
 assert.ok(start>=0,'Falta manejo del error de arranque Electron');
 const end=source.indexOf("\n});\napp.on('window-all-closed'",start);
 assert.ok(end>start,'No se delimitó el manejo del error de arranque');
 return source.slice(start,end);
}
const failureBranch=startupFailureBranch(main);
assert.match(failureBranch,/await writeSmokeResult\(\{success:false,error:/);
assert.ok(!failureBranch.includes('runIntegratedXadesLab()'),'El catch no debe volver a ejecutar XAdESjs');
assert.ok(!failureBranch.includes('const lab='),'El catch no debe invocar un ensayo que pueda ocultar el fallo');
assert.match(failureBranch,/app\.quit\(\)/);
// La misma comprobación debe funcionar al procesar un checkout CRLF de Windows.
assert.equal(startupFailureBranch(main.replace(/\n/g,'\r\n')),failureBranch,
 'La comprobación de arranque debe ser independiente de LF/CRLF');
for(const filename of ['tests/qa-electron-empaquetado.cjs','tests/qa-instalacion-actualizacion.cjs','tests/qa-version-upgrade.cjs']){
 const source=normalizeEol(fs.readFileSync(path.join(root,filename),'utf8'));
 assert.match(source,/stdio:\['ignore','pipe','pipe'\]/,filename+' debe capturar stdout/stderr');
 assert.match(source,/electron\.log/,filename+' debe conservar un registro de diagnóstico');
}
console.log('OK QA manejo de errores de arranque, evidencia Electron y LF/CRLF: 5/5');
