'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
let count=0;
async function check(name,fn){await fn();count++;console.log('OK Monitor v0.6.68:',name)}
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
(async()=>{
 const {createBackupHealthMonitor,mergeBackupHealthSnapshot,BACKUP_HEALTH_MONITOR_INTERVAL_MS}=await import(pathToFileURL(path.resolve(__dirname,'../src/backup-health-monitor.js')).href);
 const clock=()=>{const active=new Map();let next=0;return {active,schedule(fn,ms){const id=++next;active.set(id,{fn,ms});return id},cancel(id){active.delete(id)},tick(){return Promise.all([...active.values()].map(x=>x.fn()))}}};
 const monitor=(overrides={})=>{const timer=clock(),events={snapshots:[],errors:[]};let calls=0;const settings={
  fetchSnapshot:async()=>{calls++;return {health:'ok'}},
  onSnapshot:d=>events.snapshots.push(d),onFailure:(error)=>events.errors.push(error.message),
  schedule:timer.schedule,cancel:timer.cancel,...overrides};
  return {timer,events,get calls(){return calls},monitor:createBackupHealthMonitor(settings)};
 };
 await check('Un solo temporizador de 60 segundos y limpieza al abandonar Respaldos',async()=>{
  const t=monitor();t.monitor.start();t.monitor.start();assert.equal(t.timer.active.size,1);
  assert.equal([...t.timer.active.values()][0].ms,60_000);assert.equal(BACKUP_HEALTH_MONITOR_INTERVAL_MS,60_000);
  await t.monitor.check();assert.equal(t.events.snapshots.length,1);
  t.monitor.stop();assert.equal(t.timer.active.size,0);assert.equal(await t.monitor.check(),false);
 });
 await check('Entrada al módulo: primer diagnóstico sin esperar 60 segundos',async()=>{
  const t=monitor();t.monitor.start({immediate:true});await new Promise(setImmediate);
  assert.equal(t.calls,1);assert.equal(t.events.snapshots.length,1);t.monitor.stop();
 });
 await check('Cada tick actualiza y no requiere pulsar el botón',async()=>{
  const t=monitor();t.monitor.start();await t.timer.tick();await new Promise(setImmediate);
  assert.equal(t.calls,1);assert.equal(t.events.snapshots.length,1);t.monitor.stop();
 });
 await check('Una solicitud activa no permite duplicar consultas automáticas ni manuales',async()=>{
  const response=defer(),t=monitor({fetchSnapshot:()=>response.promise});
  t.monitor.start();const a=t.monitor.check();const b=t.monitor.check({manual:true});
  await t.timer.tick();assert.equal(a,b);
  response.resolve({health:'ok'});assert.equal(await a,true);
  assert.equal(t.events.snapshots.length,1);t.monitor.stop();
 });
 await check('No consulta durante operación de copia o con pantalla oculta',async()=>{
  let busy=true,visible=true;const t=monitor({isBusy:()=>busy,isVisible:()=>visible});t.monitor.start();
  await t.monitor.check();await t.timer.tick();assert.equal(t.calls,0);
  busy=false;visible=false;await t.monitor.check();assert.equal(t.calls,0);
  visible=true;await t.monitor.check();assert.equal(t.calls,1);t.monitor.stop();
 });
 await check('Ignora resultados tardíos tras abandonar el módulo',async()=>{
  const response=defer(),t=monitor({fetchSnapshot:()=>response.promise});
  t.monitor.start();const pending=t.monitor.check();t.monitor.stop();
  response.resolve({health:'outdated'});assert.equal(await pending,false);
  assert.equal(t.events.snapshots.length,0);
 });
 await check('Un resultado antiguo no pisa una nueva apertura del módulo',async()=>{
  const old=defer(),fresh=defer();let step=0;
  const t=monitor({fetchSnapshot:()=>++step===1?old.promise:fresh.promise});
  t.monitor.start();const first=t.monitor.check();t.monitor.stop();t.monitor.start();
  const second=t.monitor.check();old.resolve({health:'antiguo'});await first;
  fresh.resolve({health:'nuevo'});await second;
  assert.deepEqual(t.events.snapshots,[{health:'nuevo'}]);t.monitor.stop();
 });
 await check('Fallo no elimina el monitor y puede recuperarse en el siguiente intento',async()=>{
  let times=0;const t=monitor({fetchSnapshot:async()=>{if(++times===1)throw Error('USB desconectado');return {health:'ok'}}});
  t.monitor.start();assert.equal(await t.monitor.check(),false);assert.equal(t.events.errors[0],'USB desconectado');
  assert.equal(await t.monitor.check(),true);assert.equal(t.events.snapshots.length,1);t.monitor.stop();
 });
 await check('Conserva referencia del historial y resultados cuando los archivos no cambian',async()=>{
  const files=['a.sqlite','b.sqlite'];const previous={files,directory:'X:/copias',health:{state:'ok'}};
  const next={files:['a.sqlite','b.sqlite'],directory:'X:/copias',health:{state:'pending'}};
  const merged=mergeBackupHealthSnapshot(previous,next);
  assert.equal(merged.files,files);assert.deepEqual(merged.health,{state:'pending'});
 });
 await check('Cambio de carpeta o historial invalida las comprobaciones antiguas',async()=>{
  const previous={files:['a.sqlite'],directory:'C:/copias'};
  const changed=mergeBackupHealthSnapshot(previous,{files:['a.sqlite'],directory:'D:/copias'});
  assert.notEqual(changed.files,previous.files);
  const more=mergeBackupHealthSnapshot(previous,{files:['a.sqlite','b.sqlite'],directory:'C:/copias'});
  assert.notEqual(more.files,previous.files);
 });
 await check('No inicia el temporizador ni llama al servidor si no se abrió el módulo',async()=>{
  const t=monitor();assert.equal(t.timer.active.size,0);assert.equal(await t.monitor.check(),false);assert.equal(t.calls,0);
 });
 console.log(`QA monitor v0.6.68: ${count}/${count} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
