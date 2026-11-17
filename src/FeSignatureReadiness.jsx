import React,{useEffect,useRef,useState} from 'react';

// Componente separado de la ficha fiscal: la contraseña nunca se persiste en SQLite.
export default function FeSignatureReadiness({companyId}){
 const [secret,setSecret]=useState('');
 const [result,setResult]=useState(null);
 const [error,setError]=useState('');
 const [checking,setChecking]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{
  generation.current++;
  setSecret('');setResult(null);setError('');setChecking(false);
 },[companyId]);
 const available=typeof window!=='undefined'&&typeof window.facturacrSignature?.inspectP12==='function';
 const inspect=async()=>{
  if(!available||checking)return;
  const id=++generation.current;
  const ephemeralSecret=secret;
  setSecret('');setResult(null);setError('');setChecking(true);
  try{
   const response=await window.facturacrSignature.inspectP12(ephemeralSecret);
   if(id!==generation.current)return;
   if(response?.cancelled)return;
   if(!response?.success)throw Error(response?.error||'No se pudo inspeccionar el archivo.');
   setResult(response.report);
  }catch(err){if(id===generation.current)setError(err.message||'No se pudo inspeccionar el archivo.');}
  finally{if(id===generation.current)setChecking(false);}
 };
 return <section className="feSignatureReadiness" aria-labelledby="fe-signature-title">
  <div className="feSignatureIntro"><div><p className="companiesOverline">v0.6.73 · Preparación de firma</p><h4 id="fe-signature-title">Revisión local de certificado digital (.p12 / .pfx)</h4><p className="hint">Selecciona el archivo desde Windows y revisa sus datos básicos antes de integrar la firma XAdES-EPES. No se guarda el archivo ni su contraseña.</p></div><span className="fePreparationStage">Solo diagnóstico</span></div>
  {available?<div className="feSignatureControls"><label htmlFor="fe-signature-secret">Contraseña del archivo (uso temporal)<input id="fe-signature-secret" type="password" autoComplete="off" maxLength={512} disabled={checking} value={secret} onChange={e=>{setSecret(e.target.value);setResult(null);setError('')}} placeholder="Contraseña del .p12"/></label><button type="button" onClick={inspect} disabled={checking}>{checking?'Revisando archivo…':'Elegir archivo y revisar'}</button></div>:<p className="hint">La revisión del certificado está disponible en la aplicación de escritorio Electron. No se solicitan contraseñas desde el navegador web.</p>}
  {error&&<p className="fePreparationError" role="alert">{error}</p>}
  {result&&<div className="feSignatureResult" role="status"><strong>{result.technicallyReady?'Certificado técnicamente legible':'Se requiere revisar el certificado'}</strong><dl><div><dt>Titular declarado</dt><dd>{result.subject}</dd></div><div><dt>Emisor del certificado</dt><dd>{result.issuer}</dd></div><div><dt>Vigencia</dt><dd>{result.validFrom?.slice(0,10)} — {result.validTo?.slice(0,10)}</dd></div><div><dt>Clave pública</dt><dd>{result.publicKeyType}{result.rsaBits?` · ${result.rsaBits} bits`:''}</dd></div><div><dt>Huella SHA-256</dt><dd className="feSignatureFingerprint">{result.fingerprint256}</dd></div></dl>{result.checks?.map(c=><p key={c.key} className={c.ok?'feSignatureCheckOk':'feSignatureCheckWarn'}>{c.ok?'✓':'!'} {c.title}</p>)}<p className="hint">{result.note}</p></div>}
  <p className="fePreparationDisclaimer">Esta etapa <strong>no firma archivos XML</strong>, no confirma la inscripción tributaria ni transmite información a Hacienda. La firma y emisión estarán bloqueadas hasta completar la validación XSD, la política XAdES-EPES, la verificación del certificado y las pruebas oficiales.</p>
 </section>;
}
