const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
const {csvCell,csvDocument,csvExcelBuffer,reportHtml}=await import(pathToFileURL(path.join(__dirname,'../server/report-format.js')).href);
let n=0;const check=(name,fn)=>{fn();n++;console.log('OK '+name)};
check('Celdas con colones se convierten en cifras sin simbolos',()=>{
 assert.equal(csvCell('₡20 000,00'),'"20000,00"');
 assert.equal(csvCell('₡1.500,50'),'"1500,50"');
 assert.equal(csvCell('-₡500,00'),'"-500,00"');
 assert.equal(csvCell('Compra de artículo ₡350'),'"Compra de artículo ₡350"');
});
check('CSV conserva seguridad y cantidades monetarias numericas',()=>{
 const c=csvDocument(['Descripción','Monto CRC'],[['Gasto de papel', '₡1 500,00'],['Corrección','-₡500,00'],['Texto inseguro','=SUM(1)']]);
 assert.ok(c.includes('"1500,00"'));
 assert.ok(c.includes('"-500,00"'));
 assert.ok(c.includes(`"'=SUM(1)"`));
 assert.ok(!c.includes('₡1 500,00'));
});
check('Ventas no muestra spinners en efectivo ni pagos combinados',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
 const styles=fs.readFileSync(path.join(__dirname,'../src/style.css'),'utf8');
 assert.match(source,/id="posCashTendered" className="posMoneyInput" type="number"/);
 assert.match(source,/id=\{`posOtherPayment-\$\{i\}`\}[^\n]*className="posMoneyInput" type="number"/);
 assert.match(styles,/input\.posMoneyInput\[type="number"\]::-webkit-inner-spin-button/);
});
check('Negativos numéricos sin comillas simples',()=>{assert.equal(csvCell(-10030000),'"-10030000"');assert.equal(csvCell('-1'),'"-1"')});
check('CSV y separador regional',()=>{let c=csvDocument(['Artículo','Variación'],[['Piñata niño',-3]]);assert.ok(c.startsWith('\ufeffsep=;\r\n'));assert.ok(c.includes('Piñata niño'));assert.ok(c.includes('"-3"'))});
check('Bloqueo de fórmulas externas',()=>{assert.equal(csvCell('=HYPERLINK(1)'),`"'=HYPERLINK(1)"`);assert.equal(csvCell('+SUM(1)'),`"'+SUM(1)"`)});
check('SKU con ceros preservado en Excel CSV',()=>{assert.equal(csvCell('00123',{identifier:true}),`"=""00123"""`)});
check('HTML PDF escapa caracteres sin perder tildes',()=>{const s=reportHtml({title:'Kárdex',headers:['Artículo'],rows:[['Piñata <especial>']]});assert.ok(s.includes('Piñata &lt;especial&gt;'));assert.ok(s.includes('charset="UTF-8"'))});
check('UTF-16 LE con BOM conserva tildes y números negativos',()=>{const b=csvExcelBuffer(csvDocument(['Artículo','Variación'],[['Piñata niño',-3]]));assert.deepEqual([...b.subarray(0,2)],[255,254]);const text=b.subarray(2).toString('utf16le');assert.ok(text.includes('Piñata niño'));assert.ok(text.includes('Artículo'));assert.ok(text.includes('"-3"'));});
const f=fs.readFileSync(path.join(__dirname,'../server/kardex.js'),'utf8');
check('Kardex CSV y PDF comparten filtros',()=>{for(const extension of ['csv','html'])assert.ok(f.includes('kardex/export.'+extension))});
check('Rutas PDF de catálogo y movimientos',()=>{const s=fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8');assert.ok(s.includes('products/export.html'));assert.ok(s.includes('movements/export.html'));assert.ok(s.includes('alerts/export.html'))});
const m=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
check('CSV local de créditos y ventas protege fórmulas y no formatea CRC como texto monetario',()=>{
 assert.ok(m.includes('csvSafeCell'));assert.ok(m.includes('moneyPdf(s.total_cents)'));
 const local=fs.readFileSync(path.join(__dirname,'../src/csv-export.js'),'utf8');
 assert.ok(local.includes('export function csvSafeCell'));
});
check('PDF disponible y XLSX retirado',()=>{assert.ok(m.includes('Guardar movimientos PDF'));assert.ok(m.includes('Guardar PDF catálogo'));assert.ok(!m.includes('Exportar Excel .xlsx'))});
check('CSV sin símbolo en importes pero PDF en colones',()=>{
 const c=csvDocument(['Fondo inicial (CRC)','Gasto (CRC)'],[['₡20.000,00','₡1.500,00']]);
 assert.ok(c.includes('20000,00'));assert.ok(c.includes('1500,00'));
 assert.ok(!c.includes('₡20.000,00'));
 const html=reportHtml({title:'Caja',headers:['Monto'],rows:[['₡20.000,00']]});
 assert.ok(html.includes('₡20.000,00'));
});
console.log('QA exportaciones '+n+'/'+n);
})().catch(e=>{console.error(e);process.exitCode=1});
