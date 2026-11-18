'use strict';
const assert=require('node:assert/strict');
const {inspectP12,MAX_P12_BYTES}=require('../electron/fe-certificate-check.cjs');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
let count=0;function test(name,fn){fn();count++;console.log('OK certificado v0.6.73:',name)}
test('Límite de archivo de 4 MB',()=>assert.equal(MAX_P12_BYTES,4*1024*1024));
test('Rechaza contenedor vacío y tipo no binario',()=>{assert.throws(()=>inspectP12(Buffer.alloc(0),''),/tamaño/);assert.throws(()=>inspectP12('simulado',''),/tamaño/)});
test('Rechaza archivo excesivo',()=>assert.throws(()=>inspectP12(Buffer.alloc(MAX_P12_BYTES+1),''),/tamaño/));
test('Rechaza secretos con tipo incorrecto',()=>assert.throws(()=>inspectP12(Buffer.alloc(64),{}),/Contraseña/));
test('Rechaza secretos excesivos',()=>assert.throws(()=>inspectP12(Buffer.alloc(64),'x'.repeat(513)),/Contraseña/));
test('Rechaza fecha de prueba inválida',()=>assert.throws(()=>inspectP12(Buffer.alloc(64),'',new Date('xxx')),/Fecha/));
test('Rechaza P12 falsificado aun con tamaño correcto',()=>assert.throws(()=>inspectP12(Buffer.alloc(256),'abc')));
test('API de inspección no exporta métodos de firma ni persistencia',()=>assert.deepEqual(Object.keys(require('../electron/fe-certificate-check.cjs')).sort(),['MAX_P12_BYTES','inspectP12']));
const openssl=spawnSync('openssl',['version'],{encoding:'utf8'});
if(openssl.status===0){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-qa-p12-'));
 const run=(args)=>{const p=spawnSync('openssl',args,{encoding:'utf8',stdio:'pipe'});assert.equal(p.status,0,p.stderr||'openssl falló')};
 try{
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem'),pfx=path.join(dir,'cert.p12'),pfxWithoutKey=path.join(dir,'no-key.p12');
  run(['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=FacturaCR TEST ONLY/O=QA ficticia','-days','3','-keyout',key,'-out',cert]);
  run(['pkcs12','-export','-inkey',key,'-in',cert,'-passout','pass:TemporalQA123','-out',pfx]);
  const bytes=fs.readFileSync(pfx);
  const report=inspectP12(bytes,'TemporalQA123');
  test('Lee un archivo P12 de ensayo con certificado y clave privada',()=>{assert.equal(report.recognized,true);assert.match(report.subject,/FacturaCR TEST ONLY/);assert.equal(report.publicKeyType,'rsa');assert.equal(report.rsaBits,2048)});
  test('Nunca declara emisión ni firma disponible',()=>{assert.equal(report.canSign,false);assert.equal(report.canIssue,false);assert.match(report.note,/No comprueba revocación/)});
  test('No devuelve la contraseña, archivo ni material privado',()=>{const payload=JSON.stringify(report);assert.doesNotMatch(payload,/TemporalQA123|BEGIN PRIVATE KEY|key\.pem|cert\.p12/);assert.match(report.fingerprint256,/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/)});
  test('Rechaza contraseña incorrecta',()=>assert.throws(()=>inspectP12(bytes,'Incorrecta')));
  test('Distingue vencimiento',()=>{const result=inspectP12(bytes,'TemporalQA123',new Date('2032-01-01T00:00:00Z'));assert.equal(result.technicallyReady,false);assert.equal(result.checks.find(c=>c.key==='validity').ok,false)});
  test('Distingue todavía no vigente',()=>{const result=inspectP12(bytes,'TemporalQA123',new Date('2000-01-01T00:00:00Z'));assert.equal(result.checks.find(c=>c.key==='validity').ok,false)});
  run(['pkcs12','-export','-nokeys','-in',cert,'-passout','pass:TemporalQA123','-out',pfxWithoutKey]);
  test('Rechaza un contenedor sin clave privada',()=>assert.throws(()=>inspectP12(fs.readFileSync(pfxWithoutKey),'TemporalQA123')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}else{
 console.log('AVISO: OpenSSL no está disponible; pruebas criptográficas reales opcionales se ejecutarán en CI Linux.');
}
console.log(`QA certificado v0.6.73: ${count}/${count} aprobadas`);
