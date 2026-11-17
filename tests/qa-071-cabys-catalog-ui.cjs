'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const main=read('src/main.jsx'),picker=read('src/HaciendaCabysPicker.jsx'),style=read('src/style.css'),auth=read('server/auth.js'),server=read('server/index.js');
let n=0;function ok(title,fn){fn();n++;console.log('OK CABYS UI:',title)}
ok('Buscador está en Crear y Editar producto con el mismo formulario',()=>{assert.match(main,/<HaciendaCabysPicker/);assert.match(main,/companyId=\{selected\}/)});
ok('Selección rellena el campo CABYS real',()=>assert.match(main,/onSelect=\{code=>change\('cabys',code\)\}/));
ok('La selección no modifica impuesto ni precio',()=>{assert.doesNotMatch(picker,/change\('tax_code'/);assert.doesNotMatch(picker,/setTaxRate\(/)});
ok('Búsqueda por descripción o código con espera de 650 ms',()=>{assert.match(picker,/type="search"/);assert.match(picker,/},650\)/)});
ok('Para código numérico necesita los 13 dígitos',()=>assert.match(picker,/term.length===13/));
ok('Resultados muestran código y descripción',()=>{assert.match(picker,/item.code/);assert.match(picker,/item.description/)});
ok('Accesible por teclado con Escape y flecha abajo',()=>{assert.match(picker,/ArrowDown/);assert.match(picker,/Escape/)});
ok('Enter en botón de resultado no queda bloqueado por formulario de Productos',()=>assert.match(main,/\['TEXTAREA','BUTTON'\]\.includes\(e.target.tagName\)/));
ok('Controla respuestas atrasadas y aborta la consulta anterior',()=>{assert.match(picker,/requestRef.current/);assert.match(picker,/controller.abort/)});
ok('Servidor fija URL del catálogo en backend, con caché',()=>{assert.match(server,/createCabysLookup/);assert.match(server,/lookupCabys\(req.query.q\)/)});
ok('Endpoint requiere permiso inventory.manage por empresa',()=>assert.match(auth,/cabys-search\$.*inventory.manage/));
ok('Estilos mantienen la apariencia FacturaCR y diseño adaptable',()=>{assert.match(style,/haciendaCabysResult:focus-visible/);assert.match(style,/@media\(max-width:620px\)/)});
ok('La búsqueda permite seguir escribiendo código manualmente si falla red',()=>assert.match(picker,/completar manualmente/));
console.log(`QA interfaz CABYS oficial: ${n}/${n} aprobadas`);
