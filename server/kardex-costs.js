// Costos históricos por movimiento, nunca reconstruidos a partir del catálogo actual.
export function movementCost(row){
 const unit=row.unit_cost_cents;
 if(!Number.isSafeInteger(unit)||unit<=0)return {...row,unitCostCents:null,movementCostCents:null};
 const amount=Math.round(Math.abs(Number(row.delta))*unit);
 if(!Number.isSafeInteger(amount))return {...row,unitCostCents:null,movementCostCents:null};
 return {...row,unitCostCents:unit,movementCostCents:amount};
}
export function movementCostSummary(rows){
 let incoming=0,outgoing=0,covered=0;
 for(const raw of rows){
  const row=movementCost(raw);
  if(row.movementCostCents===null)continue;
  covered++;
  if(Number(row.delta)>0)incoming+=row.movementCostCents;
  else outgoing+=row.movementCostCents;
 }
 return {incomingCents:incoming,outgoingCents:outgoing,covered,uncovered:rows.length-covered};
}
