// v0.6.57: usuarios por empresa, borradores de venta y controles de acceso.
// No crea credenciales ni rutas administrativas sin autenticación.
// Una cuenta propietaria pertenece a la instalación, no al desarrollador.
export const DEFAULT_IDLE_LOCK_MINUTES = 15;
export const ACCESS_ROLES = Object.freeze(['owner', 'company_admin', 'supervisor', 'cashier']);
export const ACCESS_PERMISSIONS = Object.freeze([
  'sales.create','sales.read_all','sales.void','sales.payments.create',
  'clients.manage','clients.delete','quotations.manage','quotations.delete',
  'inventory.read','inventory.manage','inventory.delete','inventory.adjust','inventory.costs.read','inventory.kardex.read',
  'cash.open','cash.close_own','cash.expenses.create','cash.read_all','cash.reopen',
  'reports.operational','reports.financial','users.manage_company',
  'companies.manage_all','users.manage_all','permissions.manage_all',
  'backups.manage','backups.restore','audit.read','tax.configure'
]);
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  owner: [...ACCESS_PERMISSIONS],
  company_admin: ACCESS_PERMISSIONS.filter(p=>![
    'companies.manage_all','users.manage_all','permissions.manage_all',
    'backups.manage','backups.restore','audit.read'
  ].includes(p)),
  supervisor: [
    'sales.create','sales.read_all','sales.void','sales.payments.create',
    'clients.manage','quotations.manage','quotations.delete',
    'inventory.read','inventory.manage','inventory.adjust','inventory.costs.read','inventory.kardex.read',
    'cash.open','cash.close_own','cash.expenses.create','cash.read_all',
    'reports.operational','reports.financial'
  ],
  cashier: [
    'sales.create','sales.payments.create','clients.manage','quotations.manage',
    'inventory.read','cash.open','cash.close_own'
  ]
});
export function defaultPermissionsFor(role){
  if(!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS,role))throw Error('Rol desconocido.');
  return [...DEFAULT_ROLE_PERMISSIONS[role]];
}
export function isValidIdleLockMinutes(value){
  return Number.isSafeInteger(value)&&[0,5,15,30,60].includes(value);
}
export function ensureAccessSchema(db){
  // UNIQUE sobre username normalizado: el nombre de inicio de sesión es global
  // por instalación; asignaciones y permisos son específicos de cada empresa.
  db.exec(`CREATE TABLE IF NOT EXISTS access_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_algorithm TEXT NOT NULL CHECK(password_algorithm IN ('argon2id','scrypt')),
    is_owner INTEGER NOT NULL DEFAULT 0 CHECK(is_owner IN (0,1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    password_change_required INTEGER NOT NULL DEFAULT 1 CHECK(password_change_required IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(length(trim(username)) BETWEEN 3 AND 80),
    CHECK(length(trim(display_name)) BETWEEN 1 AND 160),
    CHECK(length(password_hash) >= 20)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_access_one_owner ON access_users(is_owner) WHERE is_owner=1;
  CREATE TABLE IF NOT EXISTS access_company_roles (
    user_id INTEGER NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('company_admin','supervisor','cashier')),
    assigned_by INTEGER REFERENCES access_users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,company_id)
  );
  CREATE INDEX IF NOT EXISTS idx_access_company_roles_company ON access_company_roles(company_id,role);
  CREATE TABLE IF NOT EXISTS access_permission_overrides (
    user_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
    changed_by INTEGER REFERENCES access_users(id) ON DELETE SET NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,company_id,permission),
    FOREIGN KEY(user_id,company_id) REFERENCES access_company_roles(user_id,company_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS access_security_settings (
    id INTEGER PRIMARY KEY CHECK(id=1),
    idle_lock_minutes INTEGER NOT NULL DEFAULT 15 CHECK(idle_lock_minutes IN (0,5,15,30,60)),
    preserve_draft_on_lock INTEGER NOT NULL DEFAULT 1 CHECK(preserve_draft_on_lock IN (0,1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS access_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES access_users(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    object_type TEXT NOT NULL DEFAULT '',
    object_id TEXT NOT NULL DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_access_audit_company_date ON access_audit_log(company_id,occurred_at);
  CREATE INDEX IF NOT EXISTS idx_access_audit_user_date ON access_audit_log(user_id,occurred_at);
  CREATE TABLE IF NOT EXISTS sale_drafts (
    user_id INTEGER NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    draft_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,company_id)
  );
  INSERT OR IGNORE INTO access_security_settings(id,idle_lock_minutes,preserve_draft_on_lock) VALUES(1,15,1);`);
}
