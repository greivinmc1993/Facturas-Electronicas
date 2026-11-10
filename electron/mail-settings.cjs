// Preferencias SMTP locales cifradas usando Electron safeStorage (DPAPI en Windows).
// Nunca almacenar claves en SQLite, texto plano, registros, respaldos o el ZIP.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const BASENAME='smtp-settings.secure';
function createMailSettingsStore({dataDir,safeStorage}){
 if(!path.isAbsolute(dataDir))throw Error('Se requiere un directorio de usuario absoluto.');
 const filename=path.join(dataDir,BASENAME);
 const supported=()=>!!safeStorage?.isEncryptionAvailable?.()&&safeStorage?.getSelectedStorageBackend?.()!=='basic_text';
 const assertEncryption=()=>{if(!supported())throw Error('El cifrado seguro del sistema operativo no está disponible. No se guardarán claves SMTP sin cifrar.')};
 const read=()=>{
  if(!fs.existsSync(filename))return null;
  assertEncryption();
  const b64=fs.readFileSync(filename,'utf8');
  if(b64.length>12000||!/^[A-Za-z0-9+/=]+$/.test(b64))throw Error('La configuración SMTP cifrada está dañada.');
  const parsed=JSON.parse(safeStorage.decryptString(Buffer.from(b64,'base64')));
  if(!parsed||typeof parsed!=='object'||typeof parsed.password!=='string')throw Error('La configuración SMTP cifrada es inválida.');
  return parsed;
 };
 const write=cfg=>{
  assertEncryption();
  if(!cfg||typeof cfg.password!=='string'||!cfg.password)throw Error('Configuración SMTP incompleta.');
  const ciphertext=safeStorage.encryptString(JSON.stringify(cfg));
  const content=ciphertext.toString('base64');
  fs.mkdirSync(dataDir,{recursive:true});
  const tmp=filename+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(tmp,content,{mode:0o600,flag:'wx'});
   fs.renameSync(tmp,filename);
  }finally{try{fs.rmSync(tmp,{force:true})}catch{}}
 };
 const remove=()=>{if(fs.existsSync(filename))fs.rmSync(filename,{force:true})};
 return Object.freeze({supported,read,write,remove});
}
module.exports={createMailSettingsStore};
