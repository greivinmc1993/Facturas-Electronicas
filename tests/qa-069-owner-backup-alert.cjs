'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
 const {getOwnerBackupNotice,getOwnerBackupCheckFailure}=await import(pathToFileURL(path.resolve(__dirname,'../src/backup-owner-notice.js')));
 let count=0;
 const test=(name,fn)=>{fn();count++;console.log('OK Avisos v0.6.69:',name)};
 test('Sin datos válidos no se muestra un estado inventado',()=>{
  assert.equal(getOwnerBackupNotice(null),null);
  assert.equal(getOwnerBackupNotice(undefined),null);
  assert.equal(getOwnerBackupNotice('ok'),null);
 });
 test('Respaldos al día no producen aviso innecesario',()=>assert.equal(getOwnerBackupNotice({state:'ok'}),null));
 test('Creación de respaldo en curso no produce alarma falsa',()=>assert.equal(getOwnerBackupNotice({state:'running'}),null));
 test('Automáticos desactivados intencionalmente no se trata como problema',()=>assert.equal(getOwnerBackupNotice({state:'disabled'}),null));
 test('Carpeta no disponible tiene prioridad sobre otras alertas',()=>{
  const notice=getOwnerBackupNotice({state:'attention',directoryAvailable:false,lowSpace:true,hasLastError:true});
  assert.equal(notice.severity,'warning');assert.match(notice.title,/carpeta.*no está disponible/);
 });
 test('Almacenamiento insuficiente muestra acción sin números sensibles',()=>{
  const notice=getOwnerBackupNotice({state:'attention',directoryAvailable:true,lowSpace:true,freeBytes:123});
  assert.match(notice.title,/espacio/);assert.doesNotMatch(notice.detail,/123/);
 });
 test('Fallo reciente del programador informa sin revelar el error técnico',()=>{
  const notice=getOwnerBackupNotice({state:'attention',hasLastError:true,lastError:'D:\\Users\\secret\\sqlite'});
  assert.match(notice.title,/error/);assert.doesNotMatch(JSON.stringify(notice),/secret|sqlite/);
 });
 test('Estado de atención desconocido pide revisión sin declarar éxito',()=>{
  assert.equal(getOwnerBackupNotice({state:'attention'}).severity,'warning');
 });
 test('Respaldo pendiente muestra alerta antes de entrar al módulo',()=>{
  const notice=getOwnerBackupNotice({state:'pending'});assert.equal(notice.severity,'warning');assert.match(notice.title,/pendiente/);
 });
 test('Primer respaldo faltante presenta información y no estado crítico',()=>{
  const notice=getOwnerBackupNotice({state:'waiting',hasCopies:false});assert.equal(notice.severity,'info');
 });
 test('Estado waiting con copia existente no crea falso aviso',()=>{
  assert.equal(getOwnerBackupNotice({state:'waiting',hasCopies:true}),null);
 });
 test('Estados futuros desconocidos fallan sin inventar alertas',()=>{
  assert.equal(getOwnerBackupNotice({state:'unknown'}),null);
 });
 test('Error de consulta no se confunde con copia al día',()=>{
  const notice=getOwnerBackupCheckFailure();assert.equal(notice.severity,'info');assert.match(notice.title,/No se pudo comprobar/);
 });
 console.log(`QA alertas preventivas v0.6.69: ${count}/${count} aprobadas`);
})().catch(err=>{console.error(err);process.exitCode=1});
