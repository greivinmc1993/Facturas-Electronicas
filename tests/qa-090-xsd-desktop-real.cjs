'use strict';
// Integración de la pasarela Node -> Python+lxml con XSD generado en directorio temporal.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {validateDraftLocally}=require('../electron/fe-xsd-desktop.cjs');
const NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/';
const TYPES={FE:['FacturaElectronica','facturaElectronica'],TE:['TiqueteElectronico','tiqueteElectronico']};
async function main(){
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'facturacr-090-qa-'));
 try{
  for(const [kind,[root,nsName]] of Object.entries(TYPES)){
   const ns=NAMESPACE+nsName;
   const xsd=`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="${ns}" elementFormDefault="qualified"><xs:element name="${root}" type="xs:integer"/></xs:schema>`;
   await fs.writeFile(path.join(d,root+'_V4.4.xsd'),xsd);
   const params={documentType:kind,schemaDir:d,pythonScript:path.resolve(__dirname,'qa-087-xsd-pareja.py')};
   const positive=await validateDraftLocally({...params,xml:`<${root} xmlns="${ns}">100</${root}>`});
   assert.equal(positive.status,'MATCHES_LOCAL_XSD',JSON.stringify(positive));
   const negative=await validateDraftLocally({...params,xml:`<${root} xmlns="${ns}">abc</${root}>`});
   assert.equal(negative.status,'DOES_NOT_MATCH_LOCAL_XSD',JSON.stringify(negative));
   assert.ok(negative.errors.length>0);
  }
  await fs.rm(path.join(d,'TiqueteElectronico_V4.4.xsd'));
  const missing=await validateDraftLocally({documentType:'TE',schemaDir:d,pythonScript:path.resolve(__dirname,'qa-087-xsd-pareja.py'),xml:`<TiqueteElectronico xmlns="${NAMESPACE}tiqueteElectronico">100</TiqueteElectronico>`});
  assert.equal(missing.status,'CANNOT_VALIDATE',JSON.stringify(missing));
  console.log('QA v0.6.90 puente Node/Python+lxml: 5/5 ensayos con XSD SINTÉTICOS. No acredita esquema oficial.');
 }finally{await fs.rm(d,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
