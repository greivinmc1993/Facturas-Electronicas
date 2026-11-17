'use strict';
// Contratos de seguridad para el análisis comercial v0.6.44.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'server','dashboard.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const panel=fs.readFileSync(path.join(root,'src','DashboardPanel.jsx'),'utf8');
let passed=0;
function check(name,cb){cb();passed++;console.log('PASS',name)}
check('Migración aditiva del costo histórico, sin alterar líneas existentes',()=>{
 assert.match(server,/addColumn\('sale_lines','unit_cost_cents','INTEGER'\)/);
 assert.match(server,/unit_cost_cents,fiscal_unit_price_5/);
 assert.match(server,/historicalCost=.*product\.currency==='CRC'/s);
});
check('Márgenes consideran solo líneas con costo capturado, excluyen históricos NULL',()=>{
 assert.match(backend,/l\.unit_cost_cents IS NOT NULL/);
 assert.match(backend,/l\.unit_cost_cents IS NULL/);
 assert.match(backend,/estimated_gross_margin_cents=profitability\.covered_net_sales_cents-profitability\.cost_cents/);
});
check('Período anterior equivale al intervalo seleccionado y reutiliza filtros SQL',()=>{
 assert.match(backend,/prevFilter=\{\.\.\.f,/);
 assert.match(backend,/const pw=saleWhere\(prevFilter,\{active:true\}\)/);
 assert.match(backend,/Date\.parse\(f\.from\+'T00:00:00Z'\)-days\*86400000/);
});
check('Dashboard presenta comparativas y advertencia de cobertura',()=>{
 assert.match(panel,/Variación de ventas/);
 assert.match(panel,/Evolución mensual/);
 assert.match(panel,/Cobertura:/);
 assert.match(panel,/No se asignan costos actuales a ventas antiguas/);
});
check('CSV y PDF contienen información de rentabilidad parcial y comparativas',()=>{
 assert.match(backend,/add\('Comparación con período anterior equivalente'\)/);
 assert.match(backend,/Margen bruto estimado parcial CRC/);
 assert.match(backend,/Comparación con período anterior<\/h2>/);
 assert.match(backend,/Clientes frecuentes/);
});
console.log(`QA análisis comercial: ${passed}/${passed} comprobaciones`);
