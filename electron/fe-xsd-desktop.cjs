'use strict';
// v0.6.90. Laboratorio local de comprobación XSD sin conectarse a Hacienda.
// El renderer aporta únicamente un borrador ya autorizado por la API y su tipo;
// la carpeta XSD se elige con el diálogo nativo. No se reciben rutas arbitrarias.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const runFile=promisify(execFile);
const DOCUMENT_TYPES=new Set(['FE','TE']);
const MAX_XML_BYTES=8*1024*1024;
const MAX_REPORT_BYTES=512*1024;
const TIMEOUT_MS=20000;

function validateRequest(xml,documentType){
 if(!DOCUMENT_TYPES.has(documentType))throw Error('Tipo de documento inválido: solo FE y TE están disponibles en esta ventana.');
 if(typeof xml!=='string'||!xml.trim()||Buffer.byteLength(xml,'utf8')>MAX_XML_BYTES)
  throw Error('El XML de prueba está vacío o supera el límite de 8 MB.');
}
function choosePythonError(error){
 const raw=String(error?.stderr||error?.message||'').trim();
 try{const parsed=JSON.parse(raw);if(typeof parsed.error==='string')return parsed.error.slice(0,1200)}catch{}
 if(/No module named ['"]?lxml|ModuleNotFoundError.*lxml/i.test(raw))
  return 'Python funciona pero falta lxml. En MSYS2 UCRT64: C:\\msys64\\usr\\bin\\pacman.exe -S mingw-w64-ucrt-x86_64-python-lxml. En Python convencional: python -m pip install lxml.';
 if(error?.code==='ENOENT')return 'No se encontró Python. Instala Python con lxml o añade el ejecutable python al PATH de Windows.';
 if(error?.killed||error?.code==='ETIMEDOUT')return 'Se agotó el tiempo de validación XSD (20 segundos).';
 return raw.slice(0,1400)||'No se pudo ejecutar el validador XSD local.';
}
// La ejecución es sin shell, sin red, en un directorio temporal que se elimina al terminar.
async function validateDraftLocally({xml,documentType,schemaDir,pythonScript,run=runFile}){
 validateRequest(xml,documentType);
 if(typeof schemaDir!=='string'||!path.isAbsolute(schemaDir))throw Error('Primero selecciona una carpeta de esquemas XSD local.');
 if(typeof pythonScript!=='string'||!path.isAbsolute(pythonScript))throw Error('No se localizó el validador empaquetado.');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'facturacr-xsd-'));
 const source=path.join(temp,`${documentType}-BORRADOR.xml`);
 try{
  await fs.writeFile(source,xml,{encoding:'utf8',mode:0o600,flag:'wx'});
  const option=documentType==='FE'?'--fe-xml':'--te-xml';
  const args=[pythonScript,'--schema-dir',schemaDir,'--schema-root',schemaDir,option,source];
  const runners=process.platform==='win32'?[['python',args],['py',['-3',...args]]]:[['python3',args],['python',args]];
  let stdout='',exitCode=2,lastError=null;
  for(const [binary,binaryArgs] of runners){
   try{
    const result=await run(binary,binaryArgs,{timeout:TIMEOUT_MS,maxBuffer:MAX_REPORT_BYTES,windowsHide:true,shell:false});
    stdout=result.stdout;exitCode=0;lastError=null;break;
   }catch(error){
    if(error.code==='ENOENT'){lastError=error;continue}
    stdout=error.stdout||'';exitCode=Number.isInteger(error.code)?error.code:2;lastError=error;
    break;
   }
  }
  if(!stdout.trim())return {status:'CANNOT_VALIDATE',error:choosePythonError(lastError)};
  let parsed;
  try{parsed=JSON.parse(stdout)}catch{
   return {status:'CANNOT_VALIDATE',error:choosePythonError(lastError)||'El validador no devolvió JSON.'};
  }
  if(exitCode===2||!Array.isArray(parsed.reports)||parsed.reports.length!==1)
   return {status:'CANNOT_VALIDATE',error:parsed.error||choosePythonError(lastError)};
  const report=parsed.reports[0];
  if(report.documentType!==documentType||typeof report.validWithSuppliedSchema!=='boolean')
   return {status:'CANNOT_VALIDATE',error:'La respuesta del validador no coincide con el tipo de borrador.'};
  if(![0,1].includes(exitCode) || (exitCode===0)!==report.validWithSuppliedSchema)
   return {status:'CANNOT_VALIDATE',error:'Resultado incongruente del validador XSD.'};
  return {
   status:report.validWithSuppliedSchema?'MATCHES_LOCAL_XSD':'DOES_NOT_MATCH_LOCAL_XSD',
   documentType,
   xsdFile:report.schemaFile,
   xsdSHA256:report.schemaSHA256,
   xmlSHA256:report.xmlSHA256,
   localXmlDsigMapping:report.localXmlDsigMapping===true,
   dependenciesSHA256:report.dependenciesSHA256||{},
   errors:Array.isArray(report.errors)?report.errors.slice(0,40):[],
   warning:'Solo se compara con el XSD elegido. Su origen y vigencia NO están verificados. El borrador no está firmado, usa claves ficticias y NO es un comprobante válido ante Hacienda.'
  };
 }finally{
  await fs.rm(temp,{recursive:true,force:true});
 }
}
module.exports={validateDraftLocally,validateRequest,choosePythonError};
