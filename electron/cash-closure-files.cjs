// Archivo adicional de cierres: se guarda FUERA de SQLite, pero solo a partir del
// documento PDF inmutable leído desde una ruta autenticada de FacturaCR.
// El proceso de renderer nunca controla rutas de archivos ni carpetas.
'use strict';
const fsDefault=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const validId=id=>Number.isSafeInteger(id)&&id>0;
function closingDayInCostaRica(value){
 // SQLite guarda CURRENT_TIMESTAMP en UTC y no incluye sufijo Z.
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value))throw Error('Fecha de cierre UTC inválida.');
 const stamp=new Date(value.replace(' ','T')+'Z');
 if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,19)!==value.replace(' ','T'))throw Error('Fecha de cierre inválida.');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(stamp).map(p=>[p.type,p.value]));
 return {year:parts.year,month:parts.month,day:parts.day,monthName:MONTHS[Number(parts.month)-1]};
}
function safeUsername(value){
 // Solo el nombre de la cuenta, nunca contraseña, cédula ni tokens.
 const clean=String(value||'usuario').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);
 return clean||'usuario';
}
function decodeAndVerifyPdf(pdfBase64,sha256){
 if(typeof pdfBase64!=='string'||pdfBase64.length<40||pdfBase64.length>1700000||!/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64))throw Error('PDF inválido o demasiado grande.');
 if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/i.test(sha256))throw Error('Falta la huella SHA-256 del PDF archivado.');
 const bytes=Buffer.from(pdfBase64,'base64');
 if(bytes.length<30||bytes.length>1200000||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-2048).toString('latin1').includes('%%EOF'))throw Error('Archivo no reconocido como PDF.');
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==sha256.toLowerCase())throw Error('El PDF no coincide con el archivado en SQLite.');
 return bytes;
}
function createCashClosureFiles({documentsDir,userDataDir,fs=fsDefault}){
 if(!path.isAbsolute(documentsDir)||!path.isAbsolute(userDataDir))throw Error('Las rutas base deben ser absolutas.');
 const defaultRoot=path.join(documentsDir,'FacturaCR','Cierres de caja');
 const settingsFile=path.join(userDataDir,'cash-closure-folder.json');
 async function settings(){
  let value={mode:'default'};
  try{
   const saved=JSON.parse(await fs.readFile(settingsFile,'utf8'));
   if(saved?.mode==='custom'&&typeof saved.directory==='string'&&path.isAbsolute(saved.directory)&&!saved.directory.includes('\0'))value={mode:'custom',directory:saved.directory};
  }catch(e){if(e.code!=='ENOENT'&&e.name!=='SyntaxError')throw e;}
  return {mode:value.mode,directory:value.mode==='custom'?value.directory:defaultRoot,defaultDirectory:defaultRoot};
 }
 async function saveSettings(value){
  await fs.mkdir(userDataDir,{recursive:true});
  const temporary=settingsFile+'.tmp-'+process.pid;
  try{await fs.writeFile(temporary,JSON.stringify(value)+'\n',{mode:0o600,flag:'w'});await fs.rename(temporary,settingsFile)}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{})}
  return settings();
 }
 async function setCustomDirectory(directory){
  if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.includes('\0'))throw Error('Selecciona una carpeta absoluta válida.');
  if(!(await fs.stat(directory)).isDirectory())throw Error('La ubicación seleccionada no es una carpeta.');
  return saveSettings({mode:'custom',directory});
 }
 async function useDefaultDirectory(){return saveSettings({mode:'default'});}
 async function destination(companyId,sessionId,closedAt,closingUsername){
  if(!validId(companyId)||!validId(sessionId))throw Error('Identificador de cierre inválido.');
  const d=closingDayInCostaRica(closedAt),cfg=await settings();
  const directory=path.join(cfg.directory,`Empresa_${companyId}`,d.year,`${d.month}-${d.monthName}`);
  const filename=`FacturaCR_Cierre_${d.year}-${d.month}-${d.day}_${safeUsername(closingUsername)}_E${companyId}_Caja${sessionId}.pdf`;
  return {root:cfg.directory,mode:cfg.mode,directory,filename,filePath:path.join(directory,filename)};
 }
 async function savePdf({companyId,sessionId,closedAt,closingUsername,pdfBase64,sha256}){
  const file=await destination(companyId,sessionId,closedAt,closingUsername);
  const bytes=decodeAndVerifyPdf(pdfBase64,sha256);
  // Una unidad USB desconectada NUNCA redirige silenciosamente la copia a Documentos.
  if(file.mode==='custom'&&!(await fs.stat(file.root).catch(()=>null))?.isDirectory())throw Error('La carpeta personalizada no está disponible. Conecta la unidad o selecciona otra carpeta.');
  await fs.mkdir(file.directory,{recursive:true});
  let handle;
  try{handle=await fs.open(file.filePath,'wx',0o600)}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   const existing=await fs.readFile(file.filePath);
   if(existing.equals(bytes))return {success:true,alreadyExists:true,path:file.filePath,directory:file.directory};
   throw Error('Ya existe un PDF distinto con ese nombre. No se sobrescribió el archivo.');
  }
  try{await handle.writeFile(bytes);await handle.sync()}
  catch(e){await handle.close().catch(()=>{});await fs.rm(file.filePath,{force:true}).catch(()=>{});throw e}
  await handle.close();
  return {success:true,alreadyExists:false,path:file.filePath,directory:file.directory};
 }
 return {settings,setCustomDirectory,useDefaultDirectory,destination,savePdf};
}
module.exports={createCashClosureFiles,closingDayInCostaRica,safeUsername,decodeAndVerifyPdf};
