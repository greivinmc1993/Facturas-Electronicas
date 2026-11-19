'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {proveP12PrivateKey}=require('../electron/fe-private-key-proof.cjs');
const {createP12SelectionManager}=require('../electron/fe-certificate-selection.cjs');
const {signatureReadiness,POLICY_REQUIREMENTS}=require('../electron/fe-signature-gate.cjs');
let passed=0;
async function check(name,fn){await fn();++passed;console.log('OK v0.6.75 firma:',name)}
(async()=>{
 await check('No declara firma ni envío aunque el certificado haya superado pruebas',()=>{
  const ready=signatureReadiness({technicallyReady:true,keyPossession:{ok:true}});
  assert.equal(ready.canSign,false);assert.equal(ready.canIssue,false);
  assert.equal(ready.checks.filter(s=>s.ok).length,2);
  assert(ready.checks.some(s=>s.key==='policy'&&!s.ok));
  assert(ready.checks.some(s=>s.key==='xsd'&&!s.ok));
 });
 await check('No se confunde lectura del P12 con posesión demostrada',()=>{
  const r=signatureReadiness({technicallyReady:true,keyPossession:{ok:false}});
  assert.equal(r.checks.find(s=>s.key==='keyProof').ok,false);
 });
 await check('El perfil XAdES-EPES se documenta sin URL de política inventada',()=>{
  assert.equal(POLICY_REQUIREMENTS.packaging,'ENVELOPED');
  assert(POLICY_REQUIREMENTS.allowedMethods.includes('RSA-SHA256'));
  assert(!JSON.stringify(POLICY_REQUIREMENTS).includes('URLXXXX'));
 });
 await check('Rechaza datos y tiempos de handshake inválidos',async()=>{
  await assert.rejects(proveP12PrivateKey(Buffer.alloc(3),'clave'),/inválido/);
  await assert.rejects(proveP12PrivateKey(Buffer.alloc(40),''),/Contraseña/);
  await assert.rejects(proveP12PrivateKey(Buffer.alloc(40),'clave',{timeoutMs:1}),/temporal/);
 });
 const openssl=spawnSync('openssl',['version'],{encoding:'utf8'});
 if(openssl.status===0){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-075-'));
  try{
   const run=args=>{const result=spawnSync('openssl',args,{stdio:'pipe'});assert.equal(result.status,0,String(result.stderr))};
   const key=path.join(dir,'qa.key'),cert=path.join(dir,'qa.crt'),p12=path.join(dir,'qa.p12');
   run(['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=FACTURACR QA SOLO PRUEBAS','-keyout',key,'-out',cert]);
   run(['pkcs12','-export','-inkey',key,'-in',cert,'-out',p12,'-passout','pass:ClaveFicticiaSoloQA']);
   await check('Un P12 ficticio demuestra correspondencia sin exportar clave privada',async()=>{
    const proof=await proveP12PrivateKey(fs.readFileSync(p12),'ClaveFicticiaSoloQA');
    assert.equal(proof.ok,true);assert(!JSON.stringify(proof).includes('PRIVATE KEY'));
   });
   await check('Contraseña inválida nunca demuestra posesión criptográfica',async()=>{
    await assert.rejects(proveP12PrivateKey(fs.readFileSync(p12),'ClaveIncorrecta'));
   });
   await check('Interfaz recibe solo estado de firma, no bytes ni material privado',async()=>{
    const mgr=createP12SelectionManager();
    const selected=await mgr.select(p12,77);
    const r=await mgr.inspect(selected.token,77,'ClaveFicticiaSoloQA');
    assert.equal(r.keyPossession.ok,true);
    assert.equal(r.signatureReadiness.canSign,false);
    assert.equal(r.signatureReadiness.canIssue,false);
    assert.equal(r.signatureReadiness.checks.find(c=>c.key==='keyProof').ok,true);
    assert(!JSON.stringify(r).includes('ClaveFicticiaSoloQA'));
    assert(!JSON.stringify(r).includes('BEGIN PRIVATE KEY'));
    assert(!JSON.stringify(r).includes(dir));
    await assert.rejects(mgr.inspect(selected.token,77,'ClaveFicticiaSoloQA'),/Vuelve a seleccionar/);
   });
   await check('Un fallo del ensayo conserva bloqueo total de firma y emisión',async()=>{
    const mgr=createP12SelectionManager({proof:async()=>{throw Error('Sin TLS de ensayo')}});
    const s=await mgr.select(p12,1);
    const report=await mgr.inspect(s.token,1,'ClaveFicticiaSoloQA');
    assert.equal(report.keyPossession.ok,false);
    assert.equal(report.signatureReadiness.canSign,false);
    assert.equal(report.signatureReadiness.checks.find(c=>c.key==='keyProof').ok,false);
   });
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
 }else console.log('AVISO: faltó openssl externo para crear certificado ficticio; el runtime usa OpenSSL integrado en Node.');
 console.log(`QA v0.6.75 prueba criptográfica: ${passed}/${passed} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
