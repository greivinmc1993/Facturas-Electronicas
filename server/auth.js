// Autenticación local v0.6.56: sin cuentas universales ni usuarios ocultos.
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {isValidIdleLockMinutes,ACCESS_ROLES,defaultPermissionsFor} from './access-schema.js';
import {registerEmailRecovery} from './email-recovery.js';
import {isMailConfigured,sendSecurityMail} from './email-smtp.js';
import {registerMailAdmin} from './mail-admin.js';

const COOKIE='facturacr_session';
const TOKEN_TTL=12*60*60*1000;
const PASSWORD_MIN=12;
const LOGIN_DELAY_MAX=30*60*1000;
const sessions=new Map();
const failures=new Map();
const recoveryFailures=new Map();
const RECOVERY_CODE_BYTES=24; // 192 bits aleatorios; imposible inferirlo de los datos SQLite.
const RECOVERY_LIMIT=6;
const RECOVERY_WINDOW=15*60*1000;
const recoveryFormat=raw=>'FCR1-'+raw.match(/.{1,8}/g).join('-');
function newRecoveryCode(){return recoveryFormat(randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase());}
function normalizedRecoveryCode(value){
 if(typeof value!=='string'||value.length>90)return null;
 const normalized=value.trim().toUpperCase().replace(/[-\s]/g,'');
 return /^FCR1[0-9A-F]{48}$/.test(normalized)?normalized:null;
}
function recoveryHash(value){return tokenHash(value);}
function recoveryMatches(value,expected){
 const normalized=normalizedRecoveryCode(value);
 const supplied=Buffer.from(recoveryHash(normalized||''),'hex');
 const stored=Buffer.from(/^[0-9a-f]{64}$/.test(String(expected))?expected:'0'.repeat(64),'hex');
 return !!normalized&&timingSafeEqual(supplied,stored);
}

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
export function registerAuth(app,getDb,options={}){
  // Leer siempre la conexión SQLite vigente: restaurar respaldos la reemplaza.
  const db={prepare:(...args)=>getDb().prepare(...args),transaction:(fn)=>getDb().transaction(fn)};
  const ownerCount=()=>db.prepare('SELECT COUNT(*) AS n FROM access_users WHERE is_owner=1').get().n;
  const saveRecovery=(userId,code)=>db.prepare(`INSERT INTO access_owner_recovery(user_id,code_hash)
    VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, created_at=CURRENT_TIMESTAMP`)
    .run(userId,recoveryHash(normalizedRecoveryCode(code)));
  const ownerResetAttempts=new Map(); // Solo limita errores de reautenticación; no registra contraseñas.
  const revokeUserSessions=(userId,exceptKey=null)=>{
    for(const [key,s] of sessions)if(s.userId===userId&&key!==exceptKey)sessions.delete(key);
  };

  const settings=()=>db.prepare('SELECT idle_lock_minutes,preserve_draft_on_lock FROM access_security_settings WHERE id=1').get();
  const credentials=req=>{
    const match=String(req.headers?.cookie||'').match(/(?:^|;\s*)facturacr_session=([a-f0-9]{64})(?:;|$)/);
    if(!match)return null;
    const key=tokenHash(match[1]),s=sessions.get(key);
    if(!s)return null;
    const now=Date.now(),idle=Number(settings().idle_lock_minutes);
    if(now>s.expires||idle>0&&now-s.lastActivity>idle*60000){sessions.delete(key);return null;}
    const user=db.prepare('SELECT id,username,display_name,is_owner,is_active,password_change_required FROM access_users WHERE id=? AND is_deleted=0').get(s.userId);
    if(!user?.is_active){sessions.delete(key);return null;}
    return {key,session:s,user};
  };
  const smtpConfigured=options.mailConfigured||(()=>{try{return options.mailStore?!!options.mailStore.read():isMailConfigured()}catch{return false}});
  const smtpMailer=options.sendMail||((mail,cfg)=>sendSecurityMail(mail,cfg||options.mailStore?.read()));
  const publicState=()=>({setupRequired:ownerCount()===0,emailRecoveryAvailable:smtpConfigured(),...settings()});
  const userCompanies=userId=>db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=?').all(userId);
  const delegatedCashiers=user=>user.is_owner?[]:db.prepare("SELECT r.company_id FROM access_company_roles r JOIN access_permission_overrides o ON o.user_id=r.user_id AND o.company_id=r.company_id AND o.permission='users.manage_cashiers' AND o.allowed=1 WHERE r.user_id=? AND r.role='supervisor'").all(user.id).map(x=>x.company_id);
  const displayUser=user=>({id:user.id,username:user.username,displayName:user.display_name,isOwner:!!user.is_owner,passwordChangeRequired:!!user.password_change_required,companies:user.is_owner?[]:userCompanies(user.id),delegatedCashierCompanies:delegatedCashiers(user)});
  const audit=(userId,type,objectType='',objectId='',companyId=null)=>db.prepare('INSERT INTO access_audit_log(user_id,company_id,event_type,object_type,object_id) VALUES (?,?,?,?,?)').run(userId,companyId,type,objectType,String(objectId));
  function can(user,companyId,permission){
    if(user.is_owner)return true;
    const assignment=db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=?').get(user.id,companyId);
    if(!assignment)return false;
    const override=db.prepare('SELECT allowed FROM access_permission_overrides WHERE user_id=? AND company_id=? AND permission=?').get(user.id,companyId,permission);
    if(override)return !!override.allowed;
    return defaultPermissionsFor(assignment.role).includes(permission);
  }
  // Política de denegación predeterminada: las rutas sin clasificación NO quedan abiertas.
  function permissionFor(method,relative,body={}){
    const p=relative;
    const reqMovementPermission=body?.movement_type==='entrada'?'inventory.receive':body?.movement_type==='ajuste'?'inventory.count':'inventory.adjust';
    if(method==='GET'&&p==='/companies')return 'companies.list';
    if(method==='GET'&&p==='/geography')return 'companies.list';
    if(/^\/companies\/\d+\/sales\/draft(?:\/beacon)?$/.test(p))return ['GET','PUT','DELETE','POST'].includes(method)?'sales.create':null;
    if(/^\/companies\/\d+\/sales$/.test(p))return method==='POST'?'sales.create':method==='GET'?'sales.read_all':null;
    if(/^\/companies\/\d+\/sales\/\d+$/.test(p)&&method==='GET')return 'sales.read_all';
    if(/^\/companies\/\d+\/products$/.test(p))return method==='GET'?'inventory.read':method==='POST'?'inventory.manage':null;
    if(/^\/companies\/\d+\/clients$/.test(p))return method==='GET'?'clients.manage':method==='POST'?'clients.manage':null;
    if(/^\/companies\/\d+\/quotations(?:\/\d+)?$/.test(p))return method==='GET'?'quotations.manage':method==='POST'||method==='PUT'?'quotations.manage':method==='DELETE'?'quotations.delete':null;
    if(/^\/companies\/\d+\/products\/\d+$/.test(p))return method==='PUT'?'inventory.manage':method==='DELETE'?'inventory.delete':null;
    if(/^\/companies\/\d+\/clients\/\d+$/.test(p))return method==='PUT'?'clients.manage':method==='DELETE'?'clients.delete':null;
    if(/^\/companies\/\d+\/sales\/\d+\/payments$/.test(p)&&method==='POST')return 'sales.payments.create';
    if(/^\/companies\/\d+\/sales\/\d+\/annul$/.test(p)&&method==='POST')return 'sales.void';
    if(/^\/companies\/\d+\/inventory\/movements$/.test(p)){if(method==='GET')return 'inventory.kardex.read';if(method==='POST')return reqMovementPermission;return null;}
    if(/^\/companies\/\d+\/inventory\/.*$/.test(p)&&method==='GET')return 'inventory.kardex.read';
    if(/^\/companies\/\d+\/(?:dashboard|reports|valuation|kardex|credit-history)(?:\/.*)?$/.test(p)&&method==='GET')return 'reports.operational';
    if(/^\/companies\/\d+\/cash$/.test(p)&&method==='GET')return 'cash.open';
    if(/^\/companies\/\d+\/cash\/open$/.test(p)&&method==='POST')return 'cash.open';
    if(/^\/companies\/\d+\/cash\/close$/.test(p)&&method==='POST')return 'cash.close_own';
    if(/^\/companies\/\d+\/cash\/expenses$/.test(p)&&method==='POST')return 'cash.expenses.create';
    if(/^\/companies\/\d+\/cash\/export\.(csv|html)$/.test(p)&&method==='GET')return 'cash.read_all';
    if(/^\/companies\/\d+\/(?:quote-settings|ticket-settings)$/.test(p))return method==='GET'?'sales.create':null;
    return null;
  }
  const auth=(req,res)=>{const a=credentials(req);if(!a)return res.status(401).json({error:'Inicia sesión para continuar.',code:'AUTH_REQUIRED'});return a;};
  app.get('/api/auth/status',(req,res)=>{const a=credentials(req);res.setHeader('Cache-Control','no-store');res.json({...publicState(),authenticated:!!a,user:a?displayUser(a.user):null});});
  app.post('/api/auth/setup',localOriginOnly,(req,res)=>{
    try{
      const username=String(req.body?.username||'').trim().toLowerCase();
      const displayName=String(req.body?.displayName||'').trim();
      if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)||displayName.length<2||displayName.length>160)throw Error('Usuario o nombre inválido.');
      const hash=passwordHash(req.body?.password);
      const recoveryCode=newRecoveryCode();
      db.transaction(()=>{
        if(ownerCount())throw Error('La cuenta propietaria ya fue configurada.');
        const id=Number(db.prepare(`INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required)
          VALUES (?,?,?,'scrypt',1,1,0)`).run(username,displayName,hash).lastInsertRowid);
        saveRecovery(id,recoveryCode);
        audit(id,'auth.owner_setup','user',id);
      })();
      // Se muestra una sola vez. SQLite conserva exclusivamente el hash SHA-256.
      res.setHeader('Cache-Control','no-store');
      res.status(201).json({ok:true,recoveryCode});
    }catch(e){res.status(400).json({error:e.message});}
  });
  // Recuperación local sin cuenta oculta: código de alta entropía, un solo uso,
  // contraseña nueva validada y revocación de todas las sesiones del propietario.
  app.post('/api/auth/recovery/reset',localOriginOnly,(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const username=typeof req.body?.username==='string'?req.body.username.trim().toLowerCase():'';
    const key=username.slice(0,80);
    const now=Date.now(),state=recoveryFailures.get(key)||{n:0,until:0};
    if(state.until>now)return res.status(429).json({error:'Demasiados intentos de recuperación. Inténtalo más tarde.'});
    const fail=()=>{
      const n=state.n+1;
      recoveryFailures.set(key,n>=RECOVERY_LIMIT?{n,until:now+RECOVERY_WINDOW}:{n,until:0});
      return res.status(403).json({error:'No se pudo verificar el código de recuperación y la cuenta.'});
    };
    if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username))return fail();
    const user=db.prepare('SELECT id,is_active FROM access_users WHERE username=? AND is_owner=1').get(username);
    const stored=user?.is_active?db.prepare('SELECT code_hash FROM access_owner_recovery WHERE user_id=?').get(user.id):null;
    if(!recoveryMatches(req.body?.recoveryCode,stored?.code_hash))return fail();
    let hash;
    try{hash=passwordHash(req.body?.newPassword);}catch(e){return res.status(400).json({error:e.message});}
    try{
      const nextCode=newRecoveryCode();
      db.transaction(()=>{
        // Validación dentro de transacción: evita reutilizar el código en peticiones concurrentes.
        const current=db.prepare('SELECT code_hash FROM access_owner_recovery WHERE user_id=?').get(user.id);
        if(!current||!recoveryMatches(req.body?.recoveryCode,current.code_hash))throw Error('Código utilizado.');
        db.prepare('UPDATE access_users SET password_hash=?,password_change_required=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_owner=1').run(hash,user.id);
        saveRecovery(user.id,nextCode); // sustituye el código usado: no puede reutilizarse
        audit(user.id,'auth.owner_recovered','user',user.id);
      })();
      revokeUserSessions(user.id);
      failures.delete(username);recoveryFailures.delete(key);
      res.json({ok:true,recoveryCode:nextCode});
    }catch{return fail();}
  });
  app.get('/api/auth/recovery/status',(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner)return res.status(403).json({error:'Solo el propietario administra su recuperación.'});
    const code=db.prepare('SELECT 1 AS enabled FROM access_owner_recovery WHERE user_id=?').get(a.user.id);
    res.setHeader('Cache-Control','no-store');res.json({configured:!!code});
  });
  app.post('/api/auth/recovery/rotate',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner)return res.status(403).json({error:'Solo el propietario administra su recuperación.'});
    const row=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
    if(!row||!verifyPassword(req.body?.password,row.password_hash))return res.status(403).json({error:'La contraseña actual es incorrecta.'});
    try{
      const code=newRecoveryCode();
      db.transaction(()=>{saveRecovery(a.user.id,code);audit(a.user.id,'auth.recovery_rotated','user',a.user.id);})();
      revokeUserSessions(a.user.id,a.key);
      res.setHeader('Cache-Control','no-store');res.json({ok:true,recoveryCode:code});
    }catch{return res.status(500).json({error:'No se pudo generar el código de recuperación.'});}
  });
  app.post('/api/auth/login',localOriginOnly,(req,res)=>{
    const username=String(req.body?.username||'').trim().toLowerCase(),key=username.slice(0,80);
    const fail=failures.get(key)||{n:0,until:0};
    if(Date.now()<fail.until)return res.status(429).json({error:'Demasiados intentos. Inténtalo más tarde.'});
    const row=db.prepare('SELECT * FROM access_users WHERE username=? AND is_active=1 AND is_deleted=0').get(username);
    let valid=false;
    try{valid=!!row&&verifyPassword(req.body?.password,row.password_hash);}catch{}
    if(!valid){
      fail.n+=1;fail.until=Date.now()+Math.min(LOGIN_DELAY_MAX,Math.max(0,fail.n-4)*30000);
      failures.set(key,fail);
      if(row)try{audit(row.id,'auth.login_failed','user',row.id)}catch{}
      return res.status(401).json({error:'Usuario o contraseña incorrectos.'});
    }
    failures.delete(key);
    audit(row.id,'auth.login','user',row.id);
    const token=randomBytes(32).toString('hex');
    sessions.set(tokenHash(token),{userId:row.id,lastActivity:Date.now(),expires:Date.now()+TOKEN_TTL});
    res.setHeader('Set-Cookie',cookie(token,Math.ceil(TOKEN_TTL/1000)));
    res.json({ok:true,user:displayUser(row),...settings()});
  });
  app.post('/api/auth/lock',localOriginOnly,(req,res)=>{
    const a=credentials(req);if(a){audit(a.user.id,'auth.lock','user',a.user.id);sessions.delete(a.key);}
    res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});
  });
  app.post('/api/auth/logout',localOriginOnly,(req,res)=>{
    const a=credentials(req);if(a){audit(a.user.id,'auth.logout','user',a.user.id);sessions.delete(a.key);}
    res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});
  });
  app.post('/api/auth/touch',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    a.session.lastActivity=Date.now();res.json({ok:true});
  });
  app.get('/api/auth/settings',(req,res)=>{const a=auth(req,res);if(!a?.session)return;res.json(settings());});
  app.put('/api/auth/settings',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    // La política de inactividad es compartida: todos los usuarios autenticados
    // pueden modificarla, pero primero deben cambiar su contraseña temporal.
    if(a.user.password_change_required)return res.status(403).json({error:'Cambia primero tu contraseña temporal.'});
    const minutes=req.body?.idle_lock_minutes;
    if(!isValidIdleLockMinutes(minutes))return res.status(400).json({error:'Tiempo de bloqueo inválido.'});
    db.transaction(()=>{
      const previous=settings().idle_lock_minutes;
      if(previous===minutes)return;
      db.prepare('UPDATE access_security_settings SET idle_lock_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(minutes);
      audit(a.user.id,'security.idle_lock_changed','security_settings',`${previous}->${minutes}`);
    })();
    res.json(settings());
  });
  // La delegación de supervisores se limita a cajeros de sus empresas.
  const adminCompanies=user=>user.is_owner?null:db.prepare("SELECT company_id FROM access_company_roles WHERE user_id=? AND role='company_admin'").all(user.id).map(r=>r.company_id);
  function manager(req,res){
    const a=auth(req,res);if(!a?.session)return null;
    if(a.user.password_change_required){res.status(403).json({error:'Cambia primero tu contraseña temporal.'});return null;}
    const managed=adminCompanies(a.user),delegated=delegatedCashiers(a.user);
    if(managed&&!managed.length&&!delegated.length){res.status(403).json({error:'No tienes permisos para administrar usuarios.'});return null;}
    return {...a,managed,delegated};
  }
  const manages=(a,companyId)=>a.user.is_owner||a.managed?.includes(companyId);
  const managesCashier=(a,companyId)=>manages(a,companyId)||a.delegated?.includes(companyId);
  const subordinate=(a,u)=>!u.is_owner&&userCompanies(u.id).length>0&&userCompanies(u.id).every(c=>c.role==='cashier'&&managesCashier(a,c.company_id));
  const manageableTarget=(a,u)=>!u.is_owner&&userCompanies(u.id).length>0&&userCompanies(u.id).every(c=>manages(a,c.company_id)&& (a.user.is_owner||c.role!=='company_admin'));
  app.get('/api/auth/users',(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const users=db.prepare('SELECT id,username,display_name,is_owner,is_active,password_change_required,is_deleted FROM access_users WHERE is_deleted=0 ORDER BY is_owner DESC,id ASC').all();
    res.json(users.filter(u=>a.user.is_owner||(!u.is_owner&&userCompanies(u.id).some(c=>manages(a,c.company_id)||c.role==='cashier'&&a.delegated.includes(c.company_id))))
      .map(u=>({...u,companies:u.is_owner?[]:userCompanies(u.id).filter(c=>a.user.is_owner||manages(a,c.company_id)||c.role==='cashier'&&a.delegated.includes(c.company_id)).map(c=>({...c,cashierDelegation:c.role==='supervisor'&&!!db.prepare("SELECT allowed FROM access_permission_overrides WHERE user_id=? AND company_id=? AND permission='users.manage_cashiers'").get(u.id,c.company_id)?.allowed}))})));
  });
  app.post('/api/auth/users',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    try{
      const username=String(req.body?.username||'').trim().toLowerCase(),displayName=String(req.body?.displayName||'').trim();
      const companyId=Number(req.body?.companyId),role=String(req.body?.role||'');
      if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)||displayName.length<2||displayName.length>160)throw Error('Usuario o nombre inválido.');
      if(!['company_admin','supervisor','cashier'].includes(role)||!Number.isSafeInteger(companyId)||companyId<=0||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))throw Error('Selecciona empresa y rol válidos.');
      if(!managesCashier(a,companyId)||!manages(a,companyId)&&role!=='cashier'||!a.user.is_owner&&role==='company_admin')return res.status(403).json({error:'No puedes asignar este rol o empresa.'});
      const hash=passwordHash(req.body?.password);
      const id=db.transaction(()=>{
        const id=Number(db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required) VALUES (?,?,?,'scrypt',0,1,1)").run(username,displayName,hash).lastInsertRowid);
        db.prepare('INSERT INTO access_company_roles(user_id,company_id,role,assigned_by) VALUES (?,?,?,?)').run(id,companyId,role,a.user.id);
        audit(a.user.id,'users.create','user',id,companyId);return id;
      })();
      res.status(201).json({ok:true,id});
    }catch(e){res.status(400).json({error:String(e.message).includes('UNIQUE')?'El nombre de usuario ya está registrado.':e.message});}
  });
  // Recuperación de cuentas ajenas: SOLO propietario, nunca delegada a administradores.
  // Se confirma la contraseña propietaria para cada operación y se entrega una clave
  // temporal una única vez. No modifica roles, empresas ni correos verificados.
  app.post('/api/auth/users/:userId/owner-recovery',localOriginOnly,(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner||a.user.password_change_required)
      return res.status(403).json({error:'Solo el propietario puede recuperar cuentas de otros usuarios.'});
    const targetId=Number(req.params.userId);
    if(!Number.isSafeInteger(targetId)||targetId<=0||targetId===a.user.id)
      return res.status(400).json({error:'Selecciona una cuenta de personal válida.'});
    const target=db.prepare('SELECT id,is_owner,is_active,is_deleted FROM access_users WHERE id=?').get(targetId);
    if(!target||target.is_owner||!target.is_active||target.is_deleted)
      return res.status(404).json({error:'La cuenta no existe o está suspendida.'});
    const previous=ownerResetAttempts.get(a.user.id),now=Date.now();
    if(previous&&previous.until>now&&previous.count>=5)
      return res.status(429).json({error:'Demasiados intentos. Intenta más tarde.'});
    const row=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
    if(!verifyPassword(req.body?.currentPassword,row?.password_hash)){
      if(!previous||now>=previous.until)ownerResetAttempts.set(a.user.id,{count:1,until:now+15*60*1000});
      else previous.count++;
      return res.status(403).json({error:'La contraseña del propietario no coincide.'});
    }
    ownerResetAttempts.delete(a.user.id);
    // La contraseña se genera en servidor con aleatoriedad criptográfica y
    // garantiza letras y números exigidos por passwordHash.
    const temporaryPassword='FCR-9'+randomBytes(18).toString('hex');
    const hashed=passwordHash(temporaryPassword);
    try{
      db.transaction(()=>{
        db.prepare('UPDATE access_users SET password_hash=?,password_change_required=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_owner=0 AND is_active=1').run(hashed,targetId);
        db.prepare('DELETE FROM access_email_tokens WHERE user_id=?').run(targetId);
        audit(a.user.id,'auth.owner_assisted_recovery','user',targetId);
      })();
      revokeUserSessions(targetId);
      return res.json({ok:true,temporaryPassword,message:'Contraseña temporal generada. Entrégala de forma privada. El usuario debe cambiarla al iniciar sesión.'});
    }catch{return res.status(500).json({error:'No se pudo recuperar la cuenta.'});}
  });
  app.put('/api/auth/users/:userId',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const id=Number(req.params.userId),target=db.prepare('SELECT id,is_owner,is_deleted FROM access_users WHERE id=?').get(id);
    if(!target||target.is_owner||target.is_deleted)return res.status(400).json({error:'No se puede modificar esta cuenta.'});
    // Ni propietario ni administrador pueden saltarse la confirmación de contraseña
    // del procedimiento de recuperación utilizando el endpoint de edición normal.
    if(req.body?.password!==undefined)return res.status(403).json({error:'Para restablecer contraseñas utiliza la recuperación exclusiva del propietario.'});
    const assignments=userCompanies(id);
    if(!a.user.is_owner&&!manageableTarget(a,target)){
      if(!subordinate(a,target)||req.body?.companyId!==undefined||Object.keys(req.body||{}).some(k=>k!=='isActive'))
        return res.status(403).json({error:'Solo puedes suspender o reactivar cajeros autorizados.'});
    }
    try{
      if(req.body?.companyId!==undefined){
        const companyId=Number(req.body.companyId),role=String(req.body.role||'');
        if(!['company_admin','supervisor','cashier'].includes(role)||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))throw Error('Empresa o rol inválidos.');
        if(!manages(a,companyId)||!a.user.is_owner&&role==='company_admin')return res.status(403).json({error:'No puedes asignar este rol o empresa.'});
      }
      // Validar antes de escribir y confirmar todos los cambios juntos.
      // Un error no debe suspender una cuenta a medias ni dejar roles inconsistentes.
      const isActive=req.body?.isActive;
      const assignment=req.body?.companyId!==undefined?
        {companyId:Number(req.body.companyId),role:String(req.body.role||'')}:null;
      db.transaction(()=>{
        if(isActive!==undefined)db.prepare('UPDATE access_users SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(isActive?1:0,id);
        if(assignment)db.prepare('INSERT INTO access_company_roles(user_id,company_id,role,assigned_by) VALUES(?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role,assigned_by=excluded.assigned_by').run(id,assignment.companyId,assignment.role,a.user.id);
        audit(a.user.id,'users.update','user',id);
      })();
      if(isActive!==undefined||assignment){
        for(const [key,s] of sessions)if(s.userId===id)sessions.delete(key);
      }
      res.json({ok:true});
    }catch(e){res.status(400).json({error:e.message});}
  });
  app.delete('/api/auth/users/:userId/companies/:companyId',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const userId=Number(req.params.userId),companyId=Number(req.params.companyId);
    const target=db.prepare('SELECT id,is_owner FROM access_users WHERE id=?').get(userId);
    if(!target||target.is_owner)return res.status(400).json({error:'No se puede modificar esta cuenta.'});
    const role=db.prepare('SELECT role FROM access_company_roles WHERE user_id=? AND company_id=?').get(userId,companyId);
    if(!role)return res.status(404).json({error:'Este usuario no pertenece a la empresa.'});
    if(!manages(a,companyId)||!a.user.is_owner&&role.role==='company_admin')return res.status(403).json({error:'No puedes retirar este permiso.'});
    db.prepare('DELETE FROM access_company_roles WHERE user_id=? AND company_id=?').run(userId,companyId);
    for(const [key,s] of sessions)if(s.userId===userId)sessions.delete(key);
    audit(a.user.id,'users.company_access_revoked','user',userId,companyId);
    res.json({ok:true});
  });
  // Permiso granular: solo el propietario lo activa por supervisor y empresa.
  app.put('/api/auth/users/:userId/delegation',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner||a.user.password_change_required)return res.status(403).json({error:'Solo el propietario puede delegar la creación de cajeros.'});
    const id=Number(req.params.userId),companyId=Number(req.body?.companyId),allowed=req.body?.allowed;
    if(!Number.isSafeInteger(id)||!Number.isSafeInteger(companyId)||typeof allowed!=='boolean'||
       !db.prepare("SELECT 1 FROM access_company_roles r JOIN access_users u ON u.id=r.user_id WHERE r.user_id=? AND r.company_id=? AND r.role='supervisor' AND u.is_active=1 AND u.is_deleted=0").get(id,companyId))
      return res.status(400).json({error:'Selecciona un supervisor activo y su empresa.'});
    db.transaction(()=>{
      db.prepare("INSERT INTO access_permission_overrides(user_id,company_id,permission,allowed,changed_by) VALUES (?,?, 'users.manage_cashiers', ?,?) ON CONFLICT(user_id,company_id,permission) DO UPDATE SET allowed=excluded.allowed,changed_by=excluded.changed_by,changed_at=CURRENT_TIMESTAMP").run(id,companyId,allowed?1:0,a.user.id);
      audit(a.user.id,'users.cashier_delegation','user',id,companyId);
    })();
    revokeUserSessions(id);
    res.json({ok:true,allowed});
  });
  // Eliminar perfil = baja lógica; nunca elimina historial fiscal, ventas o auditoría.
  app.delete('/api/auth/users/:userId',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const id=Number(req.params.userId),target=db.prepare('SELECT id,username,is_owner,is_deleted FROM access_users WHERE id=?').get(id);
    if(!target||target.is_owner||target.is_deleted||id===a.user.id)return res.status(400).json({error:'No se puede eliminar esta cuenta.'});
    if(!manageableTarget(a,target))return res.status(403).json({error:'No tienes permiso para eliminar ese perfil.'});
    if(req.body?.confirmation!==target.username)return res.status(400).json({error:'Confirma exactamente el nombre de usuario.'});
    const ownerRow=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
    if(!verifyPassword(req.body?.currentPassword,ownerRow?.password_hash))return res.status(403).json({error:'Contraseña actual incorrecta.'});
    db.transaction(()=>{
      db.prepare('UPDATE access_users SET is_active=0,is_deleted=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
      db.prepare('DELETE FROM access_email_tokens WHERE user_id=?').run(id);
      db.prepare('DELETE FROM access_user_emails WHERE user_id=?').run(id);
      audit(a.user.id,'users.deleted','user',id);
    })();
    revokeUserSessions(id);
    res.json({ok:true,message:'Perfil eliminado de la lista activa. Historial comercial conservado.'});
  });
  // Bitácora exclusiva del propietario; paginación y filtrado se aplican en SQL.
  app.get('/api/auth/audit',(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner||a.user.password_change_required)return res.status(403).json({error:'Solo el propietario puede consultar la auditoría completa.'});
    const page=Number(req.query?.page||1),userId=Number(req.query?.userId||0),companyId=Number(req.query?.companyId||0),category=String(req.query?.category||'').trim(),dateFrom=String(req.query?.from||''),dateTo=String(req.query?.to||'');
    const validDay=v=>{if(!v)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const t=Date.parse(v+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v};
    if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(userId)||userId<0||!Number.isSafeInteger(companyId)||companyId<0||category.length>45||![dateFrom,dateTo].every(validDay)||dateFrom&&dateTo&&dateFrom>dateTo)
      return res.status(400).json({error:'Filtros de auditoría inválidos.'});
    const parts=[],params=[];
    if(userId){parts.push('l.user_id=?');params.push(userId)}
    if(companyId){parts.push('l.company_id=?');params.push(companyId)}
    if(category){parts.push('l.event_type LIKE ?');params.push(category.replace(/[%_]/g,'')+'%')}
    if(dateFrom){parts.push('l.occurred_at>=?');params.push(dateFrom+' 06:00:00')}
    if(dateTo){parts.push('l.occurred_at<?');params.push(new Date(Date.parse(dateTo+'T06:00:00Z')+86400000).toISOString().slice(0,19).replace('T',' '))}
    const where=parts.length?' WHERE '+parts.join(' AND '):'';
    const total=db.prepare('SELECT COUNT(*) n FROM access_audit_log l'+where).get(...params).n;
    const rows=db.prepare(`SELECT l.id,l.occurred_at,l.event_type,l.object_type,l.object_id,l.details_json,l.user_id,l.company_id,u.username,u.display_name,c.trade_name,c.legal_name,t.username AS target_username,t.display_name AS target_name FROM access_audit_log l LEFT JOIN access_users u ON u.id=l.user_id LEFT JOIN companies c ON c.id=l.company_id LEFT JOIN access_users t ON l.object_type='user' AND t.id=CAST(l.object_id AS INTEGER) ${where} ORDER BY l.id DESC LIMIT 50 OFFSET ?`).all(...params,(page-1)*50).map(r=>{let details={};try{details=JSON.parse(r.details_json||'{}')}catch{}return {...r,details,details_json:undefined}});
    res.setHeader('Cache-Control','no-store');res.json({rows,total,page,pageSize:50});
  });
  app.get('/api/auth/audit/actors',(req,res)=>{
    const a=auth(req,res);if(!a?.session)return;
    if(!a.user.is_owner)return res.status(403).json({error:'Solo el propietario puede consultar actores históricos.'});
    res.setHeader('Cache-Control','no-store');
    res.json(db.prepare('SELECT id,username,display_name,is_deleted FROM access_users ORDER BY display_name,id').all());
  });
  app.post('/api/auth/password-change',localOriginOnly,(req,res)=>{
    const a=auth(req,res);if(!a)return;
    const row=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
    if(!verifyPassword(req.body?.oldPassword,row.password_hash))return res.status(403).json({error:'Contraseña actual incorrecta.'});
    try{
      const newHash=passwordHash(req.body?.newPassword);
      db.transaction(()=>{
        db.prepare('UPDATE access_users SET password_hash=?,password_change_required=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newHash,a.user.id);
        audit(a.user.id,'auth.password_change','user',a.user.id);
      })();
      // Mantener solo la sesión que acredita la contraseña actual. Revocar otras
      // sesiones evita que equipos antiguos sigan autorizados tras el cambio.
      for(const [key,s] of sessions)if(s.userId===a.user.id&&key!==a.key)sessions.delete(key);
      res.json({ok:true});
    }catch(e){res.status(400).json({error:e.message});}
  });
  registerEmailRecovery(app,{db,auth,localOriginOnly,audit,verifyPassword,passwordHash,revokeUserSessions,mailer:smtpMailer,mailConfigured:smtpConfigured});
  registerMailAdmin(app,{db,auth,localOriginOnly,audit,verifyPassword,mailStore:options.mailStore,sendMail:smtpMailer});
  // Es obligatorio validar todas las rutas /api restantes en el SERVIDOR.
  // La política por roles y empresas se activará después, ANTES de crear usuarios subordinados.
  app.use('/api',(req,res,next)=>{
    if(req.path==='/health')return next();
    if(!ownerCount())return res.status(428).json({error:'Configura la cuenta propietaria antes de utilizar FacturaCR.',code:'OWNER_SETUP_REQUIRED'});
    const a=credentials(req);
    if(!a)return res.status(401).json({error:'Tu sesión está bloqueada o ha expirado.',code:'AUTH_REQUIRED'});
    if(a.user.password_change_required)return res.status(403).json({error:'Debes cambiar tu contraseña temporal antes de continuar.',code:'PASSWORD_CHANGE_REQUIRED'});
    const path=req.path,method=req.method||'GET';
    if(!a.user.is_owner){
      const permission=permissionFor(method,path,req.body);
      if(!permission)return res.status(403).json({error:'Operación reservada al propietario.'});
      if(permission!=='companies.list'){
        const match=path.match(/^\/companies\/(\d+)(?:\/|$)/);
        if(!match||!(can(a.user,Number(match[1]),permission)||['inventory.receive','inventory.count'].includes(permission)&&can(a.user,Number(match[1]),'inventory.adjust')))return res.status(403).json({error:'No tienes autorización en esta empresa.'});
      }
    }
    req.authUser=a.user;
    const operations=[
      [/^\/companies\/\d+\/sales$/, 'sales.create'],
      [/^\/companies\/\d+\/sales\/\d+\/annul$/, 'sales.void'],
      [/^\/companies\/\d+\/sales\/\d+\/payments$/, 'sales.payment'],
      [/^\/companies\/\d+\/inventory\/movements$/, 'inventory.movement'],
      [/^\/companies\/\d+\/cash\/(open|close)$/, 'cash.operation'],
      [/^\/companies\/\d+\/cash\/expenses$/, 'cash.expense'],
      [/^\/companies\/\d+\/products(?:\/\d+)?$/, 'inventory.product_changed'],
      [/^\/companies\/\d+\/clients(?:\/\d+)?$/, 'clients.changed'],
      [/^\/companies\/\d+\/quotations(?:\/\d+)?$/, 'quotations.changed'],
    ];
    const operation=method!=='GET'&&method!=='HEAD'&&!/\/sales\/draft(?:\/beacon)?$/.test(path)?(operations.find(([rx])=>rx.test(path))||[null,'system.operation']):null;
    if(operation&&typeof res.once==='function'){
      const originalJson=typeof res.json==='function'?res.json.bind(res):null;
      if(originalJson)res.json=function(payload){if(payload&&Number.isSafeInteger(Number(payload.id))&&Number(payload.id)>0)res.auditResultId=Number(payload.id);return originalJson(payload)};
      res.once('finish',()=>{
      if(res.statusCode<200||res.statusCode>=300)return;
      try{
        const rawId=Number(path.split('/')[2]),companyId=Number.isSafeInteger(rawId)&&rawId>0?rawId:null;
        const safe={method};
        if(operation[1]==='inventory.movement')Object.assign(safe,{
          productId:Number(req.body?.product_id)||null,type:String(req.body?.movement_type||'').slice(0,12),quantity:Number(req.body?.quantity)||0,
          reason:String(req.body?.reason||'').slice(0,120)
        });
        if(operation[1]==='sales.create')safe.saleType=String(req.body?.sale_type||'').slice(0,15);
        db.prepare('INSERT INTO access_audit_log(user_id,company_id,event_type,object_type,object_id,details_json) VALUES(?,?,?,?,?,?)')
          .run(a.user.id,companyId,operation[1],path.includes('inventory')?'inventory':path.includes('sales')?'sale':'operation',String(res.auditResultId||path).slice(0,150),JSON.stringify(safe));
      }catch(e){console.error('Error de auditoría:',e.message)}
      });
    }
    next();
  });
  return {invalidateSessions:()=>sessions.clear()};
}
