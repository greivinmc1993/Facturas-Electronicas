'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateDraftLocally,validateRequest,choosePythonError}=require('../electron/fe-xsd-desktop.cjs');
const base=path.resolve(__dirname,'..');
const FE='<?xml version="1.0"?><FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">100</FacturaElectronica>';
const asResponse=valid=>JSON.stringify({reports:[{documentType:'FE',validWithSuppliedSchema:valid,schemaFile:'FacturaElectronica_V4.4.xsd',schemaSHA256:'a'.repeat(64),xmlSHA256:'b'.repeat(64),preSignature:{status:valid?'NO_OTHER_XSD_ERRORS_DETECTED':'OTHER_XSD_ERRORS',signaturePresent:false,onlySignatureMissing:false,note:'Diagnóstico de ensayo'},errors:valid?[]:[{line:1,message:'Incorrecto'}]}]});
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('OK XSD escritorio:',name)};
async function run(){
 await check('Rechaza XML vacío',()=>assert.throws(()=>validateRequest('', 'FE'),/vacío/));
 await check('Limita ventana a borradores FE/TE',()=>assert.throws(()=>validateRequest('ok','NC'),/FE y TE/));
 await check('Bloquea XML mayores de 8MB',()=>assert.throws(()=>validateRequest('x'.repeat(8*1024*1024+1),'FE'),/8 MB/));
 await check('Ofrece instrucciones para lxml de MSYS2',()=>assert.match(choosePythonError({stderr:'ModuleNotFoundError: No module named lxml'}),/MSYS2/));
 await check('Detecta Python no disponible',()=>assert.match(choosePythonError({code:'ENOENT'}),/Python/));
 let lastTemp;
 const options={xml:FE,documentType:'FE',schemaDir:path.resolve(base,'tests'),pythonScript:path.resolve(base,'tests','qa-087-xsd-pareja.py')};
 let good;
 await check('Ejecuta sin shell y pasa el XML temporal al validador',async()=>{
  good=await validateDraftLocally({...options,run:async(_binary,args,config)=>{
   assert.equal(config.shell,false);
   assert.equal(args[args.indexOf('--fe-xml')+1].endsWith('FE-BORRADOR.xml'),true);
   lastTemp=path.dirname(args.at(-1));
   assert.equal(fs.readFileSync(args.at(-1),'utf8'),FE);
   return {stdout:asResponse(true)};
  }});
 });
 await check('Reporta coincidencia y hash SHA-256',()=>{assert.equal(good.status,'MATCHES_LOCAL_XSD');assert.equal(good.xsdSHA256.length,64)});
 await check('Elimina el XML temporal tras una prueba válida',()=>assert.equal(fs.existsSync(lastTemp),false));
 await check('Distingue el rechazo por XSD local',async()=>{
  const result=await validateDraftLocally({...options,run:async()=>{throw Object.assign(new Error('exit=1'),{code:1,stdout:asResponse(false)})}});
  assert.equal(result.status,'DOES_NOT_MATCH_LOCAL_XSD');assert.equal(result.errors[0].line,1);
 });
 await check('Distingue imposibilidad de validar un esquema inexistente',async()=>{
  const result=await validateDraftLocally({...options,run:async()=>{throw Object.assign(new Error('invalid'),{code:2,stdout:JSON.stringify({schemaStatus:'CANNOT_VALIDATE',error:'Falta XSD'})})}});
  assert.equal(result.status,'CANNOT_VALIDATE');assert.match(result.error,/Falta XSD/);
 });
 await check('Presenta falta de lxml sin afirmar coincidencia XSD',async()=>{
  const result=await validateDraftLocally({...options,run:async()=>{throw Object.assign(new Error('No module named lxml'),{code:2,stderr:'ModuleNotFoundError: No module named lxml'})}});
  assert.equal(result.status,'CANNOT_VALIDATE');assert.match(result.error,/pacman/);
 });
 const electron=fs.readFileSync(path.join(base,'electron/main.cjs'),'utf8');
 const preload=fs.readFileSync(path.join(base,'electron/preload.cjs'),'utf8');
 const ui=fs.readFileSync(path.join(base,'src/main.jsx'),'utf8');
 const css=fs.readFileSync(path.join(base,'src/style.css'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
 await check('IPC autoriza marco principal y exige selector de carpeta',()=>{
  assert.match(electron,/facturacr:validate-local-xsd/);
  assert.match(electron,/properties:\['openDirectory'\]/);
  assert.match(electron,/authorizedCertificateFrame\(event\)/);
 });
 await check('Preload y modal enseñan resultados XSD sin habilitar emisión',()=>{
  assert.match(preload,/facturacrXsd/);
  assert.match(ui,/Elegir carpeta XSD y validar borrador/);
  assert.match(ui,/xsdResult\.errors/);
  assert.match(ui,/xmldsig-core-schema\.xsd/);
  assert.match(css,/feXsdLocalPanel/);
 });
 await check('El paquete incluye el validador fuera de asar',()=>{
  assert.ok(pkg.build.files.includes('tests/qa-087-xsd-pareja.py'));
  assert.ok(pkg.build.asarUnpack.includes('tests/qa-087-xsd-pareja.py'));
  assert.match(JSON.stringify(pkg.scripts),/qa:xsd:desktop-real/);
 });
 console.log(`QA XSD escritorio (v0.6.92): ${checks}/${checks} controles aprobados con respuestas simuladas; sin XSD oficiales.`);
}
run().catch(err=>{console.error(err);process.exitCode=1});
