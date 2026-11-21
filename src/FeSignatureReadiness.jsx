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
 const [policyReport,setPolicyReport]=useState(null);
 const [policyError,setPolicyError]=useState('');
 const [policyChecking,setPolicyChecking]=useState(false);
 const [labReport,setLabReport]=useState(null);
 const [labError,setLabError]=useState('');
 const [labChecking,setLabChecking]=useState(false);
 const [xmlReport,setXmlReport]=useState(null);
 const [xmlError,setXmlError]=useState('');
 const [xmlChecking,setXmlChecking]=useState(false);
 const [xmlExporting,setXmlExporting]=useState(false);
 const [xmlExport,setXmlExport]=useState(null);
 const [xmlExportError,setXmlExportError]=useState('');
 const [variantsReport,setVariantsReport]=useState(null);
 const [variantsError,setVariantsError]=useState('');
 const [variantsChecking,setVariantsChecking]=useState(false);
 const [xmlLocalVerification,setXmlLocalVerification]=useState(null);
 const [xmlLocalVerificationError,setXmlLocalVerificationError]=useState('');
 const [xmlLocalVerifying,setXmlLocalVerifying]=useState(false);
 const [engineChecking,setEngineChecking]=useState(false);
 const [engineStatus,setEngineStatus]=useState(null);
 const [engineError,setEngineError]=useState('');
 const [integratedChecking,setIntegratedChecking]=useState(false);
 const [integratedReport,setIntegratedReport]=useState(null);
 const [integratedError,setIntegratedError]=useState('');
 const generation=useRef(0);
 const selectedToken=useRef(null);
 useEffect(()=>{
  generation.current++;
  selectedToken.current=null;
  setSecret('');setSelection(null);setResult(null);setError('');setSelecting(false);setChecking(false);setShowSecret(false);setPolicyReport(null);setPolicyError('');setPolicyChecking(false);setLabReport(null);setLabError('');setLabChecking(false);setXmlReport(null);setXmlError('');setXmlExport(null);setXmlExportError('');setXmlChecking(false);setXmlExporting(false);setVariantsReport(null);setVariantsError('');setVariantsChecking(false);setXmlLocalVerification(null);setXmlLocalVerificationError('');setXmlLocalVerifying(false);setEngineChecking(false);setEngineStatus(null);setEngineError('');setIntegratedChecking(false);setIntegratedReport(null);setIntegratedError('');
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
  setSelection(null);setResult(null);setError('');setSecret('');setPolicyReport(null);setPolicyError('');setLabReport(null);setLabError('');setXmlReport(null);setXmlError('');setXmlExport(null);setXmlExportError('');setSelecting(true);setVariantsReport(null);setVariantsError('');
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
 const inspectPolicy=async()=>{
  if(policyChecking||!result||typeof bridge?.inspectXadesPolicy!=='function')return;
  const id=generation.current;
  setVariantsReport(null);setVariantsError('');setXmlLocalVerification(null);setXmlLocalVerificationError('');setPolicyChecking(true);setPolicyError('');setPolicyReport(null);setLabReport(null);setLabError('');setXmlReport(null);setXmlError('');setXmlExport(null);setXmlExportError('');
  try{
   const response=await bridge.inspectXadesPolicy();
   if(id!==generation.current)return;
   if(response?.cancelled)return;
   if(!response?.success||!response.report)throw Error(response?.error||'No se pudo comprobar el PDF.');
   setPolicyReport(response.report);
  }catch(err){if(id===generation.current)setPolicyError(err.message||'No se pudo revisar el PDF.');}
  finally{if(id===generation.current)setPolicyChecking(false);}
 };
 const runLab=async()=>{
  if(labChecking||busy||!policyReport?.matchesAnnexSample||!result?.keyPossession?.ok||typeof bridge?.runXadesCryptoLab!=='function')return;
  const id=generation.current;
  setVariantsReport(null);setVariantsError('');setXmlLocalVerification(null);setXmlLocalVerificationError('');setLabChecking(true);setLabError('');setLabReport(null);setXmlReport(null);setXmlError('');setXmlExport(null);setXmlExportError('');
  try{
   const response=await bridge.runXadesCryptoLab();
   if(id!==generation.current)return;
   if(!response?.success||!response.report)throw Error(response?.error||'No se pudo ejecutar el ensayo local.');
   setLabReport(response.report);
  }catch(err){if(id===generation.current)setLabError(err.message||'No se pudo ejecutar el ensayo local.');}
  finally{if(id===generation.current)setLabChecking(false);}
 };
 const runXmlLab=async()=>{
  if(xmlChecking||busy||labChecking||!labReport?.keyProofVerified||!policyReport?.matchesAnnexSample||!result?.keyPossession?.ok||typeof bridge?.runXadesXmlLab!=='function')return;
  const id=generation.current;
  setVariantsReport(null);setVariantsError('');setXmlLocalVerification(null);setXmlLocalVerificationError('');setXmlChecking(true);setXmlError('');setXmlReport(null);setXmlExport(null);setXmlExportError('');
  try{
   const response=await bridge.runXadesXmlLab();
   if(id!==generation.current)return;
   if(!response?.success||!response.report)throw Error(response?.error||'No se pudo ejecutar la prueba XMLDSig.');
   setXmlReport(response.report);
  }catch(err){if(id===generation.current)setXmlError(err.message||'Falló el laboratorio XML.');}
  finally{if(id===generation.current)setXmlChecking(false);}
 };
 const exportXmlLab=async()=>{
  if(xmlExporting||xmlChecking||busy||labChecking||!xmlReport?.signatureValid||
     !xmlReport?.documentReferenceVerified||!xmlReport?.signedPropertiesReferenceVerified||
     !labReport?.keyProofVerified||!policyReport?.matchesAnnexSample||
     !result?.keyPossession?.ok||typeof bridge?.saveXadesXmlDemo!=='function')return;
  const id=generation.current;
  setXmlExporting(true);setXmlExportError('');setXmlExport(null);
  try{
   const response=await bridge.saveXadesXmlDemo();
   if(id!==generation.current)return;
   if(response?.cancelled)return;
   if(!response?.success||!response.report?.syntheticXml)throw Error(response?.error||'No se pudo guardar el XML de prueba.');
   setXmlExport(response.report);
  }catch(err){if(id===generation.current)setXmlExportError(err.message||'No se pudo exportar el XML ficticio.');}
  finally{if(id===generation.current)setXmlExporting(false);}
 };
 const runXmlVariants=async()=>{
  if(variantsChecking||xmlChecking||busy||!xmlReport?.signatureValid||
     !xmlReport?.documentReferenceVerified||!xmlReport?.signedPropertiesReferenceVerified||
     !labReport?.keyProofVerified||!policyReport?.matchesAnnexSample||
     !result?.keyPossession?.ok||typeof bridge?.runXadesXmlVariants!=='function')return;
  const id=generation.current;
  setVariantsChecking(true);setVariantsError('');setVariantsReport(null);
  try{
   const response=await bridge.runXadesXmlVariants();
   if(id!==generation.current)return;
   if(!response?.success||!response.report?.syntheticXml||response.report?.verifiedCount!==3)
    throw Error(response?.error||'No se verificaron las tres plantillas de laboratorio.');
   setVariantsReport(response.report);
  }catch(err){if(id===generation.current)setVariantsError(err.message||'No pudo completarse la prueba de variantes.');}
  finally{if(id===generation.current)setVariantsChecking(false);}
 };
 const verifyExportedXml=async()=>{
  if(xmlLocalVerifying||busy||typeof bridge?.verifyXadesXmlDemo!=='function')return;
  const id=generation.current;
  setXmlLocalVerifying(true);setXmlLocalVerification(null);setXmlLocalVerificationError('');
  try{
   const response=await bridge.verifyXadesXmlDemo();
   if(id!==generation.current)return;
   if(response?.cancelled)return;
   if(!response?.success||!response.report)throw Error(response?.error||'No se pudo verificar el XML guardado.');
   setXmlLocalVerification(response.report);
  }catch(err){if(id===generation.current)setXmlLocalVerificationError(err.message||'No se pudo comprobar el XML.');}
  finally{if(id===generation.current)setXmlLocalVerifying(false);}
 };
 const diagnoseXadesEngine=async()=>{
  if(engineChecking||typeof bridge?.checkXadesEngine!=='function')return;
  const id=generation.current;
  setEngineChecking(true);setEngineError('');setEngineStatus(null);
  try{
   const response=await bridge.checkXadesEngine();
   if(id!==generation.current)return;
   if(!response?.success||!response.report)throw Error(response?.error||'No se pudo comprobar la compatibilidad.');
   setEngineStatus(response.report);
  }catch(err){if(id===generation.current)setEngineError(err.message||'No se pudo revisar el motor.');}
  finally{if(id===generation.current)setEngineChecking(false);}
 };
 const runIntegratedXadesLab=async()=>{
  if(integratedChecking||typeof bridge?.runIntegratedXadesLab!=='function')return;
  const id=generation.current;
  setIntegratedChecking(true);setIntegratedError('');setIntegratedReport(null);
  try{
   const response=await bridge.runIntegratedXadesLab();
   if(id!==generation.current)return;
   if(!response?.success||response.report?.verifiedCount!==3||response.report?.mutationsRejected!==6||response.report?.nonFiscal!==true)
    throw Error(response?.error||'No se verificaron los tres XML de laboratorio con XAdESjs.');
   setIntegratedReport(response.report);
  }catch(err){if(id===generation.current)setIntegratedError(err.message||'Falló el laboratorio de XAdESjs.');}
  finally{if(id===generation.current)setIntegratedChecking(false);}
 };
 const busy=selecting||checking;
 return <section className="feSignatureReadiness" aria-labelledby="fe-signature-title">
  <div className="feSignatureIntro"><div><p className="companiesOverline">v0.6.87 · XAdESjs integrado en laboratorio (sin emisión)</p><h4 id="fe-signature-title">Certificado digital de Hacienda (.p12 / .pfx)</h4><p className="hint">Selecciona el certificado, escribe su contraseña y pulsa «Aceptar y verificar». El archivo y su contraseña no se guardan en el sistema.</p></div><span className="fePreparationStage">Verificación local</span></div>
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
    {result.signatureReadiness&&<div className="feSignaturePolicy" aria-label="Cotejo del documento de política de firma">
      <div className="feSignaturePolicyHeading"><div><strong>Política oficial XAdES-EPES</strong><p className="hint">Comprueba localmente un PDF descargado de la fuente oficial de Hacienda. Es una comparación con la huella del ejemplo del Anexo 2, no una validación de vigencia ni una firma.</p></div>
      {typeof bridge?.inspectXadesPolicy==='function'&&<button type="button" className="secondary" onClick={inspectPolicy} disabled={policyChecking||busy}>{policyChecking?'Revisando PDF…':'Examinar PDF y comparar huella'}</button>}</div>
      <p className="hint">Referencia: Anexo 2, versión 4.4. No se guarda el PDF ni se modifica el certificado.</p>
      {policyError&&<p role="alert" className="fePreparationError">{policyError}</p>}
      {policyReport&&<div className="feSignaturePolicyResult" role="status"><strong>{policyReport.title}</strong><dl><div><dt>Archivo</dt><dd>{policyReport.name}</dd></div><div><dt>SHA-256 calculado</dt><dd className="feSignatureFingerprint">{policyReport.sha256}</dd></div><div><dt>Comparación con ejemplo</dt><dd>{policyReport.matchesAnnexSample?'Coincide con ejemplo documental':'No coincide; requiere revisión'}</dd></div></dl><p className="hint">{policyReport.note}</p></div>}
    </div>}
    {policyReport?.matchesAnnexSample&&result.keyPossession?.ok&&<div className="feSignatureCryptoLab" aria-label="Laboratorio RSA de prueba">
      <div className="feSignatureCryptoLabHeader"><div><strong>Laboratorio de firma RSA-SHA256</strong><p className="hint">Ensayo con una clave ficticia y XML de simulación, independiente de tu certificado real. No crea una factura firmada ni una firma XAdES-EPES.</p></div>
        <button type="button" className="secondary" onClick={runLab} disabled={labChecking||busy||!bridge?.runXadesCryptoLab}>{labChecking?'Ejecutando prueba…':'Ejecutar ensayo local'}</button></div>
      {labError&&<p role="alert" className="fePreparationError">{labError}</p>}
      {labReport&&<div role="status" className="feSignatureCryptoLabResult">
        <p className="feSignatureCheckOk">{labReport.keyProofVerified?'✓ Firma de prueba RSA-SHA256 verificada':'! No se pudo verificar la firma'}</p>
        <p className="feSignatureCheckOk">{labReport.changedContentRejected?'✓ La alteración del contenido se detectó':'! Error de integridad'}</p>
        <p className="feSignatureCheckOk">{labReport.alteredSignatureRejected?'✓ La alteración de la firma se detectó':'! Error de integridad'}</p>
        <p className="hint">{labReport.note}</p>
      </div>}
      <p className="hint"><strong>Pendiente:</strong> integración general con biblioteca XMLDSig/XAdES auditada, certificado real, XSD y pruebas oficiales. Emisión bloqueada.</p>
    </div>}
    {labReport?.keyProofVerified&&policyReport?.matchesAnnexSample&&result.keyPossession?.ok&&<div className="feSignatureXmlLab" aria-label="Prototipo de firma XMLDSig en XML de prueba">
      <div className="feSignatureCryptoLabHeader"><div><strong>Prototipo XMLDSig + XAdES-EPES (solo demostración)</strong><p className="hint">Genera y verifica una firma enveloped sobre XML de simulación fijo. Utiliza RSA 2048 y certificado autofirmado ficticio creado en memoria; nunca tu .p12 real.</p></div>
      <button type="button" className="secondary" onClick={runXmlLab} disabled={xmlChecking||busy||labChecking||!bridge?.runXadesXmlLab}>{xmlChecking?'Verificando XML de prueba…':'Ensayar firma XML ficticia'}</button></div>
      {xmlError&&<p role="alert" className="fePreparationError">{xmlError}</p>}
      {xmlReport&&<div className="feSignatureCryptoLabResult" role="status">
        <p className="feSignatureCheckOk">{xmlReport.signatureValid?'✓ Firma RSA-SHA256 de SignedInfo verificada':'! Firma incorrecta'}</p>
        <p className="feSignatureCheckOk">{xmlReport.documentReferenceVerified?'✓ Referencia enveloped del XML de prueba calculada':'! Referencia inválida'}</p>
        <p className="feSignatureCheckOk">{xmlReport.signedPropertiesReferenceVerified?'✓ Referencia SignedProperties calculada':'! Referencia inválida'}</p>
        <p className="feSignatureCheckOk">{xmlReport.documentTamperRejected&&xmlReport.propsTamperRejected&&xmlReport.changedSignedInfoRejected?'✓ Alteraciones detectadas en documento, propiedades y firma':'! Revisar comprobaciones de integridad'}</p>
        <p className="hint">{xmlReport.note}</p>
      </div>}
      {xmlReport?.signatureValid&&xmlReport?.documentReferenceVerified&&xmlReport?.signedPropertiesReferenceVerified&&<div className="feSignatureExportDemo">
        <div><strong>Exportar XML de prueba para verificación independiente</strong><p className="hint">Guarda una NUEVA firma ficticia en un XML de laboratorio. No contiene tu clave .p12 ni es una factura electrónica.</p></div>
        <button type="button" className="secondary" onClick={exportXmlLab} disabled={xmlExporting||xmlChecking||busy||!bridge?.saveXadesXmlDemo}>{xmlExporting?'Guardando…':'Guardar XML ficticio'}</button>
      </div>}
      {xmlReport?.signatureValid&&xmlReport?.documentReferenceVerified&&xmlReport?.signedPropertiesReferenceVerified&&<div className="feSignatureVariantLab" aria-label="Ensayo de variantes XML sintéticas">
        <div><strong>Probar tres estructuras XML ficticias</strong><p className="hint">Prueba XML sencillo, servicio simulado y mercadería simulada usando solamente certificados temporales. No firma comprobantes fiscales ni acepta XML ajenos.</p></div>
        <button type="button" className="secondary" onClick={runXmlVariants} disabled={variantsChecking||busy||xmlChecking||!bridge?.runXadesXmlVariants}>{variantsChecking?'Comprobando variantes…':'Probar 3 variantes de XML'}</button>
      </div>}
      {variantsError&&<p role="alert" className="fePreparationError">{variantsError}</p>}
      {variantsReport&&<div className="feSignatureVariantResult" role="status"><strong>{variantsReport.verifiedCount}/3 estructuras sintéticas comprobadas localmente</strong>{variantsReport.variants?.map(item=><p key={item.variant} className="feSignatureCheckOk">✓ {item.label}</p>)}<p className="hint">{variantsReport.note}</p></div>}
      {xmlExportError&&<p role="alert" className="fePreparationError">{xmlExportError}</p>}
      {xmlExport&&<div className="feSignatureExportResult" role="status"><strong>XML ficticio exportado</strong><p>Archivo: {xmlExport.name}</p><p className="feSignatureFingerprint">SHA-256: {xmlExport.sha256}</p><p className="hint">{xmlExport.note}</p></div>}
      <p className="hint"><strong>Importante:</strong> este prototipo no firma comprobantes fiscales ni valida la política tributaria. El verificador externo y el XSD oficial siguen siendo requisitos para un motor de producción.</p>
    </div>}
    </div>}
      <div className="feSignatureVariantLab" aria-label="Verificación local del XML ficticio guardado">
        <div><strong>Verificar XML ficticio guardado</strong><p className="hint">Selecciona el XML que exportaste. Electron vuelve a comprobar su contenido, los dos digestos y la firma RSA-SHA256 sin confiar en el resultado del generador. No acepta facturas de Hacienda ni XML ajenos al laboratorio.</p></div>
        <button type="button" className="secondary" onClick={verifyExportedXml} disabled={xmlLocalVerifying||busy||!bridge?.verifyXadesXmlDemo}>{xmlLocalVerifying?'Verificando archivo…':'Verificar XML ficticio guardado'}</button>
      </div>
      {xmlLocalVerificationError&&<p role="alert" className="fePreparationError">{xmlLocalVerificationError}</p>}
      {xmlLocalVerification&&<div className={xmlLocalVerification.valid?'feSignatureExportResult':'feSignatureVariantResult'} role="status">
        <strong>{xmlLocalVerification.valid?'Firma e integridad del XML ficticio verificadas':'El XML ficticio NO pasó la verificación'}</strong>
        <p>Archivo: {xmlLocalVerification.name}</p>
        {xmlLocalVerification.valid&&<><p className="feSignatureCheckOk">✓ Firma RSA-SHA256 y 2 referencias válidas ({xmlLocalVerification.variant})</p><p className="feSignatureFingerprint">SHA-256: {xmlLocalVerification.sha256}</p>{!xmlLocalVerification.certificateWithinValidityNow&&<p className="hint">El certificado temporal de prueba ya no está vigente. Su firma histórica se ha verificado criptográficamente.</p>}</>}
        <p className="hint">{xmlLocalVerification.note}</p>
      </div>}
      <div className="feSignatureVariantLab" aria-label="Diagnóstico de integración XAdESjs">
        <div><strong>Compatibilidad del motor XAdESjs (v0.6.85)</strong><p className="hint">Comprueba las capacidades de Node/Electron y si la biblioteca especializada está integrada. Esta prueba no usa el certificado, no firma XML y nunca habilita emisión.</p></div>
        <button type="button" className="secondary" onClick={diagnoseXadesEngine} disabled={engineChecking||!bridge?.checkXadesEngine}>{engineChecking?'Comprobando compatibilidad…':'Comprobar motor XAdESjs'}</button>
      </div>
      <p className="hint">v0.6.85 incorpora XAdESjs 3.1.0 y dependencias controladas. La comprobación siguiente genera únicamente XML ficticios: no utiliza el certificado .p12, no recibe XML externos y no autoriza emisión. La prueba de instalación y empaquetado debe completarse con GitHub Actions y Windows.</p>
      <div className="feSignatureVariantLab" aria-label="Ensayo integrado especializado XAdESjs no fiscal">
        <div><strong>Ensayo integrado de XAdESjs (solo demostración)</strong><p className="hint">Firma y comprueba tres XML sintéticos con la biblioteca instalada en FacturaCR. No utiliza tu certificado real ni guarda claves. Puedes ejecutarlo sin introducir la contraseña .p12.</p></div>
        <button type="button" className="secondary" onClick={runIntegratedXadesLab} disabled={integratedChecking||!bridge?.runIntegratedXadesLab}>{integratedChecking?'Verificando tres firmas…':'Probar motor integrado XAdESjs'}</button>
      </div>
      {integratedError&&<p role="alert" className="fePreparationError">{integratedError}</p>}
      {integratedReport&&<div className="feSignatureExportResult" role="status"><strong>{integratedReport.verifiedCount}/3 firmas XAdESjs ficticias verificadas</strong><p className="feSignatureCheckOk">✓ {integratedReport.mutationsRejected}/6 alteraciones rechazadas</p><p className="hint">{integratedReport.note}</p></div>}
      {engineError&&<p role="alert" className="fePreparationError">{engineError}</p>}
      {engineStatus&&<div className="feSignatureExportResult" role="status">
        <strong>{engineStatus.specializedEngineInstalled?'Biblioteca instalada (modo laboratorio; no habilita emisión)':'Integración XAdESjs pendiente (modo seguro)'}</strong>
        <p>Node/Electron: {engineStatus.nodeVersion} — {engineStatus.nodeCompatible?'compatible para evaluación':'requiere versión compatible'}</p>
        <p>WebCrypto RSA-SHA256: {engineStatus.cryptoOk?'prueba satisfactoria':'no disponible'}</p>
        <p>Paquetes especializados: {engineStatus.specializedEngineInstalled?'detectados':'todavía no integrados'}</p>
        <p className="hint">{engineStatus.note}</p>
      </div>}
  <p className="fePreparationDisclaimer">Esta etapa <strong>no firma archivos XML fiscales</strong>, no confirma la inscripción tributaria ni transmite información a Hacienda. La firma XAdES-EPES y la emisión siguen bloqueadas hasta validar los algoritmos, la política oficial, el XSD y realizar pruebas independientes.</p>
 </section>;
}
