// FacturaCR v0.6.68: monitor de solo lectura del estado de los respaldos.
// Mantiene una única consulta en curso y cancela la publicación de resultados
// anteriores al cerrar el módulo, cerrar sesión o abandonar la pantalla.
export const BACKUP_HEALTH_MONITOR_INTERVAL_MS = 60_000;

export function mergeBackupHealthSnapshot(previous, incoming) {
  if (!previous || !incoming) return incoming;
  const oldFiles=previous.files, newFiles=incoming.files;
  const sameHistory=previous.directory===incoming.directory &&
    Array.isArray(oldFiles) && Array.isArray(newFiles) &&
    oldFiles.length===newFiles.length && oldFiles.every((file,i)=>file===newFiles[i]);
  return sameHistory ? {...incoming,files:oldFiles} : incoming;
}

export function createBackupHealthMonitor({
  fetchSnapshot, onSnapshot, onFailure,
  isBusy=()=>false, isVisible=()=>true,
  schedule=(callback,ms)=>setInterval(callback,ms),
  cancel=(timer)=>clearInterval(timer)
}) {
  let timer=null, generation=0, inFlight=null;
  const check=({manual=false}={})=>{
    if(timer===null || isBusy() || !isVisible()) return Promise.resolve(false);
    if(inFlight) return inFlight; // También evita duplicar peticiones desde el botón manual.
    const requestedGeneration=generation;
    const pending=(async()=>{
      try {
        const snapshot=await fetchSnapshot();
        if(timer!==null && generation===requestedGeneration) {
          onSnapshot(snapshot);
          return true;
        }
      } catch(error) {
        if(timer!==null && generation===requestedGeneration)onFailure(error,{manual});
      }
      return false;
    })();
    const tracked=pending.finally(()=>{
      if(inFlight===tracked)inFlight=null;
    });
    inFlight=tracked;
    return tracked;
  };
  const start=({immediate=false}={})=>{
    if(timer!==null) return;
    generation++;
    timer=schedule(()=>{void check();},BACKUP_HEALTH_MONITOR_INTERVAL_MS);
    if(immediate)void check();
  };
  const stop=()=>{
    generation++;
    if(timer!==null) cancel(timer);
    timer=null;
    // Consultas anteriores podrán terminar, pero nunca actualizarán la pantalla.
    inFlight=null;
  };
  return {start,stop,check};
}
