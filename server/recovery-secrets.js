// v0.6.88: recuperación local sin SMTP ni cuentas ocultas.
// Solo se guardan verificadores SHA-256 de secretos generados con CSPRNG (>=192 bits).
import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const safeEquals=(left,right)=>{
  const a=Buffer.from(/^[0-9a-f]{64}$/i.test(String(left))?left:'0'.repeat(64),'hex');
  const b=Buffer.from(/^[0-9a-f]{64}$/i.test(String(right))?right:'f'.repeat(64),'hex');
  return timingSafeEqual(a,b);
};
export const newRecoveryCode=()=>`FCR2-${randomBytes(24).toString('hex').toUpperCase().match(/.{1,8}/g).join('-')}`;
export function normalizeRecoveryCode(value){
  if(typeof value!=='string'||value.length>95)return null;
  const v=value.replace(/[\s-]/g,'').toUpperCase();
  return /^FCR2[0-9A-F]{48}$/.test(v)?v:null;
}
export const recoveryCodeHash=code=>sha256(normalizeRecoveryCode(code)||'INVALID');
export function rotateRecoveryCodes(db,userId){
  const codes=Array.from({length:3},newRecoveryCode);
  db.prepare('DELETE FROM access_recovery_codes WHERE user_id=?').run(userId);
  const insert=db.prepare('INSERT INTO access_recovery_codes(user_id,slot,code_hash) VALUES (?,?,?)');
  codes.forEach((code,index)=>insert.run(userId,index+1,recoveryCodeHash(code)));
  // Una vez entregados los tres códigos nuevos, invalidar el antiguo código FCR1.
  db.prepare('DELETE FROM access_owner_recovery WHERE user_id=?').run(userId);
  return codes;
}
export const recoveryRemaining=(db,userId)=>db.prepare('SELECT COUNT(*) AS n FROM access_recovery_codes WHERE user_id=? AND used_at IS NULL').get(userId).n;
export function consumeRecoveryCode(db,userId,code){
  const normalized=normalizeRecoveryCode(code);
  if(!normalized)return false;
  const incoming=recoveryCodeHash(code);
  const rows=db.prepare('SELECT slot,code_hash FROM access_recovery_codes WHERE user_id=? AND used_at IS NULL').all(userId);
  const matched=rows.find(row=>safeEquals(incoming,row.code_hash));
  if(!matched)return false;
  return db.prepare('UPDATE access_recovery_codes SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND slot=? AND used_at IS NULL').run(userId,matched.slot).changes===1;
}
// Dos secretos independientes: un fragmento en archivo y otro impreso o guardado aparte.
// El archivo NO contiene contraseñas, claves privadas ni la segunda mitad del secreto.
export function newEmergencyKit(){
  const fileId=randomBytes(16).toString('hex');
  const fragment=randomBytes(32).toString('hex');
  const key=`FCRK-${randomBytes(32).toString('hex').toUpperCase().match(/.{1,8}/g).join('-')}`;
  const file={format:'FacturaCR-owner-kit-v1',fileId,fragment};
  return {fileId,fileContent:JSON.stringify(file,null,2)+'\n',fileName:'FacturaCR-Rescate.fcr',key,hash:sha256(`${fileId}:${fragment}:${key.replace(/[\s-]/g,'').toUpperCase()}`)};
}
export function rotateEmergencyKit(db,userId){
  const kit=newEmergencyKit();
  db.prepare(`INSERT INTO access_owner_emergency(user_id,file_id,verifier_hash) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET file_id=excluded.file_id,verifier_hash=excluded.verifier_hash,created_at=CURRENT_TIMESTAMP`).run(userId,kit.fileId,kit.hash);
  return {fileName:kit.fileName,fileContent:kit.fileContent,key:kit.key};
}
export function verifyEmergencyKit(db,userId,fileText,key){
  if(typeof fileText!=='string'||fileText.length>2048||typeof key!=='string'||key.length>128)return false;
  try{
    const file=JSON.parse(fileText);
    if(!file||Object.keys(file).sort().join(',')!=='fileId,format,fragment'||file.format!=='FacturaCR-owner-kit-v1'||
      !/^[0-9a-f]{32}$/.test(file.fileId)||!/^[0-9a-f]{64}$/.test(file.fragment))return false;
    const normalized=key.replace(/[\s-]/g,'').toUpperCase();
    if(!/^FCRK[0-9A-F]{64}$/.test(normalized))return false;
    const stored=db.prepare('SELECT file_id,verifier_hash FROM access_owner_emergency WHERE user_id=?').get(userId);
    return !!stored&&stored.file_id===file.fileId&&safeEquals(sha256(`${file.fileId}:${file.fragment}:${normalized}`),stored.verifier_hash);
  }catch{return false;}
}
