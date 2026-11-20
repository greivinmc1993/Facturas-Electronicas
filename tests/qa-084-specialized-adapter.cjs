'use strict';
/** QA offline: sin dependencia de npm, sin certificados reales. */
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const mod=await import(pathToFileURL(path.join(__dirname,'../electron/fe-xades-specialized-lab.mjs')).href);
 const tests=[
  ()=>assert.deepEqual(Object.keys(mod.XML_VARIANTS),['simple','servicio','mercaderia']),
  ()=>assert(Object.values(mod.XML_VARIANTS).every(v=>v.includes('NO_FISCAL'))),
  ()=>assert(Object.values(mod.XML_VARIANTS).every(v=>!v.includes('FacturaElectronica'))),
  ()=>assert.equal(Buffer.from(mod.POLICY_DIGEST,'base64').length,32),
  ()=>assert.match(mod.POLICY_URI,/^https:\/\/cdn\.comprobanteselectronicos\.go\.cr\//),
  ()=>assert.equal(typeof mod.runSpecializedSyntheticTrial,'function'),
 ];
 for(const test of tests)test();
 await assert.rejects(mod.runSpecializedSyntheticTrial('arbitraria',{}),/no autorizada/);
 await assert.rejects(mod.runSpecializedSyntheticTrial('simple',{}),/incompletas/);
 await assert.rejects(mod.runSpecializedSyntheticTrial('servicio',null),/incompletas/);
 console.log('QA v0.6.84 adaptador sintético aislado: 9/9 aprobadas (biblioteca aún no integrada)');
})().catch(e=>{console.error(e);process.exitCode=1});
