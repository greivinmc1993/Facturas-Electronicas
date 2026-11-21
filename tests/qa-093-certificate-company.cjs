'use strict';
/** v0.6.93 - cotejo de identidad NO fiscal, con pruebas de seguridad. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {matchCertificateToCompany,parseExplicitIdentifiers}=require('../electron/fe-certificate-company.cjs');
const {createP12SelectionManager}=require('../electron/fe-certificate-selection.cjs');
let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('OK v0.6.93 certificado:',label)};
const compare=(s,id)=>matchCertificateToCompany(s,id);
check('Identificación explícita coincide con separadores de cédula',()=>{
 const r=compare('CN=QA empresa\nserialNumber=3-101-123456\nO=LAB','3101123456');
 assert.equal(r.status,'MATCH');assert.equal(r.canIssue,false);assert.equal(r.canSign,false);assert.equal(r.verifiedOwnership,false);
});
check('Diferencia de identificaciones no se oculta',()=>assert.equal(compare('serialNumber=3101000000','3101123456').status,'MISMATCH'));
check('No infiere identificación de CN, nombre comercial u organización',()=>{
 assert.equal(compare('CN=Empresa 3101123456\nO=3101123456','3101123456').status,'INDETERMINATE');
});
check('Prefijo de dígitos no se interpreta como coincidencia',()=>assert.equal(compare('serialNumber=31011234567','3101123456').status,'MISMATCH'));
check('Identificador con otros caracteres extraños no se acepta como prueba',()=>assert.equal(compare('serialNumber=foo3101123456bar','3101123456').status,'INDETERMINATE'));
check('Certificado con dos identificaciones contradictorias es indeterminado',()=>{
 assert.equal(compare('serialNumber=3101123456\norganizationIdentifier=3101999999','3101123456').status,'INDETERMINATE');
});
check('Doble representación del mismo identificador no es contradictoria',()=>{
 assert.equal(compare('serialNumber=3101123456\nOID.2.5.4.97=3-101-123456','3101123456').status,'MATCH');
});
check('Identificación extranjera no genera afirmación de coincidencia',()=>assert.equal(compare('serialNumber=3101123456','AB-123').status,'INDETERMINATE'));
check('Campo vacío, demasiado largo u objeto no son una identidad fiscal',()=>{
 for(const bad of ['',null,{},'0'.repeat(300)])assert.equal(compare('serialNumber=3101123456',bad).status,'INDETERMINATE');
});
check('Prefijos reconocidos y RDN separados por coma',()=>{
 assert.deepEqual(parseExplicitIdentifiers('CN=QA, serialNumber=CPF-1-1234-5678, O=QA'),['112345678']);
});
check('Nunca activa firma, emisión o titularidad fiscal',()=>{
 for(const status of ['MATCH','MISMATCH','INDETERMINATE']){
  const id=status==='MATCH'?'3101123456':status==='MISMATCH'?'3101999999':'';
  const r=compare('serialNumber=3101123456',id);
  assert.equal(r.canSign,false);assert.equal(r.canIssue,false);assert.equal(r.verifiedOwnership,false);
 }
});
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-093-cert-'));
 try{
  const file=path.join(dir,'prueba.p12');fs.writeFileSync(file,Buffer.alloc(256,79));
  let seen;
  const manager=createP12SelectionManager({inspector:(bytes,passphrase)=>{
   seen=bytes;
   if(passphrase!=='CLAVE-QA-SOLO-PRUEBA')throw Error('Contraseña incorrecta');
   return {recognized:true,subject:'CN=Ficticia\nserialNumber=3101123456',technicallyReady:true,canSign:false,canIssue:false};
  }});
  const selected=await manager.select(file,21);
  await assert.rejects(manager.inspect(selected.token,22,'CLAVE-QA-SOLO-PRUEBA','3101123456'),/esta empresa/);
  const result=await manager.inspect(selected.token,21,'CLAVE-QA-SOLO-PRUEBA','3101123456');
  assert.equal(result.companyMatch.status,'MATCH');
  assert.equal(result.signatureReadiness.canIssue,false);
  assert(seen.every(byte=>byte===0),'El búfer PKCS#12 debería borrarse después de inspección');
  assert.doesNotMatch(JSON.stringify(result),/CLAVE-QA-SOLO-PRUEBA|prueba\.p12|\/tmp\//);
  await assert.rejects(manager.inspect(selected.token,21,'CLAVE-QA-SOLO-PRUEBA','3101123456'),/Vuelve a seleccionar/);
  passed++;console.log('OK v0.6.93 certificado: ticket por empresa, borrado de búfer y resultado sin secretos');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
 // Ensayo opcional con certificado PKCS#12 generado localmente (no datos fiscales).
 const openssl=spawnSync('openssl',['version'],{encoding:'utf8'});
 if(openssl.status===0){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-093-x509-'));
  const run=args=>{const p=spawnSync('openssl',args,{encoding:'utf8'});assert.equal(p.status,0,p.stderr||'OpenSSL');};
  try{
   run(['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=QA Solo Prueba/serialNumber=3101123456/O=Laboratorio','-days','3','-keyout',path.join(tmp,'k.pem'),'-out',path.join(tmp,'c.pem')]);
   run(['pkcs12','-export','-inkey',path.join(tmp,'k.pem'),'-in',path.join(tmp,'c.pem'),'-passout','pass:CLAVE-QA-SOLO-PRUEBA','-out',path.join(tmp,'prueba.p12')]);
   const {inspectP12}=require('../electron/fe-certificate-check.cjs');
   const report=inspectP12(fs.readFileSync(path.join(tmp,'prueba.p12')),'CLAVE-QA-SOLO-PRUEBA');
   assert.equal(compare(report.subject,'3101123456').status,'MATCH');
   assert.equal(compare(report.subject,'3101000000').status,'MISMATCH');
   passed++;console.log('OK v0.6.93 certificado: PKCS#12 RSA real de prueba, sin certificados del usuario');
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
 }else console.log('AVISO: OpenSSL no disponible; ensayo opcional de PKCS#12 se comprobará en CI.');
 const ui=fs.readFileSync(path.join(__dirname,'../src/FeSignatureReadiness.jsx'),'utf8');
 const parent=fs.readFileSync(path.join(__dirname,'../src/FePreparationPanel.jsx'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8');
 const gate=fs.readFileSync(path.join(__dirname,'../electron/fe-signature-gate.cjs'),'utf8');
 check('Vista muestra cotejo separado y deja autorización fiscal pendiente',()=>{
  assert.match(ui,/feCertificateCompanyCheck/);assert.match(ui,/No comprueba poder de representación, cadena de confianza/);
  assert.match(parent,/companyIdentification=\{company\?\.identification/);assert.match(gate,/identity.*ok:false/);
 });
 check('IPC protege la ventana y no expone claves, firma ni emisión',()=>{
  assert.match(main,/facturacr:inspect-p12/);assert.match(main,/authorizedCertificateFrame\(event\)/);
  assert.match(preload,/companyIdentification\)=>ipcRenderer.invoke\('facturacr:inspect-p12'/);
  assert.doesNotMatch(preload,/signFiscalXml|exportPrivateKey|readP12/);
 });
 const p=require('../package.json'),lock=require('../package-lock.json');
 check('Versiones y lockfile preparados para v0.6.93',()=>{
  assert.equal(p.version,'0.6.93');assert.equal(lock.version,p.version);assert.equal(lock.packages[''].version,p.version);
 });
 console.log(`QA v0.6.93 identidad del certificado: ${passed}/${passed} comprobaciones aprobadas. NO verifica habilitación fiscal.`);
})().catch(e=>{console.error(e);process.exitCode=1});
