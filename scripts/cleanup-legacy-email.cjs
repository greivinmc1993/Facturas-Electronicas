'use strict';
// Una única migración del repositorio fuente. No toca correos comerciales, SQLite,
// archivos .env ni archivos personales. Debe ejecutarse ANTES de git add -A.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const obsolete=[
 'server/email-recovery.js',
 'server/email-smtp.js',
 'server/mail-admin.js',
 'electron/mail-settings.cjs'
];
const active=[
 'server/index.js','server/auth.js','server/access-schema.js',
 'electron/main.cjs','electron/preload.cjs',
 'src/main.jsx','src/UsersPanel.jsx'
];
const referenced=active.flatMap(file=>{
 const source=fs.readFileSync(path.join(root,file),'utf8');
 return obsolete.filter(old=>source.includes(path.basename(old))).map(old=>`${file} hace referencia a ${old}`);
});
if(referenced.length){
 console.error('No se retiraron módulos: aún existen referencias activas.');
 referenced.forEach(ref=>console.error(ref));
 process.exitCode=1;
}else{
 for(const name of obsolete){
  const full=path.join(root,name);
  if(!fs.existsSync(full)){console.log('Ausente (correcto): '+name);continue}
  const info=fs.lstatSync(full);
  if(!info.isFile()&&!info.isSymbolicLink()){console.error('Ruta inesperada: '+name);process.exitCode=1;continue}
  fs.unlinkSync(full);
  console.log('Eliminado módulo obsoleto: '+name);
 }
 console.log('Listo. Ejecuta npm test; luego git add -A para registrar las eliminaciones.');
}
