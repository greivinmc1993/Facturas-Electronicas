// FacturaCR v0.6.69 · Avisos preventivos del propietario.
// Solo interpreta el diagnóstico emitido por el servidor; no inspecciona
// archivos, ni muestra nombres, rutas o contenido de respaldos.
export function getOwnerBackupNotice(health) {
  if (!health || typeof health !== 'object') return null;
  if (health.state === 'attention') {
    if (health.directoryAvailable === false) return {
      severity:'warning', title:'La carpeta de respaldos no está disponible',
      detail:'Comprueba la unidad o carpeta configurada antes de crear otra copia.'
    };
    if (health.lowSpace === true) return {
      severity:'warning', title:'Poco espacio para respaldar',
      detail:'El destino podría no tener espacio suficiente. Revisa su capacidad en Respaldos.'
    };
    if (health.hasLastError === true) return {
      severity:'warning', title:'El último respaldo presentó un error',
      detail:'Revisa el diagnóstico y comprueba la copia antes de depender de ella.'
    };
    return {
      severity:'warning', title:'Revisa la protección de los respaldos',
      detail:'El diagnóstico detectó un problema que necesita atención.'
    };
  }
  if (health.state === 'pending') return {
    severity:'warning', title:'Hay un respaldo automático pendiente',
    detail:'La hora programada ya pasó y falta una copia del período. Revisa Respaldos.'
  };
  if (health.state === 'waiting' && health.hasCopies === false) return {
    severity:'info', title:'Todavía no hay una copia en la carpeta actual',
    detail:'Crea y verifica un primer respaldo para proteger los datos de las empresas.'
  };
  // No convertir el estado desactivado voluntariamente en alarma.
  // Las copias al día y las operaciones en curso no requieren aviso preventivo.
  return null;
}

export function getOwnerBackupCheckFailure() {
  return {
    severity:'info', title:'No se pudo comprobar el estado de los respaldos',
    detail:'Puedes abrir Respaldos y pulsar «Actualizar estado» para volver a consultar.'
  };
}
