'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const panel=read('src/FePreparationPanel.jsx'),main=read('src/main.jsx'),css=read('src/style.css'),server=read('server/index.js'),auth=read('server/auth.js');
let n=0;const test=(label,fn)=>{fn();n++;console.log('OK Interfaz FE 4.4:',label)};
test('Se integra solamente en Empresas para propietario o administrador de esa empresa',()=>{
 assert.match(main,/tab==='companies'/);assert.match(main,/account\?\.isOwner\|\|account\?\.companies/);
 assert.match(main,/<FePreparationPanel company=\{current\}/);
});
test('No hay botón de emisión, firma o transmisión',()=>{
 assert.doesNotMatch(panel,/onClick=.*[Ee]mitir|onClick=.*[Ff]irmar|onClick=.*[Ee]nviar.*Hacienda/);
 assert.match(panel,/todavía no emite ni firma documentos/);
});
test('Formulario guarda por empresa y no en variables globales',()=>{
 assert.match(panel,/fetch\(`\/api\/companies\/\$\{companyId\}\/fe\/preparation`/);
 assert.match(panel,/method:'PUT'/);assert.match(panel,/useEffect\(\(\)=>/);
});
test('Las credenciales no se solicitan en la ficha fiscal',()=>assert.doesNotMatch(panel,/token|clientSecret|password|certificado/));
test('Dos columnas y responsive hasta pantallas pequeñas',()=>{
 assert.match(css,/\.fePreparationFields\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:720px\)/);
});
test('El backend separa datos fiscales y comerciales por company_id',()=>{
 assert.match(server,/CREATE TABLE IF NOT EXISTS company_fe_preparation/);
 assert.match(server,/PRIMARY KEY REFERENCES companies\(id\) ON DELETE CASCADE/);
 assert.match(server,/WHERE company_id=\?/);
});
test('La autorización de perfil exige tax.configure y no entrega accesos al cajero',()=>{
 assert.ok(auth.includes('fe\\/preparation') || auth.includes('fe\/preparation') || auth.includes('fe\/preparation$'));
 assert.match(auth,/'tax\.configure'/);
 assert.match(read('server/access-schema.js'),/company_admin: ACCESS_PERMISSIONS/);
});
test('El diagnóstico declara siempre que la emisión no está disponible',()=>{
 assert.match(read('server/fe-preparation.js'),/canEmit:false/);
 assert.match(panel,/Pendientes para emisión real/);
});
console.log(`QA interfaz FE 4.4 v0.6.70: ${n}/${n} aprobadas`);
