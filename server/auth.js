// Autenticación local v0.6.56: sin cuentas universales ni usuarios ocultos.
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {isValidIdleLockMinutes} from './access-schema.js';

const COOKIE='facturacr_session';
const TOKEN_TTL=12*60*60*1000;
const PASSWORD_MIN=12;
const LOGIN_DELAY_MAX=30*60*1000;
const sessions=new Map();
const failures=new Map();
const cookie=(value,age)=>`${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const tokenHash=v=>createHash('sha256').update(v).digest('hex');
export function passwordHash(password){
  if(typeof password!=='string'||password.length<PASSWORD_MIN||password.length>128||!/[A-Za-z]/.test(password)||!/\d/.test(password))
    throw Error('La contraseña debe tener entre 12 y 128 caracteres, letras y números.');
  const salt=randomBytes(24);
  const digest=scryptSync(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt$16384$${salt.toString('hex')}$${digest.toString('hex')}`;
}
export function verifyPassword(password,encoded){
  if(typeof password!=='string'||password.length>128)return false;
  const parts=String(encoded).split('$');
  if(parts.length!==4||parts[0]!=='scrypt'||parts[1]!=='16384'||!/^[0-9a-f]{48}$/.test(parts[2])||!/^[0-9a-f]{128}$/.test(parts[3]))return false;
  const expected=Buffer.from(parts[3],'hex');
  return timingSafeEqual(expected,scryptSync(password,Buffer.from(parts[2],'hex'),64,{N:16384,r:8,p:1}));
}
function localOriginOnly(req,res,next){
  const origin=req.get?.('origin');
  if(!origin)return next(); // Electron mismo origen, y herramientas locales sin Origin.
  try{
    const parsed=new URL(origin);
    if(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname))return next();
  }catch{}
  return res.status(403).json({error:'Origen no autorizado.'});
}
export function registerAuth(app,getDb){
  // Leer siempre la conexión SQLite vigente: restaurar respaldos la reemplaza.
  const db={prepare:(...args)=>getDb().prepare(...args),transaction:(fn)=>getDb().transaction(fn)};
  const ownerCount=()=>db.prepare('SELECT COUNT(*) AS n FROM access_users WHERE is_owner=1').get().n;
  const settings=()=>db.prepare('SELECT idle_lock_minutes,preserve_draft_on_lock FROM access_security_settings WHERE id=1').get();
  const credentials=req=>{
    const match=String(req.headers?.cookie||'').match(/(?:^|;\s*)facturacr_session=([a-f0-9]{64})(?:;|$)/);
    if(!match)return null;
    const key=tokenHash(match[1]),s=sessions.get(key);
    if(!s)return null;
    const now=Date.now(),idle=Number(settings().idle_lock_minutes);
    if(now>s.expires||idle>0&&now-s.lastActivity>idle*60000){sessions.delete(key);return null;}
    const user=db.prepare('SELECT id,username,display_name,is_owner,is_active FROM access_users WHERE id=?').get(s.userId);
    if(!user?.is_active){sessions.delete(key);return null;}
    return {key,session:s,user};
  };
  const publicState=()=>({setupRequired:ownerCount()===0,...settings()});
  const auth=(req,res)=>{const a=credentials(req);if(!a)return res.status(401).json({error:'Inicia sesión para continuar.',code:'AUTH_REQUIRED'});return a;};
  app.get('/api/auth/status',(req,res)=>{const a=credentials(req);res.setHeader('Cache-Control','no-store');res.json({...publicState(),authenticated:!!a,user:a?{id:a.user.id,username:a.user.username,displayName:a.user.display_name,isOwner:!!a.user.is_owner}:null});});
  app.post('/api/auth/setup',localOriginOnly,(req,res)=>{
    try{
      const username=String(req.body?.username||'').trim().toLowerCase();
      const displayName=String(req.body?.displayName||'').trim();
      if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)||displayName.length<2||displayName.length>160)throw Error('Usuario o nombre inválido.');
      const hash=passwordHash(req.body?.password);
      const id=db.transaction(()=>{
        if(ownerCount())throw Error('La cuenta propietaria ya fue configurada.');
        return Number(db.prepare(`INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required)
          VALUES (?,?,?,'scrypt',1,1,0)`).run(username,displayName,hash).lastInsertRowid);
      })();
      db.prepare(`INSERT INTO access_audit_log(user_id,event_type,object_type,object_id) VALUES (?,'auth.owner_setup','user',?)`).run(id,String(id));
      res.status(201).json({ok:true});
    }catch(e){res.status(400).json({error:e.message});}
  });
  app.post('/api/auth/login',localOriginOnly,(req,res)=>{
    const username=String(req.body?.username||'').trim().toLowerCase(),key=username.slice(0,80);
    const fail=failures.get(key)||{n:0,until:0};
    if(Date.now()<fail.until)return res.status(429).json({error:'Demasiados intentos. Inténtalo más tarde.'});
    const row=db.prepare('SELECT * FROM access_users WHERE username=? AND is_active=1').get(username);
    let valid=false;
    try{valid=!!row&&verifyPassword(req.body?.password,row.password_hash);}catch{}
    if(!valid){
      fail.n+=1;fail.until=Date.now()+Math.min(LOGIN_DELAY_MAX,Math.max(0,fail.n-4)*30000);
      failures.set(key,fail);
      return res.status(401).json({error:'Usuario o contraseña incorrectos.'});
    }
    failures.delete(key);
    const token=randomBytes(32).toString('hex');
    sessions.set(tokenHash(token),{userId:row.id,lastActivity:Date.now(),expires:Date.now()+TOKEN_TTL});
    res.setHeader('Set-Cookie',cookie(token,Math.ceil(TOKEN_TTL/1000)));
    res.json({ok:true,user:{id:row.id,username:row.username,displayName:row.display_name,isOwner:!!row.is_owner},...settings()});
  });
  app.post('/api/auth/logout',localOriginOnly,(req,res)=>{
    const a=credentials(req);if(a)sessions.delete(a.key);
    res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});
  });
  app.post('/api/auth/touch',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    a.session.lastActivity=Date.now();res.json({ok:true});
  });
  app.get('/api/auth/settings',(req,res)=>{const a=auth(req,res);if(!a?.session)return;res.json(settings());});
  app.put('/api/auth/settings',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner)return res.status(403).json({error:'Solo el propietario puede configurar la seguridad.'});
    const minutes=Number(req.body?.idle_lock_minutes);
    if(!isValidIdleLockMinutes(minutes))return res.status(400).json({error:'Tiempo de bloqueo inválido.'});
    db.prepare('UPDATE access_security_settings SET idle_lock_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(minutes);
    res.json(settings());
  });
  // Es obligatorio validar todas las rutas /api restantes en el SERVIDOR.
  // La política por roles y empresas se activará después, ANTES de crear usuarios subordinados.
  app.use('/api',(req,res,next)=>{
    if(req.path==='/health')return next();
    if(!ownerCount())return res.status(428).json({error:'Configura la cuenta propietaria antes de utilizar FacturaCR.',code:'OWNER_SETUP_REQUIRED'});
    const a=credentials(req);
    if(!a)return res.status(401).json({error:'Tu sesión está bloqueada o ha expirado.',code:'AUTH_REQUIRED'});
    if(!a.user.is_owner)return res.status(403).json({error:'Los permisos por empresa aún no están habilitados.'});
    req.authUser=a.user;
    next();
  });
  return {invalidateSessions:()=>sessions.clear()};
}
