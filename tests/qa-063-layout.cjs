/* QA de regresión: retícula responsiva general de FacturaCR v0.6.63.
   Las medidas visuales reales también deben verificarse en navegador/Electron. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const css=fs.readFileSync(new URL('../src/style.css',`file://${__filename.replace(/\\/g,'/')}`).pathname,'utf8');
const changes=css.split('/* FacturaCR v0.6.63 · Distribución fluida y simétrica de todas las secciones.')[1];
assert.ok(changes,'Falta el bloque de estilos de distribución general');
const checks=[
 ['main fluido y centrado',/\.secureRoot \.layout>main\s*\{[\s\S]*?max-width:var\(--fcr-content-max\);[\s\S]*?margin-inline:auto;/],
 ['limite de contenido uniforme',/--fcr-content-max:2200px/],
 ['dashboard y auditoria amplios',/\.bizDashboard,[\s\S]*?\.auditWorkspace\s*\{/],
 ['usuarios sin límite antiguo',/\.layout>main \.usersWorkspace,[\s\S]*?max-width:none/],
 ['seguridad fluida',/\.securitySettingsPanel>:is\([\s\S]*?\.emailRecoveryTools\)\s*\{[\s\S]*?max-width:var\(--fcr-content-max\)/],
 ['reticula de seguridad equilibrada',/grid-template-columns:minmax\(250px,\.95fr\) minmax\(0,1\.65fr\)/],
 ['dos columnas por ancho util',/@container facturacr-workspace \(min-width:980px\)/],
 ['una columna por ancho util',/@container facturacr-workspace \(max-width:979px\)/],
 ['barra superior anclada',/\.sessionBar\{position:sticky;top:0;z-index:1300\}/],
 ['soporte telefonos',/@media \(max-width:620px\)/],
];
for(const [name,regex] of checks){
 assert.match(name==='barra superior anclada'?css:changes,regex,`Falla distribución: ${name}`);
 console.log('OK Diseño:',name);
}
assert.match(changes,/\.secureRoot \.layout>aside\{[\s\S]*?position:sticky!important;top:66px/, 'El menú lateral debe anclarse sin cubrir Seguridad');
console.log('OK Diseño: menú lateral anclado sin superposición');
