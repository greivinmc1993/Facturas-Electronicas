'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {FE_PREPARATION_EMPTY,parseFePreparation,describeFePreparation}=await import(pathToFileURL(path.resolve(__dirname,'../server/fe-preparation.js')));
 let passed=0;const check=(label,fn)=>{fn();passed++;console.log('OK Ficha FE 4.4:',label)};
 const valid={identification_type:'02',activity_code:'123456',province:'1',canton:'01',district:'02',branch:'001',terminal:'00001'};
 check('Los campos permanecen vacíos en perfiles existentes',()=>assert.equal(Object.values(FE_PREPARATION_EMPTY).filter(Boolean).length,0));
 check('Permite guardar una ficha parcial sin bloquear la empresa',()=>assert.deepEqual(parseFePreparation({activity_code:'123456'}).activity_code,'123456'));
 check('Valida actividad con seis dígitos',()=>assert.throws(()=>parseFePreparation({activity_code:'3333.3'}),/Actividad económica/));
 check('Rechaza dígitos incompletos y caracteres extraños',()=>{
  for(const [key,v] of [['branch','1'],['terminal','1'],['canton','5a'],['district','001'],['province','8'],['identification_type','99']])assert.throws(()=>parseFePreparation({[key]:v}),/formato inválido/,key);
 });
 check('No admite campos de credenciales ni escrituras ocultas',()=>assert.throws(()=>parseFePreparation({password:'secret'}),/no admitidos/));
 check('No admite arreglos ni tipos inseguros',()=>{
  assert.throws(()=>parseFePreparation([]));assert.throws(()=>parseFePreparation({branch:{test:1}}));
 });
 check('Normaliza espacios sin alterar ceros a la izquierda',()=>{
  const result=parseFePreparation({...valid,terminal:' 00001 '});assert.equal(result.terminal,'00001');
 });
 const company={legal_name:'Empresa QA',identification:'3101123456',email:'emisor@example.com',address:'Avenida principal'};
 check('Señala campos pendientes y productos sin CABYS',()=>{
  const result=describeFePreparation(company,{}, {total:4,missingCabys:2});
  assert.equal(result.canEmit,false);assert.ok(result.missing.some(x=>x.includes('CAByS')));assert.ok(result.missing.some(x=>x.includes('Actividad')));
 });
 check('Ficha completa registra 10 comprobaciones locales sin autorizar emisión',()=>{
  const result=describeFePreparation(company,valid,{total:4,missingCabys:0});
  assert.equal(result.completed,10);assert.equal(result.total,10);assert.equal(result.canEmit,false);assert.equal(result.scope,'preparation-only');
 });
 check('Catálogo vacío no se declara listo para emisión',()=>{
  const result=describeFePreparation(company,valid,{total:0,missingCabys:0});assert.equal(result.checks.at(-1).ok,false);
 });
 check('Compañía incompleta mantiene faltantes sin inventar campos',()=>{
  const result=describeFePreparation({legal_name:'',identification:'',email:'',address:''},valid,{total:2,missingCabys:0});
  assert.ok(result.completed<result.total);assert.equal(result.canEmit,false);
 });
 console.log(`QA preparación FE v0.6.70: ${passed}/${passed} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
