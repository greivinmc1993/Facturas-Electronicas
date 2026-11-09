'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {ensureAccessSchema,ACCESS_ROLES,ACCESS_PERMISSIONS,DEFAULT_IDLE_LOCK_MINUTES,defaultPermissionsFor,isValidIdleLockMinutes}=await import(pathToFileURL(path.join(__dirname,'../server/access-schema.js')).href);
 let tests=0;const check=(label,fn)=>{fn();tests++;console.log('PASS',label)};
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'facturacr-access-'));
 const db=new DatabaseSync(path.join(temp,'access.sqlite'));
 try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id INTEGER PRIMARY KEY,legal_name TEXT);INSERT INTO companies VALUES(1,\'Empresa uno\'),(2,\'Empresa dos\');');
  check('Catálogo de roles: propietario distinto de administrativos',()=>{
   assert.deepEqual(ACCESS_ROLES,['owner','company_admin','supervisor','cashier']);
   assert.ok(ACCESS_PERMISSIONS.includes('backups.restore'));
   assert.ok(defaultPermissionsFor('owner').includes('users.manage_all'));
   assert.ok(!defaultPermissionsFor('company_admin').includes('users.manage_all'));
   assert.ok(!defaultPermissionsFor('cashier').includes('inventory.costs.read'));
   assert.throws(()=>defaultPermissionsFor('developer'),/desconocido/);
  });
  check('Migración repetible sin alterar empresas comerciales',()=>{
   ensureAccessSchema(db);ensureAccessSchema(db);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companies').get().n,2);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_users').get().n,0);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_company_roles').get().n,0);
  });
  check('Predeterminado 15 minutos y borrador conservado',()=>{
   const x=db.prepare('SELECT idle_lock_minutes,preserve_draft_on_lock FROM access_security_settings WHERE id=1').get();
   assert.equal(x.idle_lock_minutes,DEFAULT_IDLE_LOCK_MINUTES);assert.equal(x.preserve_draft_on_lock,1);
   assert.ok(isValidIdleLockMinutes(15));assert.ok(isValidIdleLockMinutes(60));assert.ok(!isValidIdleLockMinutes(13));
  });
  check('Migración no sobrescribe configuración futura',()=>{
   db.exec('UPDATE access_security_settings SET idle_lock_minutes=30 WHERE id=1');
   ensureAccessSchema(db);
   assert.equal(db.prepare('SELECT idle_lock_minutes AS m FROM access_security_settings').get().m,30);
  });
  const hash='scrypt$test$000000000000000000000000000000';
  check('Una sola cuenta propietaria y sin usuario de desarrollo',()=>{
   const insert=db.prepare("INSERT INTO access_users(username,display_name,password_hash,password_algorithm,is_owner) VALUES (?,?,?,'scrypt',?)");
   insert.run('propietario','Propietario',hash,1);
   assert.throws(()=>insert.run('otro_propietario','Propietario 2',hash,1),/UNIQUE/);
   insert.run('empleado','Empleado',hash,0);
   assert.throws(()=>insert.run('EMPLEADO','Duplicado',hash,0),/UNIQUE/);
  });
  check('Roles por empresa independientes y pertenencia única',()=>{
   const id=db.prepare("SELECT id FROM access_users WHERE username='empleado'").get().id;
   db.prepare("INSERT INTO access_company_roles(user_id,company_id,role) VALUES (?,1,'cashier')").run(id);
   db.prepare("INSERT INTO access_company_roles(user_id,company_id,role) VALUES (?,2,'supervisor')").run(id);
   const roles=db.prepare('SELECT company_id,role FROM access_company_roles WHERE user_id=? ORDER BY company_id').all(id);
   assert.deepEqual(roles.map(r=>[r.company_id,r.role]),[[1,'cashier'],[2,'supervisor']]);
   assert.throws(()=>db.prepare("INSERT INTO access_company_roles(user_id,company_id,role) VALUES (?,1,'owner')").run(id),/CHECK|UNIQUE/);
  });
  check('Permisos delegados solo con asignación válida',()=>{
   const id=db.prepare("SELECT id FROM access_users WHERE username='empleado'").get().id;
   db.prepare("INSERT INTO access_permission_overrides(user_id,company_id,permission,allowed) VALUES (?,1,'cash.expenses.create',1)").run(id);
   assert.throws(()=>db.prepare("INSERT INTO access_permission_overrides(user_id,company_id,permission,allowed) VALUES (?,3,'cash.expenses.create',1)").run(id),/FOREIGN KEY/);
  });
  check('Log de auditoría tiene persistencia independiente',()=>{
   db.prepare("INSERT INTO access_audit_log(user_id,company_id,event_type,object_type) VALUES (1,1,'role.changed','user')").run();
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_audit_log').get().n,1);
  });
  console.log(`QA base de permisos: ${tests}/${tests}`);
 }finally{db.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
