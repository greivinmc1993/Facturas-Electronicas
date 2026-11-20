/**
 * FacturaCR v0.6.84 — adaptador experimental de XAdESjs.
 * Recibe las bibliotecas POR INYECCIÓN desde un ensayo aislado. No importa
 * dependencias de producción, no abre archivos, no recibe XML externo ni
 * certificado .p12, no emite comprobantes ni habilita Hacienda.
 * Para conectar con producción se requiere lockfile reproducible y más QA.
 */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

export const POLICY_URI = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
export const POLICY_DIGEST = 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';
export const XML_VARIANTS = Object.freeze({
  simple: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
  servicio: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Servicio><Cantidad>2</Cantidad><Precio>50.00</Precio></Servicio><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
  mercaderia: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Articulos><Producto codigo="DEMO-A">35.00</Producto><Producto codigo="DEMO-B">65.00</Producto></Articulos><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
});

const DS='http://www.w3.org/2000/09/xmldsig#';
const XADES='http://uri.etsi.org/01903/v1.3.2#';

export async function runSpecializedSyntheticTrial(variant, dependencies) {
  // No permitimos datos comerciales ni XML arbitrario en este laboratorio.
  if (!Object.hasOwn(XML_VARIANTS, variant)) throw new Error('Variante de laboratorio no autorizada');
  const {xadesjs, xmldsigjs, xmldom, xpath, crypto=webcrypto} = dependencies || {};
  if (typeof xadesjs?.SignedXml !== 'function' || typeof xadesjs?.Parse !== 'function' ||
      typeof xadesjs?.Application?.setEngine !== 'function' ||
      typeof xmldsigjs?.setNodeDependencies !== 'function' ||
      !xmldom?.DOMParser || !xmldom?.XMLSerializer || !xmldom?.DOMImplementation ||
      !xpath || typeof crypto?.subtle?.generateKey !== 'function') {
    throw new Error('Dependencias de XAdESjs incompletas: ensayo bloqueado');
  }
  xmldsigjs.setNodeDependencies({ DOMParser:xmldom.DOMParser,
    XMLSerializer:xmldom.XMLSerializer, DOMImplementation:xmldom.DOMImplementation, xpath });
  xadesjs.Application.setEngine('NodeJS', crypto);
  const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',
    modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
    false,['sign','verify']);
  const doc=xadesjs.Parse(XML_VARIANTS[variant]);
  const signer=new xadesjs.SignedXml();
  const signature=await signer.Sign({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    keys.privateKey,doc,{
      keyValue:keys.publicKey,
      references:[{uri:'',hash:'SHA-256',transforms:['enveloped','c14n']}],
      policy:{hash:'SHA-256',identifier:{value:POLICY_URI},digestValue:POLICY_DIGEST},
    });
  doc.documentElement.appendChild(signature.GetXml());
  const xml=new xmldom.XMLSerializer().serializeToString(doc);
  const verify=async source=>{
    const parsed=xadesjs.Parse(source);
    const sigs=parsed.getElementsByTagNameNS(DS,'Signature');
    if(sigs.length!==1)return false;
    const checker=new xadesjs.SignedXml(parsed);
    checker.LoadXml(sigs[0]);
    return !!await checker.Verify(keys.publicKey);
  };
  assert.equal(await verify(xml),true, 'Firma sintética especializada inválida');
  const parsed=xadesjs.Parse(xml);
  const sig=parsed.getElementsByTagNameNS(DS,'Signature')[0];
  assert.equal(sig.getElementsByTagNameNS(DS,'Reference').length,2);
  assert.equal(sig.getElementsByTagNameNS(XADES,'SignedProperties').length,1);
  assert.equal(sig.getElementsByTagNameNS(XADES,'SignaturePolicyImplied').length,0);
  const id=sig.getElementsByTagNameNS(XADES,'Identifier')[0]?.textContent?.trim();
  const digest=sig.getElementsByTagNameNS(XADES,'SigPolicyHash')[0]?.getElementsByTagNameNS(DS,'DigestValue')[0]?.textContent?.trim();
  assert.equal(id,POLICY_URI, 'Política de laboratorio incorrecta');
  assert.equal(digest,POLICY_DIGEST, 'Digest documental incorrecto');
  let mutationsRejected=0;
  for(const tampered of [xml.replace('<Monto>100.00</Monto>','<Monto>101.00</Monto>'),
    xml.replace(POLICY_DIGEST,'B'+POLICY_DIGEST.slice(1))]){
    assert.notEqual(tampered,xml);
    try { if (!await verify(tampered)) mutationsRejected++; }
    catch { mutationsRejected++; }
  }
  assert.equal(mutationsRejected,2,'El ensayo no detectó todas las alteraciones');
  return Object.freeze({variant,xml,sha256:createHash('sha256').update(xml).digest('hex'),
    signed:true,references:2,mutationsRejected:2,nonFiscal:true});
}
