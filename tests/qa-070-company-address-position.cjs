'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
const fiscal=fs.readFileSync(path.join(root,'src/CompanyFiscalFields.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
let count=0;
function check(label,test){test();console.log('OK Dirección empresa:',label);count++}
check('Nueva empresa y Editar empresa comparten una sola ventana',()=>{
 assert.match(main,/editingCompany\?'Editar empresa':'Registrar nueva empresa'/);
 assert.equal((main.match(/id="company-address"/g)||[]).length,1);
});
check('El campo de otras señas se entrega a la ficha fiscal, no arriba de ella',()=>{
 assert.match(main,/<CompanyFiscalFields value=\{companyForm\.fe_preparation\}[\s\S]*?addressField=\{<Field title="Dirección exacta \(otras señas\)"/);
 assert.ok(!/<Field title="Dirección exacta \(otras señas\)"[\s\S]*?<CompanyFiscalFields value=\{companyForm\.fe_preparation\}/.test(main));
});
check('Dirección exacta aparece debajo de provincia, cantón, distrito y código postal',()=>{
 const district=fiscal.indexOf('>Distrito<select');
 const postal=fiscal.indexOf('>Código postal<input');
 const wrapper=fiscal.indexOf('{addressField&&<div className="companyFiscalAddress">');
 const hint=fiscal.indexOf('companyFiscalGeoWarning');
 assert.ok(district>0 && postal>district && wrapper>postal && hint>wrapper);
});
check('Se conserva valor, guardado y validación de 160 caracteres',()=>{
 assert.match(main,/id="company-address" aria-invalid=\{!!companyFieldErrors\.address\}/);
 assert.match(main,/maxLength="160" placeholder="Ej\. 150 metros/);
 assert.match(main,/value=\{companyForm\.address\} onChange=\{e=>editCompanyField\('address',e\.target\.value\)\}/);
});
check('No se pierde el enlace que enfoca dirección cuando hay errores',()=>{
 assert.match(main,/focusCompanyError\(key\)/);
 assert.match(main,/companyFieldErrors\.address/);
 assert.match(main,/COMPANY_FIELD_DOM_IDS/);
});
check('El textarea se ajusta al ancho y conserva estados de error',()=>{
 assert.match(css,/\.companyFiscalFields \.companyFiscalAddress textarea\{[^}]*width:100%/);
 assert.match(css,/\.companyModalFields \.companyFieldHasError :is\(input,textarea,select\)/);
});
console.log(`QA posición de dirección exacta: ${count}/${count} aprobadas`);
