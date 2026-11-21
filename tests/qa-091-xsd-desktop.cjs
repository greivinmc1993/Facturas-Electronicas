'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateDraftLocally}=require('../electron/fe-xsd-desktop.cjs');
const base=path.resolve(__dirname,'..');
const NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica';
const xml=`<FacturaElectronica xmlns="${NAMESPACE}"/>`;
const options={xml,documentType:'FE',schemaDir:base,pythonScript:path.join(base,'tests','qa-087-xsd-pareja.py')};
const response=status=>JSON.stringify({reports:[{documentType:'FE',validWithSuppliedSchema:false,
 schemaFile:'FacturaElectronica_V4.4.xsd',schemaSHA256:'a'.repeat(64),xmlSHA256:'b'.repeat(64),
 errors:[{line:1,message:'Signature pendiente'}],preSignature:{status,
 signaturePresent:false,onlySignatureMissing:status==='ONLY_SIGNATURE_PENDING',note:'Ensayo controlado'}}]});
(async()=>{
 const only=await validateDraftLocally({...options,run:async()=>{throw Object.assign(Error('exit'),{code:1,stdout:response('ONLY_SIGNATURE_PENDING')})}});
 assert.equal(only.status,'DOES_NOT_MATCH_LOCAL_XSD');
 assert.equal(only.preSignature.status,'ONLY_SIGNATURE_PENDING');
 assert.equal(only.preSignature.onlySignatureMissing,true);
 const other=await validateDraftLocally({...options,run:async()=>{throw Object.assign(Error('exit'),{code:1,stdout:response('OTHER_XSD_ERRORS')})}});
 assert.equal(other.preSignature.status,'OTHER_XSD_ERRORS');
 assert.equal(other.preSignature.onlySignatureMissing,false);
 const ui=fs.readFileSync(path.join(base,'src/main.jsx'),'utf8');
 const py=fs.readFileSync(path.join(base,'tests/qa-087-xsd-pareja.py'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
 assert.match(ui,/ONLY_SIGNATURE_PENDING/);
 assert.match(ui,/Validación XSD completa/);
 assert.match(ui,/no elimina la obligación de validar el XML firmado completo/);
 assert.match(py,/signature_present = any\(child\.tag == signature_tag/);
 assert.match(py,/only_missing_signature = \(len\(errors\) == 1/);
 assert.match(py,/valid = schema.validate\(xml_doc\)/);
 assert.equal(pkg.version,'0.6.93');
 assert.match(JSON.stringify(pkg.scripts),/qa:xsd:pre-sign/);
 console.log('QA v0.6.92 puente + interfaz previo a firma: 13/13 comprobaciones locales; sin XSD oficiales.');
})().catch(e=>{console.error(e);process.exitCode=1});
