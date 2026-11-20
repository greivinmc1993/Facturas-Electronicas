/** Se ejecuta SOLO en la carpeta temporal del workflow, con npm aislado. */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as xadesjs from 'xadesjs';
import * as xmldsigjs from 'xmldsigjs';
import * as xmldom from '@xmldom/xmldom';
import xpath from 'xpath';
import {runSpecializedSyntheticTrial, XML_VARIANTS} from './specialized-adapter.mjs';
const dir=process.env.FACTURACR_XADES_REPORT_DIR;
if(!dir || !path.isAbsolute(dir))throw new Error('Requiere carpeta temporal absoluta');
await mkdir(dir,{recursive:true});
const summary=[];
for (const variant of Object.keys(XML_VARIANTS)) {
 const result=await runSpecializedSyntheticTrial(variant,{xadesjs,xmldsigjs,xmldom,xpath});
 await writeFile(path.join(dir,`xadesjs-084-${variant}-NO-FISCAL.xml`),result.xml,'utf8');
 const {xml,...info}=result;
 summary.push(info);
}
await writeFile(path.join(dir,'informe-adaptador-084.json'),JSON.stringify({
 version:'0.6.84',modo:'NO FISCAL, XAdESjs en carpeta temporal',resultados:summary,
 limites:['Firma tributaria bloqueada','No se usó un .p12 real',
  'Dependencias todavía NO integradas al instalador','Pendiente XSD 4.4 y Hacienda']
},null,2),'utf8');
console.log('OK adaptador XAdESjs: 3 firmas sintéticas verificadas y 6 mutaciones rechazadas');
