'use strict';
// Diagnóstico puro. Escenarios reales de calendario local, carpeta externa y espacio.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {describeBackupHealth}=await import(pathToFileURL(path.resolve(__dirname,'../server/backup-health.js')).href);
 const {BACKUP_DEFAULTS}=await import(pathToFileURL(path.resolve(__dirname,'../server/backup-schedule.js')).href);
 let count=0;const check=(title,fn)=>{fn();count++;console.log('OK Salud respaldos:',title)};
 const settings=(patch={})=>({...BACKUP_DEFAULTS,enabled:true,...patch});
 const when=(y,m,d,h=20,min=0)=>new Date(y,m-1,d,h,min);
 const stamp=d=>'FacturaCR_auto_'+d.toISOString().replace(/[:.]/g,'-').slice(0,19)+'.sqlite';
 const diagnose=(now,patch={},extra={})=>describeBackupHealth({now,settings:settings(patch),directoryAvailable:true,freeBytes:500*1024*1024,requiredBytes:30*1024*1024,...extra});
 check('Antes de la hora no dice pendiente',()=>{
  const result=diagnose(when(2026,11,13,19,59),{}, {files:[stamp(when(2026,11,12,20,1))]});
  assert.equal(result.state,'ok');assert.equal(new Date(result.nextScheduledAt).getHours(),20);
 });
 check('Marca pendiente tras hora si falta copia del día',()=>{
  const result=diagnose(when(2026,11,13,20,1),{}, {files:[stamp(when(2026,11,12,20,1))]});
  assert.equal(result.state,'pending');assert.equal(new Date(result.nextScheduledAt).getDate(),13);
 });
 check('Respaldo creado después de la hora marca próximo día',()=>{
  const result=diagnose(when(2026,11,13,20,3),{}, {files:[stamp(when(2026,11,13,20,2))]});
  assert.equal(result.state,'ok');assert.equal(new Date(result.nextScheduledAt).getDate(),14);
 });
 check('Sin copias, antes de la hora, informa primera copia pendiente',()=>{
  const result=diagnose(when(2026,11,13,8),{}, {files:[]});
  assert.equal(result.state,'waiting');assert.equal(result.copyCount,0);
 });
 check('Sin copias y después de la hora indica pendiente',()=>{
  assert.equal(diagnose(when(2026,11,13,21),{}, {files:[]}).state,'pending');
 });
 check('Programación desactivada no informa mora',()=>{
  const result=diagnose(when(2026,11,13,21),{enabled:false},{files:[]});
  assert.equal(result.state,'disabled');assert.equal(result.nextScheduledAt,null);
 });
 check('Unidad externa desconectada prevalece sobre desactivada',()=>{
  const result=diagnose(when(2026,11,13,21),{enabled:false,directoryMode:'custom',customDirectory:'X:/mis-copias'}, {directoryAvailable:false});
  assert.equal(result.state,'attention');assert.equal(result.directoryAvailable,false);
 });
 check('Falta de espacio advierte sin crear copia',()=>{
  const result=diagnose(when(2026,11,13,8),{}, {freeBytes:10000,requiredBytes:20000});
  assert.equal(result.state,'attention');assert.equal(result.lowSpace,true);
 });
 check('Último error tiene prioridad y no se devuelve el mensaje como ruta',()=>{
  const result=diagnose(when(2026,11,13,8),{}, {lastError:'EACCES /privado/carpeta'});
  assert.equal(result.state,'attention');assert.equal(result.hasLastError,true);assert.ok(!JSON.stringify(result).includes('/privado'));
 });
 check('Mientras se escribe, indica operación en curso',()=>{
  assert.equal(diagnose(when(2026,11,13,8),{}, {busy:true}).state,'running');
 });
 check('Copia semanal ya realizada calcula el viernes siguiente',()=>{
  const now=when(2026,11,13,22),result=diagnose(now,{frequency:'weekly',weekday:5,time:'20:00'},{files:[stamp(when(2026,11,13,20,1))]});
  assert.equal(result.state,'ok');assert.equal(new Date(result.nextScheduledAt).getDate(),20);
 });
 check('Semana sin copia al llegar el horario marca pendiente',()=>{
  const result=diagnose(when(2026,11,13,20,30),{frequency:'weekly',weekday:5},{files:[stamp(when(2026,11,6,20,1))]});
  assert.equal(result.state,'pending');
 });
 check('Mes con día 31 se ajusta a febrero de año común',()=>{
  const result=diagnose(when(2027,2,27,18),{frequency:'monthly',monthDay:31},{files:[stamp(when(2027,1,31,20,1))]});
  assert.equal(result.state,'ok');assert.equal(new Date(result.nextScheduledAt).getDate(),28);
 });
 check('Febrero completado avanza hasta el 31 de marzo sin saltar abril',()=>{
  const result=diagnose(when(2027,2,28,21),{frequency:'monthly',monthDay:31},{files:[stamp(when(2027,2,28,20,1))]});
  assert.equal(result.state,'ok');assert.equal(new Date(result.nextScheduledAt).getMonth(),2);assert.equal(new Date(result.nextScheduledAt).getDate(),31);
 });
 check('Mes bisiesto y día 31 programa 29 de febrero',()=>{
  const result=diagnose(when(2028,2,10,9),{frequency:'monthly',monthDay:31},{files:[]});
  assert.equal(new Date(result.nextScheduledAt).getDate(),29);
 });
 check('Datos de respuesta son seguros y tienen fecha de revisión',()=>{
  const result=diagnose(when(2026,11,13,8),{}, {files:[stamp(when(2026,11,12,20,1))]});
  assert.match(result.checkedAt,/^2026-11-13T/);assert.equal(result.hasCopies,true);
  assert.ok(!('directory' in result));assert.ok(!('settings' in result));
 });
 check('Configuración inválida se rechaza en lugar de reportar falso éxito',()=>{
  assert.throws(()=>diagnose(when(2026,11,13,8),{frequency:'hourly'}),/inválida/);
 });
 console.log(`QA salud de respaldos v0.6.67: ${count}/${count}`);
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
