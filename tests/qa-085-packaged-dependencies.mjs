/** Inspecciona el ASAR real generado por electron-builder, antes de instalar NSIS.
 * No utiliza certificado, clave ni datos comerciales. Requiere npm ci y el .exe empaquetado.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {listPackage} from '@electron/asar';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resources=path.join(root,'release','win-unpacked','resources');
const archive=path.join(resources,'app.asar');
assert.ok(fs.existsSync(archive),'Falta app.asar; ejecuta primero npm run dist:win');
const allFiles=new Set(listPackage(archive).map(s=>s.replaceAll('\\','/').replace(/^\/+/,'')));
const unpacked=path.join(resources,'app.asar.unpacked');
const packages=['xadesjs','xmldsigjs','xml-core','@xmldom/xmldom','xpath','pkijs','asn1js'];
for(const name of packages){
 const rel=`node_modules/${name}/package.json`;
 const physicallyUnpacked=fs.existsSync(path.join(unpacked,...rel.split('/')));
 const archived=allFiles.has(rel);
 assert.ok(archived||physicallyUnpacked,`Dependencia de runtime ausente del empaquetado: ${name}`);
 if(name==='pkijs'||name==='asn1js')
  assert.ok(physicallyUnpacked,`Peer ${name} no está disponible en app.asar.unpacked`);
 console.log(`OK: ${name} (${physicallyUnpacked?'ASAR unpacked':'ASAR'})`);
}
console.log('QA ASAR: dependencias especializadas presentes, sin utilizar certificados reales.');
