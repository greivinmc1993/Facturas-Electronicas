import React,{useEffect,useRef,useState} from 'react';

// v0.6.74: tres acciones visuales separadas: elegir archivo, introducir clave,
// y Aceptar. El archivo y la contraseña NUNCA se guardan en SQLite.
export default function FeSignatureReadiness({companyId}){
 const [secret,setSecret]=useState('');
 const [selection,setSelection]=useState(null);
 const [result,setResult]=useState(null);
 const [error,setError]=useState('');
 const [selecting,setSelecting]=useState(false);
 const [checking,setChecking]=useState(false);
 const [showSecret,setShowSecret]=useState(false);
 const generation=useRef(0);
 const selectedToken=useRef(null);
 useEffect(()=>{
  generation.current++;
  selectedToken.current=null;
  setSecret('');setSelection(null);setResult(null);setError('');setSelecting(false);setChecking(false);setShowSecret(false);
  return ()=>{
   generation.current++;
   const token=selectedToken.current;
   selectedToken.current=null;
   if(token)window.facturacrSignature?.clearP12?.(token)?.catch?.(()=>{});
  };
 },[companyId]);
 const bridge=typeof window!=='undefined'?window.facturacrSignature:null;
 const available=typeof bridge?.chooseP12==='function'&&typeof bridge?.inspectP12==='function';
 const choose=async()=>{
  if(!available||selecting||checking)return;
  const id=++generation.current;
  const previous=selectedToken.current;
  selectedToken.current=null;
  if(previous)bridge.clearP12?.(previous)?.catch?.(()=>{});
  setSelection(null);setResult(null);setError('');setSecret('');setSelecting(true);
  try{
   const response=await bridge.chooseP12(companyId);
   if(id!==generation.current){if(response?.selection?.token)bridge.clearP12?.(response.selection.token)?.catch?.(()=>{});return;}
   if(response?.cancelled)return;
   if(!response?.success||!response.selection?.name||!response.selection?.token)
    throw Error(response?.error||'No se pudo seleccionar el certificado.');
   selectedToken.current=response.selection.token;
   setSelection(response.selection);
  }catch(err){if(id===generation.current)setError(err.message||'No se pudo seleccionar el certificado.');}
  finally{if(id===generation.current)setSelecting(false);}
 };
 const accept=async()=>{
  if(!available||selecting||checking||!selection?.token||!secret)return;
  const id=++generation.current;
  const ephemeralSecret=secret;
  const token=selection.token;
  setSecret('');setResult(null);setError('');setChecking(true);
  try{
   const response=await bridge.inspectP12(ephemeralSecret,companyId,token);
   if(id!==generation.current)return;
   if(!response?.success)throw Error(response?.error||'No se pudo verificar el certificado.');
   setResult(response.report);
   selectedToken.current=null;
   setSelection({name:selection.name,token:null});
  }catch(err){if(id===generation.current)setError(err.message||'No se pudo verificar el certificado.');}
  finally{if(id===generation.current)setChecking(false);}
 };
 const busy=selecting||checking;
 return <section className="feSignatureReadiness" aria-labelledby="fe-signature-title">
  <div className="feSignatureIntro"><div><p className="companiesOverline">v0.6.75 · Verificación criptográfica</p><h4 id="fe-signature-title">Certificado digital de Hacienda (.p12 / .pfx)</h4><p className="hint">Selecciona el certificado, escribe su contraseña y pulsa «Aceptar y verificar». El archivo y su contraseña no se guardan en el sistema.</p></div><span className="fePreparationStage">Verificación local</span></div>
  {available?<div className="feSignatureForm">
   <div className="feSignatureControls">
    <div className="feSignatureFileField">
     <label htmlFor="fe-signature-filename">1. Certificado digital (.p12 / .pfx)</label>
     <div className="feSignatureFileRow">
      <input id="fe-signature-filename" type="text" readOnly value={selection?.name||''} placeholder="Ningún archivo seleccionado" title={selection?.name||'Selecciona un archivo .p12 o .pfx'} />
      <button type="button" className="secondary feSignatureBrowse" onClick={choose} disabled={busy}><span aria-hidden="true">▣</span> {selecting?'Abriendo…':'Examinar'}</button>
     </div>
     <small>Solo se muestra el nombre. La ruta permanece en el proceso protegido de Electron.</small>
    </div>
    <div className="feSignatureSecretField">
     <label htmlFor="fe-signature-secret">2. Contraseña del certificado (uso temporal)</label>
     <div className="feSignaturePasswordRow">
      <input id="fe-signature-secret" type={showSecret?'text':'password'} autoComplete="off" spellCheck={false} maxLength={512} disabled={busy||!selection?.token} value={secret} onChange={e=>{setSecret(e.target.value);setResult(null);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();accept();}}} placeholder="Contraseña del .p12 / .pfx" />
      <button type="button" className="secondary feSignatureVisibility" onClick={()=>setShowSecret(prev=>!prev)} disabled={busy||!selection?.token} aria-label={showSecret?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={showSecret}>{showSecret?'Ocultar':'Mostrar'}</button>
     </div>
     <small>La contraseña se elimina del formulario al aceptar y nunca se guarda en SQLite.</small>
    </div>
   </div>
   <div className="feSignatureActions"><button type="button" className="feSignatureAccept" onClick={accept} disabled={busy||!selection?.token||!secret}>{checking?'Verificando certificado…':'Aceptar y verificar certificado'}</button></div>
  </div>:<p className="hint">La revisión del certificado está disponible en la aplicación de escritorio Electron. No se solicitan contraseñas desde el navegador web.</p>}
  {error&&<p className="fePreparationError" role="alert">{error}</p>}
  {result&&<div className="feSignatureResult" role="status"><strong>{result.technicallyReady?'Certificado técnicamente legible':'Se requiere revisar el certificado'}</strong><dl><div><dt>Titular declarado</dt><dd>{result.subject}</dd></div><div><dt>Emisor del certificado</dt><dd>{result.issuer}</dd></div><div><dt>Vigencia</dt><dd>{result.validFrom?.slice(0,10)} — {result.validTo?.slice(0,10)}</dd></div><div><dt>Clave pública</dt><dd>{result.publicKeyType}{result.rsaBits?` · ${result.rsaBits} bits`:''}</dd></div><div><dt>Huella SHA-256</dt><dd className="feSignatureFingerprint">{result.fingerprint256}</dd></div></dl>{result.checks?.map(c=><p key={c.key} className={c.ok?'feSignatureCheckOk':'feSignatureCheckWarn'}>{c.ok?'✓':'!'} {c.title}</p>)}<p className="hint">{result.note}</p>
    {result.signatureReadiness&&<div className="feSignatureProgress" aria-label="Etapas de firma electrónica"><div className="feSignatureProgressHeader"><strong>Preparación XAdES-EPES</strong><span className="fePreparationStage">Firma y envío bloqueados</span></div><p className="hint">La prueba local de la clave es independiente de la validación tributaria. Estas comprobaciones no firman ni envían XML.</p><ul>{result.signatureReadiness.checks.map(step=><li key={step.key} className={step.ok?'feSignatureStepOk':'feSignatureStepPending'}><span aria-hidden="true">{step.ok?'✓':'○'}</span>{step.title}</li>)}</ul></div>}
    </div>}
  <p className="fePreparationDisclaimer">Esta etapa <strong>no firma archivos XML</strong>, no confirma la inscripción tributaria ni transmite información a Hacienda. La firma XAdES-EPES y la emisión siguen bloqueadas hasta validar los algoritmos, la política oficial, el XSD y realizar pruebas independientes.</p>
 </section>;
}
