/* Regresión v0.6.63: controles emergentes usan la identidad visual de FacturaCR,
   las operaciones peligrosas requieren confirmación y las listas siguen accesibles. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(...names)=>fs.readFileSync(path.resolve(__dirname,'..',...names),'utf8');
const css=read('src','style.css');
const main=read('src','main.jsx');
const people=read('src','UsersPanel.jsx');
const stock=read('src','CashierStockPanel.jsx');
const provider=read('src','ConfirmProvider.jsx');
let count=0;
const test=(name,check)=>{check();count++;console.log('OK Diseño interactivo:',name)};
test('No quedan confirmaciones nativas que rompan el diseño',()=>{
 for(const file of fs.readdirSync(path.resolve(__dirname,'..','src')).filter(f=>f.endsWith('.jsx'))){
  assert.doesNotMatch(read('src',file),/window\.(?:confirm|alert|prompt)\(/,file);
 }
});
test('Proveedor visual envuelve la sesión y se comparte entre módulos',()=>{
 assert.match(main,/import \{ConfirmProvider,useConfirm\} from '\.\/ConfirmProvider\.jsx'/);
 assert.match(main,/<ConfirmProvider><SecureApp\/><\/ConfirmProvider>/);
 assert.match(people,/const confirmAction=useConfirm\(\)/);
 assert.match(stock,/const confirmAction=useConfirm\(\)/);
});
test('Acciones sensibles conservan su confirmación y no se ejecutan al cancelar',()=>{
 assert.match(main,/if\(!await confirmAction\('Se cerrarán las sesiones/);
 assert.match(main,/if\(!await confirmAction\('El código de recuperación anterior/);
 assert.match(main,/if\(!await confirmAction\('Se desactivará la recuperación por correo/);
 assert.match(stock,/if\(!await confirmAction\(/);
 assert.match(people,/if\(!await confirmAction\(/);
});
test('Confirmación accesible, cancelable y con bloqueo de segundo clic',()=>{
 for(const x of [/role="alertdialog"/,/aria-modal="true"/,/pending\.current/,/e\.key==='Escape'/,/e\.key!=='Tab'/,/settle\(false\)/,/settle\(true\)/,/origin\.current/])assert.match(provider,x);
});
test('Estilos comunes de campos select y degradación para navegadores antiguos',()=>{
 assert.match(css,/\.secureRoot select:not\(\[multiple\]\):not\(\[size\]\)/);
 assert.match(css,/@supports \(appearance:base-select\)/);
 assert.match(css,/::picker\(select\)/);
 assert.match(css,/option:checked/);
 assert.match(css,/select:disabled/);
});
test('Ventanas existentes comparten bordes, fondo y sombras',()=>{
 for(const cls of ['dialogCard','companyModal','quoteDeleteDialog','accountDeleteDialog','ticketModal','fcrConfirmModal'])assert.ok(css.includes('.'+cls),cls);
 assert.match(css,/backdrop-filter:blur\(4px\)/);
});
test('Desplegables propios y opciones avanzadas mantienen estados visibles',()=>{
 for(const cls of ['sessionMenu','sidebarCompanyDropdown','quoteChoices','bizDashClientResults'])assert.ok(css.includes('.'+cls));
 assert.match(css,/\.secureRoot details>summary:focus-visible/);
});
test('Movilidad, enfoque y reducción de animaciones',()=>{
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.fcrModalActions button/);
});
console.log(`QA estilo de ventanas y menús: ${count}/${count} aprobadas`);
