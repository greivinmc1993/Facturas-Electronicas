'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {COMPANY_ID_RULES,validateCompanyIdentification,validateCompanyActivity}=await import(pathToFileURL(path.join(__dirname,'../server/company-identity.js')));
 let passed=0;const check=(label,fn)=>{fn();passed++;console.log('OK Identidad fiscal:',label)};
 check('Cédula física admite nueve cifras sin cero inicial',()=>{
  assert.equal(validateCompanyIdentification('01','115460323'),'115460323');
  for(const x of ['015460323','11546032','1154603233','115-460323','ABC456789'])assert.throws(()=>validateCompanyIdentification('01',x),/Cédula física/);
 });
 check('Cédula jurídica exige diez cifras',()=>{
  assert.equal(validateCompanyIdentification('02','3101900123'),'3101900123');
  for(const x of ['310190012','31019001234','3101-900123','ABC1900123'])assert.throws(()=>validateCompanyIdentification('02',x),/Cédula jurídica/);
 });
 check('DIMEX acepta once o doce dígitos y exige primer dígito distinto de cero',()=>{
  for(const x of ['12345678901','123456789012'])assert.equal(validateCompanyIdentification('03',x),x);
  for(const x of ['01234567890','1234567890','1234567890123','ABCDEFGHIJK'])assert.throws(()=>validateCompanyIdentification('03',x),/DIMEX/);
 });
 check('NITE usa diez dígitos',()=>{
  assert.equal(validateCompanyIdentification('04','4001234567'),'4001234567');
  for(const x of ['400123456','40012345678','NITE123456'])assert.throws(()=>validateCompanyIdentification('04',x),/NITE/);
 });
 check('Identificación extranjera permite máximo veinte letras o números',()=>{
  for(const x of ['AB123456','123','A'.repeat(20)])assert.equal(validateCompanyIdentification('05',x),x);
  for(const x of ['','A'.repeat(21),'AB-123','AB 123','ÁB12'])assert.throws(()=>validateCompanyIdentification('05',x));
 });
 check('El tipo y el número son obligatorios en perfiles fiscales nuevos',()=>{
  assert.throws(()=>validateCompanyIdentification('','115460323'),/Seleccione el tipo/);
  assert.throws(()=>validateCompanyIdentification('01',''),/obligatorio/);
  assert.throws(()=>validateCompanyIdentification('99','123456789'),/válido/);
 });
 check('Cambiar de tipo cambia la regla aplicada',()=>{
  assert.throws(()=>validateCompanyIdentification('02','115460323'),/10 dígitos/);
  assert.throws(()=>validateCompanyIdentification('01','3101900123'),/9 dígitos/);
 });
 check('La ruta histórica sin ficha fiscal sigue aceptando nueve a doce dígitos',()=>{
  assert.equal(validateCompanyIdentification('','123456789',{allowUntyped:true}),'123456789');
  assert.throws(()=>validateCompanyIdentification('','ABC123',{allowUntyped:true}));
 });
 check('Actividad de RUT admite formato 4019.0 y variante histórica de seis cifras',()=>{
  for(const x of ['4019.0','3333.3','123456'])assert.equal(validateCompanyActivity(x),x);
  for(const x of ['4019.','4019.00','40190','40A9.0','40 19.0'])assert.throws(()=>validateCompanyActivity(x),/Actividad económica/);
 });
 check('La actividad es opcional durante preparación',()=>assert.equal(validateCompanyActivity(''),''));
 check('El patrón de interfaz puede usarse para determinar longitud máxima',()=>{
  assert.equal(COMPANY_ID_RULES['01'].maxLength,9);assert.equal(COMPANY_ID_RULES['05'].maxLength,20);
  assert.equal(COMPANY_ID_RULES['03'].pattern.test('123456789012'),true);
 });
 console.log(`QA identidad fiscal: ${passed}/${passed} aprobadas`);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
