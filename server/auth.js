// Autenticación local v0.6.56: sin cuentas universales ni usuarios ocultos.
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {isValidIdleLockMinutes,ACCESS_ROLES,defaultPermissionsFor} from './access-schema.js';

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
    const user=db.prepare('SELECT id,username,display_name,is_owner,is_active,password_change_required FROM access_users WHERE id=?').get(s.userId);
    if(!user?.is_active){sessions.delete(key);return null;}
    return {key,session:s,user};
  };
  const publicState=()=>({setupRequired:ownerCount()===0,...settings()});
  const userCompanies=userId=>db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=?').all(userId);
  const displayUser=user=>({id:user.id,username:user.username,displayName:user.display_name,isOwner:!!user.is_owner,passwordChangeRequired:!!user.password_change_required,companies:user.is_owner?[]:userCompanies(user.id)});
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
  function permissionFor(method,relative){
    const p=relative;
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
    if(/^\/companies\/\d+\/inventory\/movements$/.test(p))return method==='GET'?'inventory.kardex.read':method==='POST'?'inventory.adjust':null;
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
    res.json({ok:true,user:displayUser(row),...settings()});
  });
  app.post('/api/auth/lock',localOriginOnly,(req,res)=>{
    const a=credentials(req);if(a)sessions.delete(a.key);
    res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});
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
  // Gestión delegada: administrador de empresa solo gestiona personal subordinado en sus empresas.
  const adminCompanies=user=>user.is_owner?null:db.prepare("SELECT company_id FROM access_company_roles WHERE user_id=? AND role='company_admin'").all(user.id).map(r=>r.company_id);
  function manager(req,res){const a=auth(req,res);if(!a?.session)return null;if(a.user.password_change_required){res.status(403).json({error:'Cambia primero tu contraseña temporal.'});return null;}const managed=adminCompanies(a.user);if(managed&&!managed.length){res.status(403).json({error:'No tienes permisos para administrar usuarios.'});return null;}return {...a,managed};}
  const manages=(a,companyId)=>a.user.is_owner||a.managed.includes(companyId);
  app.get('/api/auth/users',(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const users=db.prepare('SELECT id,username,display_name,is_owner,is_active,password_change_required FROM access_users ORDER BY is_owner DESC,id ASC').all();
    res.json(users.filter(u=>a.user.is_owner||(!u.is_owner&&userCompanies(u.id).some(c=>a.managed.includes(c.company_id))))
      .map(u=>({...u,companies:u.is_owner?[]:userCompanies(u.id).filter(c=>a.user.is_owner||a.managed.includes(c.company_id))})));
  });
  app.post('/api/auth/users',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    try{
      const username=String(req.body?.username||'').trim().toLowerCase(),displayName=String(req.body?.displayName||'').trim();
      const companyId=Number(req.body?.companyId),role=String(req.body?.role||'');
      if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)||displayName.length<2||displayName.length>160)throw Error('Usuario o nombre inválido.');
      if(!['company_admin','supervisor','cashier'].includes(role)||!Number.isSafeInteger(companyId)||companyId<=0||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))throw Error('Selecciona empresa y rol válidos.');
      if(!manages(a,companyId)||!a.user.is_owner&&role==='company_admin')return res.status(403).json({error:'No puedes asignar este rol o empresa.'});
      const hash=passwordHash(req.body?.password);
      const id=db.transaction(()=>{
        const id=Number(db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner,is_active,password_change_required) VALUES (?,?,?,'scrypt',0,1,1)").run(username,displayName,hash).lastInsertRowid);
        db.prepare('INSERT INTO access_company_roles(user_id,company_id,role,assigned_by) VALUES (?,?,?,?)').run(id,companyId,role,a.user.id);
        audit(a.user.id,'users.create','user',id,companyId);return id;
      })();
      res.status(201).json({ok:true,id});
    }catch(e){res.status(400).json({error:String(e.message).includes('UNIQUE')?'El nombre de usuario ya está registrado.':e.message});}
  });
  app.put('/api/auth/users/:userId',localOriginOnly,(req,res)=>{
    const a=manager(req,res);if(!a)return;
    const id=Number(req.params.userId),target=db.prepare('SELECT id,is_owner FROM access_users WHERE id=?').get(id);
    if(!target||target.is_owner)return res.status(400).json({error:'No se puede modificar esta cuenta.'});
    const assignments=userCompanies(id);
    if(!a.user.is_owner&&(!assignments.length||assignments.some(c=>!a.managed.includes(c.company_id)||c.role==='company_admin')))
      return res.status(403).json({error:'Solo el propietario puede modificar esta cuenta.'});
    try{
      if(req.body?.companyId!==undefined){
        const companyId=Number(req.body.companyId),role=String(req.body.role||'');
        if(!['company_admin','supervisor','cashier'].includes(role)||!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId))throw Error('Empresa o rol inválidos.');
        if(!manages(a,companyId)||!a.user.is_owner&&role==='company_admin')return res.status(403).json({error:'No puedes asignar este rol o empresa.'});
      }
      // Validar antes de escribir y confirmar todos los cambios juntos.
      // Un error no debe suspender una cuenta a medias ni dejar roles inconsistentes.
      const hash=req.body?.password!==undefined?passwordHash(req.body.password):null;
      const isActive=req.body?.isActive;
      const assignment=req.body?.companyId!==undefined?
        {companyId:Number(req.body.companyId),role:String(req.body.role||'')}:null;
      db.transaction(()=>{
        if(isActive!==undefined)db.prepare('UPDATE access_users SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(isActive?1:0,id);
        if(hash!==null)db.prepare("UPDATE access_users SET password_hash=?,password_change_required=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(hash,id);
        if(assignment)db.prepare('INSERT INTO access_company_roles(user_id,company_id,role,assigned_by) VALUES(?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role,assigned_by=excluded.assigned_by').run(id,assignment.companyId,assignment.role,a.user.id);
        audit(a.user.id,'users.update','user',id);
      })();
      if(isActive!==undefined||hash!==null||assignment){
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
  // Es obligatorio validar todas las rutas /api restantes en el SERVIDOR.
  // La política por roles y empresas se activará después, ANTES de crear usuarios subordinados.
  app.use('/api',(req,res,next)=>{
    if(req.path==='/health')return next();
    if(!ownerCount())return res.status(428).json({error:'Configura la cuenta propietaria antes de utilizar FacturaCR.',code:'OWNER_SETUP_REQUIRED'});
    const a=credentials(req);
    if(!a)return res.status(401).json({error:'Tu sesión está bloqueada o ha expirado.',code:'AUTH_REQUIRED'});
    if(a.user.password_change_required)return res.status(403).json({error:'Debes cambiar tu contraseña temporal antes de continuar.',code:'PASSWORD_CHANGE_REQUIRED'});
    if(!a.user.is_owner){
      const path=req.path,method=req.method||'GET';
      const permission=permissionFor(method,path);
      if(!permission)return res.status(403).json({error:'Operación reservada al propietario.'});
      if(permission==='companies.list'){req.authUser=a.user;return next();}
      const match=path.match(/^\/companies\/(\d+)(?:\/|$)/);
      if(!match||!can(a.user,Number(match[1]),permission))return res.status(403).json({error:'No tienes autorización en esta empresa.'});
    }
    req.authUser=a.user;
    next();
  });
  return {invalidateSessions:()=>sessions.clear()};
}
