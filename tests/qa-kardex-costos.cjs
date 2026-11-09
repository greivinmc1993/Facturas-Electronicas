'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {movementCost,movementCostSummary}=await import(pathToFileURL(path.resolve(__dirname,'../server/kardex-costs.js')));
 let count=0;
 const test=(title,fn)=>{fn();console.log('PASS',title);count++};
 test('Entrada a costo conocido: 3 unidades × ₡350',()=>{
  const r=movementCost({delta:3,unit_cost_cents:35000});assert.equal(r.movementCostCents,105000);assert.equal(r.unitCostCents,35000);
 });
 test('Salida con valor absoluto y costo válido',()=>{
  assert.equal(movementCost({delta:-4,unit_cost_cents:35000}).movementCostCents,140000);
 });
 test('Históricos sin costo no se estiman con precio actual',()=>{
  assert.equal(movementCost({delta:-2,unit_cost_cents:null}).movementCostCents,null);
 });
 test('Costos cero o fuera de rango quedan sin valorar',()=>{
  assert.equal(movementCost({delta:3,unit_cost_cents:0}).unitCostCents,null);
  assert.equal(movementCost({delta:999999999999,unit_cost_cents:9999999999}).movementCostCents,null);
 });
 test('Resumen separa entradas y salidas sin mezclar sin costo',()=>{
  assert.deepEqual(movementCostSummary([
   {delta:2,unit_cost_cents:10000},{delta:-3,unit_cost_cents:20000},{delta:10,unit_cost_cents:null}
  ]),{incomingCents:20000,outgoingCents:60000,covered:2,uncovered:1});
 });
 console.log(`QA costos Kardex: ${count}/${count}`);
})().catch(e=>{console.error(e);process.exitCode=1});
