'use strict';
const assert=require('node:assert/strict');
const {assertHistoricalRowsPreserved}=require('./qa-upgrade-schema.cjs');
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name)}
const before={companies:[{id:1,name:'Empresa antigua'}],sale_lines:[{id:3,subtotal_cents:61900,total_cents:70000}],products:[{id:1,stock:7}],inventory_movements:[{id:9,delta:-1,stock_before:8,stock_after:7}]};
const after={companies:[{id:1,name:'Empresa antigua'}],sale_lines:[{id:3,subtotal_cents:61900,total_cents:70000,unit_cost_cents:null}],products:[{id:1,stock:7}],inventory_movements:[{id:9,delta:-1,stock_before:8,stock_after:7,unit_cost_cents:null}]};
check('Permite migración aditiva con costo histórico nulo',()=>assert.doesNotThrow(()=>assertHistoricalRowsPreserved(before,after)));
check('Rechaza cambio de precio anterior',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,sale_lines:[{...after.sale_lines[0],total_cents:70001}]}),/Dato histórico modificado/));
check('Rechaza inventario modificado',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,products:[{id:1,stock:6}]}),/Dato histórico modificado/));
check('Rechaza registros históricos eliminados',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,companies:[]}),/Cantidad de registros modificada/));
check('Rechaza costos históricos inventados',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,sale_lines:[{...after.sale_lines[0],unit_cost_cents:30000}]}),/Costo histórico inventado/));
check('Rechaza costos de Kardex inventados para movimientos antiguos',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,inventory_movements:[{...after.inventory_movements[0],unit_cost_cents:35000}]}),/Costo histórico inventado/));
check('Rechaza columnas históricas eliminadas',()=>assert.throws(()=>assertHistoricalRowsPreserved(before,{...after,companies:[{id:1}]}),/Columna histórica eliminada/));
console.log(`QA migración de esquema: ${count}/${count}`);
