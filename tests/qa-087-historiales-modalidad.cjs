// QA de regresión para las tarjetas FE/TE/genérica y la lectura histórica en hora local.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
let count=0;
function check(description,fn){fn();count++;console.log('OK',description)}
(async()=>{
 const {saleClientLabel,saleModeLabel,saleLocalDate,saleLocalDateTime}=await import(pathToFileURL(path.join(root,'src/sales-history-display.mjs')).href);
 const oldTZ=process.env.TZ;process.env.TZ='America/Costa_Rica';
 try{
  check('FE muestra el nombre original del cliente',()=>assert.equal(saleClientLabel({document_mode:'FE',client_name:'Cliente de prueba'}),'Cliente de prueba'));
  check('TE se identifica sin inventar cliente',()=>assert.equal(saleClientLabel({document_mode:'TE',client_name:'Consumidor final'}),'Tiquete electrónico'));
  check('Genérica se identifica sin inventar cliente',()=>assert.equal(saleClientLabel({document_mode:'GENERICA',client_name:'Consumidor final'}),'Genérica'));
  check('Histórico sin modalidad se conserva como histórico',()=>assert.equal(saleModeLabel({document_mode:null}),'Histórica'));
  check('FE sin cliente recuperable no inventa identidad',()=>assert.equal(saleClientLabel({document_mode:'FE'}),'Cliente no disponible'));
  check('UTC nocturno de SQLite se filtra en el día correcto de Costa Rica',()=>assert.equal(saleLocalDate('2026-11-21 01:05:00'),'2026-11-20'));
  check('UTC de mañana no se desplaza indebidamente',()=>assert.equal(saleLocalDate('2026-11-20 13:05:00'),'2026-11-20'));
  check('Marca ISO con zona respeta la zona del sistema',()=>assert.equal(saleLocalDate('2026-11-20T18:05:48-06:00'),'2026-11-20'));
  check('Fecha y hora visible coinciden con la fecha del filtro local',()=>assert.equal(saleLocalDateTime('2026-11-21 01:05:00'),'2026-11-20 19:05'));
  check('Formato histórico sin hora no inventa zona horaria',()=>assert.equal(saleLocalDate('2026-11-20'),'2026-11-20'));
  const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
  const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
  check('Radios tienen dimensiones limitadas sin heredar input{width:100%}',()=>assert.match(css,/\.posDocumentModeSelector \.posDocumentModeOption input\[type="radio"\]\{[^}]*width:18px;[^}]*flex:0 0 18px/));
  check('Tarjetas simétricas y responsivas',()=>{assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/min-height:104px/);assert.match(css,/@media\(max-width:850px\)\{\.posDocumentModeOptions/)});
  check('El filtro FE TE genérica está disponible y por defecto muestra todas',()=>{assert.match(ui,/\[historyMode,setHistoryMode\]=useState\('todos'\)/);assert.match(ui,/<option value="TE">Tiquete electrónico<\/option>/)});
  check('Historial filtra por fecha local de SQLite y permite buscar por modalidad',()=>{assert.match(ui,/const date=saleLocalDate\(s.created_at\)/);assert.match(ui,/saleClientLabel\(s\),saleModeLabel\(s\),s.document_mode/)});
  check('Tabla principal, crédito y exportaciones usan etiquetas consistentes',()=>{assert.match(ui,/<td>\{saleClientLabel\(s\)\}<\/td>/);assert.match(ui,/const reportRows=\(\)=>filteredSales\.map\(s=>\[s.id,saleLocalDateTime\(s.created_at\),saleClientLabel\(s\)/)});
  check('API de Ventas incluye TE y genérica con etiqueta de cliente',()=>{assert.match(server,/WHEN s.document_mode='TE' THEN 'Tiquete electrónico'/);assert.match(server,/WHEN s.document_mode='GENERICA' THEN 'Genérica'/)});
 } finally {if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
 console.log(`QA historiales y selector v0.6.88: ${count}/${count}`);
})().catch(e=>{console.error(e);process.exitCode=1});
