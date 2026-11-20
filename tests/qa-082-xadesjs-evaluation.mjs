/**
 * Evaluación manual, aislada y NO FISCAL de XAdESjs 3.x.
 * Ejecución SOLO en .github/workflows/xadesjs-evaluation.yml,
 * con paquetes instalados fuera del proyecto. No usa clave .p12.
 * Este smoke NO valida XAdES-EPES ante Hacienda: la política y XSD quedan pendientes.
 */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import * as xadesjs from 'xadesjs';
import * as xmldsigjs from 'xmldsigjs';
import * as xmldom from '@xmldom/xmldom';
import xpath from 'xpath';

const DS='http://www.w3.org/2000/09/xmldsig#';
assert.equal(typeof xadesjs.SignedXml,'function','No se cargó SignedXml especializado');
assert.equal(typeof xmldsigjs.setNodeDependencies,'function');
xmldsigjs.setNodeDependencies({DOMParser:xmldom.DOMParser, XMLSerializer:xmldom.XMLSerializer,
 DOMImplementation:xmldom.DOMImplementation,xpath});
xadesjs.Application.setEngine('NodeJS',webcrypto);
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['sign','verify']);
const doc=xadesjs.Parse('<FacturaCRDemoNoFiscal><Monto>100.00</Monto><Tipo>SIMULACION</Tipo></FacturaCRDemoNoFiscal>');
const signer=new xadesjs.SignedXml();
const signed=await signer.Sign({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},pair.privateKey,doc,{
 keyValue:pair.publicKey,
 references:[{hash:'SHA-256',transforms:['enveloped','c14n']}],
});
doc.documentElement.appendChild(signed.GetXml());
const serialized=new xmldom.XMLSerializer().serializeToString(doc);
assert(serialized.includes('SignedProperties'),'No se generaron propiedades XAdES');
assert(serialized.includes('SignatureValue'),'No se generó una firma XML');
const roundtrip=xadesjs.Parse(serialized);
const signature=roundtrip.getElementsByTagNameNS(DS,'Signature');
assert.equal(signature.length,1);
const checker=new xadesjs.SignedXml(roundtrip);
checker.LoadXml(signature[0]);
assert.equal(await checker.Verify(pair.publicKey),true,'La firma XAdES de evaluación no se verificó');
const changed=xadesjs.Parse(serialized.replace('<Monto>100.00</Monto>','<Monto>100.01</Monto>'));
const tamperedSig=changed.getElementsByTagNameNS(DS,'Signature');
assert.equal(tamperedSig.length,1);
const checkerTampered=new xadesjs.SignedXml(changed);
checkerTampered.LoadXml(tamperedSig[0]);
let rejected=false;
try{rejected=!(await checkerTampered.Verify(pair.publicKey));}catch{rejected=true;}
assert.equal(rejected,true,'El cambio del monto debe invalidar la firma');
console.log('OK evaluación AISLADA XAdESjs: firma sintética, SignedProperties, verificación y alteración rechazada.');
console.log('PENDIENTE: política explícita EPES, digest de política, certificado tributario, XSD 4.4 y Hacienda.');
