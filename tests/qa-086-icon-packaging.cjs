'use strict';
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const project=path.resolve(__dirname,'..');const pkg=require('../package.json');
assert.ok(pkg.build.files.includes('build/icon.png'),'El icono debe incluirse expresamente en el ASAR de Windows.');
assert.ok(fs.statSync(path.join(project,'build/icon.png')).size>100,'Icono PNG ausente.');
const main=fs.readFileSync(path.join(project,'electron/main.cjs'),'utf8');
assert.match(main,/build\/icon\.png/,'Electron debe utilizar el icono empaquetado.');
console.log('QA icono Electron en instalador: 3/3 controles');
