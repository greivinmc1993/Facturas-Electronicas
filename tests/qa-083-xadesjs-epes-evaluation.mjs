/**
 * v0.6.83 — experimento aislado de XAdESjs 3.x con política explícita.
 * SOLO se ejecuta en .github/workflows/xadesjs-evaluation.yml, fuera de
 * node_modules de producción. No utiliza .p12, usuarios, SQLite ni Hacienda.
 * Las firmas son demostraciones con claves RSA efímeras; NO son facturas.
 */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as xadesjs from 'xadesjs';
import * as xmldsigjs from 'xmldsigjs';
import * as xmldom from '@xmldom/xmldom';
import xpath from 'xpath';

const DS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const POLICY_URI = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
const POLICY_DIGEST_B64 = 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';
const VARIANTS = Object.freeze({
 simple: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
 servicio: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Servicio><Cantidad>2</Cantidad><Precio>50.00</Precio></Servicio><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
 mercaderia: '<FacturaCRPruebaEspecializada><Tipo>NO_FISCAL</Tipo><Articulos><Producto codigo="DEMO-A">35.00</Producto><Producto codigo="DEMO-B">65.00</Producto></Articulos><Monto>100.00</Monto></FacturaCRPruebaEspecializada>',
});

assert.equal(typeof xmldsigjs.setNodeDependencies, 'function', 'XAdESjs 3.x debe compartir un único motor XML');
xmldsigjs.setNodeDependencies({
 DOMParser: xmldom.DOMParser,
 XMLSerializer: xmldom.XMLSerializer,
 DOMImplementation: xmldom.DOMImplementation,
 xpath,
});
xadesjs.Application.setEngine('NodeJS', webcrypto);

const reportDir = process.env.FACTURACR_XADES_REPORT_DIR;
assert(reportDir && path.isAbsolute(reportDir), 'Se requiere directorio absoluto temporal para el informe');
await mkdir(reportDir, { recursive: true });
const results = [];
for (const [name, initialXml] of Object.entries(VARIANTS)) {
 const keys = await webcrypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5', modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256',
 },false,['sign','verify']);
 const document = xadesjs.Parse(initialXml);
 const signedXml = new xadesjs.SignedXml();
 const signature = await signedXml.Sign(
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, keys.privateKey, document,
  {
   keyValue: keys.publicKey,
   references:[{uri:'',hash:'SHA-256',transforms:['enveloped','c14n']}],
   policy:{hash:'SHA-256',identifier:{value:POLICY_URI},digestValue:POLICY_DIGEST_B64},
  },
 );
 document.documentElement.appendChild(signature.GetXml());
 const xml = new xmldom.XMLSerializer().serializeToString(document);
 const parsed = xadesjs.Parse(xml);
 const signatures = parsed.getElementsByTagNameNS(DS,'Signature');
 const signedProperties = parsed.getElementsByTagNameNS(XADES,'SignedProperties');
 const policies = parsed.getElementsByTagNameNS(XADES,'SignaturePolicyId');
 const policyDigests = parsed.getElementsByTagNameNS(XADES,'SigPolicyHash');
 assert.equal(signatures.length,1, `${name}: firma única`);
 assert.equal(signedProperties.length,1, `${name}: una SignedProperties`);
 assert.equal(policies.length,1, `${name}: política explícita`);
 assert.equal(policyDigests.length,1, `${name}: digest de política`);
 assert.equal(parsed.getElementsByTagNameNS(XADES,'SignaturePolicyImplied').length,0);
 const digestValue = policyDigests[0].getElementsByTagNameNS(DS,'DigestValue')[0]?.textContent?.trim();
 assert.equal(digestValue,POLICY_DIGEST_B64,`${name}: digest de ejemplo Anexo 2`);
 assert.equal(policies[0].getElementsByTagNameNS(XADES,'Identifier')[0]?.textContent?.trim(),POLICY_URI);
 const info = signatures[0].getElementsByTagNameNS(DS,'SignedInfo')[0];
 assert.equal(info.getElementsByTagNameNS(DS,'Reference').length,2,`${name}: referencias XML y SignedProperties`);
 const verify = async (source) => {
  const dom = xadesjs.Parse(source);
  const sig = dom.getElementsByTagNameNS(DS,'Signature');
  assert.equal(sig.length,1);
  const checker = new xadesjs.SignedXml(dom);
  checker.LoadXml(sig[0]);
  return checker.Verify(keys.publicKey);
 };
 assert.equal(await verify(xml),true,`${name}: firma y referencias verificadas`);
 for (const mutant of [
  xml.replace('<Monto>100.00</Monto>', '<Monto>101.00</Monto>'),
  xml.replace(POLICY_DIGEST_B64, 'A'+POLICY_DIGEST_B64.slice(1)),
 ]) {
  assert.notEqual(mutant,xml);
  let rejected=false;
  try { rejected=!(await verify(mutant)); } catch { rejected=true; }
  assert.equal(rejected,true,`${name}: debe rechazar alteraciones de documento o política`);
 }
 const file=`xadesjs-083-${name}-NO-FISCAL.xml`;
 await writeFile(path.join(reportDir,file),xml,'utf8');
 results.push({variante:name,archivo:file,sha256:createHash('sha256').update(xml).digest('hex'),
  firma:'verificada-en-laboratorio', referencias:2, mutacionesRechazadas:2});
}
const report={versionProyecto:'0.6.83',fechaEnsayo:new Date().toISOString(),node:process.version,
 entorno:'EVALUACION AISLADA - NO FISCAL',biblioteca:'xadesjs',
 politica:{identificador:POLICY_URI,huellaEjemplo:POLICY_DIGEST_B64},
 resultados:results,
 limitaciones:['No se incorpora XAdESjs a dependencias de produccion',
  'Sin certificado tributario ni cadena de confianza',
  'Sin prueba XSD oficial 4.4 ni envio a Hacienda',
  'El resultado de este workflow no habilita emision fiscal']};
await writeFile(path.join(reportDir,'informe-XAdESjs-v0.6.83.json'),JSON.stringify(report,null,2),'utf8');
console.log(`OK XAdESjs AISLADO: ${results.length}/3 firmas con politica explicita y 6/6 mutaciones rechazadas. EMISION BLOQUEADA.`);
