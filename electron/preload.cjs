const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('facturacrPrinter',{print:(html,settings)=>ipcRenderer.invoke('facturacr:print-ticket',html,settings),list:()=>ipcRenderer.invoke('facturacr:list-printers')});

contextBridge.exposeInMainWorld('facturacrReports',{savePdf:(html,filename,options)=>ipcRenderer.invoke('facturacr:save-sales-pdf',html,filename,options)});

contextBridge.exposeInMainWorld('facturacrBackups',{openFolder:()=>ipcRenderer.invoke('facturacr:open-backups-folder'),chooseFolder:()=>ipcRenderer.invoke('facturacr:choose-backups-folder')});

// v0.6.74: el navegador no recibe rutas ni bytes del certificado.
// Elegir el archivo NO transmite la contraseña; Aceptar es una acción separada.
contextBridge.exposeInMainWorld('facturacrSignature',{
 chooseP12:(companyId)=>ipcRenderer.invoke('facturacr:choose-p12',companyId),
 inspectP12:(passphrase,companyId,token)=>ipcRenderer.invoke('facturacr:inspect-p12',passphrase,companyId,token),
 clearP12:(token)=>ipcRenderer.invoke('facturacr:clear-p12',token),
 inspectXadesPolicy:()=>ipcRenderer.invoke('facturacr:inspect-xades-policy'),
 runXadesCryptoLab:()=>ipcRenderer.invoke('facturacr:xades-crypto-lab'),
 runXadesXmlLab:()=>ipcRenderer.invoke('facturacr:xades-xml-lab')
});
