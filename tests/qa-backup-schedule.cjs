'use strict';
// QA independiente de SQLite y Express: horarios locales, días configurables y compatibilidad.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {BACKUP_DEFAULTS,normalizeBackupSettings,validateBackupSettings,scheduledBackupDate,lastBackupTimestamp,backupIsDue}=await import(pathToFileURL(path.resolve(__dirname,'../server/backup-schedule.js')).href);
 let total=0;
 const check=(name,fn)=>{fn();total++;console.log('OK '+name)};
 const config=(changes={})=>({...BACKUP_DEFAULTS,enabled:true,...changes});
 const stamp=date=>'FacturaCR_auto_'+date.toISOString().replace(/[:.]/g,'-').slice(0,19)+'.sqlite';
 const local=(y,m,d,h=20,min=0)=>new Date(y,m-1,d,h,min);
 check('Configuración antigua conserva lunes y día 1',()=>{
  const legacy=normalizeBackupSettings({enabled:true,frequency:'weekly',time:'21:00',keep:7});
  assert.equal(legacy.weekday,1);assert.equal(legacy.monthDay,1);assert.equal(legacy.keep,7);
 });
 check('Semana permite los siete días',()=>{for(let day=0;day<7;day++)assert.ok(validateBackupSettings(config({frequency:'weekly',weekday:day}))) });
 check('Mes permite días 1 al 31',()=>{for(let day=1;day<=31;day++)assert.ok(validateBackupSettings(config({frequency:'monthly',monthDay:day}))) });
 check('Días inválidos se rechazan',()=>{
  for(const weekday of [-1,7,2.5,'2',null])assert.equal(validateBackupSettings(config({weekday})),false);
  for(const monthDay of [-1,0,32,1.5,'30'])assert.equal(validateBackupSettings(config({monthDay})),false);
 });
 check('Hora y retención inválidas se rechazan',()=>{
  assert.equal(validateBackupSettings(config({time:'25:00'})),false);
  assert.equal(validateBackupSettings(config({keep:0})),false);
 });
 check('Martes no ejecuta antes de las 21:00',()=>{
  const setting=config({frequency:'weekly',weekday:2,time:'21:00'});
  assert.equal(backupIsDue(local(2026,11,10,20,59),setting,null),false); // martes
  assert.equal(backupIsDue(local(2026,11,10,21),setting,null),true);
 });
 check('Antes del día semanal indicado no se adelanta',()=>{
  const setting=config({frequency:'weekly',weekday:5,time:'12:00'});
  assert.equal(backupIsDue(local(2026,11,10,23),setting,null),false);
  assert.equal(backupIsDue(local(2026,11,13,12),setting,null),true);
 });
 check('El domingo se considera fin de la semana que empezó lunes',()=>{
  const setting=config({frequency:'weekly',weekday:0,time:'09:00'});
  assert.equal(scheduledBackupDate(local(2026,11,9),setting).getDate(),15);
  assert.equal(backupIsDue(local(2026,11,15,9),setting,null),true);
 });
 check('Respaldo completado en el ciclo evita duplicados',()=>{
  const setting=config({frequency:'weekly',weekday:2,time:'20:00'});
  assert.equal(backupIsDue(local(2026,11,11,10),setting,stamp(local(2026,11,10,20,1))),false);
  assert.equal(backupIsDue(local(2026,11,17,20),setting,stamp(local(2026,11,10,20,1))),true);
 });
 check('Día 31 se ajusta al 28 de febrero en año común',()=>{
  const setting=config({frequency:'monthly',monthDay:31});
  const due=scheduledBackupDate(local(2027,2,20),setting);
  assert.equal(due.getDate(),28);assert.equal(due.getMonth(),1);
  assert.equal(backupIsDue(local(2027,2,27,23),setting,null),false);
  assert.equal(backupIsDue(local(2027,2,28,20),setting,null),true);
 });
 check('Día 31 se ajusta al 29 de febrero bisiesto',()=>{
  assert.equal(scheduledBackupDate(local(2028,2,15),config({frequency:'monthly',monthDay:31})).getDate(),29);
 });
 check('Día 31 se ajusta al 30 en abril',()=>{
  assert.equal(scheduledBackupDate(local(2027,4,1),config({frequency:'monthly',monthDay:31})).getDate(),30);
 });
 check('Mensual no se adelanta al principio de un nuevo mes',()=>{
  const setting=config({frequency:'monthly',monthDay:20,time:'08:30'});
  assert.equal(backupIsDue(local(2027,3,1,21),setting,stamp(local(2027,2,20,8,31))),false);
  assert.equal(backupIsDue(local(2027,3,20,8,30),setting,stamp(local(2027,2,20,8,31))),true);
 });
 check('Forzado manual previo al día no suprime el respaldo programado',()=>{
  const setting=config({frequency:'monthly',monthDay:10});
  assert.equal(backupIsDue(local(2027,3,10,20),setting,stamp(local(2027,3,5,11))),true);
 });
 check('Diario ejecuta una sola vez después de la hora',()=>{
  const setting=config({frequency:'daily',time:'15:00'});
  assert.equal(backupIsDue(local(2026,11,10,14),setting,null),false);
  assert.equal(backupIsDue(local(2026,11,10,15),setting,null),true);
  assert.equal(backupIsDue(local(2026,11,10,16),setting,stamp(local(2026,11,10,15,3))),false);
 });
 check('Nombre de archivo UTC se interpreta en UTC, no hora local',()=>{
  const date=new Date('2026-11-10T20:12:08.000Z');
  assert.equal(lastBackupTimestamp(stamp(date)).getTime(),date.getTime());
  assert.equal(lastBackupTimestamp('../copia-no-valida.sqlite'),null);
 });
 check('Programación desactivada nunca ejecuta',()=>{
  assert.equal(backupIsDue(local(2026,11,10,22),config({enabled:false}),null),false);
 });
 check('Configuración guardada inválida se recupera de forma segura',()=>{
  assert.deepEqual(normalizeBackupSettings({weekday:99,enabled:true}),{...BACKUP_DEFAULTS});
 });
 console.log(`QA programación de respaldos: ${total}/${total}`);
})().catch(e=>{console.error(e);process.exitCode=1});
