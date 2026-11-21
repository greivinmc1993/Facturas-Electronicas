'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const workflow=read('.github/workflows/xadesjs-evaluation.yml');
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const adapter=read('electron/fe-xades-specialized-lab.mjs');
const tests=[
 ()=>{assert.equal(pkg.version,'0.6.91');assert.equal(lock.version,'0.6.91');assert.equal(lock.packages[''].version,'0.6.91');},
 ()=>assert.match(workflow,/node: \['22', '24'\]/),
 ()=>assert.match(workflow,/xadesjs@3\.1\.0 xmldsigjs@3\.1\.0 xml-core@3\.1\.0 @xmldom\/xmldom@0\.9\.12/),
 ()=>assert.doesNotMatch(workflow,/@xmldom\/xmldom@0\.9\.10/),
 ()=>assert.match(workflow,/actions\/checkout@v6[\s\S]*actions\/setup-node@v6/),
 ()=>assert.match(workflow,/actions\/setup-python@v6/),
 ()=>assert.match(workflow,/actions\/upload-artifact@v6/),
 ()=>assert.match(workflow,/cp electron\/fe-xades-specialized-lab\.mjs/),
 ()=>assert.match(workflow,/probe-084\.mjs/),
 ()=>assert.match(workflow,/production-lockfile-candidate:/),
 ()=>assert.match(workflow,/--package-lock-only --save-exact --ignore-scripts/),
 ()=>assert.match(workflow,/npm ci --prefix "\$RUNNER_TEMP\/xades-candidate" --ignore-scripts/),
 ()=>assert.match(workflow,/package-lock\.candidato\.json/),
 ()=>assert.match(workflow,/git diff --exit-code -- package\.json package-lock\.json/),
 ()=>assert.match(workflow,/auditoria-npm\.json/),
 ()=>{for(const n of ['xadesjs','xmldsigjs','xml-core'])assert.equal(pkg.dependencies[n],'3.1.0');assert.equal(pkg.dependencies['@xmldom/xmldom'],'0.9.12');},
 ()=>{assert.match(adapter,/Object\.hasOwn\(XML_VARIANTS, variant\)/);assert.match(adapter,/extractable|false,\['sign','verify'\]/);},
 ()=>assert.doesNotMatch(read('electron/preload.cjs'),/sendFiscalToHacienda|signFiscalXml/),
 ()=>assert.match(read('src/FeSignatureReadiness.jsx'),/v0\.6\.85/),
 ()=>assert.match(workflow,/qa-083-xadesjs-epes-independiente\.py.*084/),
];
for(const f of tests)f();
console.log(`QA v0.6.84 contrato CI y dependencias protegidas: ${tests.length}/${tests.length} aprobadas`);
