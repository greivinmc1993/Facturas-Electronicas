/** QA offline del contrato de integración. La criptografía real se prueba en qa:xades-engine. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const pkg=require('../package.json'),lock=require('../package-lock.json');
const tests=[];
const check=(name,fn)=>tests.push([name,fn]);
check('Versión alineada',()=>{assert.equal(pkg.version,'0.6.93');assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version)});
check('Dependencias directas fijadas',()=>{for(const k of ['xadesjs','xmldsigjs','xml-core'])assert.equal(pkg.dependencies[k],'3.1.0');assert.equal(pkg.dependencies['@xmldom/xmldom'],'0.9.12');assert.equal(pkg.dependencies.xpath,'0.0.35')});
check('Lockfile refleja dependencias',()=>{for(const [k,v] of Object.entries(pkg.dependencies)){assert.equal(lock.packages[''].dependencies[k],v);assert(lock.packages['node_modules/'+k])}});
check('Integridad de paquetes especializados',()=>{for(const k of ['xadesjs','xmldsigjs','xml-core','@xmldom/xmldom','xpath']){const e=lock.packages['node_modules/'+k];assert(e.integrity?.startsWith('sha512-'));assert(e.resolved?.startsWith('https://registry.npmjs.org/'));}});
check('Firma fiscal sigue bloqueada',()=>{const s=read('electron/fe-signature-gate.cjs');assert.match(s,/canSign:false,canIssue:false/)});
check('No admite argumentos IPC de contenido',()=>{const m=read('electron/main.cjs');assert.match(m,/handle\('facturacr:xades-integrated-lab',async event=>/);assert.match(m,/authorizedCertificateFrame\(event\)/);assert.match(m,/integratedXadesRunning/)});
check('Bridge no permite XML ni .p12 en el ensayo',()=>{const p=read('electron/preload.cjs');assert.match(p,/runIntegratedXadesLab:\(\)=>ipcRenderer\.invoke\('facturacr:xades-integrated-lab'\)/);assert.doesNotMatch(p,/signFiscalXml|sendFiscalToHacienda/)});
check('Carga ESM diferida',()=>{const p=read('electron/fe-xades-integrated-lab.mjs');assert.match(p,/import\('xadesjs'\)/);assert.match(p,/import\('xmldsigjs'\)/);assert.match(p,/import\('@xmldom\/xmldom'\)/)});
check('QA del motor real dentro del ejecutable empaquetado',()=>{const m=read('electron/main.cjs');assert.match(m,/lab=await mainWindow.webContents.executeJavaScript/);assert.match(m,/lab.report\?\.verifiedCount!==3/);assert.match(m,/preloadIntegratedXades/)});
check('QA del motor real obligatoria en CI',()=>{for(const f of ['.github/workflows/qa.yml','.github/workflows/windows-installer.yml'])assert.match(read(f),/npm run qa:xades-engine/)});
check('Auditoría de producción sin ocultar fallo',()=>{for(const f of ['.github/workflows/qa.yml','.github/workflows/windows-installer.yml'])assert.match(read(f),/npm audit --omit=dev --audit-level=high/)});
check('Conserva archivos y datos históricos',()=>{for(const f of ['README.md','CHANGELOG.md','.gitignore','server/index.js','tests/fixtures/FacturaCR_v0.6.34_baseline.zip'])assert(fs.existsSync(path.join(root,f)))});
(async()=>{
 for(const [name,test] of tests){await test();console.log('OK v0.6.85: '+name);}
 const mod=await import(pathToFileURL(path.join(root,'electron/fe-xades-integrated-lab.mjs')).href);
 await assert.rejects(mod.runIntegratedSyntheticSuite({loadLibraries:async()=>{throw Error('Biblioteca no disponible')}}),/Biblioteca no disponible/);
 const expected=['simple','servicio','mercaderia'];
 const report=await mod.runIntegratedSyntheticSuite({loadLibraries:async()=>({testOnly:true}),runTrial:async variant=>({variant,signed:true,references:2,mutationsRejected:2,nonFiscal:true,sha256:'a'.repeat(64),xml:'NO EXPORTAR'})});
 assert.deepEqual(report.results.map(r=>r.variant),expected);assert(!('xml' in report.results[0]));
 await assert.rejects(mod.runIntegratedSyntheticSuite({loadLibraries:async()=>({}),runTrial:async variant=>({variant,signed:true,references:1,mutationsRejected:2,nonFiscal:true,sha256:'b'.repeat(64)})}),/no superó/);
 console.log(`QA v0.6.85 contrato integración: ${tests.length+3}/${tests.length+3} aprobadas (ensayo criptográfico real en CI)`);
})().catch(e=>{console.error(e);process.exitCode=1});
