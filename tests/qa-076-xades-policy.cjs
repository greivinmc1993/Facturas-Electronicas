'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createHash}=require('node:crypto');
const {policyDigestResult,inspectPolicyPdf,POLICY_URL,ANNEX_URL,ANNEX_SAMPLE_SHA256_B64,MAX_POLICY_BYTES}=require('../electron/fe-xades-policy.cjs');
const {signatureReadiness}=require('../electron/fe-signature-gate.cjs');
let count=0;
async function check(title,fn){await fn();count++;console.log('OK v0.6.76 política:',title)}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-xades-policy-'));
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n','latin1');
 const filename=path.join(dir,'politica.pdf');
 try{
  fs.writeFileSync(filename,pdf);
  await check('URI del PDF y SHA-256 del ejemplo son referencias oficiales inmutables',()=>{
   assert(POLICY_URL.startsWith('https://cdn.comprobanteselectronicos.go.cr/xml-schemas/'));
   assert(ANNEX_URL.startsWith('https://www.hacienda.go.cr/docs/'));
   assert.equal(Buffer.from(ANNEX_SAMPLE_SHA256_B64,'base64').length,32);
  });
  await check('La política local usa SHA-256 real y no identifica un PDF diferente como oficial',()=>{
   const result=policyDigestResult(pdf);
   assert.equal(result.sha256,createHash('sha256').update(pdf).digest('hex').toUpperCase());
   assert.equal(result.matchesAnnexSample,false);
   assert.equal(result.status,'requiere-revision');
   assert.equal(result.canSign,false);
   assert.equal(result.canIssue,false);
  });
  await check('Seleccionar el PDF devuelve nombre y huella, nunca ruta o contenidos',async()=>{
   const result=await inspectPolicyPdf(filename);
   assert.equal(result.name,'politica.pdf');
   assert.equal(result.sizeBytes,pdf.length);
   assert.equal(result.referenceUrl,POLICY_URL);
   assert(!JSON.stringify(result).includes(dir));
   assert(!JSON.stringify(result).includes('%PDF'));
   assert.equal(result.canSign,false);
  });
  await check('Rechaza extensión, ruta relativa y archivos no-PDF',async()=>{
   await assert.rejects(inspectPolicyPdf('politica.pdf'),/Elige un PDF/);
   await assert.rejects(inspectPolicyPdf(path.join(dir,'politica.txt')),/Elige un PDF/);
   assert.throws(()=>policyDigestResult(Buffer.from('XML: no es PDF')),/tamaño inválido|estructura básica/);
  });
  await check('Rechaza PDFs truncados sin marcador EOF',()=>{
   assert.throws(()=>policyDigestResult(Buffer.from('%PDF-1.7\n'+'x'.repeat(50))),/estructura básica/);
  });
  await check('Rechaza PDF sobredimensionado',()=>{
   assert.throws(()=>policyDigestResult(Buffer.alloc(MAX_POLICY_BYTES+1)),/tamaño inválido/);
  });
  await check('Rechaza archivo simbólico sin leer datos',async()=>{
   const link=path.join(dir,'referencia.pdf');
   try{fs.symlinkSync(filename,link)}catch(err){if(['EPERM','EACCES','ENOSYS'].includes(err.code))return;throw err;}
   await assert.rejects(inspectPolicyPdf(link),/regular/);
  });
  await check('Un PDF puede tener el mismo nombre pero distinta huella, nunca se asume oficial',()=>{
   const changed=Buffer.from(pdf);changed[10]=changed[10]===49?50:49;
   assert.notEqual(policyDigestResult(changed).sha256,policyDigestResult(pdf).sha256);
  });
  await check('No habilita firma o emisión aunque el P12 sea legible y su prueba local haya pasado',()=>{
   const r=signatureReadiness({technicallyReady:true,keyPossession:{ok:true}});
   assert.equal(r.canSign,false);assert.equal(r.canIssue,false);
   assert.equal(r.checks.find(c=>c.key==='policy').ok,false);
  });
  await check('No altera ni reescribe el archivo PDF al revisar su huella',async()=>{
   const before=fs.readFileSync(filename);
   await inspectPolicyPdf(filename);
   assert.deepEqual(fs.readFileSync(filename),before);
  });
  await check('Cotejo PDF no utiliza red, certificados privados ni comandos externos',()=>{
   const code=fs.readFileSync(path.join(__dirname,'../electron/fe-xades-policy.cjs'),'utf8');
   assert.doesNotMatch(code,/\bfetch\s*\(|https\.get|spawnSync|execFile|writeFile|createPrivateKey/);
  });
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
 console.log(`QA v0.6.76 política: ${count}/${count} aprobadas`);
})().catch(error=>{console.error(error);process.exitCode=1});
