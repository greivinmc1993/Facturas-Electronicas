"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const panel=fs.readFileSync(path.join(root,'src/UsersPanel.jsx'),'utf8');
const picker=fs.readFileSync(path.join(root,'src/HaciendaCabysPicker.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const electron=fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8');
const tests=[
 ['Los accesos de empresa se agrupan a la derecha',()=>{assert.match(panel,/className="userCompanyRow"/);assert.match(panel,/className="userCompanyActions"/)}],
 ['Se conservan quitar acceso y delegación con sus funciones',()=>{assert.match(panel,/onClick=\{\(\)=>revoke\(u,c\)\}/);assert.match(panel,/onClick=\{\(\)=>delegate\(u,c,!delegationOf\(u,c\)\)\}/)}],
 ['Selector y botones de perfil se organizan en dos grupos',()=>{for(const key of ['userCardActions','userCardRoleControl','userCardManageActions'])assert.ok(panel.includes(key))}],
 ['No desaparecen los controles de suspensión ni eliminación',()=>{for(const key of ['Suspender','Reactivar','Eliminar perfil'])assert.ok(panel.includes(key))}],
 ['No se modifican permisos del servidor',()=>{assert.ok(panel.includes('canAdminister(u)'));assert.ok(panel.includes('canSuspend(u)'))}],
 ['Botones sin desbordamiento y con foco accesible',()=>{for(const key of ['.usersWorkspace .userCompanyActions button','.usersWorkspace .userCardManageActions button','button:focus-visible'])assert.ok(css.includes(key))}],
 ['Diseño adaptable a ancho de contenedor y pantalla móvil',()=>{assert.ok(css.includes('@container facturacr-workspace (max-width:700px)'));assert.ok(css.includes('@media(max-width:480px)'))}],
 ['CABYS enlaza a consulta oficial de Hacienda',()=>assert.match(picker,/https:\/\/api\.hacienda\.go\.cr\/fe\/cabys\/test/)],
 ['CABYS BCCR enlaza directamente al archivo XLSX oficial',()=>assert.match(picker,/https:\/\/www\.bccr\.fi\.cr\/content\/dam\/bccr\/bccr-espanol\/noticias\/2025\/2025-04-01-catalogo-de-bienes-servicios-1\.xlsx/)],
 ['Electron permite explícitamente los dos destinos nuevos',()=>{for(const link of ['https://api.hacienda.go.cr/fe/cabys/test','https://www.bccr.fi.cr/content/dam/bccr/bccr-espanol/noticias/2025/2025-04-01-catalogo-de-bienes-servicios-1.xlsx'])assert.ok(electron.includes(link));assert.ok(electron.includes('officialPages.has(url)'));assert.ok(electron.includes("return {action:'deny'}"))}],
 ['No conserva el enlace antiguo a la nota de prensa',()=>assert.ok(!picker.includes('actualizacion-del-catalogo-de-bienes-y-servicios-cabys-2025.html'))],
 ['Enlaces externos con seguridad y texto visible',()=>{assert.match(picker,/rel="noopener noreferrer"/);assert.match(picker,/Catálogo BCCR \(Excel\)/);assert.ok(css.includes('.haciendaCabysLinks a:focus-visible'))}],
];
let count=0;for(const [name,fn] of tests){fn();console.log('OK QA botones y CABYS:',name);count++}console.log(`QA botones usuarios y enlaces CABYS: ${count}/${count}`);
