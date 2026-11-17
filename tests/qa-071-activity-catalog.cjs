'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const root=require('node:path').resolve(__dirname,'..');
 const index=await import(require('node:url').pathToFileURL(require('node:path').join(root,'src/hacienda-activity-catalog.js')).href);
 const look=await import(require('node:url').pathToFileURL(require('node:path').join(root,'server/hacienda-activity-lookup.js')).href);
 let n=0;const check=(name,fn)=>{fn();n++;console.log('OK Catálogo Hacienda:',name)};
 check('Fuente del extracto es la publicación oficial de Hacienda',()=>{assert.match(index.HACIENDA_ACTIVITY_SOURCE,/hacienda\.go\.cr/);assert.match(index.HACIENDA_ACTIVITY_PDF,/CorrespondenciaATV/)});
 check('El extracto contiene datos CIIU4 y no repite códigos',()=>{assert.ok(index.HACIENDA_ACTIVITY_EXCERPT.length>=100);assert.equal(new Set(index.HACIENDA_ACTIVITY_EXCERPT.map(x=>x.code)).size,index.HACIENDA_ACTIVITY_EXCERPT.length)});
 check('Busca por prefijo y conserva ceros iniciales',()=>{const a=index.searchHaciendaActivityExcerpt('0114');assert.equal(a[0].code,'0114.0')});
 check('Busca por descripción ignorando acentos',()=>{assert.ok(index.searchHaciendaActivityExcerpt('PROGRAMACION').some(x=>x.code==='6201.0'))});
 check('Busca por varias palabras',()=>{assert.ok(index.searchHaciendaActivityExcerpt('consultoria informatica').some(x=>x.code==='6202.0'))});
 check('Limita resultados y no convierte códigos que no existen',()=>{assert.deepEqual(index.searchHaciendaActivityExcerpt(''),[]);assert.ok(index.searchHaciendaActivityExcerpt('fabricacion',3).length<=3);assert.equal(index.searchHaciendaActivityExcerpt('4019.0').length,0)});
 check('Parser ignora códigos inválidos, elimina repetidos y limpia descripciones',()=>{
  assert.deepEqual(look.parseRegisteredActivities({actividades:[{codigo:'6201.0',descripcion:'Programación'},{codigo:'6201.0'},{codigo:'BAD'},{codigo:'4711.1',descripcion:'Comercio'}]}),[{code:'6201.0',description:'Programación'},{code:'4711.1',description:'Comercio'}]);
 });
 check('Parser rechaza respuesta extraña sin inventar actividades',()=>assert.throws(()=>look.parseRegisteredActivities({foo:[]}),/no reconocido/));
 let calls=0,now=100000;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,look.HACIENDA_TAXPAYER_URL+'?identificacion=2100042005');assert.equal(options.method,'GET');return{ok:true,status:200,text:async()=>JSON.stringify({actividades:[{codigo:'6201.0',descripcion:'Actividades de programación informática'}]})}};
 const lookup=look.createRegisteredActivitiesLookup({fetchImpl:fetcher,clock:()=>now,ttlMs:600000});
 const first=await lookup('2-100-042005');
 check('Obtiene inscritas desde Hacienda sin URL arbitraria',()=>{assert.equal(first.activities[0].code,'6201.0');assert.equal(calls,1)});
 await lookup('2100042005');
 check('Caché evita repetir la llamada',()=>assert.equal(calls,1));
 now+=600001;await lookup('2100042005');
 check('Tras vencer el caché vuelve a consultar',()=>assert.equal(calls,2));
 try{await lookup('no-valida');assert.fail('Debe fallar')}catch(err){check('Rechaza cédula inválida antes de consultar',()=>assert.match(err.message,/identificación/))}
 const throttled=look.createRegisteredActivitiesLookup({fetchImpl:async()=>({status:429,ok:false})});
 try{await throttled('2100042005');assert.fail('Debe fallar')}catch(err){check('Maneja límites 429 sin datos inventados',()=>assert.match(err.message,/limitó/))}
 const lost=look.createRegisteredActivitiesLookup({fetchImpl:async()=>{throw Error('timeout')}});
 try{await lost('2100042005');assert.fail('Debe fallar')}catch(err){check('Fallo de red no modifica actividades',()=>assert.match(err.message,/conectar/))}
 console.log(`QA catálogo y consulta Hacienda: ${n}/${n} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
