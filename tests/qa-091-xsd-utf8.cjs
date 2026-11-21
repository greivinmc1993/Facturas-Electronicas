'use strict';
// Regresión UTF-8 en Windows/MSYS2: conserva las tildes de la salida Python.
const assert=require('node:assert/strict');
const path=require('node:path');
const {validateDraftLocally}=require('../electron/fe-xsd-desktop.cjs');
(async()=>{
 const expected='El único error XSD comunicado es la ausencia de Signature. No equivale a una validación fiscal completa.';
 const payload={reports:[{documentType:'FE',validWithSuppliedSchema:false,
  schemaFile:'FacturaElectronica_V4.4.xsd',schemaSHA256:'a'.repeat(64),xmlSHA256:'b'.repeat(64),
  errors:[{line:3,message:'Elemento inválido: Información'}],
  preSignature:{status:'ONLY_SIGNATURE_PENDING',signaturePresent:false,onlySignatureMissing:true,note:expected}}]};
 let invoked=false;
 const result=await validateDraftLocally({
  xml:'<FacturaElectronica/>',documentType:'FE',schemaDir:path.resolve('.'),
  pythonScript:path.resolve('tests/qa-087-xsd-pareja.py'),
  run:async(binary,args,options)=>{
   invoked=true;
   assert.equal(options.env.PYTHONIOENCODING,'utf-8');
   assert.equal(options.env.PYTHONUTF8,'1');
   assert.equal(options.encoding,'utf8');
   assert.equal(options.shell,false);
   throw Object.assign(new Error('XML inválido como se esperaba'),{code:1,stdout:JSON.stringify(payload)});
  }
 });
 assert.equal(invoked,true);
 assert.equal(result.status,'DOES_NOT_MATCH_LOCAL_XSD');
 assert.equal(result.preSignature.note,expected);
 assert.equal(result.errors[0].message,'Elemento inválido: Información');
 console.log('QA v0.6.92 UTF-8 XSD: configuración del proceso Python y acentos conservados.');
})().catch(e=>{console.error(e);process.exitCode=1});
