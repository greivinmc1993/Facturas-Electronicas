'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const main=read('src/main.jsx'),picker=read('src/HaciendaActivityPicker.jsx'),company=read('src/CompanyFiscalFields.jsx');
let count=0;
const test=(label,action)=>{action();count++;console.log('OK interfaz v0.6.72:',label)};
const inventory=main.slice(main.indexOf('<h4>Precios e impuestos</h4>'),main.indexOf('<h4>Inventario</h4>',main.indexOf('<h4>Precios e impuestos</h4>')));
const clients=main.slice(main.indexOf("{tab==='clients'?<>"),main.indexOf('  <h4>Dirección</h4>',main.indexOf("{tab==='clients'?<>")));
test('selector de modalidad precede los tres campos de precio/costo/moneda',()=>{
  const choice=inventory.indexOf('<Field title="Cómo se ingresa el precio">');
  const amounts=inventory.indexOf('<div className="three"><Field title={form.price_includes_tax');
  assert.ok(choice>=0&&amounts>choice);
});
test('se mantiene el precio con IVA por defecto y el alternativo sin IVA',()=>{
  assert.match(main,/price_includes_tax:'1'/);
  assert.match(inventory,/value="1">Precio final con IVA incluido \(predeterminado\)/);
  assert.match(inventory,/value="0">Precio base sin IVA · agregar impuesto/);
  assert.match(inventory,/Precio base sin IVA \*/);
});
test('se conserva vista previa decimal y la tarifa tributaria',()=>{
  assert.match(inventory,/productPricePreview/);
  assert.match(inventory,/fiveString\(/);
  assert.match(inventory,/Tarifa de IVA/);
});
test('cliente conserva ingreso manual de la actividad fiscal',()=>{
  assert.match(clients,/value=\{form\.activity_code\}/);
  assert.match(clients,/onChange=\{e=>change\('activity_code',e\.target\.value\)\}/);
  assert.match(clients,/maxLength="6"/);
});
test('cliente reutiliza el buscador de Empresas con coincidencias al teclear código',()=>{
  assert.match(main,/import HaciendaActivityPicker from '\.\/HaciendaActivityPicker\.jsx'/);
  assert.match(clients,/<HaciendaActivityPicker key=\{`client-activity-/);
  assert.match(clients,/code=\{form\.activity_code\}/);
  assert.match(clients,/onSelect=\{code=>change\('activity_code',code\)\}/);
  assert.match(picker,/const term=query\.trim\(\)\|\|String\(code\)\.trim\(\)/);
  assert.match(picker,/term\.length>=2\?searchHaciendaActivityExcerpt/);
  assert.match(company,/<HaciendaActivityPicker/);
});
test('la actividad elegida solo actualiza el campo del cliente',()=>{
  assert.match(picker,/onSelect\(item\.code\)/);
  assert.match(clients,/onSelect=\{code=>change\('activity_code',code\)\}/);
});
test('no busca actividades inscritas de la empresa para un cliente',()=>{
  assert.match(clients,/allowRegisteredLookup=\{false\}/);
  assert.match(picker,/if\(!allowRegisteredLookup\|\|!companyId\|\|busy\)return/);
  assert.match(picker,/allowRegisteredLookup&&<button/);
  assert.match(picker,/allowRegisteredLookup&&registeredMatches/);
});
test('buscador de cliente usa ID distinto del de Empresas',()=>{
  assert.match(clients,/inputId="client-activity-search"/);
  assert.match(picker,/htmlFor=\{inputId\}/);
  assert.match(picker,/id=\{inputId\}/);
});
test('muestra que el extracto no acredita inscripción del receptor',()=>{
  assert.match(picker,/no el padrón completo/);
  assert.match(picker,/no confirma inscripción tributaria/);
});
(async()=>{
  const {searchHaciendaActivityExcerpt}=await import('../src/hacienda-activity-catalog.js');
  test('búsqueda de código 6201 trae programación informática',()=>{
    const hits=searchHaciendaActivityExcerpt('6201',8);
    assert.ok(hits.some(hit=>hit.code==='6201.0'&&hit.description.includes('programación informática')));
  });
  test('búsqueda por descripción sigue funcionando',()=>{
    const hits=searchHaciendaActivityExcerpt('peluquería',8);
    assert.ok(hits.some(hit=>hit.code==='9602.0'));
  });
  console.log(`QA orden de precios y catálogo clientes: ${count}/${count} aprobadas`);
})().catch(error=>{console.error(error);process.exitCode=1});
