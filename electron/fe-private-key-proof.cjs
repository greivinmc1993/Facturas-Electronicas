'use strict';
/**
 * v0.6.75 — Prueba efímera de posesión de clave PKCS#12.
 * OpenSSL (integrado en Node/Electron) usa la clave privada en un handshake TLS 1.3
 * exclusivo de 127.0.0.1. La clave no se extrae, exporta ni escribe en disco.
 * Es una prueba de correspondencia criptográfica, NO es XAdES ni validación
 * de cadena, OCSP/CRL o idoneidad del certificado para firma tributaria.
 */
const tls=require('node:tls');
const {X509Certificate,createHash,timingSafeEqual}=require('node:crypto');
const {MAX_P12_BYTES}=require('./fe-certificate-check.cjs');
const LIMIT_MS=3500;

async function proveP12PrivateKey(bytes,passphrase,{timeoutMs=LIMIT_MS}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>MAX_P12_BYTES)throw Error('Certificado PKCS#12 inválido.');
 if(typeof passphrase!=='string'||!passphrase||passphrase.length>512)throw Error('Contraseña inválida.');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<200||timeoutMs>10000)throw Error('Límite temporal inválido.');
 const ctx=tls.createSecureContext({pfx:bytes,passphrase});
 const server=tls.createServer({pfx:bytes,passphrase,minVersion:'TLSv1.2',maxVersion:'TLSv1.3'});
 // Se fija el certificado del PFX, para que un puerto ajeno no pueda falsear éxito.
 const expected=new X509Certificate(ctx.context.getCertificate());
 const expectedDigest=createHash('sha256').update(expected.raw).digest();
 let client;
 let timer;
 try{
  const address=await new Promise((resolve,reject)=>{
   const onError=(err)=>reject(err);
   server.once('error',onError);
   server.listen(0,'127.0.0.1',()=>{
    server.removeListener('error',onError);
    resolve(server.address());
   });
  });
  return await new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error)=>{
    if(settled)return;
    settled=true;
    if(error)reject(Error('La prueba local de correspondencia criptográfica no pudo completarse.'));
    else resolve({ok:true,method:'TLS local con clave privada PKCS#12 y cotejo SHA-256 del certificado'});
   };
   // No se verifica CA/hostname: este NO es un acceso web; se exige igualdad
   // exacta con el certificado del PFX en memoria.
   client=tls.connect({host:'127.0.0.1',port:address.port,servername:'facturacr-local.invalid',
    rejectUnauthorized:false,minVersion:'TLSv1.2',maxVersion:'TLSv1.3'},()=>{
     try{
      const received=client.getPeerCertificate(true)?.raw;
      if(!Buffer.isBuffer(received))return finish(Error('Sin certificado'));
      const digest=createHash('sha256').update(received).digest();
      if(!timingSafeEqual(expectedDigest,digest))return finish(Error('Certificado distinto'));
      finish();
     }catch(err){finish(err)}
    });
   client.once('error',finish);
   client.once('close',()=>finish(Error('Conexión finalizada')));
   timer=setTimeout(()=>finish(Error('Tiempo excedido')),timeoutMs);
   timer.unref?.();
  });
 }finally{
  if(timer)clearTimeout(timer);
  client?.destroy();
  if(server.listening){
   // Cerrar sin bloquear: destruir el socket cliente termina la sesión.
   server.close();
  }
 }
}
module.exports={proveP12PrivateKey};
