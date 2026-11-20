const {app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage} = require('electron');
const {createMailSettingsStore}=require('./mail-settings.cjs');
const {createP12SelectionManager}=require('./fe-certificate-selection.cjs');
const {inspectPolicyPdf}=require('./fe-xades-policy.cjs');
const {runLocalCryptoLab}=require('./fe-xades-crypto-lab.cjs');
const {runXmlProof,runXmlVariantsProof}=require('./fe-xades-xml-lab.cjs');
const {saveSyntheticXml}=require('./fe-xades-demo-export.cjs');
const {inspectSavedDemoXml}=require('./fe-xades-demo-verifier.cjs');
const {diagnoseXadesEngine}=require('./fe-xades-engine-readiness.cjs');
const fs=require('node:fs/promises');
const path = require('node:path');
const {randomBytes}=require('node:crypto');
let server;
let mainWindow;
const dev = process.argv.includes('--dev');
// QA opcional: el ejecutable empaquetado usa datos aislados y genera una prueba de arranque.
// No se activa en el uso normal del programa.
const qaSmoke = process.argv.includes('--qa-smoke');
const qaArg = name => process.argv.find(arg => arg.startsWith(name+'='))?.slice(name.length+1);
const qaResultFile = qaSmoke ? qaArg('--qa-result') : null;
const qaDataDir = qaSmoke ? qaArg('--qa-data-dir') : null;
if(qaSmoke){
  if(!qaResultFile || !qaDataDir || !path.isAbsolute(qaResultFile) || !path.isAbsolute(qaDataDir)){
    console.error('QA empaquetado requiere --qa-result y --qa-data-dir absolutos');
    process.exit(2);
  }
  app.setPath('userData',qaDataDir);
}
let qaErrors=[];
async function writeSmokeResult(result){
 if(!qaSmoke)return;
 try{
  await fs.mkdir(path.dirname(qaResultFile),{recursive:true});
  await fs.writeFile(qaResultFile,JSON.stringify({...result,version:app.getVersion(),errors:qaErrors},null,2));
 }catch(error){console.error('No se pudo guardar evidencia QA:',error)}
}
// QA del ejecutable REAL: comprobar pantalla protegida primero y luego interfaz autorizada.
// Nunca se inyecta una sesión ni se desactiva la autenticación: se usan los endpoints normales.
async function runPackagedSmoke(){
 const inspect=`(() => {
   const root=document.getElementById('root');
   const text=(root?.innerText||'').trim();
   const nav=Array.from(document.querySelectorAll('aside nav button'));
   return {
     title:document.title,rootPresent:!!root,visibleCharacters:text.length,
     hasBrand:text.includes('FacturaCR')||text.includes('FACTURACR'),
     authHeading:document.querySelector('.authPanel h1')?.innerText||'',
     authFormVisible:!!document.querySelector('.authPanel form'),
     navButtons:nav.length,
     hasCompanyNavigation:nav.some(b=>b.innerText.includes('Empresas')),
     preloadPrinter:typeof window.facturacrPrinter?.list==='function',
     preloadReports:typeof window.facturacrReports?.savePdf==='function',
     preloadBackups:typeof window.facturacrBackups?.openFolder==='function',
     preloadSignature:typeof window.facturacrSignature?.inspectP12==='function'&&
       typeof window.facturacrSignature?.chooseP12==='function'&&
       typeof window.facturacrSignature?.clearP12==='function',
     preloadIntegratedXades:typeof window.facturacrSignature?.runIntegratedXadesLab==='function',
     preloadBackupPicker:typeof window.facturacrBackups?.chooseFolder==='function'
   };
 })()`;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function waitFor(predicate,description){
   let dom;
   for(let i=0;i<50;i++){
     dom=await mainWindow.webContents.executeJavaScript(inspect,true);
     if(predicate(dom))return dom;
     await pause(250);
   }
   throw Error(description+': '+JSON.stringify(dom));
 }
 const request=async(method,url,body)=>mainWindow.webContents.executeJavaScript(`(async()=>{
   const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},
     credentials:'same-origin',headers:{'Content-Type':'application/json'},
     ${body===undefined?'':`body:${JSON.stringify(JSON.stringify(body))},`}
     cache:'no-store'});
   return {status:r.status,body:await r.json()};
 })()`,true);
 // En la primera instalación no hay propietario; tras reinstalarlo debe persistir.
 // La sesión HTTP es en memoria y por tanto se inicia de nuevo de forma normal.
 const firstStatus=await request('GET','/api/auth/status');
 if(firstStatus.status!==200||firstStatus.body.authenticated!==false||
    typeof firstStatus.body.setupRequired!=='boolean')
   throw Error('Estado inicial de seguridad incorrecto: '+JSON.stringify(firstStatus));
 const needsSetup=firstStatus.body.setupRequired;
 const expectedHeading=needsSetup?'Configurar propietario':'Iniciar sesión';
 const initial=await waitFor(d=>d.authHeading===expectedHeading&&d.authFormVisible,
   'No apareció el formulario seguro esperado ('+expectedHeading+')');
 if(initial.navButtons!==0||initial.hasCompanyNavigation)
   throw Error('El menú comercial no debe verse antes de iniciar sesión.');
 if(!initial.preloadPrinter||!initial.preloadReports||!initial.preloadBackups||!initial.preloadBackupPicker)
   throw Error('El preload de Electron no está disponible en el acceso protegido: '+JSON.stringify(initial));
 const beforeLogin=await request('GET','/api/companies');
 if(needsSetup){
   if(beforeLogin.status!==428||beforeLogin.body.code!=='OWNER_SETUP_REQUIRED')
     throw Error('La API debe exigir configurar propietario: '+JSON.stringify(beforeLogin));
 }else if(beforeLogin.status!==401||beforeLogin.body.code!=='AUTH_REQUIRED'){
   throw Error('La API debe exigir autenticación al reinstalar: '+JSON.stringify(beforeLogin));
 }
 // La contraseña compartida entre los dos arranques de QA se pasa exclusivamente
 // por una variable de entorno del proceso hijo, nunca por argumentos, SQLite ni evidencias.
 // En el ensayo de arranque individual se genera una contraseña nueva al vuelo.
 const qaPassword=process.env.FACTURACR_QA_OWNER_PASSWORD;
 const owner={username:'qa_propietario',displayName:'Propietario temporal de QA',
   password:qaPassword||(needsSetup?'QaSeguro1234'+randomBytes(20).toString('hex'):null)};
 if(!owner.password)throw Error('Falta la contraseña efímera del propietario QA para verificar la reinstalación.');
 if(needsSetup){
   const setup=await request('POST','/api/auth/setup',owner);
   if(setup.status!==201||setup.body.ok!==true)
     throw Error('Configuración inicial del propietario falló: '+JSON.stringify(setup));
   const afterSetup=await request('GET','/api/auth/status');
   if(afterSetup.status!==200||afterSetup.body.setupRequired!==false||afterSetup.body.authenticated!==false)
     throw Error('Estado posterior a configuración incorrecto: '+JSON.stringify(afterSetup));
   const beforeLoginAfterSetup=await request('GET','/api/companies');
   if(beforeLoginAfterSetup.status!==401||beforeLoginAfterSetup.body.code!=='AUTH_REQUIRED')
     throw Error('La API debe seguir protegida sin login: '+JSON.stringify(beforeLoginAfterSetup));
 }
 const login=await request('POST','/api/auth/login',{username:owner.username,password:owner.password});
 if(login.status!==200||login.body.user?.isOwner!==true)
   throw Error('No se pudo autenticar al propietario de QA: '+JSON.stringify(login));
 // La cookie HttpOnly se establece normalmente por HTTP; nunca llega al reporte.
 await mainWindow.loadURL(`http://127.0.0.1:${server.port}/`);
 const dom=await waitFor(d=>d.rootPresent&&d.visibleCharacters>100&&d.navButtons>=4&&d.hasCompanyNavigation,
   'El menú comercial no apareció después de autenticarse');
 if(!dom.preloadPrinter||!dom.preloadReports||!dom.preloadBackups||!dom.preloadBackupPicker||!dom.preloadSignature||!dom.preloadIntegratedXades)
   throw Error('La interfaz autenticada perdió las APIs preload: '+JSON.stringify(dom));
 const status=await request('GET','/api/auth/status');
 if(status.status!==200||status.body.authenticated!==true||status.body.user?.isOwner!==true)
   throw Error('La sesión autenticada no se restauró tras recargar: '+JSON.stringify(status));
 const companyResponse=await request('GET','/api/companies');
 if(companyResponse.status!==200||!Array.isArray(companyResponse.body))
   throw Error('API comercial del propietario no respondió: '+JSON.stringify(companyResponse));
 const health=await request('GET','/api/health');
 if(health.status!==200||health.body?.ok!==true||health.body.version!==app.getVersion())
   throw Error('Servidor interno no respondió correctamente: '+JSON.stringify(health));
 // QA empaquetado REAL: prueba XAdESjs desde preload y el proceso principal.
 // Nunca toca el .p12 ni procesa datos de ventas; falla si faltan módulos ASAR.
 const lab=await mainWindow.webContents.executeJavaScript(
   `window.facturacrSignature.runIntegratedXadesLab()`,true);
 if(lab?.success!==true||lab.report?.verifiedCount!==3||
    lab.report?.mutationsRejected!==6||lab.report?.canIssue!==false||
    lab.report?.usesRealCertificate!==false)
   throw Error('El laboratorio XAdESjs empaquetado no superó sus pruebas criptográficas: '+JSON.stringify(lab));
 const shot=qaArg('--qa-screenshot');
 if(shot&&path.isAbsolute(shot)){
   await fs.mkdir(path.dirname(shot),{recursive:true});
   await fs.writeFile(shot,(await mainWindow.webContents.capturePage()).toPNG());
 }
 return {success:true,dom,health:health.body,integratedXadesProof:{verifiedCount:lab.report.verifiedCount,mutationsRejected:lab.report.mutationsRejected,nonFiscal:true},
   security:{initialOwnerSetup:needsSetup,existingOwnerLogin:!needsSetup,
     blockedBeforeSetup:needsSetup,blockedBeforeLogin:true,
     authenticatedOwner:true,commercialScreenAfterLogin:true},screenshot:shot||null};
}

// v0.6.74: selección y aceptación son operaciones independientes.
// La ruta queda exclusivamente en memoria del proceso principal de Electron.
const certificateSelection=createP12SelectionManager();
const authorizedCertificateFrame=event=>event.sender===mainWindow?.webContents &&
  event.senderFrame===mainWindow?.webContents.mainFrame;
ipcMain.handle('facturacr:choose-p12',async(event,companyId)=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{
  certificateSelection.clearAll();
  const chosen=await dialog.showOpenDialog(mainWindow,{
   title:'Seleccionar certificado digital (.p12 / .pfx)',
   properties:['openFile'],filters:[{name:'Certificado PKCS#12',extensions:['p12','pfx']}]
  });
  if(chosen.canceled||!chosen.filePaths?.[0])return {success:false,cancelled:true};
  const selection=await certificateSelection.select(chosen.filePaths[0],companyId);
  return {success:true,selection};
 }catch{return {success:false,error:'No se pudo seleccionar el certificado. Revisa el formato y tamaño (máximo 4 MB).'};}
});
ipcMain.handle('facturacr:inspect-p12',async(event,passphrase,companyId,token)=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{
  const report=await certificateSelection.inspect(token,companyId,passphrase);
  return {success:true,report};
 }catch(err){
  // No comunicar rutas locales ni detalles de OpenSSL al proceso de interfaz.
  if(/Vuelve a seleccionar|El certificado cambió|Introduce la contraseña/.test(err.message))
   return {success:false,error:err.message};
  return {success:false,error:'No se pudo verificar el certificado. Comprueba la contraseña y el archivo.'};
 }
});
ipcMain.handle('facturacr:clear-p12',async(event,token)=>{
 if(!authorizedCertificateFrame(event))return false;
 return certificateSelection.clear(token);
});
// v0.6.76: el usuario elige un PDF local, nunca proporciona una ruta arbitraria
// a Electron. La huella es SOLO cotejo con un ejemplo normativo, no autorización.
ipcMain.handle('facturacr:inspect-xades-policy',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{
  const chosen=await dialog.showOpenDialog(mainWindow,{
   title:'Seleccionar PDF de política XAdES-EPES para cotejo local',
   properties:['openFile'],filters:[{name:'Documento PDF',extensions:['pdf']}]
  });
  if(chosen.canceled||!chosen.filePaths?.[0])return {success:false,cancelled:true};
  const report=await inspectPolicyPdf(chosen.filePaths[0]);
  return {success:true,report};
 }catch{return {success:false,error:'No se pudo revisar el PDF. Elige un archivo válido de hasta 12 MB.'};}
});
// v0.6.77: laboratorio RSA sobre datos ficticios, sin certificados ni XML fiscales.
ipcMain.handle('facturacr:xades-crypto-lab',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{return {success:true,report:await runLocalCryptoLab()};}
 catch{return {success:false,error:'No pudo completarse el ensayo criptográfico local.'};}
});
// 0.6.78: prueba XMLDSig/XAdES exclusiva de XML ficticio y clave generada en memoria.
ipcMain.handle('facturacr:xades-xml-lab',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{return {success:true,report:await runXmlProof()};}
 catch{return {success:false,error:'Falló el prototipo XMLDSig de laboratorio.'};}
});
// v0.6.80: tres escenarios totalmente sintéticos. No recibe XML ni datos fiscales.
ipcMain.handle('facturacr:xades-xml-variants',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{return {success:true,report:await runXmlVariantsProof()};}
 catch{return {success:false,error:'No se pudo completar la comparación de plantillas ficticias.'};}
});
// 0.6.79: entrega únicamente un XML sintético mediante diálogo nativo.
// El renderer no suministra contenido, rutas, certificados ni contraseñas.
ipcMain.handle('facturacr:save-xades-xml-demo',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{
  return await saveSyntheticXml({
   showSaveDialog:opts=>dialog.showSaveDialog(mainWindow,opts),
   writeFile:(filename,bytes,options)=>fs.writeFile(filename,bytes,options),
   documentsPath:app.getPath('documents')
  });
 }catch(error){
  return {success:false,error:error?.code==='EEXIST'
   ?'Ese archivo ya existe. Elige otro nombre para conservar el anterior.'
   :'No se pudo guardar el XML de prueba. Comprueba la carpeta y los permisos.'};
 }
});
// v0.6.81: reabre una exportación ficticia en el proceso principal y verifica
// datos + SignedProperties + RSA-SHA256 SIN invocar al generador de firmas.
// NO es un verificador XMLDSig de propósito general ni acepta facturas fiscales.
ipcMain.handle('facturacr:verify-xades-xml-demo',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{return await inspectSavedDemoXml({
  showOpenDialog:opts=>dialog.showOpenDialog(mainWindow,opts),
  lstat:filename=>fs.lstat(filename),
  openFile:(filename,flags)=>fs.open(filename,flags)
 });}
 catch{return {success:false,error:'No se pudo abrir el XML de laboratorio seleccionado. Comprueba el archivo y sus permisos.'};}
});
// v0.6.82: diagnóstico local, no firma, no recibe datos ni certificados.
ipcMain.handle('facturacr:check-xades-engine',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 try{return {success:true,report:await diagnoseXadesEngine()};}
 catch{return {success:false,error:'No fue posible completar el diagnóstico local.'};}
});
// v0.6.85: la carga ESM de XAdESjs es tardía y se usa solo con XML sintético.
// El IPC NO admite XML, rutas, .p12, contraseñas ni datos del renderer.
let integratedXadesRunning=false;
ipcMain.handle('facturacr:xades-integrated-lab',async event=>{
 if(!authorizedCertificateFrame(event))return {success:false,error:'Ventana no autorizada.'};
 if(integratedXadesRunning)return {success:false,error:'Ya existe un ensayo XAdESjs en curso.'};
 integratedXadesRunning=true;
 try{
  const {runIntegratedSyntheticSuite}=await import('./fe-xades-integrated-lab.mjs');
  const report=await runIntegratedSyntheticSuite();
  return {success:true,report};
 }catch{
  return {success:false,error:'No pudo completarse el ensayo XAdESjs de laboratorio. Comprueba las dependencias instaladas y vuelve a ejecutar QA.'};
 }finally{integratedXadesRunning=false;}
});
ipcMain.handle('facturacr:list-printers',async event=>{if(event.sender!==mainWindow?.webContents)throw Error('Ventana no autorizada');return mainWindow.webContents.getPrintersAsync()});
ipcMain.handle('facturacr:print-ticket',async(event,html,settings={})=>{
 if(event.sender!==mainWindow?.webContents)return {success:false,error:'Ventana no autorizada'};
 if(typeof html!=='string'||html.length>1200000)return {success:false,error:'Tiquete inválido o demasiado grande'};
 const printWindow=new BrowserWindow({show:false,width:450,height:700,parent:mainWindow,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 try{
  await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  const printerName=String(settings.printerName||'');
  const silent=!!settings.silent;
  const copies=Math.max(1,Math.min(5,Number(settings.copies)||1));
  const printers=await mainWindow.webContents.getPrintersAsync();
  if(printerName&&!printers.some(p=>p.name===printerName))return {success:false,error:'La impresora configurada ya no está instalada en Windows.'};
  if(silent&&!printerName)return {success:false,error:'Selecciona una impresora para habilitar la impresión directa.'};
  return await new Promise(resolve=>printWindow.webContents.print({silent,deviceName:printerName||undefined,copies,printBackground:true,margins:{marginType:'none'}},(success,reason)=>resolve({success,cancelled:!success&&/cancel/i.test(String(reason)),error:success?'':reason||'Impresión cancelada o fallida'})));
 }catch(error){return {success:false,error:String(error.message||error)}}
 finally{if(!printWindow.isDestroyed())printWindow.destroy()}
});
// Genera un PDF real desde una ventana aislada, sin ventanas emergentes del navegador.
ipcMain.handle('facturacr:save-sales-pdf',async(event,html,filename,options={})=>{
 if(event.sender!==mainWindow?.webContents)return {success:false,error:'Ventana no autorizada'};
 if(typeof html!=='string'||html.length>5000000)return {success:false,error:'Reporte inválido o demasiado grande'};
 const safeName=String(filename||'FacturaCR_reporte.pdf').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120).replace(/\.pdf$/i,'')+'.pdf';
 const reportWindow=new BrowserWindow({show:false,width:1120,height:800,parent:mainWindow,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 try{
  const result=await dialog.showSaveDialog(mainWindow,{title:'Guardar documento como PDF',defaultPath:path.join(app.getPath('documents'),safeName),filters:[{name:'Archivo PDF',extensions:['pdf']}]});
  if(result.canceled||!result.filePath)return {success:false,cancelled:true};
  await reportWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await reportWindow.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
  const pdf=await reportWindow.webContents.printToPDF({pageSize:'A4',landscape:options?.landscape!==false,printBackground:true,margins:{top:0.5,bottom:0.5,left:0.5,right:0.5}});
  await fs.writeFile(result.filePath,pdf);
  return {success:true,path:result.filePath};
 }catch(error){return {success:false,error:String(error.message||error)}}
 finally{if(!reportWindow.isDestroyed())reportWindow.destroy()}
});
// El renderer nunca elige una ruta por texto. Electron muestra el explorador nativo.
async function activeBackupFolder(){
 if(server?.getBackupDirectory)return server.getBackupDirectory();
 // En desktop:dev el servidor es otro proceso y usa ./data.
 const root=dev?path.join(process.cwd(),'data'):app.getPath('userData');
 try{
  const cfg=JSON.parse(await fs.readFile(path.join(root,'automatic-backup-settings.json'),'utf8'));
  if(cfg.directoryMode==='custom'&&typeof cfg.customDirectory==='string'&&path.isAbsolute(cfg.customDirectory))return cfg.customDirectory;
 }catch{} 
 return path.join(root,'automatic-backups');
}
ipcMain.handle('facturacr:choose-backups-folder',async event=>{
 if(event.sender!==mainWindow?.webContents)return {success:false,error:'Ventana no autorizada'};
 try{
  const result=await dialog.showOpenDialog(mainWindow,{
   title:'Seleccionar carpeta de respaldos de FacturaCR',
   defaultPath:app.getPath('documents'),
   properties:['openDirectory','createDirectory']
  });
  if(result.canceled||!result.filePaths?.[0])return {success:false,cancelled:true};
  return {success:true,path:result.filePaths[0]};
 }catch(error){return {success:false,error:String(error.message||error)}}
});
ipcMain.handle('facturacr:open-backups-folder',async event=>{
 if(event.sender!==mainWindow?.webContents)return {success:false,error:'Ventana no autorizada'};
 try{
  const folder=await activeBackupFolder();
  if(folder===path.join(dev?path.join(process.cwd(),'data'):app.getPath('userData'),'automatic-backups'))
   await fs.mkdir(folder,{recursive:true});
  else if(!(await fs.stat(folder)).isDirectory())throw Error('La ruta de respaldo no es una carpeta.');
  const error=await shell.openPath(folder);
  return error?{success:false,error}:{success:true};
 }catch(e){return {success:false,error:'No se pudo abrir la carpeta configurada: '+String(e.message||e)}}
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    if (!dev) {
      const {startServer} = await import('../server/index.js');
      server = await startServer({dataDir:app.getPath('userData'),port:0,staticDir:path.join(__dirname,'../dist'),
        mailSettingsStore:createMailSettingsStore({dataDir:app.getPath('userData'),safeStorage})});
    }
    mainWindow = new BrowserWindow({width:1180,height:760,minWidth:850,minHeight:580,
      title:'FacturaCR', icon:path.join(__dirname,'../build/icon.png'),
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
    mainWindow.on('closed',()=>certificateSelection.clearAll());
    if(qaSmoke){
      mainWindow.webContents.on('render-process-gone',(_event,details)=>qaErrors.push('Renderer cerrado: '+details.reason));
      mainWindow.webContents.on('console-message',(_event,details)=>{
        if(details.level==='error'||details.level===3) qaErrors.push(String(details.message).slice(0,500));
      });
    }
    // Links oficiales: abrir en navegador del sistema sin habilitar navegación externa
    // dentro de Electron. No permitir URLs arbitrarias ni javascript:/file:.
    const officialPages=new Set([
      'https://www.hacienda.go.cr/ClasificacionActividadesEconomicas.html',
      'https://api.hacienda.go.cr/docs/',
      'https://api.hacienda.go.cr/fe/cabys/test',
      'https://www.bccr.fi.cr/content/dam/bccr/bccr-espanol/noticias/2025/2025-04-01-catalogo-de-bienes-servicios-1.xlsx'
    ]);
    mainWindow.webContents.setWindowOpenHandler(({url})=>{
      if(officialPages.has(url))shell.openExternal(url).catch(error=>console.error('No se pudo abrir enlace oficial:',error.message));
      return {action:'deny'};
    });
    mainWindow.webContents.on('will-navigate',(event,url)=>{
      const allowed = dev ? 'http://127.0.0.1:5173/' : `http://127.0.0.1:${server.port}/`;
      if (!url.startsWith(allowed)) event.preventDefault();
    });
    await mainWindow.loadURL(dev?'http://127.0.0.1:5173':`http://127.0.0.1:${server.port}`);
    if(qaSmoke){
      const result=await runPackagedSmoke();
      await writeSmokeResult(result);
      app.quit();
    }
  } catch(err) {
    console.error('No se pudo iniciar FacturaCR:',err);
    if(qaSmoke){
      // Un error de arranque NO debe ejecutar más pruebas ni impedir el
      // informe de fallo. El laboratorio XAdESjs se ejecuta solo en la
      // ruta de éxito, dentro de runPackagedSmoke().
      const shot=qaArg('--qa-screenshot');
      if(shot&&path.isAbsolute(shot)&&mainWindow&&!mainWindow.isDestroyed()){
        try{
          await fs.mkdir(path.dirname(shot),{recursive:true});
          await fs.writeFile(shot,(await mainWindow.webContents.capturePage()).toPNG());
        }catch(captureError){qaErrors.push('Captura de fallo: '+captureError.message)}
      }
      await writeSmokeResult({success:false,error:String(err.stack||err)});
      process.exitCode=1;
    }
    app.quit();
  }
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{certificateSelection.clearAll();if(server)server.close().catch(console.error);});
