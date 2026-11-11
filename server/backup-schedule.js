// Programación local de respaldos. Funciones puras, independientes de Express y SQLite.
// weekday: 0=domingo, 1=lunes ... 6=sábado; monthDay: 1..31.
export const BACKUP_DEFAULTS=Object.freeze({enabled:false,frequency:'daily',time:'20:00',keep:14,weekday:1,monthDay:1,directoryMode:'default',customDirectory:''});

export function validateBackupSettings(value){
 return !!value && typeof value==='object' &&
  typeof value.enabled==='boolean' &&
  ['daily','weekly','monthly'].includes(value.frequency) &&
  typeof value.time==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) &&
  Number.isInteger(value.keep) && value.keep>=1 && value.keep<=365 &&
  Number.isInteger(value.weekday) && value.weekday>=0 && value.weekday<=6 &&
  Number.isInteger(value.monthDay) && value.monthDay>=1 && value.monthDay<=31 &&
  ['default','custom'].includes(value.directoryMode) &&
  typeof value.customDirectory==='string' && value.customDirectory.length<=1024 &&
  (value.directoryMode==='default' || value.customDirectory.trim().length>0);
}

export function normalizeBackupSettings(raw){
 // Lee también configuraciones antiguas que todavía no tenían día personalizado.
 const next={...BACKUP_DEFAULTS,...(raw && typeof raw==='object' && !Array.isArray(raw)?raw:{})};
 return validateBackupSettings(next)?next:{...BACKUP_DEFAULTS};
}

export function scheduledBackupDate(now,settings){
 if(!(now instanceof Date) || !Number.isFinite(now.getTime()))throw Error('Fecha de respaldo inválida.');
 if(!validateBackupSettings(settings))throw Error('Programación de respaldo inválida.');
 const [hour,minute]=settings.time.split(':').map(Number);
 const due=new Date(now.getTime());due.setHours(hour,minute,0,0);
 if(settings.frequency==='weekly'){
  // La semana comienza en lunes: domingo pertenece a la misma semana que el lunes anterior.
  due.setDate(due.getDate()-((now.getDay()+6)%7)+(settings.weekday+6)%7);
 }else if(settings.frequency==='monthly'){
  // El día 31 se ejecuta el último día de febrero, abril, junio, etc.
  const lastDay=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  due.setDate(Math.min(settings.monthDay,lastDay));
 }
 return due;
}

export function lastBackupTimestamp(filename){
 const match=/^FacturaCR_auto_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.sqlite$/.exec(String(filename||''));
 if(!match)return null;
 // Los nombres se generan con toISOString() en UTC; evitar interpretarlos como hora local.
 const parsed=new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
 return Number.isFinite(parsed.getTime())?parsed:null;
}

export function backupIsDue(now,settings,latestFile){
 if(!settings.enabled)return false;
 const due=scheduledBackupDate(now,settings);
 if(now<due)return false;
 const last=lastBackupTimestamp(latestFile);
 return !last || last<due;
}
