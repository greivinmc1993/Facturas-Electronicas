'use strict';
/** QA offline de contrato de la evaluación aislada v0.6.83.
 * No indica que npm ni XAdESjs se hayan ejecutado en GitHub.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workflow=read('.github/workflows/xadesjs-evaluation.yml');
const probe=read('tests/qa-083-xadesjs-epes-evaluation.mjs');
const external=read('tests/qa-083-xadesjs-epes-independiente.py');
const ui=read('src/FeSignatureReadiness.jsx');
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const tests=[
 ()=>{assert.equal(pkg.version,'0.6.89');assert.equal(lock.version,'0.6.89');assert.equal(lock.packages[''].version,'0.6.89');},
 ()=>assert.match(workflow,/workflow_dispatch:/),
 ()=>assert.match(workflow,/node: \['22', '24'\]/),
 ()=>assert.match(workflow,/xadesjs@3\.1\.0 xmldsigjs@3\.1\.0 xml-core@3\.1\.0/),
 ()=>assert.match(workflow,/--prefix "\$RUNNER_TEMP\/xades-eval"/),
 ()=>assert.match(workflow,/probe-082\.mjs/),
 ()=>assert.match(workflow,/probe-083\.mjs/),
 ()=>assert.match(workflow,/qa-083-xadesjs-epes-independiente\.py/),
 ()=>assert.match(workflow,/actions\/upload-artifact@v6/),
 ()=>assert.match(workflow,/git diff --exit-code -- package\.json package-lock\.json/),
 ()=>{for(const name of ['xadesjs','xmldsigjs','xml-core'])assert.equal(pkg.dependencies[name],'3.1.0');},
 ()=>{assert.match(probe,/digestValue:POLICY_DIGEST_B64/);assert.match(probe,/SignaturePolicyId/);assert.match(probe,/SignaturePolicyImplied/);},
 ()=>{assert.match(probe,/webcrypto\.subtle\.generateKey/);assert.match(probe,/mutant/);assert.match(probe,/keyValue: keys\.publicKey/);},
 ()=>{assert.match(external,/resolve_entities=False/);assert.match(external,/no_network=True/);assert.match(external,/key\.verify/);},
 ()=>{assert.match(external,/SignaturePolicyImplied/);assert.match(external,/SignaturePolicyId/);},
 ()=>{assert.match(ui,/v0\.6\.89/);assert.match(ui,/Ensayo integrado de XAdESjs/);},
 ()=>assert.doesNotMatch(read('electron/preload.cjs'),/signFiscalXml|sendFiscalToHacienda/),
];
for(const t of tests)t();
console.log(`QA v0.6.83 contrato de evaluación y transición de XAdESjs: ${tests.length}/${tests.length} aprobadas (firma fiscal bloqueada).`);
