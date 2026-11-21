const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const r=path.resolve(__dirname,'..');
const main=readFileSync(path.join(r,'src/main.jsx'),'utf8');
const users=readFileSync(path.join(r,'src/UsersPanel.jsx'),'utf8');
const comp=readFileSync(path.join(r,'src/DismissibleNotice.jsx'),'utf8');
const css=readFileSync(path.join(r,'src/style.css'),'utf8');
const readme=readFileSync(path.join(r,'README.md'),'utf8');
let count=0;function ok(value,title){assert.ok(value,title);count++}
ok(comp.includes('type="button"')&&comp.includes('aria-label="Cerrar notificación"'),'cierre accesible y sin submit');
ok(comp.includes('onClick={onClose}'),'el botón ejecuta el cierre');
ok(comp.includes('role={role}')&&comp.includes("variant==='error'?'alert':'status'"),'anuncios de éxito y error');
ok(comp.includes('dismissibleNoticeText'),'texto mantiene espacio propio');
for(const [code,label] of [['setRecoveryMessage(\'\')','recuperación'],['setMessage(\'\')','mensajes'],['setNotice(\'\')','ventas']]){
 ok(main.includes(`onClose={()=>${code}}`),`se cierra aviso ${label}`);
}
ok(users.includes("onClose={()=>setError('')}"),'error de usuario cerrable');
ok(users.includes("onClose={()=>setMessage('')}"),'mensaje de usuario cerrable');
ok(main.includes('Generar tres códigos nuevos'),'texto del botón propietario');
ok(css.includes('ownerRecoveryTools form button{min-height:44px'),'botón legible');
ok(css.includes('.dismissibleNoticeClose:hover'),'feedback de cierre');
ok(users.includes('issuedSecrets'),'entrega única al alta');
ok(main.includes('recoveryMethod'),'recuperación local seleccionable');
console.log(`QA v0.6.88 notificaciones y recuperación diferida: ${count}/${count}`);
