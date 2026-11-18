'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createP12SelectionManager}=require('../electron/fe-certificate-selection.cjs');
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('OK certificado v0.6.74:',name)};
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-074-certificate-'));
 try{
  const filename=path.join(dir,'test.p12');
  fs.writeFileSync(filename,Buffer.alloc(256,64));
  let observed=null;
  const make=()=>createP12SelectionManager({inspector:(bytes,pw)=>{observed=bytes; if(pw!=='TemporalQA')throw Error('clave inválida');return {recognized:true,technicallyReady:true,canSign:false}}});
  await check('Separa seleccionar de aceptar; seleccionar no inspecciona ni solicita contraseña',async()=>{
   let count=0;const obj=createP12SelectionManager({inspector:()=>{count++;return {}}});
   const selection=await obj.select(filename,1);
   assert.equal(count,0);assert.equal(typeof selection.name,'string');assert.equal(selection.name,'test.p12');
   assert.match(selection.token,/^[a-f0-9]{48}$/);assert.equal('filename' in selection,false);
   assert.equal('path' in selection,false);assert.equal(obj.clear(selection.token),true);
  });
  await check('Valida empresa y ticket sin permitir usarlos entre empresas',async()=>{
   const obj=make(),s=await obj.select(filename,7);
   await assert.rejects(obj.inspect(s.token,8,'TemporalQA'),/esta empresa/);
   await assert.rejects(obj.inspect('token-falso',7,'TemporalQA'),/Vuelve a seleccionar/);
   await assert.rejects(obj.select(filename,0),/empresa/);
  });
  await check('Aceptar válido borra el búfer y consume el ticket',async()=>{
   const obj=make(),s=await obj.select(filename,7);
   const report=await obj.inspect(s.token,7,'TemporalQA');
   assert.equal(report.recognized,true);assert.equal(report.canSign,false);
   assert(observed.every(byte=>byte===0),'Búfer PKCS#12 no borrado');
   await assert.rejects(obj.inspect(s.token,7,'TemporalQA'),/Vuelve a seleccionar/);
  });
  await check('Contraseña incorrecta no permite acceso y borra búfer; se puede reintentar',async()=>{
   const obj=make(),s=await obj.select(filename,5);
   await assert.rejects(obj.inspect(s.token,5,'NoEsLaClave'),/clave inválida/);
   assert(observed.every(byte=>byte===0));
   const ok=await obj.inspect(s.token,5,'TemporalQA');assert.equal(ok.recognized,true);
  });
  await check('No admite contraseña vacía, objeto o excesiva',async()=>{
   const obj=make(),s=await obj.select(filename,9);
   for(const input of ['',{},'x'.repeat(513)])await assert.rejects(obj.inspect(s.token,9,input),/contraseña/);
  });
  await check('No acepta ruta inventada, extensión inválida, directorio ni archivo diminuto',async()=>{
   const obj=make();
   await assert.rejects(obj.select('falso.p12',1),/válido/);
   await assert.rejects(obj.select(dir,1),/válido/);
   const bad=path.join(dir,'datos.txt');fs.writeFileSync(bad,Buffer.alloc(256));
   await assert.rejects(obj.select(bad,1),/válido/);
   const small=path.join(dir,'small.pfx');fs.writeFileSync(small,Buffer.alloc(5));
   await assert.rejects(obj.select(small,1),/válido/);
  });
  await check('No admite certificados de más de 4 MB',async()=>{
   const obj=make(),oversize=path.join(dir,'big.p12');
   fs.writeFileSync(oversize,Buffer.alloc(4*1024*1024+1));
   await assert.rejects(obj.select(oversize,1),/4 MB/);
  });
  await check('Rechaza sustitución o modificación después de seleccionar',async()=>{
   const obj=make(),s=await obj.select(filename,3);
   fs.appendFileSync(filename,Buffer.from('cambio'));
   await assert.rejects(obj.inspect(s.token,3,'TemporalQA'),/cambió/);
   fs.writeFileSync(filename,Buffer.alloc(256,64));
  });
  await check('Seleccionar otro certificado invalida el anterior',async()=>{
   const obj=make(),a=await obj.select(filename,1),b=await obj.select(filename,1);
   assert.notEqual(a.token,b.token);
   await assert.rejects(obj.inspect(a.token,1,'TemporalQA'),/Vuelve a seleccionar/);
   assert.equal(obj.clear(a.token),false);
   assert.equal(obj.clear(b.token),true);
  });
  await check('Eliminación evita usar el archivo desde otro perfil',async()=>{
   const obj=make(),a=await obj.select(filename,1);
   obj.clearAll();
   await assert.rejects(obj.inspect(a.token,1,'TemporalQA'),/Vuelve a seleccionar/);
  });
  await check('Rechaza enlace simbólico, si lo admite el sistema',async()=>{
   const obj=make(),link=path.join(dir,'link.p12');
   try{fs.symlinkSync(filename,link,'file')}catch(e){if(['EPERM','ENOTSUP','EACCES'].includes(e.code))return;throw e;}
   await assert.rejects(obj.select(link,1),/válido/);
  });
  const openssl=spawnSync('openssl',['version'],{encoding:'utf8'});
  if(openssl.status===0){
   const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem'),p12=path.join(dir,'real.p12');
   const run=args=>{const p=spawnSync('openssl',args,{encoding:'utf8'});assert.equal(p.status,0,p.stderr)};
   run(['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=QA FIRMA LOCAL SOLO ENSAYO','-days','2','-keyout',key,'-out',cert]);
   run(['pkcs12','-export','-inkey',key,'-in',cert,'-passout','pass:TemporalQA','-out',p12]);
   await check('P12 criptográfico auténtico: inspección diferida, nunca firma XML',async()=>{
    const obj=createP12SelectionManager(),selected=await obj.select(p12,2);
    assert.equal(selected.name,'real.p12');
    await assert.rejects(obj.inspect(selected.token,2,'incorrecta'));
    const result=await obj.inspect(selected.token,2,'TemporalQA');
    assert.equal(result.technicallyReady,true);assert.equal(result.publicKeyType,'rsa');
    assert.equal(result.rsaBits,2048);assert.equal(result.canSign,false);
    assert.equal(result.checks.find(c=>c.key==='privateKey')?.ok,true);
   });
  }else console.log('AVISO: OpenSSL no disponible; la prueba criptográfica adicional se ejecutará en CI que lo tenga.');
  console.log(`QA v0.6.74 selección segura: ${passed}/${passed} aprobadas`);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
