'use strict';
// Controles de reproducibilidad del ensayo entre versiones. No instala software.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const fixture=path.join(root,'tests','fixtures','FacturaCR_v0.6.34_baseline.zip');
const manifest=require('./fixtures/baseline-manifest.json');
const flow=fs.readFileSync(path.join(root,'.github','workflows','windows-installer.yml'),'utf8');
const test=fs.readFileSync(path.join(root,'tests','qa-version-upgrade.cjs'),'utf8');
const auth=fs.readFileSync(path.join(root,'tests','qa-version-auth.cjs'),'utf8');
let count=0;
function check(name,fn){fn();count++;console.log('OK',name)}
check('La fuente anterior está congelada y verificada por SHA256',()=>{
 assert.ok(fs.existsSync(fixture));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),manifest.sha256);
 assert.equal(manifest.version,'0.6.34');
});
check('La actualización exige dos instaladores distintos y versiones distintas',()=>{
 assert.ok(test.includes('assert.notEqual(previousInstaller,currentInstaller'));
 assert.ok(test.includes("assert.notEqual(report.previousSha256,report.currentSha256"));
 assert.ok(test.includes("await smoke('antes-de-actualizar',previousVersion)"));
 assert.ok(test.includes("await smoke('despues-de-actualizar',currentVersion)"));
});
check('La prueba utiliza directorios efímeros y no toca la instalación habitual',()=>{
 assert.ok(test.includes("process.env.GITHUB_ACTIONS!=='true'"));
 assert.ok(test.includes("process.env.RUNNER_OS!=='Windows'"));
 assert.ok(test.includes('fs.mkdtempSync('));
 assert.ok(test.includes('fs.rmSync(tempRoot'));
});
check('Workflow construye ambas versiones y publica evidencias',()=>{
 for(const phrase of ['Expand-Archive','facturacr-previous','qa:version-upgrade','Actualización REAL','upload-artifact@v4']){
  assert.ok(flow.includes(phrase),phrase);
 }
});
check('QA compara las tablas e inspecciona API posterior a la actualización',()=>{
 for(const phrase of ['snapshot(db)','foreign_key_check','verifyApiAfterUpgrade','quote-settings','balance_cents','inventory_movements']){
  assert.ok(test.includes(phrase),phrase);
 }
});
check('La API migrada exige sesión nueva y verifica el rechazo 401',()=>{
 for(const phrase of ['FACTURACR_QA_OWNER_PASSWORD','authenticateUpgradeApi','auth.verifyUnauthorized'])assert.ok(test.includes(phrase),phrase);
 for(const phrase of ['/api/auth/status','/api/auth/login',"'/api/companies'",'AUTH_REQUIRED','HttpOnly','SameSite=Strict','facturacr_session'])assert.ok(auth.includes(phrase),phrase);
 assert.ok(!test.includes('sessionCookie='),'No incorporar cookies estáticas al ensayo');
});
console.log(`QA contrato de upgrade: ${count}/${count}`);
