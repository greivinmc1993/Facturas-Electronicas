'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
const drafts=fs.readFileSync(path.join(root,'server/sale-drafts.js'),'utf8');
let passed=0;
function check(n,fn){fn();passed++;console.log('OK modalidad Ventas:',n)}
check('Tres modalidades distintas y opción genérica predeterminada',()=>{
 for(const n of ['Cliente con datos · Factura electrónica','Sin datos · Tiquete electrónico','Genérica · Factura interna'])assert.ok(ui.includes(n));
 assert.match(ui,/\[documentMode,setDocumentMode\]=useState\('GENERICA'\)/);
});
check('Buscar cliente solo aparece al elegir FE',()=>{
 assert.match(ui,/documentMode==='FE'&&<div className="posClientPicker">/);
 assert.match(ui,/Buscar cliente por nombre o cédula/);
 assert.match(ui,/const changeDocumentMode=mode=>/);
 assert.match(ui,/resetClient\(\); \/\/ Evitar arrastrar receptor/);
});
check('TE y genérica usan contado sin crear un receptor',()=>{
 assert.match(ui,/if\(mode!=='FE'\)setSaleType\('contado'\)/);
 assert.match(ui,/client_id:documentMode==='FE'\?\(clientId\|\|null\):null/);
 assert.match(ui,/document_mode:documentMode/);
});
check('Borrador comercial recupera modalidad y la guarda también con beacon',()=>{
 assert.equal((ui.match(/const payload=\{lines:cart\.map/g)||[]).length,2);
 assert.match(drafts,/version:2,documentMode/);
 assert.match(ui,/setDocumentMode\(recoveredMode\)/);
});
check('Los dos historiales comienzan cerrados y se pueden expandir',()=>{
 assert.match(ui,/\[historyOpen,setHistoryOpen\]=useState\(false\),\[creditsOpen,setCreditsOpen\]=useState\(false\)/);
 assert.match(ui,/setHistoryOpen\(v=>!v\)/);
 assert.match(ui,/setCreditsOpen\(v=>!v\)/);
});
check('Genérica no puede generar borrador XML desde interfaz ni API',()=>{
 assert.match(ui,/details\.document_mode!=='GENERICA'&&<div className="feDraftActionGroup"/);
 assert.match(server,/sale\.document_mode==='GENERICA'\)return res\.status\(409\)/);
});
check('Validación servidor de FE, TE y genérica, crédito solo FE',()=>{
 for(const fragment of ["documentMode==='FE'&&!clientId","documentMode!=='FE'&&clientId","documentMode==='TE'&&saleType!=='contado'","saleType==='credito'&&documentMode!=='FE'"])
 assert.ok(server.includes(fragment),fragment);
});
check('Modalidad queda persistida sin reescribir ventas históricas',()=>{
 assert.match(server,/addColumn\('sales','document_mode','TEXT'\)/);
 assert.match(server,/INSERT INTO sales\(company_id,client_id,sale_type,document_mode/);
});
check('Impresión de factura genérica aclara que es interna',()=>assert.match(ui,/FACTURA GENÉRICA INTERNA/));
check('Estilos adaptables a pantalla pequeña',()=>{
 assert.match(css,/posDocumentModeOptions/);
 assert.match(css,/@media\(max-width:850px\)\{\.posDocumentModeOptions/);
});
console.log('QA modalidades v0.6.88:',passed,'/',passed);
