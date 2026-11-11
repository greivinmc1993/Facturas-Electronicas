/* QA de regresión: retícula responsiva general de FacturaCR v0.6.63.
   Las medidas visuales reales también deben verificarse en navegador/Electron. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
// __dirname ya es una ruta absoluta de sistema de archivos. No convertirla
// manualmente a file://: en Windows eso puede duplicar la unidad (D:\D:\...).
const projectFile=(...parts)=>path.resolve(__dirname,'..',...parts);
const jsx=fs.readFileSync(projectFile('src','main.jsx'),'utf8');
const css=fs.readFileSync(projectFile('src','style.css'),'utf8');

// Regresión multiplataforma para el fallo real en GitHub Actions Windows.
const windowsRoot=String.raw`D:\a\Facturas-Electronicas\Facturas-Electronicas\tests`;
assert.equal(
 path.win32.resolve(windowsRoot,'..','src','main.jsx'),
 String.raw`D:\a\Facturas-Electronicas\Facturas-Electronicas\src\main.jsx`,
 'La prueba debe resolver la ruta Windows sin duplicar D:'
);
assert.equal(
 path.posix.resolve('/home/runner/work/facturacr/tests','..','src','main.jsx'),
 '/home/runner/work/facturacr/src/main.jsx',
 'La prueba debe resolver la ruta POSIX sin file://'
);
console.log('OK QA: rutas de archivos multiplataforma (Windows y POSIX)');
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


// Regresión real: un sticky dentro de .layout NO puede colocarse sobre
// un hermano que precede a .layout. El panel de seguridad debe ser hijo
// de <main>; de otro modo todo el menú lateral se desplazará hacia abajo.
const appStart=jsx.indexOf('function App({account,securityPanel})');
const secureStart=jsx.indexOf('function SecureApp()');
assert.ok(appStart>=0&&secureStart>appStart,'App debe recibir el panel de Seguridad');
const appSource=jsx.slice(appStart,secureStart);
assert.match(appSource,/<main>\{securityPanel\}/,'Seguridad debe aparecer al inicio de <main>, junto al menú');
assert.ok(!appSource.includes('className="securitySettingsPanel"'),'La sección se crea una sola vez dentro de SecureApp');
const secureSource=jsx.slice(secureStart);
assert.match(secureSource,/const securityPanel = hasSession&&securitySettingsOpen/,'Seguridad se construye únicamente con sesión válida');
assert.match(secureSource,/<App key=\{sessionUser.id\} account=\{sessionUser\} securityPanel=\{securityPanel\}/,'App recibe el panel sin desmontar el negocio');
assert.ok(secureSource.indexOf('const securityPanel =')<secureSource.indexOf('return <div className="secureRoot">'),'No se debe renderizar Seguridad antes de .layout');
assert.match(secureSource,/id="facturacr-security-panel"/,'Panel accesible para el desplazamiento al abrir');
assert.match(secureSource,/scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/,'La apertura debe llevar al panel visible');
assert.match(css,/\.secureRoot \.layout>main>\.securitySettingsPanel\{[\s\S]*?scroll-margin-top:/,'Panel dentro del main con margen por barra de sesión');
assert.match(css,/\.secureRoot \.layout>aside\{[\s\S]*?position:sticky!important;top:66px/,'Navegación fija debajo de la barra de sesión');
console.log('OK Diseño: Seguridad integrada en main y lateral independiente al abrir/cerrar');
