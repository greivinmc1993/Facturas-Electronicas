const {app, BrowserWindow, Menu, ipcMain, dialog, shell} = require('electron');
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
     preloadBackups:typeof window.facturacrBackups?.openFolder==='function'
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
 if(!initial.preloadPrinter||!initial.preloadReports||!initial.preloadBackups)
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
 if(!dom.preloadPrinter||!dom.preloadReports||!dom.preloadBackups)
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
 const shot=qaArg('--qa-screenshot');
 if(shot&&path.isAbsolute(shot)){
   await fs.mkdir(path.dirname(shot),{recursive:true});
   await fs.writeFile(shot,(await mainWindow.webContents.capturePage()).toPNG());
 }
 return {success:true,dom,health:health.body,
   security:{initialOwnerSetup:needsSetup,existingOwnerLogin:!needsSetup,
     blockedBeforeSetup:needsSetup,blockedBeforeLogin:true,
     authenticatedOwner:true,commercialScreenAfterLogin:true},screenshot:shot||null};
}

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
// Open only FacturaCR's known backups folder; the renderer cannot choose an arbitrary path.
ipcMain.handle('facturacr:open-backups-folder',async event=>{
 if(event.sender!==mainWindow?.webContents)return {success:false,error:'Ventana no autorizada'};
 try{
  const folder=path.join(app.getPath('userData'),'automatic-backups');
  await fs.mkdir(folder,{recursive:true});
  const error=await shell.openPath(folder);
  return error?{success:false,error}:{success:true};
 }catch(e){return {success:false,error:String(e.message||e)}}
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    if (!dev) {
      const {startServer} = await import('../server/index.js');
      server = await startServer({dataDir:app.getPath('userData'),port:0,staticDir:path.join(__dirname,'../dist')});
    }
    mainWindow = new BrowserWindow({width:1180,height:760,minWidth:850,minHeight:580,
      title:'FacturaCR', icon:path.join(__dirname,'../build/icon.png'),
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
    if(qaSmoke){
      mainWindow.webContents.on('render-process-gone',(_event,details)=>qaErrors.push('Renderer cerrado: '+details.reason));
      mainWindow.webContents.on('console-message',(_event,details)=>{
        if(details.level==='error'||details.level===3) qaErrors.push(String(details.message).slice(0,500));
      });
    }
    mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
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
      const shot=qaArg('--qa-screenshot');
      if(shot&&path.isAbsolute(shot)&&mainWindow&&!mainWindow.isDestroyed())try{
        await fs.mkdir(path.dirname(shot),{recursive:true});
        await fs.writeFile(shot,(await mainWindow.webContents.capturePage()).toPNG());
      }catch(e){qaErrors.push('Captura de fallo: '+e.message)}
      await writeSmokeResult({success:false,error:String(err.stack||err)});process.exitCode=1
    }
    app.quit();
  }
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(server)server.close().catch(console.error);});
