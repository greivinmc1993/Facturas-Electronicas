// FacturaCR 0.6.64 - regresión de radios y texto del destino de respaldos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');
const jsx = fs.readFileSync(path.resolve(__dirname, '../src/main.jsx'), 'utf8');
let count = 0;
const check = (title, cb) => { cb(); count++; console.log('OK Respaldos UI:', title); };
check('Las dos opciones y sus descripciones se mantienen', () => {
  for (const label of ['Carpeta predeterminada', 'Carpeta personalizada', 'Recomendada para empezar', 'disco externo']) assert.ok(jsx.includes(label), label);
});
check('Los radios siguen perteneciendo al mismo grupo y los cambios actualizan el estado', () => {
  assert.equal((jsx.match(/name="backup-directory-mode"/g) || []).length, 2);
  assert.match(jsx, /directoryMode:'default'/);
  assert.match(jsx, /directoryMode:'custom'/);
});
check('El contenedor se adapta al espacio disponible y no usa dos columnas obligatorias', () => {
  assert.match(css, /\.backupDirectory \.backupDestinationChoices\s*\{[^}]*repeat\(auto-fit,minmax\(min\(100%,255px\),1fr\)\)/s);
});
check('Las tarjetas muestran botón y texto en columnas con anchura protegida', () => {
  assert.match(css, /label\.backupDestinationChoice\s*\{[^}]*grid-template-columns:18px minmax\(0,1fr\)/s);
  assert.match(css, /\.backupDestinationChoice>span\s*\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/s);
});
check('El botón radio no hereda input width 100% ni padding general', () => {
  assert.match(css, /\.backupDestinationChoice input\[type="radio"\]\s*\{[^}]*width:18px[^}]*max-width:18px[^}]*height:18px[^}]*padding:0/s);
});
check('No se pierde la indicación visual de la opción elegida ni el foco', () => {
  assert.match(css, /\.backupDestinationChoice:has\(input:checked\)/);
  assert.match(css, /\.backupDestinationChoice:focus-within/);
});
check('La selección de carpeta sigue usando el explorador Electron y se guarda explícitamente', () => {
  assert.match(jsx, /window\.facturacrBackups\?\.chooseFolder/);
  assert.match(jsx, /onClick=\{chooseFolder\}/);
  assert.match(jsx, /onClick=\{saveAutoBackup\}/);
});
console.log(`QA v0.6.64 opciones de respaldo: ${count}/${count} aprobadas`);
