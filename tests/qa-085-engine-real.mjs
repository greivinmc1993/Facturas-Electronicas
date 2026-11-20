/** QA con dependencias instaladas mediante npm ci: obligatorio en Actions. */
import assert from 'node:assert/strict';
import {runIntegratedSyntheticSuite} from '../electron/fe-xades-integrated-lab.mjs';
const result=await runIntegratedSyntheticSuite();
assert.equal(result.verifiedCount,3);
assert.equal(result.mutationsRejected,6);
assert.equal(result.nonFiscal,true);
assert.equal(result.integratedLabVerified,true);
for(const key of ['canIssue','canSend','canSignFiscalXml','usesRealCertificate'])assert.equal(result[key],false);
assert.deepEqual(result.results.map(r=>r.variant),['simple','servicio','mercaderia']);
for(const entry of result.results){assert.match(entry.sha256,/^[a-f0-9]{64}$/);assert.equal(entry.references,2);assert.equal(entry.mutationsRejected,2);}
assert(!JSON.stringify(result).includes('PRIVATE KEY'));
assert(!JSON.stringify(result).includes('<ds:'));
console.log('QA v0.6.85 motor especializado REAL: 3/3 firmas y 6/6 alteraciones rechazadas (NO FISCAL)');
