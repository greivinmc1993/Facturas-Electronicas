/** v0.6.85: asegura que los peers ESM necesarios se empaqueten como producción. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const required=Object.freeze({pkijs:'4.0.1',asn1js:'4.1.0'});
let checks=0;
for(const [name,version] of Object.entries(required)){
 assert.equal(pkg.dependencies?.[name],version,`Falta ${name} en dependencies de producción`);
 checks++;
 assert.equal(lock.packages?.['']?.dependencies?.[name],version,`Lockfile raíz sin ${name}`);
 checks++;
 assert.equal(lock.packages?.[`node_modules/${name}`]?.version,version,`Lockfile sin versión concreta para ${name}`);
 checks++;
 assert.notEqual(lock.packages?.[`node_modules/${name}`]?.peer,true,`${name} sigue registrado solamente como peer`);
 checks++;
 assert.ok(pkg.build.asarUnpack.includes(`node_modules/${name}/**/*`),`${name} debe quedar disponible en ASAR unpacked`);
 checks++;
}
for(const name of ['xadesjs','xmldsigjs','xml-core','@xmldom/xmldom']){
 assert.ok(pkg.dependencies?.[name],`Dependencia especializada ausente: ${name}`);
 checks++;
}
const workflow=fs.readFileSync(path.join(root,'.github/workflows/windows-installer.yml'),'utf8');
assert.match(workflow,/npm run qa:packaged-deps/, 'El workflow Windows debe comprobar los paquetes reales en ASAR');
checks++;
const runner=fs.readFileSync(path.join(root,'tests/qa-085-packaged-dependencies.mjs'),'utf8');
assert.match(runner,/listPackage/);
checks++;
assert.match(runner,/pkijs/);
checks++;
assert.match(runner,/asn1js/);
checks++;
const upgrade=fs.readFileSync(path.join(root,'tests/qa-instalacion-actualizacion.cjs'),'utf8');
assert.match(upgrade,/integridad-dependencia-instalada-/);
checks++;
console.log(`QA dependencias XAdESjs en instalador: ${checks}/${checks}`);
