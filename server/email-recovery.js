// v0.6.61: recuperación por correo individual para todos los roles.
// La identidad y los permisos no se cambian durante la recuperación.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {sendSecurityMail,isMailConfigured} from './email-smtp.js';
const VERIFY_MS=15*60*1000, RESET_MS=10*60*1000;
const requests=new Map();
const cleanUsername=value=>typeof value==='string'?value.trim().toLowerCase().slice(0,80):'';
const cleanEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validUsername=value=>/^[a-z0-9][a-z0-9._-]{2,79}$/.test(value);
const validEmail=value=>value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const newCode=()=>`FCR-MAIL-${randomBytes(9).toString('hex').toUpperCase().match(/.{1,6}/g).join('-')}`;
const normalized=value=>typeof value==='string'&&value.length<=45?value.trim().toUpperCase().replace(/[\s-]/g,''):'';
const codeMatches=(code,expected)=>{
 const test=normalized(code),valid=/^FCRMAIL[0-9A-F]{18}$/.test(test);
 const a=Buffer.from(hash(valid?test:''),'hex');
 const b=Buffer.from(/^[0-9a-f]{64}$/.test(String(expected))?expected:'0'.repeat(64),'hex');
 return valid&&timingSafeEqual(a,b);
};
function limit(key,max,period){
 const now=Date.now();const row=requests.get(key);
 if(!row||now>=row.until){if(requests.size>2000)requests.clear();requests.set(key,{n:1,until:now+period});return false;}
 row.n++;return row.n>max;
}
export function registerEmailRecovery(app,{db,auth,localOriginOnly,audit,verifyPassword,passwordHash,revokeUserSessions,mailer=sendSecurityMail,mailConfigured=isMailConfigured}){
 // Solo cuentas activas: el código pertenece siempre al user_id, NO al rol.
 // No se permite registrar el correo de otra cuenta ni modificar permisos por esta vía.
 const eligible=user=>Number.isSafeInteger(user?.id)&&user.id>0&&user.is_active===1;
 const record=id=>db.prepare('SELECT email,verified FROM access_user_emails WHERE user_id=?').get(id);
 const token=(id,kind)=>db.prepare('SELECT code_hash,pending_email,expires_at,attempts FROM access_email_tokens WHERE user_id=? AND purpose=?').get(id,kind);
 const store=(id,kind,code,email,ttl)=>db.prepare(`INSERT INTO access_email_tokens(user_id,purpose,code_hash,pending_email,expires_at,attempts)
   VALUES(?,?,?,?,?,0) ON CONFLICT(user_id,purpose) DO UPDATE SET code_hash=excluded.code_hash,pending_email=excluded.pending_email,expires_at=excluded.expires_at,attempts=0,created_at=CURRENT_TIMESTAMP`).run(id,kind,hash(normalized(code)),email,Date.now()+ttl);
 const checkCode=(id,kind,provided)=>{
  const t=token(id,kind);
  if(!t||t.expires_at<Date.now()||t.attempts>=5)return null;
  if(!codeMatches(provided,t.code_hash)){
    db.prepare('UPDATE access_email_tokens SET attempts=attempts+1 WHERE user_id=? AND purpose=?').run(id,kind);
    return null;
  }
  return t;
 };
 const failNotAllowed=(req,res)=>{
  const a=auth(req,res);if(!a?.session)return null;
  if(a.user.password_change_required)return res.status(403).json({error:'Cambia primero tu contraseña temporal.'});
  if(!eligible(a.user))return res.status(403).json({error:'Esta cuenta no está habilitada para recuperar su acceso.'});
  return a;
 };
 app.get('/api/auth/email/status',(req,res)=>{
   const a=auth(req,res);if(!a?.session)return;
   res.setHeader('Cache-Control','no-store');
   const can=eligible(a.user);
   const row=can?record(a.user.id):null;
   res.json({eligible:can,configured:mailConfigured(),email:row?.email||'',verified:!!row?.verified});
 });
 app.post('/api/auth/email/verification/request',localOriginOnly,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const a=failNotAllowed(req,res);if(!a?.session)return;
  if(!mailConfigured())return res.status(503).json({error:'El servicio de correo no está configurado.'});
  const email=cleanEmail(req.body?.email);
  if(!validEmail(email))return res.status(400).json({error:'Escribe un correo electrónico válido.'});
  if(limit(`verify:${a.user.id}`,4,60*60*1000))return res.status(429).json({error:'Demasiadas solicitudes de verificación. Intenta más tarde.'});
  const user=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
  if(!verifyPassword(req.body?.password,user?.password_hash))return res.status(403).json({error:'Contraseña incorrecta.'});
  const used=db.prepare('SELECT user_id FROM access_user_emails WHERE email=? AND verified=1 AND user_id<>?').get(email,a.user.id);
  if(used)return res.status(409).json({error:'Ese correo ya está asociado a una cuenta verificada.'});
  const code=newCode();
  // Guardar antes del envío: si el proveedor falla, se elimina el token de esa petición.
  store(a.user.id,'verify',code,email,VERIFY_MS);
  try{
   await mailer({to:email,subject:'FacturaCR: verifica tu correo',body:`Solicitaste registrar este correo como método de recuperación de FacturaCR.\n\nCódigo: ${code}\n\nVálido durante 15 minutos. Si no lo solicitaste, ignora este mensaje. Nunca compartas el código.`});
   audit(a.user.id,'auth.email_verification_requested','user',a.user.id);
   res.json({ok:true,message:'Enviamos un código a la dirección indicada. Revisa tu correo.'});
  }catch{
   db.prepare('DELETE FROM access_email_tokens WHERE user_id=? AND purpose=? AND code_hash=?').run(a.user.id,'verify',hash(normalized(code)));
   res.status(502).json({error:'No se pudo enviar el correo. Revisa la configuración SMTP.'});
  }
 });
 app.post('/api/auth/email/verification/confirm',localOriginOnly,(req,res)=>{
  const a=failNotAllowed(req,res);if(!a?.session)return;
  const found=checkCode(a.user.id,'verify',req.body?.code);
  if(!found)return res.status(403).json({error:'Código incorrecto, agotado o vencido.'});
  try{
   db.transaction(()=>{
    const latest=token(a.user.id,'verify');
    if(!latest||latest.code_hash!==found.code_hash||latest.expires_at<Date.now()||!codeMatches(req.body?.code,latest.code_hash))throw Error('Código utilizado o vencido.');
    db.prepare(`INSERT INTO access_user_emails(user_id,email,verified,verified_at)
      VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified=1,verified_at=CURRENT_TIMESTAMP`).run(a.user.id,found.pending_email);
    db.prepare('DELETE FROM access_email_tokens WHERE user_id=?').run(a.user.id);
    audit(a.user.id,'auth.email_verified','user',a.user.id);
   })();
   revokeUserSessions(a.user.id,a.key);
   res.json({ok:true});
  }catch{res.status(409).json({error:'No se pudo verificar el correo. Solicita un código nuevo.'});}
 });
 // Respuesta pública uniforme: nunca revela si una cuenta/correo existe o tiene un rol concreto.
 app.post('/api/auth/email/recovery/request',localOriginOnly,async(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   if(!mailConfigured())return res.status(503).json({error:'La recuperación por correo no está configurada.'});
   const username=cleanUsername(req.body?.username);
   const message={ok:true,message:'Si existe una cuenta autorizada con correo verificado, recibirá instrucciones.'};
   if(!validUsername(username)||limit(`reset:${username}`,3,60*60*1000))return res.json(message);
   const user=db.prepare('SELECT id,is_owner,is_active,password_change_required FROM access_users WHERE username=?').get(username);
   const email=eligible(user)?record(user.id):null;
   if(!email?.verified)return res.json(message);
   const code=newCode();store(user.id,'reset',code,email.email,RESET_MS);
   // Envío asíncrono para que el tiempo de respuesta pública no permita
   // distinguir cuentas registradas de nombres inexistentes.
   void Promise.resolve().then(()=>mailer({to:email.email,subject:'FacturaCR: recuperación de contraseña',body:`Recibimos una solicitud de recuperación de FacturaCR para ${username}.\n\nCódigo: ${code}\n\nVálido por 10 minutos y para un solo uso. Si no lo solicitaste, ignora el mensaje. Nunca compartas el código.`}))
     .then(()=>audit(user.id,'auth.email_recovery_requested','user',user.id))
     .catch(()=>{try{db.prepare('DELETE FROM access_email_tokens WHERE user_id=? AND purpose=? AND code_hash=?').run(user.id,'reset',hash(normalized(code)));}catch{/* La prueba o la app puede haberse cerrado. */}});
   return res.json(message);
 });
 app.post('/api/auth/email/recovery/reset',localOriginOnly,(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   const username=cleanUsername(req.body?.username);
   const failure=()=>res.status(403).json({error:'Código inválido o vencido, o cuenta no autorizada.'});
   if(!validUsername(username)||limit(`confirm:${username}`,10,15*60*1000))return failure();
   const user=db.prepare('SELECT id,is_owner,is_active FROM access_users WHERE username=?').get(username);
   if(!user?.is_active||!eligible(user)||!record(user.id)?.verified)return failure();
   // Un código ajeno nunca será aceptado: se verifica contra el user_id
   // resuelto desde el username exacto, no contra un correo ni un rol arbitrarios.
   const found=checkCode(user.id,'reset',req.body?.code);
   if(!found)return failure();
   let newHash;
   try{newHash=passwordHash(req.body?.newPassword);}catch(e){return res.status(400).json({error:e.message});}
   try{
    db.transaction(()=>{
     const latest=token(user.id,'reset');
     if(!latest||latest.code_hash!==found.code_hash||latest.expires_at<Date.now()||!codeMatches(req.body?.code,latest.code_hash))throw Error('Código utilizado o vencido.');
     db.prepare('UPDATE access_users SET password_hash=?,password_change_required=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newHash,user.id);
     db.prepare('DELETE FROM access_email_tokens WHERE user_id=?').run(user.id);
     audit(user.id,'auth.email_password_recovered','user',user.id);
    })();
    revokeUserSessions(user.id);
    res.json({ok:true,message:'Contraseña actualizada. Inicia sesión con tu nueva clave.'});
   }catch{return failure();}
 });
}
