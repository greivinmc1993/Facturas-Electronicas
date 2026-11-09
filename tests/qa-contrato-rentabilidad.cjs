'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'server/dashboard.js'),'utf8');
const panel=fs.readFileSync(path.join(root,'src/DashboardPanel.jsx'),'utf8');
const pkg=require('../package.json');
let checks=0;const check=(title,fn)=>{fn();checks++;console.log('PASS',title)};
check('Cálculo de rentabilidad utiliza costos históricos por línea',()=>{
 assert.match(backend,/l\.unit_cost_cents IS NOT NULL/);
 assert.match(backend,/l\.quantity\*l\.unit_cost_cents/);
 assert.match(backend,/product_margins:productMargins/);
});
check('Consulta se vincula a filtros por empresa, cliente, estado y fechas',()=>{
 assert.match(backend,/FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE \$\{valid.sql\}/);
 assert.match(backend,/\.all\(\.\.\.valid\.args\)/);
});
check('Interfaz distingue cobertura parcial y pérdidas',()=>{
 assert.ok(panel.includes('Rentabilidad por producto'));
 assert.ok(panel.includes('bizDashMissingCost'));
 assert.ok(panel.includes('bizDashNegativeMargin'));
});
check('CSV resumen y PDF incluyen tabla de márgenes',()=>{
 assert.ok(backend.includes('Rentabilidad por artículo'));
 assert.ok(backend.includes('Rentabilidad por producto (solo costos históricos)'));
});
check('Versión actualizada',()=>assert.equal(pkg.version,'0.6.59'));
console.log(`QA rentabilidad: ${checks}/${checks}`);
