'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const lookup=await import(pathToFileURL(path.join(__dirname,'../server/hacienda-cabys-lookup.js')).href);
 let count=0;
 function ok(name,fn){fn();count++;console.log('OK CABYS oficial:',name)}
 ok('Endpoint fijo de Hacienda sin dominios arbitrarios',()=>assert.equal(lookup.HACIENDA_CABYS_URL,'https://api.hacienda.go.cr/fe/cabys'));
 ok('Descripción de 3 caracteres admitida',()=>assert.deepEqual(lookup.validateCabysQuery('arroz'),{value:'arroz',kind:'q'}));
 ok('Código de 13 dígitos admitido, incluidos ceros iniciales',()=>assert.deepEqual(lookup.validateCabysQuery('0123400010100'),{value:'0123400010100',kind:'codigo'}));
 ok('Código incompleto rechazado',()=>assert.throws(()=>lookup.validateCabysQuery('123456'),/13 dígitos/));
 ok('Consulta de una sola letra rechazada',()=>assert.throws(()=>lookup.validateCabysQuery('a'),/3 caracteres/));
 ok('Búsqueda excesiva rechazada',()=>assert.throws(()=>lookup.validateCabysQuery('a'.repeat(81)),/80 caracteres/));
 ok('Respuestas CABYS de Hacienda se normalizan sin perder ceros',()=>{
  assert.deepEqual(lookup.normalizeCabysResults({cabys:[{codigo:'0123400010100',descripcion:'Tomate',impuesto:1}]}),[{code:'0123400010100',description:'Tomate',taxRate:'1'}]);
 });
 ok('Respuesta por código como objeto singular',()=>assert.equal(lookup.normalizeCabysResults({codigo:'2132100000100',descripcion:'Jugo de tomate',impuesto:13})[0].code,'2132100000100'));
 ok('Se eliminan códigos repetidos e inválidos',()=>assert.equal(lookup.normalizeCabysResults({cabys:[{codigo:'2132100000100'},{codigo:'2132100000100'},{codigo:'X'}]}).length,1));
 ok('Estructuras no reconocidas fallan y no inventan resultados',()=>assert.throws(()=>lookup.normalizeCabysResults({otra:[]}),/no reconocida/));
 let now=100000,calls=0;
 const fetchImpl=async(url,options)=>{
  calls++;
  assert.equal(url,'https://api.hacienda.go.cr/fe/cabys?q=jugo%20de%20tomate&top=12');
  assert.equal(options.method,'GET');
  return{ok:true,status:200,text:async()=>JSON.stringify({cabys:[{codigo:'2132100000100',descripcion:'Jugo de tomate',impuesto:13}]})};
 };
 const fetchCabys=lookup.createCabysLookup({fetchImpl,clock:()=>now,ttlMs:600000});
 const found=await fetchCabys('jugo de tomate');
 ok('Búsqueda consulta endpoint oficial y devuelve los resultados',()=>assert.equal(found.items[0].code,'2132100000100'));
 await fetchCabys('jugo de tomate');
 ok('Caché evita repetir una búsqueda',()=>assert.equal(calls,1));
 now+=600001;await fetchCabys('jugo de tomate');
 ok('Caché expira y permite actualización',()=>assert.equal(calls,2));
 let concurrent=0;
 const dedupe=lookup.createCabysLookup({fetchImpl:async()=>{concurrent++;await new Promise(r=>setTimeout(r,15));return{ok:true,status:200,text:async()=>JSON.stringify({cabys:[]})}}});
 await Promise.all([dedupe('leche'),dedupe('leche')]);
 ok('Consultas simultáneas idénticas se deduplican',()=>assert.equal(concurrent,1));
 const cap=lookup.createCabysLookup({fetchImpl:async()=>({ok:false,status:429})});
 await assert.rejects(cap('queso'),/limitó/);ok('Límite 429 comunica advertencia',()=>{});
 const missing=lookup.createCabysLookup({fetchImpl:async()=>({ok:false,status:404})});
 const none=await missing('galletas');ok('Código o descripción no encontrada devuelve lista vacía',()=>assert.deepEqual(none.items,[]));
 const offline=lookup.createCabysLookup({fetchImpl:async()=>{throw Error('red')} });
 await assert.rejects(offline('café'),/conectar/);ok('Fallo de red no produce código falso',()=>{});
 const huge=lookup.createCabysLookup({fetchImpl:async()=>({ok:true,status:200,text:async()=>'{'.repeat(351000)})});
 await assert.rejects(huge('fresa'),/excede/);ok('Respuesta excesiva rechazada',()=>{});
 console.log(`QA catálogo CABYS oficial: ${count}/${count} aprobadas`);
})().catch(e=>{console.error(e);process.exitCode=1});
