'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
const auth=get('server/auth.js'),main=get('src/main.jsx'),index=get('server/index.js'),users=get('src/UsersPanel.jsx');
for(const f of ['server/email-recovery.js','server/email-smtp.js','server/mail-admin.js','electron/mail-settings.cjs'])assert.equal(fs.existsSync(path.join(root,f)),false,f);
for(const string of ['/api/auth/email/','/api/auth/mail/','emailRecoveryAvailable','registerEmailRecovery','registerMailAdmin','createMailSettingsStore','setSmtpForm','setEmailRecoveryMode'])assert.ok(![auth,main,index,get('electron/main.cjs')].some(text=>text.includes(string)),string);
assert.ok(main.includes('RecoverySecretsPanel')&&main.includes('owner-kit/rotate')&&main.includes('setRecoverySecrets'));
assert.ok(users.includes('RecoverySecretsPanel')&&users.includes('created.recoveryCodes'));
assert.ok(get('server/access-schema.js').includes('DROP TABLE IF EXISTS access_email_tokens'));
let ts;try{ts=require('typescript')}catch{ts=null}
for(const file of ts?['src/main.jsx','src/UsersPanel.jsx','src/RecoverySecretsPanel.jsx']:[]){
 const source=ts.createSourceFile(file,get(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.JSX);
 assert.equal(source.parseDiagnostics.length,0,`${file}: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '))}`);
}
console.log('QA recuperación sin correo y JSX: 9/9');
