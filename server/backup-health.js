// FacturaCR v0.6.67 · Diagnóstico de programación y almacenamiento de copias.
// Solo lectura: nunca abre ni modifica archivos SQLite, carpetas ni preferencias.
import {backupIsDue,lastBackupTimestamp,scheduledBackupDate,validateBackupSettings} from './backup-schedule.js';

function nextScheduledDate(now,settings,last){
 if(!settings.enabled)return null;
 const scheduled=scheduledBackupDate(now,settings);
 // Si se pasó la hora y la copia correspondiente aún no existe, sigue pendiente.
 if(now<scheduled||!last||last<scheduled)return scheduled;
 // La copia correspondiente ya existe: calcular el próximo periodo sin usar
 // setMonth() sobre un día 29/30/31, porque saltaría meses cortos.
 const reference=new Date(now);
 if(settings.frequency==='daily')reference.setDate(reference.getDate()+1);
 else if(settings.frequency==='weekly')reference.setDate(reference.getDate()+7);
 else reference.setFullYear(reference.getFullYear(),reference.getMonth()+1,1);
 return scheduledBackupDate(reference,settings);
}

export function describeBackupHealth({now=new Date(),settings,files=[],directoryAvailable=true,freeBytes=null,requiredBytes=null,lastError='',busy=false}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Fecha de diagnóstico inválida.');
 if(!validateBackupSettings(settings))throw Error('Configuración de respaldos inválida.');
 const latest=Array.isArray(files)&&files.length?files[0]:null;
 const latestDate=lastBackupTimestamp(latest);
 const due=settings.enabled&&backupIsDue(now,settings,latest);
 const next=nextScheduledDate(now,settings,latestDate);
 const lowSpace=directoryAvailable&&Number.isFinite(freeBytes)&&Number.isFinite(requiredBytes)&&freeBytes<requiredBytes;
 let state='ok',title='Respaldos al día',detail='La programación y la ubicación guardada no muestran alertas.';
 if(!directoryAvailable){
  state='attention';title='Ubicación no disponible';detail='No se puede acceder a la carpeta configurada. Comprueba que la unidad esté conectada.';
 }else if(lastError){
  state='attention';title='Se necesita atención';detail='El último intento de respaldo produjo un error. Revisa el aviso y vuelve a probar.';
 }else if(lowSpace){
  state='attention';title='Espacio insuficiente';detail='El destino tiene poco espacio para generar una copia con margen de seguridad.';
 }else if(busy){
  state='running';title='Creando respaldo';detail='Hay una copia en proceso. Actualiza el historial al finalizar.';
 }else if(!settings.enabled){
  state='disabled';title='Respaldos automáticos desactivados';detail='Puedes crear copias manuales y activar una programación cuando quieras.';
 }else if(due){
  state='pending';title='Respaldo programado pendiente';detail='La hora programada ya llegó, pero no hay una copia de este período en el destino activo.';
 }else if(!latest){
  state='waiting';title='Esperando primera copia';detail='No hay copias en la carpeta actual. La primera se generará en el horario configurado mientras FacturaCR esté abierto.';
 }
 return {
  state,title,detail,scheduledEnabled:settings.enabled,
  lastBackupAt:latestDate?latestDate.toISOString():null,
  nextScheduledAt:next?next.toISOString():null,
  hasCopies:!!latest,copyCount:Array.isArray(files)?files.length:0,
  directoryAvailable:!!directoryAvailable,freeBytes:Number.isFinite(freeBytes)?freeBytes:null,
  requiredBytes:Number.isFinite(requiredBytes)?requiredBytes:null,
  lowSpace:!!lowSpace,hasLastError:!!lastError,
  checkedAt:now.toISOString()
 };
}
