// Transporte SMTP seguro sin dependencias adicionales. Solo SMTP implícito TLS (puerto 465).
// No registra contraseñas, códigos ni contenido de correos. Nunca usa SMTP sin TLS.
import tls from 'node:tls';

const safeAddress=value=>typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
export function smtpConfiguration(){
 const host=String(process.env.FACTURACR_SMTP_HOST||'').trim();
 const user=String(process.env.FACTURACR_SMTP_USER||'').trim();
 const password=String(process.env.FACTURACR_SMTP_PASSWORD||'');
 const from=String(process.env.FACTURACR_SMTP_FROM||user).trim();
 const port=Number(process.env.FACTURACR_SMTP_PORT||465);
 return host&&!/[\s\r\n\/]/.test(host)&&safeAddress(user)&&safeAddress(from)&&password&&Number.isInteger(port)&&port===465?
   {host,port,user,password,from}:null;
}
export const isMailConfigured=()=>!!smtpConfiguration();

export async function sendSecurityMail({to,subject,body}){
 const cfg=smtpConfiguration();
 if(!cfg)throw Error('SMTP seguro no configurado.');
 if(!safeAddress(to)||typeof subject!=='string'||/[\r\n]/.test(subject)||typeof body!=='string')throw Error('Mensaje inválido.');
 const socket=tls.connect({host:cfg.host,port:cfg.port,servername:cfg.host,minVersion:'TLSv1.2',rejectUnauthorized:true});
 socket.setTimeout(12000,()=>socket.destroy(Error('Tiempo de espera SMTP agotado.')));
 let buffer='',current=[],pending=[],ready=[],terminalError=null;
 const fail=err=>{terminalError=err;for(const p of pending.splice(0))p.reject(err)};
 socket.on('error',fail);
 socket.on('close',()=>{if(!terminalError)fail(Error('Conexión SMTP cerrada.'))});
 socket.on('data',data=>{
   buffer+=data.toString('utf8');
   if(buffer.length>32768){socket.destroy(Error('Respuesta SMTP demasiado larga.'));return;}
   let idx;
   while((idx=buffer.indexOf('\n'))!==-1){
     const line=buffer.slice(0,idx).replace(/\r$/,'');buffer=buffer.slice(idx+1);
     if(!/^\d{3}[- ]/.test(line)){socket.destroy(Error('Respuesta SMTP no válida.'));return;}
     current.push(line);
     if(line[3]===' '){
       const result={code:Number(line.slice(0,3)),lines:current};current=[];
       const waiter=pending.shift();if(waiter)waiter.resolve(result);else ready.push(result);
     }
   }
 });
 const receive=()=>terminalError?Promise.reject(terminalError):ready.length?Promise.resolve(ready.shift()):new Promise((resolve,reject)=>pending.push({resolve,reject}));
 const expect=async allowed=>{const response=await receive();if(!allowed.includes(response.code))throw Error(`Servidor SMTP rechazó la solicitud (${response.code}).`);};
 const send=async(command,allowed)=>{if(!socket.writable)throw Error('Conexión SMTP no disponible.');socket.write(command+'\r\n');await expect(allowed);};
 try{
   await expect([220]);
   await send('EHLO localhost',[250]);
   await send('AUTH PLAIN '+Buffer.from(`\0${cfg.user}\0${cfg.password}`).toString('base64'),[235]);
   await send(`MAIL FROM:<${cfg.from}>`,[250]);
   await send(`RCPT TO:<${to}>`,[250,251]);
   await send('DATA',[354]);
   const b64=Buffer.from(body,'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
   const message=`From: <${cfg.from}>\r\nTo: <${to}>\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}`;
   await send(message+'\r\n.',[250]);
   await send('QUIT',[221]);
 }finally{socket.end();socket.destroy();}
}
