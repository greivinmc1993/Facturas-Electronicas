'use strict';
// Prueba unitaria REAL de escritura local, SHA, calendario CR y carpeta.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createCashClosureFiles,closingDayInCostaRica,safeUsername,decodeAndVerifyPdf}=require('../electron/cash-closure-files.cjs');
(async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'facturacr-cash-copy-'));
 let n=0;
 function check(label,fn){fn();n++;console.log('OK',label)}
 try{
  const service=createCashClosureFiles({documentsDir:path.join(temporary,'Documentos'),userDataDir:path.join(temporary,'AppData')});
  const binary=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const pdfBase64=binary.toString('base64'),sha256=createHash('sha256').update(binary).digest('hex');
  const data={companyId:17,sessionId:25,closedAt:'2026-11-21 02:30:00',closingUsername:'José Cajero /prueba',pdfBase64,sha256};
  check('El cierre UTC del día siguiente pasa al día anterior en Costa Rica',()=>assert.deepEqual(closingDayInCostaRica(data.closedAt),{year:'2026',month:'11',day:'20',monthName:'Noviembre'}));
  check('Se eliminan caracteres peligrosos del nombre de usuario',()=>{assert.equal(safeUsername('José Cajero /prueba'),'Jose_Cajero_prueba');assert.equal(safeUsername('../..\\usuario'),'usuario')});
  const cfg=await service.settings();
  check('Por defecto se utiliza Documentos de Windows',()=>assert.equal(cfg.directory,path.join(temporary,'Documentos','FacturaCR','Cierres de caja')));
  const written=await service.savePdf(data);
  check('Primer PDF se guarda en carpeta de Empresa/Año/Mes y contiene usuario y día',()=>{
   assert.equal(written.success,true);assert.equal(written.alreadyExists,false);
   assert.ok(written.path.includes(path.join('Empresa_17','2026','11-Noviembre')));
   assert.ok(written.path.endsWith('FacturaCR_Cierre_2026-11-20_Jose_Cajero_prueba_E17_Caja25.pdf'));
  });
  check('PDF guardado tiene bytes exactos del original',()=>{});
  assert.deepEqual(await fs.readFile(written.path),binary);
  const duplicate=await service.savePdf(data);
  check('Reintento idéntico no sobrescribe el archivo',()=>assert.equal(duplicate.alreadyExists,true));
  const conflicting=Buffer.from('%PDF-1.4\n% Archivo diferente\n%%EOF\n');
  await fs.writeFile(written.path,conflicting);
  await assert.rejects(service.savePdf(data),/No se sobrescribió/);
  check('Si existe otro PDF con mismo nombre, se preserva sin sobrescribir',()=>{});
  assert.deepEqual(await fs.readFile(written.path),conflicting);
  await assert.rejects(service.savePdf({...data,sha256:'a'.repeat(64)}),/no coincide/);
  check('Bloquea PDF que no coincide con SHA-256 archivado',()=>{});
  assert.throws(()=>decodeAndVerifyPdf(Buffer.from('javascript').toString('base64'),sha256),/PDF inválido|Archivo no reconocido/);
  check('No acepta contenido distinto de PDF',()=>{});
  const custom=path.join(temporary,'Cierre Personalizado');await fs.mkdir(custom);
  await service.setCustomDirectory(custom);
  const service2=createCashClosureFiles({documentsDir:path.join(temporary,'Documentos'),userDataDir:path.join(temporary,'AppData')});
  check('La carpeta elegida persiste en AppData',()=>{});
  assert.equal((await service2.settings()).directory,custom);
  const second=await service2.savePdf({...data,sessionId:26,closedAt:'2026-12-01 05:59:00',closingUsername:'cajero2'});
  check('Mes de diciembre en hora local usa Noviembre si aún no es medianoche',()=>assert.ok(second.path.includes(path.join('2026','11-Noviembre'))));
  await fs.rm(custom,{recursive:true,force:true});
  await assert.rejects(service2.savePdf({...data,sessionId:27}),/no está disponible/);
  check('Unidad externa desconectada no provoca cambio silencioso a Documentos',()=>{});
  await service2.useDefaultDirectory();
  const defaultAgain=await service2.settings();
  check('Se puede regresar a Documentos',()=>assert.equal(defaultAgain.mode,'default'));
  await assert.rejects(service.savePdf({...data,companyId:0}),/Identificador/);
  check('No permite ID de empresa o caja inválidos',()=>{});
  console.log(`QA 0.6.88 doble guardado local: ${n}/${n}`);
 }finally{await fs.rm(temporary,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
