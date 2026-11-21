const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('facturacrPrinter',{print:(html,settings)=>ipcRenderer.invoke('facturacr:print-ticket',html,settings),list:()=>ipcRenderer.invoke('facturacr:list-printers')});

contextBridge.exposeInMainWorld('facturacrReports',{
 savePdf:(html,filename,options)=>ipcRenderer.invoke('facturacr:save-sales-pdf',html,filename,options),
 renderCashClosurePdf:html=>ipcRenderer.invoke('facturacr:render-cash-closure-pdf',html),
 openCashClosurePdf:(pdfBase64,companyId,sessionId)=>ipcRenderer.invoke('facturacr:open-cash-closure-pdf',pdfBase64,companyId,sessionId),
 cashClosureFolder:()=>ipcRenderer.invoke('facturacr:cash-closure-folder'),
 chooseCashClosureFolder:()=>ipcRenderer.invoke('facturacr:choose-cash-closure-folder'),
 defaultCashClosureFolder:()=>ipcRenderer.invoke('facturacr:default-cash-closure-folder'),
 saveCashClosureCopy:details=>ipcRenderer.invoke('facturacr:save-cash-closure-copy',details),
 openCashClosureFolder:()=>ipcRenderer.invoke('facturacr:open-cash-closure-folder')
});

contextBridge.exposeInMainWorld('facturacrBackups',{openFolder:()=>ipcRenderer.invoke('facturacr:open-backups-folder'),chooseFolder:()=>ipcRenderer.invoke('facturacr:choose-backups-folder')});

// v0.6.74: el navegador no recibe rutas ni bytes del certificado.
// Elegir el archivo NO transmite la contraseña; Aceptar es una acción separada.
contextBridge.exposeInMainWorld('facturacrSignature',{
 chooseP12:(companyId)=>ipcRenderer.invoke('facturacr:choose-p12',companyId),
 inspectP12:(passphrase,companyId,token,companyIdentification)=>ipcRenderer.invoke('facturacr:inspect-p12',passphrase,companyId,token,companyIdentification),
 clearP12:(token)=>ipcRenderer.invoke('facturacr:clear-p12',token),
 inspectXadesPolicy:()=>ipcRenderer.invoke('facturacr:inspect-xades-policy'),
 runXadesCryptoLab:()=>ipcRenderer.invoke('facturacr:xades-crypto-lab'),
 runXadesXmlLab:()=>ipcRenderer.invoke('facturacr:xades-xml-lab'),
 runXadesXmlVariants:()=>ipcRenderer.invoke('facturacr:xades-xml-variants'),
 saveXadesXmlDemo:()=>ipcRenderer.invoke('facturacr:save-xades-xml-demo'),
 verifyXadesXmlDemo:()=>ipcRenderer.invoke('facturacr:verify-xades-xml-demo'),
 checkXadesEngine:()=>ipcRenderer.invoke('facturacr:check-xades-engine'),
 runIntegratedXadesLab:()=>ipcRenderer.invoke('facturacr:xades-integrated-lab')
});

// v0.6.90: el usuario elige carpeta XSD en un diálogo de Electron.
// No se exponen rutas locales ni permisos de archivos al navegador.
contextBridge.exposeInMainWorld('facturacrXsd',{
 validateDraft:(xml,documentType)=>ipcRenderer.invoke('facturacr:validate-local-xsd',{xml,documentType})
});
