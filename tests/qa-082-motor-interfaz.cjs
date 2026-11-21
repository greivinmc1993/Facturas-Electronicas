'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('src/FeSignatureReadiness.jsx'),main=read('electron/main.cjs'),preload=read('electron/preload.cjs');
const packageJson=require('../package.json'),lock=require('../package-lock.json');
const tests=[
 ()=>{assert.equal(packageJson.version,'0.6.87');assert.equal(lock.version,'0.6.87');assert.equal(lock.packages[''].version,'0.6.87');},
 ()=>{assert.match(ui,/v0\.6\.87/);assert.match(ui,/Comprobar motor XAdESjs/);assert.match(ui,/onClick=\{diagnoseXadesEngine\}/);},
 ()=>{assert.match(ui,/setEngineStatus\(null\)/);assert.match(ui,/generation\.current/);},
 ()=>{assert.match(ui,/Integración XAdESjs pendiente/);assert.match(ui,/no firma XML y nunca habilita emisión/);},
 ()=>{assert.match(preload,/checkXadesEngine:\(\)=>ipcRenderer\.invoke\('facturacr:check-xades-engine'\)/);},
 ()=>{assert.match(main,/ipcMain\.handle\('facturacr:check-xades-engine',async event=>\{/);assert.match(main,/if\(!authorizedCertificateFrame\(event\)\)/);},
 ()=>{assert.doesNotMatch(preload,/signRealFiscal|sendToHacienda/);},
 ()=>{assert.equal(packageJson.dependencies.xadesjs,'3.1.0');},
 ()=>{assert.match(read('.github/workflows/xadesjs-evaluation.yml'),/workflow_dispatch:/);assert.match(read('.github/workflows/xadesjs-evaluation.yml'),/npm install --prefix/);}
];
for(const t of tests)t();console.log(`QA v0.6.83 interfaz y aislamiento: ${tests.length}/${tests.length} aprobadas`);
