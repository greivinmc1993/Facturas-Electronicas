'use strict';
// Comparación entre versiones: preservar valores anteriores aunque existan columnas nuevas.
const assert = require('node:assert/strict');

function assertHistoricalRowsPreserved(previous, current) {
  for (const [table, previousRows] of Object.entries(previous)) {
    const currentRows = current[table];
    assert.ok(Array.isArray(currentRows), `Falta tabla ${table} después de actualizar`);
    assert.equal(currentRows.length, previousRows.length, `Cantidad de registros modificada: ${table}`);
    for (let i = 0; i < previousRows.length; i++) {
      const before = previousRows[i];
      const after = currentRows[i];
      for (const [column, value] of Object.entries(before)) {
        assert.ok(Object.hasOwn(after, column), `Columna histórica eliminada: ${table}.${column}`);
        assert.deepEqual(after[column], value, `Dato histórico modificado: ${table}[${i}].${column}`);
      }
    }
  }
  // Los movimientos anteriores a esta versión no reciben costos inventados.
  if (previous.inventory_movements && current.inventory_movements) {
    for (const [i, movement] of current.inventory_movements.entries()) {
      if (!Object.hasOwn(previous.inventory_movements[i], 'unit_cost_cents')) {
        assert.ok(Object.hasOwn(movement, 'unit_cost_cents'), 'Falta migración inventory_movements.unit_cost_cents');
        assert.equal(movement.unit_cost_cents, null, `Costo histórico inventado: inventory_movements[${i}]`);
      }
    }
  }
  // La nueva columna de costo NO debe inventarse para ventas históricas.
  if (previous.sale_lines && current.sale_lines) {
    for (const [i, line] of current.sale_lines.entries()) {
      if (!Object.hasOwn(previous.sale_lines[i], 'unit_cost_cents')) {
        assert.ok(Object.hasOwn(line, 'unit_cost_cents'), 'Falta migración sale_lines.unit_cost_cents');
        assert.equal(line.unit_cost_cents, null, `Costo histórico inventado: sale_lines[${i}]`);
      }
    }
  }
}

module.exports = { assertHistoricalRowsPreserved };
