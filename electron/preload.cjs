const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('facturacrPrinter',{print:(html,settings)=>ipcRenderer.invoke('facturacr:print-ticket',html,settings),list:()=>ipcRenderer.invoke('facturacr:list-printers')});

contextBridge.exposeInMainWorld('facturacrReports',{savePdf:(html,filename,options)=>ipcRenderer.invoke('facturacr:save-sales-pdf',html,filename,options)});

contextBridge.exposeInMainWorld('facturacrBackups',{openFolder:()=>ipcRenderer.invoke('facturacr:open-backups-folder'),chooseFolder:()=>ipcRenderer.invoke('facturacr:choose-backups-folder')});
