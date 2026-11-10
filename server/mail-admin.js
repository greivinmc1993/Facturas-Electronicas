// Panel de correo emisor reservado al propietario.
// La clave permanece cifrada en safeStorage; nunca se envía de regreso al navegador.
import {validateSmtpSettings} from './email-smtp.js';
const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
const testAttempts=new Map();
export function registerMailAdmin(app,{db,auth,localOriginOnly,audit,verifyPassword,mailStore,sendMail}){
 const available=()=>!!mailStore?.supported?.();
 const current=()=>mailStore?.read?.()||null;
 const onlyOwner=(req,res)=>{
   const a=auth(req,res);if(!a?.session)return null;
   if(!a.user.is_owner||a.user.password_change_required){res.status(403).json({error:'Solo el propietario puede configurar el correo emisor.'});return null;}
   // La configuración contiene una credencial. Bloquear orígenes locales de puertos distintos.
   const origin=req.get?.('origin');
   if(origin){
     const host=req.get?.('host');
     if(!host||origin!==`http://${host}`){res.status(403).json({error:'Origen de configuración no autorizado.'});return null;}
   }
   return a;
 };
 const confirmed=(a,password)=>{
   const row=db.prepare('SELECT password_hash FROM access_users WHERE id=?').get(a.user.id);
   return verifyPassword(password,row?.password_hash);
 };
 const replyStatus=()=>{
   if(!available())return {available:false,configured:false,secureStorage:'unavailable'};
   const cfg=current();
   return {available:true,configured:!!cfg,secureStorage:'os-encrypted',host:cfg?.host||'',port:465,user:cfg?.user||'',from:cfg?.from||'',passwordSaved:!!cfg?.password};
 };
 app.get('/api/auth/mail/settings',(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   const a=onlyOwner(req,res);if(!a)return;
   try{return res.json(replyStatus())}catch{return res.status(500).json({error:'No se pudo leer el correo cifrado de Windows.'})}
 });
 app.put('/api/auth/mail/settings',localOriginOnly,(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   const a=onlyOwner(req,res);if(!a)return;
   if(!available())return res.status(503).json({error:'El almacén cifrado de Windows no está disponible. Usa la aplicación instalada.'});
   if(!confirmed(a,req.body?.currentPassword))return res.status(403).json({error:'Contraseña del propietario incorrecta.'});
   try{
     const before=current();
     const cfg=validateSmtpSettings({host:req.body?.host,port:465,user:req.body?.user,from:req.body?.from,password:req.body?.smtpPassword||before?.password});
     mailStore.write(cfg);
     audit(a.user.id,'auth.smtp_settings_updated','mail','sender');
     return res.json({ok:true,...replyStatus()});
   }catch(e){return res.status(400).json({error:e.message||'No se pudo guardar la configuración SMTP.'})}
 });
 app.post('/api/auth/mail/test',localOriginOnly,async(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   const a=onlyOwner(req,res);if(!a)return;
   if(!available())return res.status(503).json({error:'Configura SMTP desde FacturaCR instalado en Windows.'});
   if(!confirmed(a,req.body?.currentPassword))return res.status(403).json({error:'Contraseña del propietario incorrecta.'});
   const to=String(req.body?.to||'').trim();
   if(!validEmail(to))return res.status(400).json({error:'Correo de prueba inválido.'});
   const now=Date.now(),item=testAttempts.get(a.user.id);
   if(item&&now<item.until&&item.count>=5)return res.status(429).json({error:'Demasiadas pruebas de envío. Intenta más tarde.'});
   if(!item||now>=item.until)testAttempts.set(a.user.id,{count:1,until:now+600000});else item.count++;
   try{
     const cfg=current();
     if(!cfg)return res.status(409).json({error:'Guarda primero la configuración SMTP.'});
     await sendMail({to,subject:'FacturaCR: prueba de correo emisor',body:'FacturaCR aceptó tu solicitud de prueba SMTP. Si recibes este mensaje, el envío está funcionando. No respondas a este correo.'},cfg);
     audit(a.user.id,'auth.smtp_test_sent','mail','test');
     return res.json({ok:true,message:'El servidor SMTP aceptó el mensaje. Comprueba que llegue a tu bandeja o correo no deseado.'});
   }catch(e){
     // Un proveedor puede incluir parte de su respuesta en el error. Jamás exponer la clave.
     let info=String(e?.message||'Revisa usuario, clave y conexión.');
     const secret=current()?.password;
     if(secret)info=info.replaceAll(secret,'[oculto]');
     const code=String(info.match(/\b(?:534|535)\b/)?.[0]||'');
     if(current()?.host==='smtp.gmail.com'&&code==='534'){
       return res.status(502).json({error:'Gmail rechazó la autenticación (534). Activa la verificación en dos pasos y crea una contraseña de aplicación de 16 caracteres en myaccount.google.com/apppasswords. Pega esa clave en «Clave SMTP» y vuelve a guardar; NO utilices la contraseña normal de Gmail.'});
     }
     if(current()?.host==='smtp.gmail.com'&&code==='535'){
       return res.status(502).json({error:'Gmail rechazó el usuario o la clave SMTP (535). Verifica la dirección emisora y usa una contraseña de aplicación válida. Guarda de nuevo antes de probar.'});
     }
     return res.status(502).json({error:`El servidor SMTP no aceptó el envío. ${info.slice(0,180)}`});
   }
 });
 app.delete('/api/auth/mail/settings',localOriginOnly,(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   const a=onlyOwner(req,res);if(!a)return;
   if(!available())return res.status(503).json({error:'El almacén cifrado no está disponible.'});
   if(!confirmed(a,req.body?.currentPassword))return res.status(403).json({error:'Contraseña del propietario incorrecta.'});
   try{mailStore.remove();audit(a.user.id,'auth.smtp_settings_removed','mail','sender');return res.json({ok:true,...replyStatus()})}
   catch{return res.status(500).json({error:'No se pudo eliminar la configuración cifrada.'})}
 });
}
