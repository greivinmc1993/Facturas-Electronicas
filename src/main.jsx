import {csvExcelBlob,decodeCatalogCsv,csvSafeCell} from './csv-export.js';
import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import appLogo from '../build/icon.png';
import QuotesPanel from './QuotesPanel.jsx';
import DashboardPanel from './DashboardPanel.jsx';
import KardexPanel from './KardexPanel.jsx';
import CashPanel from './CashPanel.jsx';
import InventoryValuationPanel from './InventoryValuationPanel.jsx';
import UsersPanel from './UsersPanel.jsx';

const APP_VERSION = __APP_VERSION__;
const ACTIVE_COMPANY_KEY = 'facturacr_active_company_id';
const COMPANY_COLORS=['#2563eb','#0891b2','#0f766e','#7c3aed','#d97706','#dc5265'];
const colorForCompany=company=>COMPANY_COLORS.includes(company?.avatar_color)?company.avatar_color:COMPANY_COLORS[0];
const withAlpha=(hex,alpha=.22)=>{const value=String(hex||'').replace('#','');if(value.length!==6)return hex;const n=parseInt(value,16);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;return `rgba(${r}, ${g}, ${b}, ${alpha})`;};
function UiIcon({name,size=18}){
 const shapes={
  office:<>
    <path d="M4 21V6.5A1.5 1.5 0 0 1 5.5 5H10v16"/>
    <path d="M10 3h8.5A1.5 1.5 0 0 1 20 4.5V21"/>
    <path d="M8 9h.01M8 13h.01M8 17h.01M14 7h2M14 11h2M14 15h2M11 21h2"/>
  </>,
  idcard:<>
    <rect x="3" y="5" width="18" height="14" rx="2.5"/>
    <circle cx="9" cy="11" r="2.2"/>
    <path d="M6.8 15.2c.8-1.1 3.6-1.1 4.4 0M14 10h4M14 14h3"/>
  </>,
  package:<>
    <path d="m12 3 7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3Z"/>
    <path d="M12 3v8.8m7.5-4.6L12 11.8 4.5 7.2"/>
  </>,
  cart:<>
    <path d="M6 6h13l-1.4 6.2a2 2 0 0 1-2 1.6H9.3a2 2 0 0 1-2-1.6L5.6 4.8A2 2 0 0 0 3.7 3.3H3"/>
    <circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>
  </>,
  backup:<>
    <ellipse cx="12" cy="6" rx="7.5" ry="2.5"/>
    <path d="M4.5 6v5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V6"/>
    <path d="M8 17.5a5 5 0 1 0 8.9-3.1"/><path d="M16 11.8v3.6h-3.6"/>
  </>,
  building:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12M7 7h.01M17 7h.01M7 11h.01M17 11h.01"/></>,
  users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  boxes:<><path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/></>,
  receipt:<><path d="M4 2h16v20l-4-2-4 2-4-2-4 2V2ZM8 7h8M8 11h8M8 15h5"/></>,
  database:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,
  chevron:<path d="m6 9 6 6 6-6"/>,
  check:<path d="m4 12 5 5 11-11"/>,
  close:<path d="M18 6 6 18M6 6l12 12"/>,
  shield:<>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
    <path d="m9 12 2 2 4-4"/>
  </>,
  edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z"/></>,
  trash:<><path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  mail:<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 8 10-8"/></>,
  phone:<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3A2 2 0 0 1 9.1 3.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"/>,
  store:<><path d="M3 10h18l-2-7H5l-2 7ZM5 10v11h14V10M9 21v-7h6v7"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  logout:<><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  save:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>
 };
 return <svg className="uiIcon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.receipt}</svg>;
}
const roundCRC=cents=>Math.round(Number(cents||0)/100)*100;
const provinces={'1':'San José','2':'Alajuela','3':'Cartago','4':'Heredia','5':'Guanacaste','6':'Puntarenas','7':'Limón'};
const tariffs=[
 ['08','13% · Tarifa general'],['04','4% · Reducida'],['03','2% · Reducida'],
 ['02','1% · Reducida'],['09','0.5% · Reducida'],['01','0% · Con derecho a crédito'],
 ['10','Exento · Código 10'],['11','0% · Sin derecho a crédito'],
 ['05','Transitorio 0% · Solo notas de ajuste'],['06','Transitorio 4% · Solo notas de ajuste'],
 ['07','Transitorio 8% · Solo notas de ajuste']
];
const paymentMethods=[['01','Efectivo'],['02','Tarjeta'],['03','Cheque'],['04','Transferencia bancaria'],['05','Recaudado por terceros'],['06','SINPE Móvil'],['07','Plataforma digital'],['99','Otros']];
const geoBase='https://ubicaciones-cr.ryze-cr.workers.dev';
const pad2=v=>String(v).padStart(2,'0');
const rates={'01':0,'02':1,'03':2,'04':4,'05':0,'06':4,'07':8,'08':13,'09':0.5,'10':0,'11':0};
const blankClient={name:'',trade_name:'',identification_type:'01',identification:'',email:'',phone:'',phone_alt:'',country_code:'506',province:'',canton:'',district:'',address:'',activity_code:'',preferred_payment:'',notes:''};
const blankProduct={kind:'producto',product_code:'',barcode:'',description:'',cabys:'',price:'',price_includes_tax:'1',cost:'0',currency:'CRC',tax_code:'08',tax_rate:13,unit:'Unid',stock:'0',min_stock:'0',track_stock:'1',alert_enabled:'1',image_data:'',notes:''};
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 if(response.status===204)return null;
 const contentType=response.headers.get('content-type')||'';
 if(!contentType.includes('application/json'))throw Error(`El servidor devolvió una respuesta inesperada (${response.status}). Comprueba que FacturaCR esté iniciado correctamente y reinicia la aplicación.`);
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Error en la solicitud');
 return data;
}
function Field({title,children}){return <label className="field">{title}{children}</label>}
class ScreenErrorBoundary extends React.Component {
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('FacturaCR: error de interfaz',error,info)}
 render(){if(this.state.error)return <div style={{padding:32,fontFamily:'system-ui',color:'#193450',maxWidth:800,margin:'auto'}}><h2>No se pudo mostrar esta pantalla</h2><p>FacturaCR detectó un problema en la interfaz. Tus datos no se han eliminado.</p><pre style={{whiteSpace:'pre-wrap',background:'#eef2f6',padding:16,borderRadius:8}}>{String(this.state.error.message||this.state.error)}</pre><button type="button" onClick={()=>window.location.reload()}>Recargar FacturaCR</button></div>;return this.props.children}
}
const basePrice=p=>Number(p.price_includes_tax)===1?Number(p.price)/(1+Number(p.tax_rate||0)/100):Number(p.price);
const saleMoney=cents=>(Number(cents||0)/100).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0});
const ticketDefaults={width:'80',logo:'',thankYou:'¡Gracias por su compra!',social:'',showAddress:true,showPhone:true,showClient:true,showPayments:true,showTax:true,autoPrint:false,printerName:'',silent:false,copies:1,template:'classic'};
const safeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ivaLabel=rate=>`${Number(rate||0).toLocaleString('es-CR',{maximumFractionDigits:2})}%`;

function buildTicketHtml(sale,company,settings){
 const t={...ticketDefaults,...settings},width=t.width==='58'?'58mm':'80mm';
 const money=n=>'₡'+saleMoney(n);
 const client=sale.client||{};
 const field=(label,value)=>value?`<p><strong>${safeHtml(label)}:</strong> ${safeHtml(value)}</p>`:'';
 const lines=(sale.lines||[]).map(l=>`<tr><td>${safeHtml(l.description)}<small>${safeHtml(l.quantity)} × ${money(l.unit_price_cents)} · IVA ${safeHtml(ivaLabel(l.tax_rate))}</small></td><td class="right">${money(l.total_cents)}</td></tr>`).join('');
 const subtotal=Number(sale.subtotal_cents??(sale.lines||[]).reduce((a,l)=>a+Number(l.subtotal_cents||0),0));
 const tax=Number(sale.tax_cents??(sale.lines||[]).reduce((a,l)=>a+Number(l.tax_cents||0),0));
 const discount=Number(sale.discount_cents||0);
 // El IVA por tarifa se obtiene de las líneas guardadas en la venta, no de la ficha actual del producto.
 // Se usa el impuesto realmente cobrado en cada línea para que el desglose coincida con el total.
 const taxByRate=new Map();
 for(const line of sale.lines||[]){
   const rate=Number(line.tax_rate||0);
   if(!Number.isFinite(rate))continue;
   const key=ivaLabel(rate);
   taxByRate.set(key,(taxByRate.get(key)||0)+Number(line.tax_cents||0));
 }
 const taxBreakdown=[...taxByRate].sort((a,b)=>parseFloat(b[0])-parseFloat(a[0]))
   .map(([label,amount])=>`<p><span>IVA ${safeHtml(label)}</span><b>${money(amount)}</b></p>`).join('');
 const taxRows=taxBreakdown||`<p><span>IVA (total)</span><b>${money(tax)}</b></p>`;
 const logo=t.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(t.logo)?`<img class="logo" src="${t.logo}" alt="Logotipo">`:'';
 const compact=t.template==='compact',modern=t.template==='modern';
 const companyBlock=`${field('Razón social',company?.legal_name)}${field('Cédula jurídica/física',company?.identification)}${t.showAddress?field('Dirección',company?.address):''}${t.showPhone?field('Teléfono',company?.phone):''}${field('Correo',company?.email)}${field('Sitio web',company?.website)}`;
 const clientBlock=t.showClient?`<section class="section"><strong>DATOS DEL CLIENTE</strong>${field('Nombre',client.name||sale.client_name||'Consumidor final')}${field('Nombre comercial',client.trade_name)}${field('Identificación',client.identification)}${field('Teléfono',client.phone)}${field('Correo',client.email)}${field('Dirección',client.address)}</section>`:'';
 // Nunca inventar clave ni consecutivo de Hacienda. Solo mostrar datos reales persistidos.
 const feBlock=sale.fe_consecutivo||sale.fe_clave?`<section class="section"><strong>COMPROBANTE ELECTRÓNICO</strong>${field('Consecutivo FE',sale.fe_consecutivo)}${field('Clave FE',sale.fe_clave)}${field('Estado Hacienda',sale.fe_estado||'Sin estado registrado')}</section>`:`<p class="muted">FE Hacienda: no emitida / pendiente de integración</p>`;
 return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Tiquete #${safeHtml(sale.id)}</title><style>@page{size:${width} auto;margin:2mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;width:${width};max-width:100%;margin:0 auto;padding:3mm;font-size:${compact?'9':'11'}px;overflow-wrap:anywhere}.center{text-align:center}.logo{max-width:80%;max-height:25mm;object-fit:contain}h2{font-size:${modern?'19':'16'}px;margin:6px 0}p{margin:4px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td{vertical-align:top;padding:4px 0;border-bottom:1px dashed #bbb;overflow-wrap:anywhere}td.right{text-align:right;white-space:nowrap;width:36%}small{display:block;font-size:10px}.totals{margin-top:8px}.totals p{display:flex;justify-content:space-between}.total{font-size:16px;font-weight:bold;border-top:1px solid #111;padding-top:6px}.muted{font-size:10px}.foot{margin-top:12px;border-top:1px dashed #777;padding-top:8px;white-space:pre-wrap}.section{border-top:1px dashed #888;padding:6px 0;margin-top:7px}.section strong{font-size:10px}</style></head><body><header class="center">${logo}<h2>${safeHtml(company?.trade_name||company?.legal_name||'FacturaCR')}</h2>${companyBlock}</header><section class="section"><strong>${sale.status==='anulada'?'VENTA ANULADA':'TIQUETE COMERCIAL INTERNO'}</strong>${field('Número de tiquete',sale.id)}${field('Fecha',sale.created_at)}${field('Tipo de venta',sale.sale_type)}</section>${feBlock}${clientBlock}<section class="section"><strong>DETALLE DE VENTA</strong><table><tbody>${lines}</tbody></table></section><div class="totals"><p><span>Subtotal sin IVA</span><b>${money(subtotal)}</b></p><p><span>Descuento</span><b>− ${money(discount)}</b></p>${t.showTax?taxRows:''}<p class="total"><span>TOTAL</span><span>${money(sale.total_cents)}</span></p><p><span>Saldo pendiente</span><span>${money(sale.balance_cents)}</span></p></div>${t.showPayments?`<p class="muted">Pagos: ${(sale.payments||[]).map(x=>`${safeHtml(x.method)} ${money(x.amount_cents)}`).join(' · ')||'Sin pagos'}</p>`:''}<div class="foot center">${safeHtml(t.thankYou)}${(t.social||company?.social)?`<p>${safeHtml(t.social||company.social)}</p>`:''}<p class="muted">Documento interno. No sustituye una factura electrónica autorizada por Hacienda.</p></div></body></html>`;
}
function SalesPanel({companyId,company,askConfirm,canReadHistory=true}){
 const [products,setProducts]=useState([]),[clients,setClients]=useState([]),[sales,setSales]=useState([]);
 const [draftReadyCompany,setDraftReadyCompany]=useState(null),[pendingDraft,setPendingDraft]=useState(null),[draftNotice,setDraftNotice]=useState('');
 const savedDraftRef=useRef(null),draftEpoch=useRef(0),draftWriteQueue=useRef(Promise.resolve());
 const [cart,setCart]=useState([]),[clientId,setClientId]=useState(''),[clientQuery,setClientQuery]=useState(''),[clientResultIndex,setClientResultIndex]=useState(0),[saleType,setSaleType]=useState('contado');
 const [cashTendered,setCashTendered]=useState(''),[discount,setDiscount]=useState('0'),[payments,setPayments]=useState([{method:'Efectivo',amount:''}]);
 const [query,setQuery]=useState(''),[scanCode,setScanCode]=useState(''),[productPage,setProductPage]=useState(1),[historyQuery,setHistoryQuery]=useState(''),[notice,setNotice]=useState('');
 const [historyPeriod,setHistoryPeriod]=useState('mes'),[historyFrom,setHistoryFrom]=useState(''),[historyTo,setHistoryTo]=useState('');
 const [historyOpen,setHistoryOpen]=useState(true),[creditsOpen,setCreditsOpen]=useState(true);
 const [details,setDetails]=useState(null),[annulReason,setAnnulReason]=useState('');
 const [abonoAmount,setAbonoAmount]=useState(''),[abonoMethod,setAbonoMethod]=useState('Efectivo');
 const [creditSales,setCreditSales]=useState([]),[creditPayments,setCreditPayments]=useState([]),[creditFilter,setCreditFilter]=useState('todas'),[creditSearch,setCreditSearch]=useState(''),[creditTab,setCreditTab]=useState('ventas');
 const [ticketSettings,setTicketSettings]=useState(ticketDefaults),[ticketDraft,setTicketDraft]=useState(ticketDefaults),[ticketSavedMessage,setTicketSavedMessage]=useState(''),[ticketPreview,setTicketPreview]=useState(''),[ticketConfigOpen,setTicketConfigOpen]=useState(false);
 const [printers,setPrinters]=useState([]),[printerBusy,setPrinterBusy]=useState(false);
 // Bloqueo inmediato (ref) y visual (state) para evitar doble envío de operaciones comerciales.
 const operationLock=useRef(false),[operationBusy,setOperationBusy]=useState(false);
 const runCommercialAction=async(label,action)=>{
  if(operationLock.current)return;
  operationLock.current=true;setOperationBusy(true);
  try{await action()}finally{operationLock.current=false;setOperationBusy(false)}
 };
   const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const today=new Date();
 const startOfWeek=new Date(today.getFullYear(),today.getMonth(),today.getDate()-((today.getDay()+6)%7));
 const periodStart=historyPeriod==='dia'?dateKey(today):historyPeriod==='semana'?dateKey(startOfWeek):historyPeriod==='mes'?dateKey(new Date(today.getFullYear(),today.getMonth(),1)):historyPeriod==='anio'?dateKey(new Date(today.getFullYear(),0,1)):historyPeriod==='personalizado'?historyFrom:'';
 const periodEnd=historyPeriod==='personalizado'?historyTo:dateKey(today);
 const PRODUCT_PAGE_SIZE=24;
 // Buscador de clientes para el punto de venta, sin alterar el cliente seleccionado.
 const normalizedClientQuery=clientQuery.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const digitsOnly=value=>String(value||'').replace(/[^0-9]/g,'');
 const searchedClientDigits=digitsOnly(clientQuery);
 const visibleClients=clients.filter(c=>{
  if(!normalizedClientQuery)return true;
  const fields=[c.name,c.trade_name,c.identification,c.phone,c.phone_alt,c.email];
  const textMatch=fields.some(value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').includes(normalizedClientQuery));
  const idMatch=searchedClientDigits.length>=3&&digitsOnly(c.identification).includes(searchedClientDigits);
  return textMatch||idMatch;
 });
 const clientSuggestions=visibleClients.slice(0,8);
 const selectedClient=clients.find(c=>String(c.id)===String(clientId));
 const chooseClient=(client)=>{setClientId(String(client.id));setClientQuery('');setClientResultIndex(0)};
 const resetClient=()=>{setClientId('');setClientQuery('');setClientResultIndex(0)};
 const normalizedProductQuery=query.trim().toLocaleLowerCase('es');
 const matchingProducts=products.filter(p=>p.currency==='CRC'&&(p.kind==='servicio'||(p.kind==='producto'&&(!Number(p.track_stock)||Number(p.stock)>0))))
  .filter(p=>[p.description,p.product_code,p.barcode].some(v=>String(v||'').toLocaleLowerCase('es').includes(normalizedProductQuery)));
 const productPageCount=Math.max(1,Math.ceil(matchingProducts.length/PRODUCT_PAGE_SIZE));
 const currentProductPage=Math.min(productPage,productPageCount);
 const visibleProducts=matchingProducts.slice((currentProductPage-1)*PRODUCT_PAGE_SIZE,currentProductPage*PRODUCT_PAGE_SIZE);
 const filteredSales=sales.filter(s=>{
  const match=[s.id,s.created_at,s.client_name].some(v=>String(v||'').toLowerCase().includes(historyQuery.trim().toLowerCase()));
  const date=String(s.created_at||'').slice(0,10);
  return match&&(!periodStart||date>=periodStart)&&(!periodEnd||date<=periodEnd);
 });
 useEffect(()=>{
   let cancelled=false;
 const load=async()=>{
     let saved=ticketDefaults;
     try{saved={...ticketDefaults,...JSON.parse(localStorage.getItem(`facturacr_ticket_${companyId}`)||'{}')}}catch{}
     try{
       const remote=await api(`/api/companies/${companyId}/ticket-settings`);
       if(remote.saved&&remote.settings)saved={...ticketDefaults,...remote.settings};
       else if(localStorage.getItem(`facturacr_ticket_${companyId}`)){
         // Migración automática de configuraciones locales existentes hacia SQLite.
         await api(`/api/companies/${companyId}/ticket-settings`,{method:'PUT',body:JSON.stringify(saved)});
       }
     }catch(e){if(!cancelled)setNotice('No se pudo sincronizar la personalización con el respaldo: '+e.message)}
     if(cancelled)return;
     setTicketSettings(saved);setTicketDraft(saved);setTicketSavedMessage('');setTicketConfigOpen(false);setTicketPreview('');
   };
   void load();
   return()=>{cancelled=true};
 },[companyId]);
 const updateTicket=(key,value)=>{setTicketDraft(old=>({...old,[key]:value}));setTicketSavedMessage('')};
 // La preferencia de impresión automática se guarda en el momento de cambiarla.
 // Se confirma contra SQLite para evitar mostrar un guardado que falló.
 const updateAutoPrint=async enabled=>{
   const previous=ticketDraft;
   const next={...ticketDraft,autoPrint:enabled};
   setTicketDraft(next);setTicketSavedMessage('Guardando impresión automática…');
   try{
     await api(`/api/companies/${companyId}/ticket-settings`,{method:'PUT',body:JSON.stringify(next)});
     const check=await api(`/api/companies/${companyId}/ticket-settings`);
     if(!check.saved||Boolean(check.settings?.autoPrint)!==enabled)throw Error('No se pudo verificar el ajuste guardado.');
     const verified={...ticketDefaults,...check.settings};
     setTicketSettings(verified);setTicketDraft(verified);
     try{localStorage.setItem(`facturacr_ticket_${companyId}`,JSON.stringify(verified))}catch{}
     setTicketSavedMessage(enabled?'Impresión automática activada y guardada.':'Impresión automática desactivada y guardada.');
   }catch(e){setTicketDraft(previous);setTicketSavedMessage('');setNotice('No se pudo guardar la impresión automática: '+e.message)}
 };
 const saveTicketSettings=async()=>{
   try{
     // Primero guardar en SQLite: así los ajustes viajan con los respaldos.
     await api(`/api/companies/${companyId}/ticket-settings`,{method:'PUT',body:JSON.stringify(ticketDraft)});
     const check=await api(`/api/companies/${companyId}/ticket-settings`);
     if(!check.saved||!check.settings||Boolean(check.settings.autoPrint)!==Boolean(ticketDraft.autoPrint))throw Error('No se pudo verificar la configuración guardada.');
     const verified={...ticketDefaults,...check.settings};
     try{localStorage.setItem(`facturacr_ticket_${companyId}`,JSON.stringify(verified))}catch{}
     setTicketSettings(verified);setTicketDraft(verified);
     setTicketSavedMessage('Ajustes verificados y guardados en SQLite. Se incluirán en los próximos respaldos.');
   }catch(e){setNotice('No se pudieron guardar los ajustes: '+e.message)}
 };
 const discardTicketChanges=()=>{setTicketDraft({...ticketSettings});setTicketSavedMessage('Se descartaron los cambios sin guardar.')};
 const ticketHasChanges=JSON.stringify(ticketDraft)!==JSON.stringify(ticketSettings);
 const refreshPrinters=async()=>{if(!window.facturacrPrinter?.list)return;setPrinterBusy(true);try{const result=await window.facturacrPrinter.list();setPrinters(result||[])}catch(e){setNotice('No se pudieron consultar las impresoras: '+e.message)}finally{setPrinterBusy(false)}};
 useEffect(()=>{refreshPrinters()},[companyId]);
 const printHtml=async html=>{if(!window.facturacrPrinter)throw Error('Impresión disponible solo en Electron.');const result=await window.facturacrPrinter.print(html,{printerName:ticketSettings.printerName,silent:ticketSettings.silent,copies:Number(ticketSettings.copies)||1,width:ticketSettings.width});if(!result?.success&&!result?.cancelled)throw Error(result?.error||'No se pudo imprimir.');return result};
 const testTicket=async()=>{try{const demo={id:'PRUEBA',created_at:new Date().toLocaleString('es-CR'),client:{name:'Cliente de prueba',identification:'',phone:''},lines:[{description:'Artículo de prueba',quantity:1,unit_price_cents:100000,total_cents:113000,tax_cents:13000,tax_rate:13}],total_cents:113000,balance_cents:0,payments:[],discount_cents:0};await printHtml(buildTicketHtml(demo,company,ticketSettings));}catch(e){setNotice(e.message)}};
 const openTicket=async(id,print=false)=>{try{const sale=await api(`/api/companies/${companyId}/sales/${id}`);sale.client_name=sale.client?.name||clients.find(c=>Number(c.id)===Number(sale.client_id))?.name||'Consumidor final';const html=buildTicketHtml(sale,company,ticketSettings);if(print){await printHtml(html)}else setTicketPreview(html)}catch(e){setNotice(e.message)}};
 const methods=['Efectivo' ,'Tarjeta','SINPE Móvil','Transferencia bancaria','Cheque','Otros'];
 const loadCredits=async()=>{
  if(!companyId)return;
  try{const [cs,cp]=await Promise.all([api(`/api/companies/${companyId}/credit-history`),api(`/api/companies/${companyId}/credit-history/payments`)]);
   setCreditSales(Array.isArray(cs)?cs:[]);setCreditPayments(Array.isArray(cp)?cp:[]);
  }catch(e){setNotice('No se pudo cargar el histórico de créditos: '+e.message)}
 };
 const exportCredits=()=>{
  const headers=creditTab==='ventas'?['Venta','Fecha','Cliente','Estado','Total CRC','Abonado CRC','Saldo CRC']:['Abono','Venta','Fecha','Cliente','Método','Monto CRC','Estado venta'];
  const rows=creditTab==='ventas'?filteredCredits.map(s=>[s.id,s.created_at,s.client_name,s.status,s.total_cents/100,s.paid_cents/100,s.balance_cents/100]):filteredCreditPayments.map(a=>[a.id,a.sale_id,a.created_at,a.client_name,a.method,a.amount_cents/100,a.status]);
  const csv='\ufeffsep=;\r\n'+[headers,...rows].map(r=>r.map(csvSafeCell).join(';')).join('\r\n');
  const url=URL.createObjectURL(csvExcelBlob(csv));const link=document.createElement('a');link.href=url;link.download=creditTab==='ventas'?'FacturaCR_creditos.csv':'FacturaCR_abonos.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const exportCreditsPdf=async()=>{
  try{if(!window.facturacrReports?.savePdf)throw Error('El PDF requiere FacturaCR de escritorio.');
   const headers=creditTab==='ventas'?['Venta','Fecha','Cliente','Estado','Total CRC','Abonado CRC','Saldo CRC']:['Abono','Venta','Fecha','Cliente','Método','Monto CRC','Estado'];
   const moneyPdf=cents=>'₡'+(Number(cents||0)/100).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2});
   const rows=creditTab==='ventas'?filteredCredits.map(s=>[s.id,s.created_at,s.client_name,s.status,moneyPdf(s.total_cents),moneyPdf(s.paid_cents),moneyPdf(s.balance_cents)]):filteredCreditPayments.map(a=>[a.id,a.sale_id,a.created_at,a.client_name,a.method,moneyPdf(a.amount_cents),a.status]);
   const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const html=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#233448}h1{color:#12695e}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:7px 5px;border-bottom:1px solid #dce8e4;text-align:left;overflow-wrap:anywhere;word-break:break-word}th{background:#e3f3ed}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${clean(creditTab==='ventas'?'Ventas a crédito':'Historial de abonos')}</h1><p>${clean(company?.trade_name||company?.legal_name||'FacturaCR')} · ${rows.length} registros · Filtro: ${clean(creditFilter)} · Fecha: ${clean(new Date().toLocaleString('es-CR'))}</p><table><thead><tr>${headers.map(h=>`<th>${clean(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${clean(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
   const result=await window.facturacrReports.savePdf(html,`FacturaCR_${creditTab}_credito.pdf`,{landscape:true});
   if(!result?.success&&!result?.cancelled)throw Error(result?.error||'No se pudo guardar el PDF.');
  }catch(e){setNotice(e.message)}
 };
 const filteredCredits=creditSales.filter(s=>{
  const search=[s.id,s.client_name,s.created_at].some(v=>String(v||'').toLowerCase().includes(creditSearch.toLowerCase()));
  const state=creditFilter==='todas'||(creditFilter==='pendientes'&&s.status==='activa'&&s.balance_cents>0)||(creditFilter==='pagadas'&&s.status==='activa'&&s.balance_cents===0)||(creditFilter==='anuladas'&&s.status==='anulada');return search&&state;
 });
 const filteredCreditPayments=creditPayments.filter(a=>[a.sale_id,a.client_name,a.created_at,a.method].some(v=>String(v||'').toLowerCase().includes(creditSearch.toLowerCase()))&&(creditFilter==='todas'||filteredCredits.some(s=>s.id===a.sale_id)));
 const load=async()=>{
  if(!companyId)return;
  try{
   const [p,c,h]=await Promise.all([api(`/api/companies/${companyId}/products`),api(`/api/companies/${companyId}/clients`),canReadHistory?api(`/api/companies/${companyId}/sales`):Promise.resolve([])]);
   setProducts(Array.isArray(p)?p:[]);setClients(Array.isArray(c)?c:[]);setSales(Array.isArray(h)?h:[]);
  }catch(e){setNotice(e.message)}
 };
 useEffect(()=>{setCart([]);setClientId('');setClientQuery('');setDetails(null);setCreditSales([]);setCreditPayments([]);setNotice('');load();if(canReadHistory)loadCredits()},[companyId,canReadHistory]);
 // El borrador queda en SQLite por empresa y por usuario; nunca se restaura sin revisión.
 useEffect(()=>{
   let cancelled=false;const epoch=++draftEpoch.current;
   savedDraftRef.current=null;setDraftReadyCompany(null);setPendingDraft(null);setDraftNotice('');
   if(!companyId)return()=>{cancelled=true};
   api(`/api/companies/${companyId}/sales/draft`).then(r=>{
     if(cancelled||draftEpoch.current!==epoch)return;
     if(r.draft?.lines?.length){setPendingDraft(r.draft);setDraftNotice('Se encontró una venta sin finalizar. Puedes recuperarla o descartarla.');}
     else setDraftReadyCompany(companyId);
   }).catch(e=>{if(!cancelled){setDraftNotice(`No se pudo consultar el borrador: ${e.message}. La edición se mantiene bloqueada para evitar pérdida de datos.`)}});
   return()=>{cancelled=true};
 },[companyId]);
 const recoverDraft=()=>{
   if(!pendingDraft)return;
   const restored=pendingDraft.lines.map(l=>{
     const product=products.find(p=>p.id===l.id);
     return product?{id:product.id,description:product.description,price:basePrice(product),listed_price:Number(product.price),includes_tax:Number(product.price_includes_tax)===1,tax_rate:Number(product.tax_rate),quantity:l.quantity}:null;
   }).filter(Boolean);
   const missing=pendingDraft.lines.length-restored.length;
   setCart(restored);setClientId(pendingDraft.clientId||'');setSaleType(pendingDraft.saleType||'contado');setDiscount(pendingDraft.discount||'0');setPayments(pendingDraft.payments?.length?pendingDraft.payments:[{method:'Efectivo',amount:''}]);setCashTendered(pendingDraft.cashTendered||'');
   setPendingDraft(null);setDraftReadyCompany(companyId);
   setDraftNotice(missing?`${missing} artículo(s) ya no existen y no pudieron restaurarse. Revisa precios, existencias y pagos antes de cobrar.`:'Venta recuperada. Revisa precios, existencias y pagos antes de confirmar.');
 };
 const discardDraft=async()=>{
   try{await api(`/api/companies/${companyId}/sales/draft`,{method:'DELETE'});setPendingDraft(null);setDraftReadyCompany(companyId);setDraftNotice('Borrador descartado.');}
   catch(e){setDraftNotice(`No se pudo descartar: ${e.message}`)}
 };
 useEffect(()=>{
   if(!companyId||draftReadyCompany!==companyId||pendingDraft||!cart.length)return;
   const payload={lines:cart.map(l=>({id:l.id,quantity:l.quantity})),clientId,saleType,discount,cashTendered,payments};
   const onClose=()=>{try{navigator.sendBeacon(`/api/companies/${companyId}/sales/draft/beacon`,new Blob([JSON.stringify(payload)],{type:'application/json'}))}catch{}};
   window.addEventListener('beforeunload',onClose);
   return()=>window.removeEventListener('beforeunload',onClose);
 },[companyId,draftReadyCompany,pendingDraft,cart,clientId,saleType,discount,cashTendered,payments]);
 useEffect(()=>{
   if(!companyId||draftReadyCompany!==companyId||pendingDraft)return;
   const payload={lines:cart.map(l=>({id:l.id,quantity:l.quantity})),clientId,saleType,discount,cashTendered,payments};
   const serialized=JSON.stringify(payload),key=`${companyId}:${serialized}`;
   if(key===savedDraftRef.current)return;
   // Escrituras ordenadas: al cambiar de pestaña no se cancela el último guardado.
   const save=draftWriteQueue.current.catch(()=>{}).then(()=>api(`/api/companies/${companyId}/sales/draft`,{method:'PUT',body:serialized}));
   draftWriteQueue.current=save;
   save.then(()=>{savedDraftRef.current=key}).catch(e=>setDraftNotice('No se pudo guardar el borrador: '+e.message));
 },[companyId,draftReadyCompany,pendingDraft,cart,clientId,saleType,discount,cashTendered,payments]);

 const add=product=>{if(draftReadyCompany!==companyId){setNotice('Recupera o descarta el borrador pendiente antes de añadir productos.');return;}setCart(old=>old.some(l=>l.id===product.id)?old.map(l=>l.id===product.id?{...l,quantity:l.quantity+1}:l):[...old,{id:product.id,description:product.description,price:basePrice(product),listed_price:Number(product.price),includes_tax:Number(product.price_includes_tax)===1,tax_rate:Number(product.tax_rate),quantity:1}]);};
 // Los lectores USB suelen actuar como teclado y enviar Enter después del código.
 // Buscar coincidencias exactas evita añadir accidentalmente un producto parecido.
 const scanProduct=()=>{
   const code=scanCode.trim();
   if(!code){setNotice('Ingresa o escanea un código de barras o SKU.');return;}
   const candidates=products.filter(p=>p.currency==='CRC'&&(p.kind==='servicio'||(p.kind==='producto'&&(!Number(p.track_stock)||Number(p.stock)>0))));
   const found=candidates.filter(p=>String(p.barcode||'').trim()===code||String(p.product_code||'').trim()===code);
   if(found.length===0){setNotice(`No hay un artículo disponible con el código «${code}».`);return;}
   if(found.length>1){setNotice(`El código «${code}» corresponde a varios artículos. Revisa los códigos duplicados antes de vender.`);return;}
   add(found[0]);setScanCode('');setNotice(`Añadido al carrito: ${found[0].description}`);
 };
 const productSuggestions=normalizedProductQuery?matchingProducts.slice(0,8):[];
 const lineBaseCents=l=>roundCRC(Math.round(l.price*100))*l.quantity;
 const lineTaxAdjustment=l=>{
   if(!l.includes_tax)return 0;
   const base=lineBaseCents(l);
   const gross=roundCRC(Math.round(l.listed_price*100))*l.quantity;
   const taxBeforeAdjustment=roundCRC(Math.round(base*l.tax_rate/100));
   return gross-base-taxBeforeAdjustment;
 };
 const subtotal=cart.reduce((sum,l)=>sum+lineBaseCents(l),0);
 const discountCents=roundCRC(Math.round(Math.max(0,Number(discount)||0)*100));
 const effectiveDiscount=Math.min(subtotal,discountCents);
 let allocated=0;
 // Los totales que ve el cajero coinciden con el cálculo del servidor.
 // Los precios con IVA incluido conservan su precio final (p. ej. ₡700).
 const tax=cart.reduce((sum,l,i)=>{const base=lineBaseCents(l);const part=i===cart.length-1?effectiveDiscount-allocated:Math.floor(effectiveDiscount*base/(subtotal||1)/100)*100;allocated+=part;const remainingBase=base-part;const adjustment=remainingBase>0&&base>0?Math.round(lineTaxAdjustment(l)*remainingBase/base/100)*100:0;return sum+Math.max(0,roundCRC(Math.round(remainingBase*l.tax_rate/100))+adjustment)},0);
 const total=subtotal-effectiveDiscount+tax;
 const discountInvalid=discountCents>subtotal;
 const priceWithTaxCents=l=>{
   const base=lineBaseCents(l);
   return base+Math.max(0,roundCRC(Math.round(base*l.tax_rate/100))+lineTaxAdjustment(l));
 };
 const cashSelected=payments.some(p=>p.method==='Efectivo');
 const nonCashPaid=payments.filter(p=>p.method!=='Efectivo').reduce((sum,p)=>sum+roundCRC(Math.round((Number(p.amount)||0)*100)),0);
 const tenderCents=cashSelected&&cashTendered!==''?Math.max(0,roundCRC(Math.round((Number(cashTendered)||0)*100))):0;
 const cashApplied=cashSelected?Math.min(tenderCents,Math.max(0,total-nonCashPaid)):0;
 const paid=nonCashPaid+cashApplied;
 const changeCents=cashSelected?Math.max(0,tenderCents-cashApplied):0;
 const actualPayments=payments.filter(p=>p.method!=='Efectivo'&&Number(p.amount)>0).map(p=>({method:p.method,amount:roundCRC(Math.round(Number(p.amount)*100))/100}));
 if(cashApplied>0)actualPayments.push({method:'Efectivo',amount:cashApplied/100});
 const submit=()=>runCommercialAction('venta',async()=>{
  try{
   // Esperar borradores anteriores antes de registrar la venta; el servidor elimina el borrador de forma atómica.
   await draftWriteQueue.current.catch(()=>{});
   const result=await api(`/api/companies/${companyId}/sales`,{method:'POST',body:JSON.stringify({sale_type:saleType,client_id:clientId||null,discount:discountCents/100,lines:cart.map(l=>({product_id:l.id,quantity:l.quantity})),payments:actualPayments})});
   // Limpiar inmediatamente tras confirmar la escritura, incluso si la impresión o actualización falla.
   await api(`/api/companies/${companyId}/sales/draft`,{method:'DELETE'}).catch(()=>{});
   setCart([]);setPayments([{method:'Efectivo',amount:''}]);setDiscount('0');setCashTendered('');
   setNotice(`Venta interna #${result.id} registrada. Total ₡${saleMoney(result.total_cents)}. Saldo ₡${saleMoney(result.balance_cents)}. No es comprobante electrónico de Hacienda.`);
   if(ticketSettings.autoPrint)try{await openTicket(result.id,true)}catch(e){setNotice(`Venta #${result.id} guardada; impresión pendiente: ${e.message}`)}
   try{await load();if(canReadHistory)await loadCredits()}catch(e){setNotice(`Venta #${result.id} guardada, pero no se pudo actualizar el historial: ${e.message}`)}
  }catch(e){setNotice(e.message)}
 });
 const finish=e=>{e.preventDefault();if(operationLock.current||operationBusy)return;
  if(draftReadyCompany!==companyId){setNotice('Resuelve primero el borrador pendiente.');return}
  if(!cart.length){setNotice('Agrega al menos un artículo.');return}
  if(discountInvalid){setNotice('El descuento supera el subtotal sin IVA. Reduce el descuento antes de confirmar la venta.');return}
  if(total<=0){setNotice('La venta debe tener un total positivo. Reduce el descuento o revisa los artículos.');return}
  askConfirm('Confirmar venta',`¿Registrar esta venta ${saleType} por ₡${saleMoney(total)}? Se descontará el inventario.`,submit);
 };
 const showSale=async id=>{try{setDetails(await api(`/api/companies/${companyId}/sales/${id}`))}catch(e){setNotice(e.message)}};
 const saveAbono=()=>runCommercialAction('abono',async()=>{
  if(!details)return;
  const saleId=details.id;
  try{
   await api(`/api/companies/${companyId}/sales/${saleId}/payments`,{method:'POST',body:JSON.stringify({method:abonoMethod,amount:roundCRC(Math.round(Number(abonoAmount)*100))/100,settle_balance:roundCRC(Math.round(Number(abonoAmount)*100))===roundCRC(details.balance_cents)})});
   setAbonoAmount('');setNotice('Abono registrado correctamente.');
   await load();await loadCredits();await showSale(saleId);
  }catch(e){setNotice(e.message)}
 });
 const annul=id=>runCommercialAction('anulación',async()=>{
  try{
   await api(`/api/companies/${companyId}/sales/${id}/annul`,{method:'POST',body:JSON.stringify({reason:annulReason})});
   setDetails(null);setAnnulReason('');setNotice(`Venta #${id} anulada y existencias devueltas.`);
   await load();await loadCredits();
  }catch(e){setNotice(e.message)}
 });
 const saveReportFile=(blob,name)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
 const exportSales=async()=>{try{const response=await fetch(`/api/companies/${companyId}/sales/export.csv`);if(!response.ok)throw Error('No se pudo exportar.');saveReportFile(await response.blob(),'FacturaCR_ventas_todas.csv')}catch(e){setNotice(e.message)}};
 const reportName=()=>`FacturaCR_ventas_${historyPeriod}_${dateKey(new Date())}`;
 const reportRows=()=>filteredSales.map(s=>[s.id,s.created_at,s.client_name||'Consumidor final',s.sale_type,s.status,Math.round(Number(s.total_cents||0)/100),Math.round(Number(s.balance_cents||0)/100)]);
 const exportFilteredExcel=()=>{
  try{
   const escapeCsv=csvSafeCell;
   const headers=['Número','Fecha','Cliente','Tipo','Estado','Total (CRC)','Saldo (CRC)'];
   const rows=[headers,...reportRows()];
   const csv='\uFEFFsep=;\r\n'+rows.map(row=>row.map(escapeCsv).join(';')).join('\r\n');
   saveReportFile(csvExcelBlob(csv),reportName()+'.csv');
   setNotice(`Exportadas ${filteredSales.length} ventas filtradas en CSV compatible con Excel.`);
  }catch(e){setNotice('No se pudo exportar: '+e.message)}
 };
 const exportFilteredPdf=async()=>{
  try{
   const title=company?.trade_name||company?.legal_name||'FacturaCR';
   const range=historyPeriod==='personalizado'?`${historyFrom||'Inicio'} a ${historyTo||'Hoy'}`:{dia:'Hoy',semana:'Esta semana',mes:'Este mes',anio:'Este año',todos:'Todas las fechas'}[historyPeriod];
   const columns=['#','Fecha','Cliente','Tipo','Estado','Total (₡)','Saldo (₡)'];
   const rows=reportRows().map(row=>`<tr>${row.map((v,i)=>`<td class="${i>=5?'numeric':''}">${safeHtml(i>=5?Number(v).toLocaleString('es-CR'):v)}</td>`).join('')}</tr>`).join('');
   const total=filteredSales.filter(s=>s.status!=='anulada').reduce((sum,s)=>sum+Number(s.total_cents||0),0);
   const html=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${safeHtml(reportName())}</title><style>@page{size:A4 landscape;margin:13mm}body{font:12px Arial,sans-serif;color:#233044}h1{margin-bottom:3px;font-size:20px}.meta{margin-bottom:15px;color:#526477}table{width:100%;border-collapse:collapse}th,td{padding:7px 6px;border-bottom:1px solid #d8e0e8;text-align:left;overflow-wrap:anywhere}th{background:#eaf0f6}.numeric{text-align:right}tr{break-inside:avoid}.summary{margin-top:15px;font-weight:bold}footer{margin-top:20px;color:#6a7685;font-size:10px}@media print{button{display:none}}</style></head><body><h1>${safeHtml(title)} · Historial de ventas</h1><div class="meta">Período: ${safeHtml(range)} · Búsqueda: ${safeHtml(historyQuery||'Sin filtro')} · ${filteredSales.length} ventas · Generado: ${safeHtml(new Date().toLocaleString('es-CR'))}</div><table><thead><tr>${columns.map(c=>`<th>${safeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="7">No hay ventas para los filtros seleccionados.</td></tr>'}</tbody></table><div class="summary">Total (sin anuladas): ₡${safeHtml(saleMoney(total))}</div><footer>Reporte interno de FacturaCR. No constituye comprobante electrónico autorizado por Hacienda.</footer></body></html>`;
   if(!window.facturacrReports?.savePdf)throw Error('El guardado de PDF está disponible en la aplicación de escritorio de FacturaCR.');
   const result=await window.facturacrReports.savePdf(html,reportName()+'.pdf');
   if(result?.cancelled)return;
   if(!result?.success)throw Error(result?.error||'No se pudo guardar el PDF.');
   setNotice(`Reporte de ${filteredSales.length} ventas guardado como PDF: ${result.path}`);
  }catch(e){setNotice('No se pudo preparar el PDF: '+e.message)}
 };

 if(!companyId)return <div className="card">Selecciona una empresa en Empresas antes de registrar ventas.</div>;
 return <div className="salesModule">
  <div className="card"><h3>Punto de venta · {company?.trade_name||company?.legal_name}</h3><p className="hint">Registro comercial interno en colones. No emite factura electrónica ni valida comprobantes ante Hacienda.</p>{notice&&<p className="notice" role="status">{notice}</p>}
   <div className="posQuickTools">
    <div className="posQuickSearch"><Field title="Buscar artículo, código o SKU"><input value={query} onChange={e=>{setQuery(e.target.value);setProductPage(1)}} placeholder="Escribe para buscar entre todos los artículos" autoComplete="off"/></Field>
     {productSuggestions.length>0&&<div className="posSuggestions" aria-label="Sugerencias de artículos"><p className="hint">Resultados rápidos · pulsa para añadir al carrito</p>{productSuggestions.map(p=><button type="button" key={p.id} className="posSuggestion" onClick={()=>{add(p);setQuery('');setProductPage(1);setNotice(`Añadido al carrito: ${p.description}`)}}><span><strong>{p.description}</strong><small>{p.product_code||p.barcode||'Sin código'} · {p.kind==='servicio'?'Servicio':`Stock: ${p.stock}`}</small></span><b>₡{Math.round(basePrice(p)).toLocaleString('es-CR')}</b></button>)}</div>}
    </div>
    <div className="posQuickScan"><Field title="Escanear código de barras / SKU"><input value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanProduct()}}} placeholder="Escanea y presiona Enter" autoComplete="off"/></Field><button type="button" className="secondary" onClick={scanProduct}>Agregar por código</button><p className="hint">Compatible con lectores USB que escriben el código y envían Enter. También puedes introducirlo manualmente.</p></div>
   </div>
   <div className="posProducts">{visibleProducts.map(p=><button type="button" className="secondary" key={p.id} onClick={()=>add(p)}><span className="posProductVisual">{p.image_data?<img src={p.image_data} alt={`Foto de ${p.description}`}/>:<span className="posProductNoPhoto">Sin foto</span>}</span><strong>{p.description}</strong><small>{p.product_code||'Sin SKU'} · ₡{Math.round(basePrice(p)).toLocaleString('es-CR',{maximumFractionDigits:0})} sin IVA · {p.kind==='producto'?`Stock: ${p.stock}`:'Servicio'}</small></button>)}</div>
   <div className="posCatalogPager"><span>{matchingProducts.length===0?'No se encontraron artículos disponibles':`Mostrando ${(currentProductPage-1)*PRODUCT_PAGE_SIZE+1}–${Math.min(currentProductPage*PRODUCT_PAGE_SIZE,matchingProducts.length)} de ${matchingProducts.length} artículos · Página ${currentProductPage} de ${productPageCount}`}</span><div className="actions"><button type="button" className="secondary" disabled={currentProductPage<=1} onClick={()=>setProductPage(p=>Math.max(1,p-1))}>‹ Anterior</button><button type="button" className="secondary" disabled={currentProductPage>=productPageCount} onClick={()=>setProductPage(p=>Math.min(productPageCount,p+1))}>Siguiente ›</button></div></div>
  </div>
  {draftNotice&&<section className="draftNotice" role="status"><UiIcon name="save" size={19}/><span>{draftNotice}</span>{pendingDraft&&<div className="actions"><button type="button" onClick={recoverDraft} disabled={!products.length}>Recuperar venta</button><button type="button" className="secondary" onClick={discardDraft}>Descartar borrador</button></div>}</section>}
  <form className="card posCartCard" aria-busy={operationBusy} onSubmit={finish} onKeyDown={e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA')e.preventDefault()}}><div className="posCartHeader"><h3 className="posCartTitle"><span className="posCartTitleMain">🛒 Carrito de compras</span><span>{cart.reduce((s,l)=>s+l.quantity,0)} artículos</span></h3>{cart.length>0&&<p className="posCartSubtitle">Los artículos agregados se muestran aquí. Puedes ajustar cantidades antes de confirmar la venta.</p>}</div>
   {cart.length===0?<div className="posCartEmpty"><strong>No has agregado artículos todavía</strong><p className="hint">Selecciona productos del catálogo para comenzar la venta.</p></div>:<div className="posCartTableWrap"><table className="posCartTable"><thead><tr><th>Artículo</th><th>Cantidad</th><th>Precio</th><th>Acción</th></tr></thead><tbody>{cart.map((l,index)=><tr key={l.id} className="posCartRow"><td className="posCartItemCell"><div className="posCartItemBlock"><span className="posCartItemIndex">{index+1}</span><div><strong className="posCartItemName">{l.description}</strong><small className="posCartItemHint">Artículo agregado al carrito</small></div></div></td><td><input className="posCartQtyInput" type="number" min="1" max="100000" step="1" value={l.quantity} onChange={e=>setCart(old=>old.map(x=>x.id===l.id?{...x,quantity:Number(e.target.value)}:x))}/></td><td className="posCartPriceCell"><strong className="posCartLineTotal">₡{saleMoney(priceWithTaxCents(l))}</strong><small className="posCartItemHint">Con IVA · antes de descuentos</small><small className="posCartItemHint">Base sin IVA: ₡{saleMoney(lineBaseCents(l))}</small></td><td className="posCartActionCell"><button type="button" className="danger" onClick={()=>setCart(old=>old.filter(x=>x.id!==l.id))}>Quitar</button></td></tr>)}</tbody></table></div>}
   <div className="posClientSaleStack"><div className="posClientPicker"><div className="posClientSearchHeader"><strong>Cliente de la venta</strong>{!selectedClient&&<span>Consumidor final</span>}</div>{selectedClient?<div className="posClientSelectedCard"><div className="posClientSelectedInitial" aria-hidden="true">{String(selectedClient.name||'C').charAt(0).toUpperCase()}</div><div className="posClientSelectedInfo"><strong>{selectedClient.name}</strong><small>{selectedClient.identification||'Sin identificación'}{selectedClient.trade_name?` · ${selectedClient.trade_name}`:''}</small><small>{selectedClient.phone||selectedClient.email||'Cliente registrado'}</small></div><button type="button" className="secondary posClientChangeButton" onClick={resetClient}>Cambiar</button></div>:<><label className="field" htmlFor="posClientSearch">Buscar cliente por nombre o cédula<input id="posClientSearch" type="search" value={clientQuery} onChange={e=>{setClientQuery(e.target.value);setClientResultIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();setClientResultIndex(i=>Math.min(i+1,clientSuggestions.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();setClientResultIndex(i=>Math.max(i-1,0))}else if(e.key==='Enter'&&clientQuery.trim()){e.preventDefault();e.stopPropagation();if(clientSuggestions.length)chooseClient(clientSuggestions[Math.min(clientResultIndex,clientSuggestions.length-1)])}else if(e.key==='Escape'){e.stopPropagation();setClientQuery('');setClientResultIndex(0)}}} placeholder="Escribe nombre, cédula, teléfono o correo..." autoComplete="off" aria-label="Buscar cliente para esta venta" aria-controls="posClientResults"/></label>{clientQuery.trim()?<div id="posClientResults" className="posClientResults" role="group" aria-label="Resultados de búsqueda de clientes"><p className="posClientMatches">{visibleClients.length===0?'No se encontraron clientes.':`${visibleClients.length} cliente(s) encontrado(s). Haz clic para seleccionar.`}</p>{clientSuggestions.map((c,i)=><button key={c.id} type="button" className={'posClientResult '+(i===clientResultIndex?'isHighlighted':'')} onClick={()=>chooseClient(c)}><span className="posClientResultAvatar" aria-hidden="true">{String(c.name||'C').charAt(0).toUpperCase()}</span><span className="posClientResultInfo"><strong>{c.name}</strong><small>{c.identification||'Sin identificación'}{c.trade_name?` · ${c.trade_name}`:''}</small><small>{[c.phone,c.email].filter(Boolean).join(' · ')}</small></span><span className="posClientResultAction" aria-hidden="true">Elegir</span></button>)}{visibleClients.length>8&&<p className="posClientResultsMore">Mostrando los primeros 8. Escribe más letras o números para precisar.</p>}</div>:<p className="posClientSearchHint">Escribe para ver clientes coincidentes y selecciona uno. Si no eliges ninguno, la venta será para consumidor final.</p>}</>}</div><div className="posSaleCondition"><Field title="Condición de venta"><select value={saleType} onChange={e=>setSaleType(e.target.value)}><option value="contado">Contado</option><option value="credito">Crédito</option></select></Field></div></div>
   <Field title="Descuento total (₡)"><input type="number" min="0" step="1" max={subtotal/100} value={discount} onChange={e=>setDiscount(e.target.value)} aria-invalid={discountInvalid}/></Field>
   {discountInvalid&&<p className="posDiscountError" role="alert">El descuento ingresado supera el subtotal sin IVA (₡{saleMoney(subtotal)}). Corrige el importe para registrar la venta.</p>}
   {cart.length>0&&total<=0&&!discountInvalid&&<p className="posDiscountError" role="alert">La venta debe tener un total mayor que ₡0.</p>}
   <div className="posTotals"><div><span>Subtotal sin IVA</span><strong>₡{saleMoney(subtotal)}</strong></div><div><span>Descuento</span><strong className="posDiscount">− ₡{saleMoney(effectiveDiscount)}</strong></div><div><span>IVA</span><strong>₡{saleMoney(tax)}</strong></div><div className="posGrandTotal"><span>TOTAL A PAGAR</span><strong>₡{saleMoney(total)}</strong></div></div>
   <h4>Pagos combinados</h4>
   {payments.map((pay,i)=><div className="posPayment" key={i}>
    <select aria-label={`Método de pago ${i+1}`} value={pay.method} onChange={e=>{const method=e.target.value;if(method==='Efectivo'&&payments.some((p,j)=>j!==i&&p.method==='Efectivo'))return;setPayments(old=>old.map((p,j)=>i===j?{...p,method,amount:''}:p));if(pay.method==='Efectivo')setCashTendered('')}}>{methods.map(m=><option key={m} disabled={m==='Efectivo'&&payments.some((p,j)=>j!==i&&p.method==='Efectivo')}>{m}</option>)}</select>
    <div className="posCashHint">{pay.method==='Efectivo'?'Ingresa el efectivo recibido en el cuadro inferior.':`Ingresa el monto de ${pay.method} en su cuadro inferior.`}</div>
    <button type="button" className="secondary" disabled={payments.length===1} onClick={()=>{setPayments(old=>old.filter((_,j)=>j!==i));if(pay.method==='Efectivo')setCashTendered('')}}>Quitar</button>
   </div>)}
   <div className="actions"><button type="button" className="secondary" disabled={payments.length>=10} onClick={()=>setPayments(old=>[...old,{method:'SINPE Móvil',amount:''}])}>Agregar otro pago</button></div>
   {payments.map((pay,i)=>pay.method==='Efectivo'?null:<div className="posCashBox posOtherPaymentBox" key={`payment-panel-${i}`}>
    <label htmlFor={`posOtherPayment-${i}`} className="posCashTitle">{pay.method} · Monto recibido (₡)</label>
    <input id={`posOtherPayment-${i}`} aria-label={`Monto de ${pay.method}`} className="posMoneyInput" type="number" min="0" step="1" placeholder="Monto pagado por este método" value={pay.amount} onChange={e=>setPayments(old=>old.map((p,j)=>i===j?{...p,amount:e.target.value}:p))}/>
    <p className="hint">Registra el monto pagado mediante {pay.method}. Este método no genera vuelto.</p>
    <div className="posCashResults"><span>Aplicado con {pay.method}: <strong>₡{saleMoney(roundCRC(Math.round((Number(pay.amount)||0)*100)))}</strong></span></div>
   </div>)}
   {cashSelected&&<div className="posCashBox"><label htmlFor="posCashTendered" className="posCashTitle">Efectivo recibido (₡)</label><input id="posCashTendered" className="posMoneyInput" type="number" min="0" step="0.01" value={cashTendered} onChange={e=>setCashTendered(e.target.value)} placeholder="Monto entregado por el cliente"/><p className="hint">El sistema aplica únicamente lo necesario a la venta. El excedente se devuelve como vuelto.</p><div className="posCashResults"><span>Aplicado en efectivo: <strong>₡{saleMoney(cashApplied)}</strong></span><span className="posChange">Vuelto: <strong>₡{saleMoney(changeCents)}</strong></span></div></div>}
   <p className="posPaidSummary"><strong>Pagado:</strong> ₡{saleMoney(paid)} · <strong>Saldo:</strong> ₡{saleMoney(Math.max(0,total-paid))}</p>
   {saleType==='credito'&&<p className="hint">Las ventas a crédito requieren un cliente registrado. Puedes registrar abonos posteriores desde el historial de ventas.</p>}
   <button type="submit" disabled={draftReadyCompany!==companyId||operationBusy||!cart.length||discountInvalid||total<=0||nonCashPaid>total||(saleType==='contado'&&paid!==total)||(saleType==='credito'&&(!clientId||paid>=total))}>{operationBusy?'Procesando operación…':'Confirmar venta'}</button>
  </form>
  <section className="card"><h3>Impresión de tiquetes</h3><p className="hint">Impresoras instaladas en Windows. Configuración independiente por empresa; tiquetes comerciales internos, no facturas electrónicas de Hacienda.</p><button type="button" className="secondary" onClick={()=>{setTicketConfigOpen(v=>!v);setTicketDraft({...ticketSettings});setTicketSavedMessage('')}}>{ticketConfigOpen?'Cerrar configuración':'Personalizar tiquete'}</button>{ticketConfigOpen&&<div className="ticketSettings"><div className="two"><Field title="Ancho de papel"><select value={ticketDraft.width} onChange={e=>updateTicket('width',e.target.value)}><option value="58">58 mm</option><option value="80">80 mm</option></select></Field><Field title="Texto adicional para redes sociales (opcional)"><input value={ticketDraft.social} maxLength="200" onChange={e=>updateTicket('social',e.target.value)}/></Field></div><div className="two"><Field title="Impresora instalada en Windows"><select value={ticketDraft.printerName} onChange={e=>updateTicket('printerName',e.target.value)}><option value="">Predeterminada de Windows</option>{printers.map(pr=><option key={pr.name} value={pr.name}>{pr.displayName||pr.name}{pr.isDefault?' (predeterminada)':''}</option>)}</select></Field><Field title="Copias"><input type="number" min="1" max="5" step="1" value={ticketDraft.copies} onChange={e=>updateTicket('copies',Math.max(1,Math.min(5,Number(e.target.value)||1)))}/></Field></div><div className="actions"><button type="button" className="secondary" disabled={printerBusy} onClick={refreshPrinters}>Actualizar impresoras</button><button type="button" className="secondary" onClick={testTicket}>Imprimir tiquete de prueba</button></div><div className="two"><Field title="Plantilla"><select value={ticketDraft.template} onChange={e=>updateTicket('template',e.target.value)}><option value="classic">Clásica</option><option value="compact">Compacta</option><option value="modern">Moderna</option></select></Field></div><div className="ticketChecks"><label><input type="checkbox" checked={!!ticketDraft.silent} onChange={e=>updateTicket('silent',e.target.checked)}/>Impresión directa sin diálogo (solo impresora seleccionada)</label></div><Field title="Mensaje de agradecimiento"><textarea rows="2" maxLength="300" value={ticketDraft.thankYou} onChange={e=>updateTicket('thankYou',e.target.value)}/></Field><Field title="Logotipo (PNG, JPEG o WebP)">
  <p className="hint">Dimensiones máximas: 800 × 800 píxeles. Tamaño máximo: 250 KB. Para una mejor impresión térmica utiliza un logotipo de alto contraste, preferiblemente en blanco y negro.</p>
  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>250000){setNotice('El logotipo no puede superar 250 KB.');e.target.value='';return}
    const reader=new FileReader();
    reader.onload=()=>{
      const data=reader.result;
      const img=new Image();
      img.onload=()=>{
        if(img.naturalWidth>800||img.naturalHeight>800){setNotice(`El logotipo mide ${img.naturalWidth} × ${img.naturalHeight} píxeles. El máximo permitido es 800 × 800.`);e.target.value='';return}
        updateTicket('logo',data);
      };
      img.onerror=()=>{setNotice('No se pudo leer la imagen del logotipo.');e.target.value=''};
      img.src=data;
    };
    reader.onerror=()=>setNotice('No se pudo cargar el archivo.');
    reader.readAsDataURL(file);
  }}/>
</Field>
{ticketDraft.logo&&<div className="ticketLogoPreview"><strong>Vista previa del logotipo</strong><img src={ticketDraft.logo} alt="Miniatura del logotipo seleccionado"/><button type="button" className="secondary" onClick={()=>updateTicket('logo','')}>Quitar logotipo</button><p className="hint">Presiona «Guardar ajustes de impresión» para conservar este logotipo.</p></div>}
<div className="ticketChecks">{[['showAddress','Mostrar dirección'],['showPhone','Mostrar teléfono'],['showClient','Mostrar cliente'],['showPayments','Mostrar métodos de pago'],['showTax','Mostrar desglose de IVA'],['autoPrint','Imprimir automáticamente al registrar una venta']].map(([key,label])=><label key={key}><input type="checkbox" checked={!!ticketDraft[key]} onChange={e=>key==='autoPrint'?void updateAutoPrint(e.target.checked):updateTicket(key,e.target.checked)}/>{label}</label>)}</div><div className="actions ticketSaveActions"><button type="button" onClick={saveTicketSettings} disabled={!ticketHasChanges}>Guardar ajustes de impresión</button><button type="button" className="secondary" onClick={discardTicketChanges} disabled={!ticketHasChanges}>Descartar cambios</button></div>{ticketSavedMessage&&<p className="ticketSavedMessage" role="status">{ticketSavedMessage}</p>}{ticketHasChanges&&<p className="hint">Hay cambios sin guardar. Las ventas seguirán usando la configuración guardada.</p>}<p className="hint">La impresión automática abre el diálogo de impresión de Windows. Para impresión silenciosa selecciona primero una impresora instalada. El controlador debe admitir el papel elegido.</p></div>}</section><section className="card"><div className="historySectionHeader"><div><h3>Historial de ventas</h3><p className="hint">{filteredSales.length} venta(s) en el período seleccionado</p></div><button type="button" className="secondary" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?'Ocultar historial ▴':'Mostrar historial ▾'}</button></div>{historyOpen&&<><div className="actions"><button type="button" className="secondary" onClick={exportSales}>Exportar todas las ventas CSV</button><button type="button" className="secondary" onClick={exportFilteredExcel}>Exportar filtradas para Excel (CSV)</button><button type="button" className="secondary" onClick={exportFilteredPdf}>Guardar filtradas como PDF</button><button type="button" className="secondary" onClick={load}>Actualizar</button></div><div className="salesHistoryFilters"><Field title="Período"><select value={historyPeriod} onChange={e=>setHistoryPeriod(e.target.value)}><option value="dia">Hoy</option><option value="semana">Esta semana (lunes a hoy)</option><option value="mes">Este mes</option><option value="anio">Este año</option><option value="todos">Todas las fechas</option><option value="personalizado">Rango personalizado</option></select></Field><Field title="Buscar por número, fecha o cliente"><input value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)} placeholder="Número de venta, cliente o fecha"/></Field></div>{historyPeriod==='personalizado'&&<div className="salesHistoryFilters"><Field title="Desde"><input type="date" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)}/></Field><Field title="Hasta"><input type="date" min={historyFrom||undefined} value={historyTo} onChange={e=>setHistoryTo(e.target.value)}/></Field></div>}<div className="historySummary">Total de ventas mostradas: <strong>₡{saleMoney(filteredSales.filter(s=>s.status!=='anulada').reduce((sum,s)=>sum+Number(s.total_cents||0),0))}</strong> <small>(excluye anuladas)</small></div><div className="movementHistory"><table><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Total</th><th>Saldo</th><th>Detalle</th></tr></thead><tbody>{filteredSales.map(s=><tr key={s.id}><td>{s.id}</td><td>{s.created_at}</td><td>{s.client_name||'Consumidor final'}</td><td>{s.sale_type}</td><td>{s.status}</td><td>₡{saleMoney(s.total_cents)}</td><td>₡{saleMoney(s.balance_cents)}</td><td><button type="button" className="secondary" onClick={()=>showSale(s.id)}>Ver</button> <button type="button" className="secondary" onClick={()=>openTicket(s.id)}>Tiquete</button></td></tr>)}</tbody></table>{filteredSales.length===0&&<p className="hint">No hay ventas para los filtros seleccionados.</p>}</div></>}
   {details&&<div className="catalogTools"><button type="button" className="secondary" onClick={()=>openTicket(details.id)}>Vista previa del tiquete</button> <button type="button" className="secondary" onClick={()=>openTicket(details.id,true)}>Imprimir</button><h4>Venta #{details.id} · {details.status}</h4><p>Fecha: {details.created_at} · Total ₡{saleMoney(details.total_cents)} · Saldo ₡{saleMoney(details.balance_cents)}</p><div className="movementHistory"><table><thead><tr><th>Artículo</th><th>Cantidad</th><th>Precio</th><th>IVA</th><th>Total</th></tr></thead><tbody>{details.lines.map(l=><tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td>₡{saleMoney(l.unit_price_cents)}</td><td>₡{saleMoney(l.tax_cents)}</td><td>₡{saleMoney(l.total_cents)}</td></tr>)}</tbody></table></div><p>Pagos: {details.payments.map(p=>`${p.method} ₡${saleMoney(p.amount_cents)}`).join(' · ')||'Sin abonos'}</p>{details.status==='activa'&&details.sale_type==='credito'&&details.balance_cents>0&&<div className="posAbono"><h4>Registrar abono a crédito</h4><div className="two"><Field title="Método de pago"><select value={abonoMethod} onChange={e=>setAbonoMethod(e.target.value)}>{methods.map(m=><option key={m}>{m}</option>)}</select></Field><Field title="Monto del abono (₡)"><input type="number" min="0.01" step="0.01" value={abonoAmount} onChange={e=>setAbonoAmount(e.target.value)}/></Field></div><p>Saldo pendiente: ₡{saleMoney(details.balance_cents)}</p><button type="button" disabled={operationBusy||!Number.isFinite(Number(abonoAmount))||roundCRC(Math.round(Number(abonoAmount)*100))<=0||roundCRC(Math.round(Number(abonoAmount)*100))>roundCRC(details.balance_cents)} onClick={()=>askConfirm('Confirmar abono',`¿Registrar un abono de ₡${Number(abonoAmount).toLocaleString('es-CR')}?`,saveAbono)}>Registrar abono</button></div>}{details.status==='activa'&&<><Field title="Motivo de anulación (mínimo 5 caracteres)"><textarea rows="2" maxLength="300" value={annulReason} onChange={e=>setAnnulReason(e.target.value)}/></Field><button type="button" className="danger" disabled={operationBusy||annulReason.trim().length<5} onClick={()=>askConfirm('Anular venta',`¿Anular la venta #${details.id}? Se devolverán las existencias y quedará registrada la anulación.`,()=>annul(details.id),true)}>Anular venta</button></>}<button type="button" className="secondary" onClick={()=>setDetails(null)}>Cerrar detalle</button></div>}
  </section>
  {canReadHistory&&<section className="card creditHistory"><div className="creditHeading"><div><h3>Histórico de ventas a crédito</h3><p className="hint">Consulta cuentas pendientes, pagadas y todos los abonos registrados de esta empresa.</p></div><button type="button" className="secondary" aria-expanded={creditsOpen} onClick={()=>setCreditsOpen(v=>!v)}>{creditsOpen?"Ocultar créditos ▴":"Mostrar créditos ▾"}</button></div>{creditsOpen&&<><div className="actions"><button type="button" className="secondary" onClick={()=>{loadCredits();load()}}>Actualizar</button><button type="button" className="secondary" onClick={exportCredits}>Exportar CSV</button><button type="button" className="secondary" onClick={exportCreditsPdf}>Guardar PDF</button></div>
   <div className="creditSummary"><div><small>Ventas a crédito</small><strong>{creditSales.filter(s=>s.status==='activa').length}</strong></div><div><small>Total pendiente</small><strong>₡{saleMoney(creditSales.filter(s=>s.status==='activa').reduce((n,s)=>n+s.balance_cents,0))}</strong></div><div><small>Total abonado</small><strong>₡{saleMoney(creditSales.filter(s=>s.status==='activa').reduce((n,s)=>n+s.paid_cents,0))}</strong></div></div>
   <div className="creditFilters"><Field title="Buscar cliente, venta o fecha"><input value={creditSearch} onChange={e=>setCreditSearch(e.target.value)} placeholder="Nombre, número o fecha"/></Field><Field title="Estado de la cuenta"><select value={creditFilter} onChange={e=>setCreditFilter(e.target.value)}><option value="todas">Todas</option><option value="pendientes">Pendientes</option><option value="pagadas">Pagadas</option><option value="anuladas">Anuladas</option></select></Field></div>
   <div className="actions"><button type="button" className={creditTab==='ventas'?'':'secondary'} onClick={()=>setCreditTab('ventas')}>Ventas a crédito</button><button type="button" className={creditTab==='abonos'?'':'secondary'} onClick={()=>setCreditTab('abonos')}>Todos los abonos</button></div>
   <div className="movementHistory"><table><thead>{creditTab==='ventas'?<tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Acción</th></tr>:<tr><th>Abono</th><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Monto</th><th>Acción</th></tr>}</thead><tbody>{creditTab==='ventas'?filteredCredits.map(s=><tr key={s.id}><td>#{s.id}</td><td>{s.created_at}</td><td>{s.client_name}</td><td>{s.status==='anulada'?'Anulada':s.balance_cents>0?'Pendiente':'Pagada'}</td><td>₡{saleMoney(s.total_cents)}</td><td>₡{saleMoney(s.paid_cents)}</td><td><strong>₡{saleMoney(s.balance_cents)}</strong></td><td><button type="button" className="secondary" onClick={()=>showSale(s.id)}>Ver abonos</button></td></tr>):filteredCreditPayments.map(a=><tr key={a.id}><td>#{a.id}</td><td>#{a.sale_id}</td><td>{a.created_at}</td><td>{a.client_name}</td><td>{a.method}</td><td>₡{saleMoney(a.amount_cents)}</td><td><button type="button" className="secondary" onClick={()=>showSale(a.sale_id)}>Ver venta</button></td></tr>)}</tbody></table>{(creditTab==='ventas'?filteredCredits:filteredCreditPayments).length===0&&<p className="hint">No se encontraron registros para los filtros seleccionados.</p>}</div>
   {details?.sale_type==='credito'&&<div className="creditDetail"><h4>Detalle de abonos de venta #{details.id}</h4><p>Total ₡{saleMoney(details.total_cents)} · Abonado ₡{saleMoney(details.paid_cents)} · Saldo ₡{saleMoney(details.balance_cents)}</p><div className="movementHistory"><table><thead><tr><th>Abono</th><th>Fecha</th><th>Método</th><th>Importe</th></tr></thead><tbody>{details.payments.map(a=><tr key={a.id}><td>#{a.id}</td><td>{a.created_at}</td><td>{a.method}</td><td>₡{saleMoney(a.amount_cents)}</td></tr>)}</tbody></table>{!details.payments.length&&<p className="hint">Esta venta todavía no tiene abonos.</p>}</div><button type="button" className="secondary" onClick={()=>setDetails(null)}>Cerrar detalle</button></div>}
  </>}
  </section>}
  {ticketPreview&&<div className="ticketOverlay" role="dialog" aria-modal="true" aria-label="Vista previa de tiquete"><div className="ticketModal"><h3>Vista previa del tiquete</h3><iframe title="Tiquete" sandbox="allow-same-origin" srcDoc={ticketPreview}/><div className="actions"><button type="button" onClick={async()=>{try{if(!window.facturacrPrinter)throw Error('La impresión requiere la aplicación de escritorio.');await printHtml(ticketPreview)}catch(e){setNotice(e.message)}}}>Imprimir con Windows</button><button type="button" className="secondary" onClick={()=>setTicketPreview('')}>Cerrar</button></div></div></div>}
 </div>;
}

function backupFileDate(filename){
 const match=String(filename||'').match(/^FacturaCR_auto_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.sqlite$/);
 if(!match)return 'Fecha no disponible';
 const date=new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
 return Number.isNaN(date.getTime())?'Fecha no disponible':date.toLocaleString('es-CR',{dateStyle:'medium',timeStyle:'short'});
}
function BackupWorkspace({autoBackup,autoConfig,setAutoConfig,backupStatus,busy,downloadBackup,createAutoBackup,saveAutoBackup,refreshAutoBackup,refreshBackupStatus,restoreInput,restoreBackup,restoreStage,setMessage,sizeLabel}){
 const files=Array.isArray(autoBackup?.files)?autoBackup.files:[];
 const [backupSearch,setBackupSearch]=useState('');
 const [showAllBackups,setShowAllBackups]=useState(false);
 const latest=files[0]||null;
 const searchTerm=backupSearch.trim().toLocaleLowerCase('es-CR');
 const filteredBackupFiles=searchTerm?files.filter(f=>String(f).toLocaleLowerCase('es-CR').includes(searchTerm)||backupFileDate(f).toLocaleLowerCase('es-CR').includes(searchTerm)):files;
 const visibleBackupFiles=showAllBackups||searchTerm?filteredBackupFiles:filteredBackupFiles.slice(0,20);
 const openFolder=async()=>{
  try{
   if(!window.facturacrBackups?.openFolder)throw Error('Abrir carpeta requiere la aplicación de escritorio.');
   const result=await window.facturacrBackups.openFolder();
   if(!result?.success)throw Error(result?.error||'Windows no pudo abrir la carpeta.');
  }catch(e){setMessage(e.message)}
 };
 return <section className="backupWorkspace">
  <div className="backupHero">
   <div><p className="backupEyebrow">Protección de datos · Costa Rica</p><h3>Copias de seguridad</h3><p className="hint">Protege los datos SQLite de tus empresas con copias verificadas almacenadas localmente.</p></div>
   <button type="button" disabled={busy} onClick={createAutoBackup}>▣ Crear respaldo ahora</button>
  </div>
  <div className="backupProtectionBanner">
   <span className="backupShield" aria-hidden="true">♢</span>
   <div><p className="backupEyebrow">Protección de datos locales</p><h4>Tu historial, protegido</h4><p>Las copias incluyen los datos de las empresas registrados en SQLite. No se envían a un servidor externo.</p></div>
   <span className={'backupStateBadge '+(autoConfig.enabled?'enabled':'disabled')}>{autoConfig.enabled?'● Automáticos activos':'○ Automáticos desactivados'}</span>
  </div>
  <div className="backupMetrics">
   <div className="backupMetric"><small>Última copia automática</small><strong>{latest?backupFileDate(latest):'Sin copias aún'}</strong><span>Fecha de la copia más reciente</span></div>
   <div className="backupMetric"><small>Programación</small><strong>{autoConfig.enabled?({daily:'Diaria',weekly:'Semanal',monthly:'Mensual'}[autoConfig.frequency]||'Configurada'):'Desactivada'}</strong><span>{autoConfig.enabled?`Hora local: ${autoConfig.time}`:'Puedes activarla cuando quieras'}</span></div>
   <div className="backupMetric"><small>Copias registradas</small><strong>{files.length}</strong><span>En la carpeta automática configurada</span></div>
  </div>
  <div className="backupColumns">
   <div className="card backupSettingsCard"><div className="backupCardHeading"><div><h4>Programación automática</h4><p className="hint">Configura cuándo se generan y cuántas copias se conservan.</p></div><span aria-hidden="true">⚙</span></div>
    <label className="backupSwitch"><input type="checkbox" checked={!!autoConfig.enabled} onChange={e=>setAutoConfig({...autoConfig,enabled:e.target.checked})}/><span><strong>Activar respaldos automáticos</strong><small>Se ejecutan mientras FacturaCR está abierto; al reiniciar se revisan los pendientes.</small></span></label>
    <div className="backupSettingsGrid">
     <Field title="Frecuencia"><select value={autoConfig.frequency} onChange={e=>setAutoConfig({...autoConfig,frequency:e.target.value})}><option value="daily">Diario</option><option value="weekly">Semanal (lunes)</option><option value="monthly">Mensual (día 1)</option></select></Field>
     <Field title="Conservar últimas copias"><input type="number" min="1" max="365" value={autoConfig.keep} onChange={e=>setAutoConfig({...autoConfig,keep:Number(e.target.value)})}/></Field>
     <Field title="Hora local del respaldo"><input type="time" value={autoConfig.time} onChange={e=>setAutoConfig({...autoConfig,time:e.target.value})}/></Field>
    </div>
    <div className="backupDirectory"><small>Carpeta de respaldos automáticos</small><code title={autoBackup?.directory||''}>{autoBackup?.directory||'Consultando ruta local…'}</code><div className="actions"><button type="button" className="secondary" onClick={openFolder}>▤ Abrir carpeta</button><button type="button" className="secondary" onClick={refreshBackupStatus}>Actualizar espacio</button></div><p className="hint">Base: {sizeLabel(backupStatus?.databaseBytes)} · WAL: {sizeLabel(backupStatus?.walBytes)} · Espacio disponible: {sizeLabel(backupStatus?.freeBytes)}</p></div>
    <div className="backupSettingsActions"><button type="button" disabled={busy} onClick={saveAutoBackup}>✓ Guardar configuración</button><button type="button" disabled={busy} className="secondary" onClick={downloadBackup}>↓ Descargar copia SQLite</button></div>
   </div>
   <div className="card backupHistoryCard"><div className="backupCardHeading"><div><h4>Historial de respaldos</h4><p className="hint">Archivos creados y verificados en la carpeta automática.</p></div><button type="button" className="backupRefresh" disabled={busy} onClick={refreshAutoBackup}>⟳ Actualizar</button></div>
     {files.length>0&&<div className="backupHistorySearch"><label htmlFor="backupHistoryFilter">Buscar respaldo por fecha o nombre</label><input id="backupHistoryFilter" type="search" value={backupSearch} onChange={e=>setBackupSearch(e.target.value)} placeholder="Ej.: 2026-11-05, noviembre o 08-30" autoComplete="off"/><small>{searchTerm?`${filteredBackupFiles.length} de ${files.length} copias coinciden`:`${files.length} copias disponibles`}</small></div>}
     {visibleBackupFiles.length>0?<div className="backupFileList">{visibleBackupFiles.map(f=><div className="backupFileRow" key={f}><span className="backupFileIcon" aria-hidden="true">▤</span><div><strong title={f}>{f}</strong><small>{backupFileDate(f)} · Copia automática verificada</small></div></div>)}</div>:<div className="backupEmpty"><strong>{files.length?'No se encontraron respaldos con ese filtro':'Aún no hay copias automáticas'}</strong><p className="hint">{files.length?'Prueba con otra fecha o borra la búsqueda.':'Presiona «Crear respaldo ahora» para generar la primera copia.'}</p></div>}
     {!searchTerm&&files.length>20&&<div className="backupHistoryMore"><span>{showAllBackups?`Mostrando las ${files.length} copias`:`Mostrando las primeras 20 de ${files.length} copias`}</span><button type="button" className="secondary" onClick={()=>setShowAllBackups(v=>!v)}>{showAllBackups?'Mostrar solo 20':'Mostrar todas'}</button></div>}
     {autoBackup?.lastError&&<p className="warning">Último error: {autoBackup.lastError}</p>}
   </div>
  </div>
  {restoreStage&&<div className="backupRestoreProgress" role="status" aria-live="polite"><span className="backupRestoreSpinner" aria-hidden="true"/><div><strong>Procesando respaldo</strong><p>{restoreStage}</p></div></div>}
  <div className="backupAdvanced"><details><summary>Restauración y opciones avanzadas</summary><p>Antes de restaurar, FacturaCR inspecciona el respaldo y muestra cuántas empresas, clientes, productos, ventas y proformas contiene. Solo tras tu confirmación reemplaza la información actual y crea una copia previa.</p><div className="actions"><button type="button" className="danger" disabled={busy} onClick={()=>restoreInput.current?.click()}>Restaurar archivo .sqlite</button><button type="button" className="secondary" disabled={busy} onClick={refreshAutoBackup}>Actualizar historial</button></div><input ref={restoreInput} type="file" accept=".sqlite" style={{display:'none'}} onChange={restoreBackup}/></details></div>
  <p className="backupFooterInfo">ⓘ Los respaldos automáticos solo se ejecutan con FacturaCR abierto. Si el programa estuvo cerrado, comprueba los respaldos pendientes cuando se vuelva a abrir. Mantén también una copia en un disco externo.</p>
 </section>;
}

function App({account}){
 const restoreInput=useRef(null),catalogInput=useRef(null),bulkInput=useRef(null);
 const [backupStatus,setBackupStatus]=useState(null),[catalogPreview,setCatalogPreview]=useState(null),[catalogBusy,setCatalogBusy]=useState(false);
 const [bulkPreview,setBulkPreview]=useState(null),[bulkFile,setBulkFile]=useState(null),[bulkPrice,setBulkPrice]=useState(true),[bulkStock,setBulkStock]=useState(false),[bulkCabys,setBulkCabys]=useState(false),[bulkBusy,setBulkBusy]=useState(false);
 const [backupBusy,setBackupBusy]=useState(false);
 const restoreRunningRef=useRef(false);
 const [restoreStage,setRestoreStage]=useState('');
 const [autoBackup,setAutoBackup]=useState(null),[autoConfig,setAutoConfig]=useState({enabled:false,frequency:'daily',time:'20:00',keep:14});
 const [dialog,setDialog]=useState(null);
 const askConfirm=(title,description,action,danger=false,confirmLabel)=>setDialog({title,description,action,danger,confirmLabel});
 const closeDialog=()=>setDialog(null);
 const confirmDialog=()=>{const action=dialog?.action;setDialog(null);if(action)void action()};
 const [companies,setCompanies]=useState([]),[selected,setSelected]=useState(null),[tab,setTab]=useState(account?.isOwner?'companies':'sales');
 const [companyMenuOpen,setCompanyMenuOpen]=useState(false);
 const companyMenuRef=useRef(null);
 useEffect(()=>{const close=e=>{if(!companyMenuRef.current?.contains(e.target))setCompanyMenuOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 const [geoCantons,setGeoCantons]=useState({}),[geoDistricts,setGeoDistricts]=useState({}),[geoError,setGeoError]=useState('');
 const [companyForm,setCompanyForm]=useState({legal_name:'',identification:'',trade_name:'',phone:'',email:'',address:'',website:'',social:'',avatar_color:COMPANY_COLORS[0]}),[items,setItems]=useState([]);
 const [movementProduct,setMovementProduct]=useState(null),[movementBusy,setMovementBusy]=useState(false),[movements,setMovements]=useState([]),[moveForm,setMoveForm]=useState({movement_type:'entrada',quantity:'1',reason:'Compra',notes:''}),[form,setForm]=useState(blankClient),[editing,setEditing]=useState(null),[search,setSearch]=useState(''),[message,setMessage]=useState('');
 const [inventoryAlerts,setInventoryAlerts]=useState(null),[alertsBusy,setAlertsBusy]=useState(false);
 const [stockFilter,setStockFilter]=useState('all'),[movementTypeFilter,setMovementTypeFilter]=useState('all'),[movementFrom,setMovementFrom]=useState(''),[movementTo,setMovementTo]=useState('');
 const sortStorageKey=`facturacr_sort_${selected??'none'}_${tab}`;
 const [sortBy,setSortBy]=useState('az');
 useEffect(()=>{try{setSortBy(localStorage.getItem(sortStorageKey)||'az')}catch{setSortBy('az')}},[sortStorageKey]);
 const changeSort=(value)=>{setSortBy(value);try{localStorage.setItem(sortStorageKey,value)}catch{}};
 const downloadBackup=async()=>{
  setBackupBusy(true);setMessage('Creando respaldo seguro de la base de datos...');
  try{
   const response=await fetch('/api/backups/download');
   if(!response.ok){const type=response.headers.get('content-type')||'';const data=type.includes('application/json')?await response.json():null;throw Error(data?.error||`No se pudo generar el respaldo (HTTP ${response.status}).`);}
   const blob=await response.blob();
   const filename=`FacturaCR_respaldo_${new Date().toISOString().slice(0,10)}.sqlite`;
   const url=URL.createObjectURL(blob);const link=document.createElement('a');
   link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage('Respaldo generado. Comprueba que el archivo esté en tu carpeta de descargas y guárdalo también en una unidad externa.');
  }catch(err){setMessage(err.message)}finally{setBackupBusy(false)}
 };
 const restoreBackup=async(event)=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!file.name.toLowerCase().endsWith('.sqlite')){setMessage('Selecciona un archivo de respaldo .sqlite.');return}
  if(restoreRunningRef.current||backupBusy){setMessage('Ya se está procesando un respaldo.');return}
  restoreRunningRef.current=true;setRestoreStage('Analizando el archivo seleccionado…');
  setBackupBusy(true);setMessage('Inspeccionando el respaldo antes de solicitar confirmación...');
  try{
   const response=await fetch('/api/backups/inspect',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
   const type=response.headers.get('content-type')||'';
   if(!type.includes('application/json'))throw Error(`El servidor no devolvió una respuesta JSON (HTTP ${response.status}).`);
   const result=await response.json();if(!response.ok||!result.compatible)throw Error(result.error||'El respaldo no es compatible.');
   const summary=result.backup,existing=result.current;
   const names=Array.isArray(summary.companyNames)&&summary.companyNames.length?`\nEmpresas en el archivo: ${summary.companyNames.join(', ')}${summary.companies>summary.companyNames.length?'…':''}`:'';
   const details=`Archivo: ${file.name}\n\nRESPALDO: ${summary.companies} empresa(s), ${summary.clients} cliente(s), ${summary.products} artículo(s), ${summary.sales} venta(s), ${summary.quotations} proforma(s).${names}\n\nDATOS ACTUALES: ${existing.companies} empresa(s), ${existing.clients} cliente(s), ${existing.products} artículo(s), ${existing.sales} venta(s), ${existing.quotations} proforma(s).\n\nSe REEMPLAZARÁ la información de TODAS las empresas. Se guardará una copia previa.`;
   setMessage('Respaldo íntegro y compatible. Revisa los datos antes de confirmar la restauración.');
   askConfirm('Inspección de respaldo completada',details,()=>askConfirm('Confirmación final de restauración',`¿Confirmas REEMPLAZAR TODA la información actual con «${file.name}»? No se combinarán los datos.`,()=>performRestore(file),true,'Restaurar respaldo'),false,'Continuar');
  }catch(err){setMessage('El respaldo no pudo inspeccionarse: '+err.message);setDialog({title:'No se pudo inspeccionar el respaldo',description:err.message,kind:'error',confirmLabel:'Aceptar'});}finally{restoreRunningRef.current=false;setRestoreStage('');setBackupBusy(false)}
 };
 const performRestore=async(file)=>{
  // Bloqueo síncrono: evita solicitudes duplicadas incluso antes de que React repinte.
  if(restoreRunningRef.current)return;
  restoreRunningRef.current=true;
  setRestoreStage('Restaurando datos… No cierres FacturaCR ni desconectes el equipo.');
  setBackupBusy(true);setMessage('Verificando respaldo y protegiendo los datos actuales...');
  try{
   const response=await fetch('/api/backups/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
   const type=response.headers.get('content-type')||'';
   if(!type.includes('application/json'))throw Error(`El servidor no devolvió una respuesta JSON (HTTP ${response.status}). No repitas la restauración sin comprobar primero tus datos.`);
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo restaurar.');
   if(!result.ok)throw Error(result.error||'El servidor no confirmó la restauración.');
   // En este punto el servidor YA confirmó el reemplazo. Refrescar la vista es otra operación.
   localStorage.removeItem(ACTIVE_COMPANY_KEY);setSelected(null);setItems([]);setEditing(null);
   let refreshWarning='';
   try{const updatedCompanies=await api('/api/companies');setCompanies(updatedCompanies);setSelected(updatedCompanies[0]?.id??null)}catch(err){refreshWarning=' No se pudo recargar la lista de empresas: '+err.message+'. Reinicia FacturaCR si no aparecen los datos.';}
   const successText=`El respaldo «${file.name}» se restauró correctamente.\n\nSe creó una copia de seguridad de los datos anteriores: ${result.previousBackup||'copia previa guardada'}.\n\n${refreshWarning||'Puedes continuar trabajando con las empresas restauradas.'}`;
   setMessage('Restauración completada correctamente. '+(result.previousBackup?`Copia previa: ${result.previousBackup}.`:'')+refreshWarning);
   setDialog({title:'Restauración realizada con éxito',description:successText,kind:'success',confirmLabel:'Aceptar'});
  }catch(err){
   setMessage('No se pudo confirmar la restauración: '+err.message);
   setDialog({title:'No se pudo completar la restauración',description:`${err.message}\n\nVerifica tus datos antes de intentar nuevamente.`,kind:'error',confirmLabel:'Aceptar'});
  }finally{restoreRunningRef.current=false;setRestoreStage('');setBackupBusy(false)}
 };
 const refreshBackupStatus=async()=>{try{const status=await api('/api/backups/status');setBackupStatus(status);setMessage('')}catch(e){setBackupStatus(null);setMessage('No se pudo consultar el espacio de respaldos: '+e.message)}};
 const refreshAutoBackup=async()=>{try{const data=await api('/api/backups/automatic');setAutoBackup(data);setAutoConfig(data.config)}catch(e){setMessage('No se pudieron consultar los respaldos automáticos: '+e.message)}};
 const saveAutoBackup=async()=>{setBackupBusy(true);try{await api('/api/backups/automatic',{method:'PUT',body:JSON.stringify(autoConfig)});await refreshAutoBackup();setMessage('Programación de respaldos guardada. Se ejecutará mientras FacturaCR esté abierto; si estaba cerrado, comprobará los respaldos pendientes al iniciar.')}catch(e){setMessage(e.message)}finally{setBackupBusy(false)}};
 const createAutoBackup=async()=>{setBackupBusy(true);try{const data=await api('/api/backups/automatic/run',{method:'POST'});await refreshAutoBackup();setMessage('Respaldo verificado: '+data.file)}catch(e){setMessage(e.message)}finally{setBackupBusy(false)}};
 useEffect(()=>{if(tab==='backups'){refreshBackupStatus();refreshAutoBackup()}},[tab]);
 const sizeLabel=bytes=>bytes==null||!Number.isFinite(Number(bytes))?'—':(Number(bytes)/1048576).toLocaleString('es-CR',{maximumFractionDigits:1})+' MB';
 const exportPdfFromRoute=async(path,name)=>{
  try{if(!window.facturacrReports?.savePdf)throw Error('El PDF requiere la aplicación de escritorio.');
   const response=await fetch(path);if(!response.ok)throw Error('No se pudo obtener el reporte.');
   const result=await window.facturacrReports.savePdf(await response.text(),name+'.pdf',{landscape:true});
   if(!result?.cancelled){if(!result?.success)throw Error(result?.error||'No se pudo guardar el PDF.');setMessage('Reporte PDF guardado correctamente.')}}
  catch(e){setMessage('No se pudo exportar a PDF: '+e.message)}
 };
 const exportCatalog=async()=>{
  try{const response=await fetch(`/api/companies/${selected}/products/export.csv`);if(!response.ok)throw Error('No se pudo exportar el catálogo.');
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='FacturaCR_catalogo.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){setMessage(e.message)}
 };
 const [movementExportStatus,setMovementExportStatus]=useState('all');
 const [movementExportSort,setMovementExportSort]=useState('az');
 const exportMovements=async()=>{
  if(!selected){setMessage('Selecciona una empresa antes de exportar.');return;}
  try{
   const response=await fetch(`/api/companies/${selected}/inventory/movements/export.csv?status=${encodeURIComponent(movementExportStatus)}&sort=${encodeURIComponent(movementExportSort)}`);
   if(!response.ok){const type=response.headers.get('content-type')||'';const result=type.includes('application/json')?await response.json():null;throw Error(result?.error||`No se pudo exportar el historial (HTTP ${response.status}).`)}
   const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');
   link.href=url;link.download=`FacturaCR_movimientos_${movementExportStatus}_${movementExportSort}.csv`;document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('Historial de movimientos exportado correctamente.');
  }catch(err){setMessage(err.message)}
 };
 const parseCsv=text=>{
  text=text.replace(/^\uFEFF/,'');
  let delimiter=',';
  if(text.startsWith('sep=;')){delimiter=';';text=text.replace(/^sep=;\r?\n/,'')}
  else if(text.startsWith('sep=,')){text=text.replace(/^sep=,\r?\n/,'')}
  else {const first=text.split(/\r?\n/,1)[0];if((first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length)delimiter=';'}
  const rows=[],row=[];let field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
  else if(c==='"')quoted=true;else if(c===delimiter){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push([...row]);row.length=0;field=''}else field+=c}
  if(quoted)throw Error('El archivo CSV tiene comillas sin cerrar.');if(field||row.length){row.push(field);rows.push(row)}
  const aliases={'tipo':'kind','codigo / sku':'product_code','código / sku':'product_code','codigo de barras':'barcode','código de barras':'barcode','producto / descripcion':'description','producto / descripción':'description','cabys':'cabys','precio de venta':'price','costo':'cost','moneda':'currency','codigo iva':'tax_code','código iva':'tax_code','unidad':'unit','existencias':'stock','existencias minimas':'min_stock','existencias mínimas':'min_stock','controla existencias':'track_stock','alerta habilitada':'alert_enabled','observaciones':'notes'};
  const headers=(rows.shift()||[]).map(h=>{const key=h.trim().toLowerCase();return aliases[key]||key});
  if(!headers.includes('description')||!headers.includes('price'))throw Error('El CSV debe incluir Producto / descripción y Precio de venta. Puedes exportar primero una plantilla.');
  if(rows.length>2000)throw Error('Máximo 2000 artículos por importación.');
  const allowed=['kind','product_code','barcode','description','cabys','price','cost','currency','tax_code','unit','stock','min_stock','track_stock','alert_enabled','notes'];
  return rows.filter(r=>r.some(v=>v.trim())).map((r,i)=>{if(r.length!==headers.length)throw Error('Columnas inconsistentes en fila '+(i+2));return Object.fromEntries(headers.map((h,j)=>[h,['product_code','barcode','cabys','tax_code'].includes(h)?r[j].replace(/^=\"(\d+)\"$/,'$1'):r[j]]).filter(([h])=>allowed.includes(h)))});
 };
 const selectCatalog=async(e)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>2*1024*1024)throw Error('Divide el CSV en lotes de hasta 2 MB.');const bytes=await file.arrayBuffer();const raw=new Uint8Array(bytes);
   const decoded=decodeCatalogCsv(raw);
   const rows=parseCsv(decoded);if(!rows.length)throw Error('El archivo no contiene artículos.');setCatalogPreview({name:file.name,rows});setMessage('Revisa la vista previa antes de importar.')}catch(err){setCatalogPreview(null);setMessage(err.message)}};
 const selectBulkFile=async(e)=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  setBulkPreview(null);setBulkFile(null);
  try{
   if(file.size>2*1024*1024)throw Error('El CSV supera 2 MB. Divide el catálogo en lotes.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   const rows=parseCsv(decodeCatalogCsv(bytes));
   if(!rows.length)throw Error('No se encontraron artículos en el archivo.');
   if(rows.some(r=>!r.product_code&&!r.barcode))throw Error('Cada fila debe contener un SKU o código de barras.');
   setBulkFile({name:file.name,rows});setMessage('Archivo listo. Elige qué campos deseas actualizar y revisa la vista previa.');
  }catch(err){setMessage(err.message)}
 };
 const previewBulk=async()=>{
  if(!bulkFile)return;
  setBulkBusy(true);setBulkPreview(null);
  try{
   const result=await api(`/api/companies/${selected}/products/bulk-update/preview`,{method:'POST',body:JSON.stringify({rows:bulkFile.rows,updatePrice:bulkPrice,updateStock:bulkStock,updateCabys:bulkCabys})});
   setBulkPreview({...result,companyId:selected,updatePrice:bulkPrice,updateStock:bulkStock,updateCabys:bulkCabys});
   setMessage(`Vista previa validada: ${result.changed} artículo(s) con cambios de ${result.rows.length} revisados.`);
  }catch(err){setMessage(err.message)}finally{setBulkBusy(false)}
 };
 const applyBulk=()=>{
  if(!bulkPreview||!bulkFile||bulkPreview.companyId!==selected)return;
  askConfirm('Confirmar actualización masiva',`¿Actualizar ${bulkPreview.changed} artículo(s) de ${current?.legal_name}? Los cambios de existencias se registrarán en movimientos. Esta acción no crea artículos.`,async()=>{
   setBulkBusy(true);
   try{
    const rows=bulkFile.rows.map((r,i)=>({...r,expected_price:bulkPreview.rows[i].old_price,expected_stock:bulkPreview.rows[i].old_stock,expected_cabys:bulkPreview.rows[i].old_cabys}));
    const result=await api(`/api/companies/${selected}/products/bulk-update/apply`,{method:'POST',body:JSON.stringify({rows,updatePrice:bulkPreview.updatePrice,updateStock:bulkPreview.updateStock,updateCabys:bulkPreview.updateCabys})});
    setBulkPreview(null);setBulkFile(null);await refreshItems();
    setMessage(`Actualización terminada: ${result.priceChanges} precio(s), ${result.stockChanges} existencia(s) y ${result.cabysChanges} CABYS modificados.`);
   }catch(err){setBulkPreview(null);setMessage(err.message+' Vuelve a generar la vista previa.')}finally{setBulkBusy(false)}
  });
 };
 const importCatalog=async()=>{if(!catalogPreview)return;askConfirm('Importar catálogo',`¿Importar ${catalogPreview.rows.length} artículos a ${current?.legal_name}? No se sobrescribirán artículos existentes.`,()=>persistCatalog());};
 const persistCatalog=async()=>{
  setCatalogBusy(true);try{const result=await api(`/api/companies/${selected}/products/import`,{method:'POST',body:JSON.stringify({rows:catalogPreview.rows})});setCatalogPreview(null);await refreshItems();setMessage(`Se importaron ${result.imported} artículos correctamente.`)}catch(err){setMessage(err.message)}finally{setCatalogBusy(false)}};
 const current=companies.find(c=>c.id===selected);
 const currentCompanyName=current?.trade_name||current?.legal_name||'Sin asignar';
 const currentCompanyMeta=current?.identification||'Historial multiempresa';
 const endpoint=`/api/companies/${selected}/${tab}`;
 const refreshCompanies=async()=>{try{const result=await api('/api/companies');setCompanies(result);setSelected(prev=>{
    const saved=localStorage.getItem(ACTIVE_COMPANY_KEY);
    const desired=prev??(saved===null?null:Number(saved));
    return result.some(c=>c.id===desired)?desired:result[0]?.id??null;
   });}catch(e){setMessage(e.message)}};
 const refreshInventoryAlerts=async()=>{
  if(!selected || tab!=='products'){setInventoryAlerts(null);return;}
  setAlertsBusy(true);
  try{setInventoryAlerts(await api(`/api/companies/${selected}/inventory/alerts`));}
  catch(err){setInventoryAlerts(null);setMessage('No se pudieron consultar las alertas de inventario: '+err.message);}
  finally{setAlertsBusy(false);}
 };
 const downloadInventoryAlerts=()=>{
  if(!inventoryAlerts){setMessage('Actualiza las alertas antes de exportar.');return;}
  const clean=v=>{if(typeof v==='number'&&Number.isFinite(v))return String(v);const str=String(v??'');return /^[\s]*[=+@\-\t\r]/.test(str)?"'"+str:str};
  const cell=v=>'"'+clean(v).replace(/"/g,'""')+'"';
  const rows=[['Código / SKU','Producto','Estado','Existencias','Mínimo','Unidades sugeridas','Unidad','Costo estimado (CRC)','Costo registrado'],
    ...inventoryAlerts.rows.map(r=>[r.code,r.description,r.status,r.stock,r.minimum,r.suggested,r.unit,r.estimatedCostCRC??'',r.costKnown?'Sí':'No'])];
  const csv='\uFEFFsep=;\r\n'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
  const url=URL.createObjectURL(csvExcelBlob(csv));const a=document.createElement('a');
  a.href=url;a.download=`FacturaCR_reposicion_empresa_${selected}.csv`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 const refreshItems=async()=>{
  if(!selected||!['clients','products'].includes(tab)){setItems([]);return;}
  try{const result=await api(endpoint);if(!Array.isArray(result))throw Error('El servidor devolvió un formato inesperado para el listado.');setItems(result);if(tab==='products')void refreshInventoryAlerts()}
  catch(e){setItems([]);setMessage(e.message)}
 };
 useEffect(()=>{refreshCompanies()},[]);
 useEffect(()=>{if(selected!==null&&companies.some(c=>c.id===selected)){
  try{localStorage.setItem(ACTIVE_COMPANY_KEY,String(selected))}catch{}
 }},[selected,companies]);
 useEffect(()=>{setInventoryAlerts(null);setItems([]);setSearch('');setEditing(null);setForm(tab==='products'?blankProduct:blankClient);setMessage('');setMovementProduct(null);setMovements([]);refreshItems();refreshInventoryAlerts()},[selected,tab]);
 const getGeo=async(path,setter)=>{
   const key='facturacr_geo_'+path;
   const cached=localStorage.getItem(key);
   if(cached){try{setter(JSON.parse(cached));setGeoError('');return}catch{localStorage.removeItem(key)}}
   try{const response=await fetch(geoBase+path);if(!response.ok)throw Error();const data=await response.json();
     setter(data);localStorage.setItem(key,JSON.stringify(data));setGeoError('');
   }catch{setter({});setGeoError('No se pudo cargar el catálogo territorial. Conéctate a Internet para la primera consulta. Las ubicaciones consultadas anteriormente quedan guardadas en este equipo.');}
 };
 useEffect(()=>{if(tab==='clients'&&form.province)getGeo(`/provincia/${Number(form.province)}/cantones.json`,setGeoCantons);else setGeoCantons({})},[tab,form.province]);
 useEffect(()=>{if(tab==='clients'&&form.province&&form.canton)getGeo(`/provincia/${Number(form.province)}/canton/${Number(form.canton)}/distritos.json`,setGeoDistricts);else setGeoDistricts({})},[tab,form.province,form.canton]);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value,...(key==='tax_code'?{tax_rate:rates[value]}:{})}));
 const resetCompanyForm=()=>setCompanyForm({legal_name:'',identification:'',trade_name:'',phone:'',email:'',address:'',website:'',social:'',avatar_color:COMPANY_COLORS[0]});
 const [companyModalOpen,setCompanyModalOpen]=useState(false);
 const [companySaving,setCompanySaving]=useState(false);
 const [companyModalError,setCompanyModalError]=useState('');
 const closeCompanyModal=()=>{if(!companySaving){setCompanyModalOpen(false);setEditingCompany(null)}};
 const saveCompany=e=>{e.preventDefault();askConfirm('Guardar empresa',`¿${editingCompany?'Actualizar':'Registrar'} la empresa «${companyForm.legal_name}»?`,editingCompany?updateCompany:persistCompany)};
 const persistCompany=async()=>{setCompanySaving(true);try{const created=await api('/api/companies',{method:'POST',body:JSON.stringify(companyForm)});resetCompanyForm();await refreshCompanies();setSelected(created.id);setCompanyModalOpen(false);setMessage('Empresa registrada.')}catch(err){setCompanyModalError(err.message)}finally{setCompanySaving(false)}};
 const [editingCompany,setEditingCompany]=useState(null);
 const createCompanyProfile=()=>{setEditingCompany(null);resetCompanyForm();setCompanyModalError('');setCompanyModalOpen(true)};
 const openCompanyProfile=c=>{setSelected(c.id);setEditingCompany(c.id);setCompanyForm({legal_name:c.legal_name,identification:c.identification,trade_name:c.trade_name||'',phone:c.phone||'',email:c.email||'',address:c.address||'',website:c.website||'',social:c.social||'',avatar_color:COMPANY_COLORS.includes(c.avatar_color)?c.avatar_color:COMPANY_COLORS[0]});setTab('companies');setCompanyModalError('');setCompanyModalOpen(true)};
 const editCompany=c=>openCompanyProfile(c);
 const updateCompany=async()=>{setCompanySaving(true);try{await api(`/api/companies/${editingCompany}`,{method:'PUT',body:JSON.stringify(companyForm)});await refreshCompanies();setEditingCompany(null);resetCompanyForm();setCompanyModalOpen(false);setMessage('Información de empresa actualizada.')}catch(e){setCompanyModalError(e.message)}finally{setCompanySaving(false)}};
 const persistItem=async()=>{try{
   await api(endpoint+(editing?`/${editing}`:''),{method:editing?'PUT':'POST',body:JSON.stringify(tab==='products'?{...form,price_includes_tax:'1'}:form)});
   setForm(tab==='products'?blankProduct:blankClient);setEditing(null);await refreshItems();setMessage('Registro guardado correctamente.');
  }catch(err){setMessage(err.message)}};
 const saveItem=e=>{e.preventDefault();
  askConfirm(editing?'Guardar cambios':tab==='clients'?'Guardar cliente':'Guardar artículo',tab==='clients'?`¿Confirmas ${editing?'actualizar':'registrar'} este cliente?`:editing?'¿Confirmas los cambios de este artículo o servicio?':'¿Confirmas guardar este nuevo artículo o servicio?',persistItem);
 };
 const removeRecord=async item=>{try{await api(endpoint+'/'+item.id,{method:'DELETE'});await refreshItems();setMessage(tab==='products'?'Artículo retirado del catálogo. Su historial de inventario se conserva.':'Registro eliminado.');}catch(e){setMessage(e.message)}};
 const remove=item=>askConfirm(tab==='products'?'Eliminar artículo':'Eliminar registro',tab==='products'?`¿Retirar «${item.description}» del catálogo? Dejará de aparecer en artículos, pero se conservarán sus movimientos para auditoría.`:'¿Eliminar este registro? Esta acción no se puede deshacer.',()=>removeRecord(item),true);
 const edit=item=>{const apply=()=>{const keys=Object.keys(tab==='products'?blankProduct:blankClient);setForm(Object.fromEntries(keys.map(k=>[k,k==='price'&&tab==='products'&&Number(item.price_includes_tax)!==1?String(Math.round(Number(item.price)*(1+Number(item.tax_rate||0)/100)*100)/100):k==='price_includes_tax'?'1':String(item[k]??'')])));setEditing(item.id);window.scrollTo({top:0,behavior:'smooth'})};
  askConfirm(tab==='products'?'Editar artículo':'Editar cliente',`¿Deseas editar «${item.description||item.name}»?`,apply);
 };
 const loadMovements=async(productId)=>{try{setMovements(await api(`/api/companies/${selected}/inventory/movements?productId=${productId}`))}catch(e){setMessage(e.message)}};
 const openMovement=item=>{setMovementProduct(item.id);setMovementTypeFilter('all');setMovementFrom('');setMovementTo('');setMoveForm({movement_type:'entrada',quantity:'1',reason:'Compra',notes:''});loadMovements(item.id)};
 const saveMovement=async(e)=>{
  e.preventDefault();if(movementBusy)return;
  const product=items.find(p=>p.id===movementProduct);
  const qty=Number(moveForm.quantity),before=Number(product?.stock);
  const type=moveForm.movement_type,reason=moveForm.reason.trim();
  if(!product||!Number.isSafeInteger(qty)||qty<(type==='ajuste'?0:1)||qty>1e9||reason.length<5){setMessage('Indica una cantidad válida y un motivo de al menos 5 caracteres. Los ajustes permiten saldo cero.');return;}
  const after=type==='ajuste'?qty:before+(type==='entrada'?qty:-qty);
  if(after<0||after>1e9||after===before){setMessage(after===before?'El movimiento no cambia las existencias.':'Las existencias finales deben quedar entre 0 y 1.000.000.000.');return;}
  const change=after-before;
  askConfirm('Confirmar movimiento de inventario',`Artículo: ${product.description}\nMotivo: ${reason}\nExistencias antes: ${before}\nVariación: ${change>0?'+':''}${change}\nExistencias después: ${after}\n\nEste registro quedará en el Kardex.`,()=>persistMovement());
 };
 const movementSavingRef=useRef(false);
 const persistMovement=async()=>{
  if(movementSavingRef.current)return;
  movementSavingRef.current=true;setMovementBusy(true);
  try{
   const result=await api(`/api/companies/${selected}/inventory/movements`,{method:'POST',body:JSON.stringify({product_id:movementProduct,...moveForm,reason:moveForm.reason.trim()})});
   setMessage(`Movimiento #${result.id} registrado. Existencias: ${result.stock_before} → ${result.stock_after}.`);
   try{await refreshItems();await loadMovements(movementProduct)}catch(e){setMessage(`Movimiento #${result.id} guardado correctamente; no se pudo actualizar la pantalla: ${e.message}. Pulsa Actualizar.`)}
   setMoveForm({...moveForm,quantity:'1',notes:''});
  }catch(e){setMessage(e.message)}finally{movementSavingRef.current=false;setMovementBusy(false)}
 };
 const uploadImage=async(e)=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage('Solo imágenes JPG, PNG o WebP.');return}
  if(file.size>700000){setMessage('La imagen debe pesar menos de 700 KB.');return}
  const reader=new FileReader();reader.onload=()=>change('image_data',String(reader.result));reader.readAsDataURL(file);
 };
 const trackedProducts=(Array.isArray(items)?items:[]).filter(p=>p.kind==='producto'&&Number(p.track_stock)===1);
 const stockOut=trackedProducts.filter(p=>Number(p.stock)<=0);
 const stockLow=trackedProducts.filter(p=>Number(p.stock)>0&&Number(p.alert_enabled)===1&&Number(p.stock)<=Number(p.min_stock));
 const stockNormal=trackedProducts.filter(p=>Number(p.stock)>0&&!(Number(p.alert_enabled)===1&&Number(p.stock)<=Number(p.min_stock)));
 const matchStockFilter=p=>tab!=='products'||stockFilter==='all'||(p.kind==='producto'&&Number(p.track_stock)===1&&(stockFilter==='out'?Number(p.stock)<=0:stockFilter==='low'?Number(p.stock)>0&&Number(p.alert_enabled)===1&&Number(p.stock)<=Number(p.min_stock):stockFilter==='normal'?Number(p.stock)>0&&!(Number(p.alert_enabled)===1&&Number(p.stock)<=Number(p.min_stock)):true));
 const filteredMovements=movements.filter(m=>(movementTypeFilter==='all'||m.movement_type===movementTypeFilter)&&(!movementFrom||String(m.created_at).slice(0,10)>=movementFrom)&&(!movementTo||String(m.created_at).slice(0,10)<=movementTo));
 const filtered=(Array.isArray(items)?items:[]).filter(item=>matchStockFilter(item)&&Object.entries(item).filter(([k])=>k!=='image_data').some(([,v])=>String(v).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>{
  const label=tab==='clients'?'name':'description';
  const text=(x,y)=>String(x??'').localeCompare(String(y??''),'es',{numeric:true,sensitivity:'base'});
  const num=(x,y)=>Number(x??0)-Number(y??0);
  let result=0;
  switch(sortBy){
   case 'za':result=text(b[label],a[label]);break;
   case 'oldest':result=num(a.id,b.id);break;
   case 'newest':result=num(b.id,a.id);break;
   case 'identification':result=text(a.identification,b.identification);break;
   case 'price_asc':result=num(a.price,b.price);break;
   case 'price_desc':result=num(b.price,a.price);break;
   case 'stock_asc':result=num(a.stock,b.stock);break;
   case 'stock_desc':result=num(b.stock,a.stock);break;
   default:result=text(a[label],b[label]);
  }
  return result||num(a.id,b.id);
 });
 const activeAccent=colorForCompany(current);
 const activeAccentSoft=withAlpha(activeAccent,.15);
 const activeAccentBorder=withAlpha(activeAccent,.42);
 return <div className="layout"><aside><div className="brandPanel"><div className="brandMark"><img src={appLogo} alt="Logo de FacturaCR"/></div><div className="brandText"><h1>Factura<span>CR</span></h1><small>Gestor electrónico</small></div></div><div className="sidebarCompanyCard"><p className="sidebarEyebrow">Empresa activa</p><div className="sidebarCompanyPicker" ref={companyMenuRef}><button type="button" className={'sidebarCompanyControl '+(companyMenuOpen?'menuOpened':'')} onClick={()=>setCompanyMenuOpen(v=>!v)} aria-label="Cambiar empresa activa" aria-expanded={companyMenuOpen} aria-haspopup="true" style={{borderColor:activeAccentBorder,boxShadow:companyMenuOpen?`0 0 0 2px ${withAlpha(activeAccent,.16)}`:'none',background:companyMenuOpen?`linear-gradient(180deg, ${withAlpha(activeAccent,.18)}, rgba(255,255,255,.08))`:`linear-gradient(180deg, ${withAlpha(activeAccent,.15)}, rgba(255,255,255,.06))`}}><div className="sidebarCompanyAvatar" style={{background:`linear-gradient(180deg, ${activeAccent}, ${activeAccent})`}}>{currentCompanyName.charAt(0).toUpperCase()}</div><div className="sidebarCompanyInfo"><strong title={currentCompanyName} style={{color:activeAccent}}>{currentCompanyName}</strong><small title={currentCompanyMeta}>{currentCompanyMeta}</small></div><UiIcon name="chevron" size={16}/></button>{companyMenuOpen&&<div className="sidebarCompanyDropdown" role="group" aria-label="Empresas disponibles">{companies.length===0?<p className="companyDropdownEmpty">Aún no hay empresas registradas.</p>:companies.map(c=>{const name=c.trade_name||c.legal_name;const accent=colorForCompany(c);return <button key={c.id} type="button" className={'companyDropdownOption '+(selected===c.id?'selected':'')} onClick={()=>{setSelected(c.id);setCompanyMenuOpen(false)}} style={selected===c.id?{background:`linear-gradient(180deg, ${withAlpha(accent,.20)}, rgba(49,82,124,.88))`,borderColor:withAlpha(accent,.55)}:{}}><span className="companyDropdownAvatar" style={{background:`linear-gradient(180deg, ${accent}, ${accent})`}}>{name.charAt(0).toUpperCase()}</span><span className="companyDropdownInfo"><strong style={selected===c.id?{color:accent}:{}}>{name}</strong><small>{c.identification}</small></span>{selected===c.id&&<UiIcon name="check" size={15}/>}</button>})}</div>}</div>{account?.isOwner&&<button type="button" className="sidebarLinkButton" onClick={createCompanyProfile}><UiIcon name="plus" size={15}/> Nueva empresa</button>}</div><div className="sidebarNavTitle">Espacio de trabajo</div><nav>
  {(account?.isOwner||account?.companies?.some(c=>c.company_id===selected&&c.role!=='cashier'))&&<button className={tab==='dashboard'?'navactive':''} onClick={()=>setTab('dashboard')}><span className="navIcon"><UiIcon name="store" size={18}/></span><span>Dashboard</span></button>}
  <button className={tab==='companies'?'navactive':''} onClick={()=>setTab('companies')}><span className="navIcon"><UiIcon name="office" size={18}/></span><span>Empresas</span></button>
  <button className={tab==='clients'?'navactive':''} onClick={()=>setTab('clients')}><span className="navIcon"><UiIcon name="idcard" size={18}/></span><span>Clientes</span></button>
  {(account?.isOwner||account?.companies?.some(c=>c.company_id===selected&&c.role!=='cashier'))&&<button className={tab==='products'?'navactive':''} onClick={()=>setTab('products')}><span className="navIcon"><UiIcon name="package" size={18}/></span><span>Inventario y servicios</span></button>}
  {(account?.isOwner||account?.companies?.some(c=>c.company_id===selected&&c.role!=='cashier'))&&<button className={tab==='valuation'?'navactive':''} onClick={()=>setTab('valuation')}><span className="navIcon"><UiIcon name="boxes" size={18}/></span><span>Valoración inventario</span></button>}
 {(account?.isOwner||account?.companies?.some(c=>c.company_id===selected&&c.role!=='cashier'))&&<button className={tab==='kardex'?'navactive':''} onClick={()=>setTab('kardex')}><span className="navIcon"><UiIcon name="boxes" size={18}/></span><span>Kardex · Movimientos</span></button>}
  <button className={tab==='quotes'?'navactive':''} onClick={()=>setTab('quotes')}><span className="navIcon"><UiIcon name="receipt" size={18}/></span><span>Cotizaciones / Proformas</span></button>
  <button className={tab==='sales'?'navactive':''} onClick={()=>setTab('sales')}><span className="navIcon"><UiIcon name="cart" size={18}/></span><span>Ventas</span></button>
  <button className={tab==='cash'?'navactive':''} onClick={()=>setTab('cash')}><span className="navIcon"><UiIcon name="receipt" size={18}/></span><span>Caja y gastos</span></button>
  {account?.isOwner&&<button className={tab==='backups'?'navactive':''} onClick={()=>setTab('backups')}><span className="navIcon"><UiIcon name="backup" size={18}/></span><span>Respaldos</span></button>}<span>Facturas electrónicas · Próximamente</span>{(account?.isOwner||account?.companies?.some(c=>c.role==='company_admin'))&&<button className={tab==='users'?'navactive':''} onClick={()=>setTab('users')}><span className="navIcon"><UiIcon name="users" size={18}/></span><span>Usuarios y permisos</span></button>}
 </nav><div className="sidebarBottom"><div className="sidebarProtection"><span className="sidebarProtectionIcon" aria-hidden="true"><UiIcon name="shield" size={18}/></span><strong>Tus datos, en tu equipo</strong><p>Historial guardado en SQLite. No se envía a la nube.</p></div>{account?.isOwner&&<button type="button" className="sidebarBackupButton" onClick={()=>setTab('backups')}><span className="navIcon"><UiIcon name="backup" size={18}/></span><span>Respaldar base SQLite</span></button>}<small>FacturaCR · v{APP_VERSION}</small></div></aside><main>{tab!=='backups'&&<header><h2>{tab==='dashboard'?'Dashboard comercial':tab==='companies'?'Empresas':tab==='clients'?'Clientes':tab==='sales'?'Punto de venta':tab==='quotes'?'Cotizaciones y proformas':tab==='valuation'?'Valoración de inventario':tab==='cash'?'Caja y gastos':tab==='kardex'?'Kardex de inventario':tab==='users'?'Usuarios y permisos':'Inventario y servicios'}</h2><p>Información guardada localmente y separada por empresa</p></header>}
 {message&&<p className="notice" role="status">{message}</p>}
 {tab==='users'&&<UsersPanel account={account}/>}
 {tab==='backups'&&<BackupWorkspace autoBackup={autoBackup} autoConfig={autoConfig} setAutoConfig={setAutoConfig} backupStatus={backupStatus} busy={backupBusy} downloadBackup={downloadBackup} createAutoBackup={createAutoBackup} saveAutoBackup={saveAutoBackup} refreshAutoBackup={refreshAutoBackup} refreshBackupStatus={refreshBackupStatus} restoreInput={restoreInput} restoreBackup={restoreBackup} restoreStage={restoreStage} setMessage={setMessage} sizeLabel={sizeLabel}/>}
 {tab==='users'?null:tab==='companies'?<section className="companiesWorkspace"><div className="companiesHero"><div><p className="companiesOverline">Gestión de comprobantes · Costa Rica</p><h3>Perfiles de empresas</h3><p className="hint">Administra los documentos de cada empresa por separado y cambia rápidamente entre ellas.</p></div>{account?.isOwner&&<button type="button" onClick={createCompanyProfile}><UiIcon name="plus" size={15}/> Nueva empresa</button>}</div><div className="companiesInlineNotice">Las empresas comparten una base local, pero sus clientes, inventario, ventas y respaldos se manejan por separado.</div><div className="companyProfilesGrid">{companies.map(c=>{const title=c.trade_name||c.legal_name;const subtitle=c.identification||'Sin cédula configurada';const initial=(title||'E').charAt(0).toUpperCase();return <article key={c.id} className={'companyProfileCard '+(selected===c.id?'isSelected':'')}><div className="companyProfileHeader"><div className="companyProfileAvatar" style={{background:`linear-gradient(180deg, ${colorForCompany(c)}, ${colorForCompany(c)})`}}>{initial}</div>{selected===c.id&&<span className="companyProfileBadge">Activa</span>}</div><div className="companyProfileBody"><strong title={title}>{title}</strong><small title={subtitle}>{subtitle}</small></div><div className="companyProfileFooter"><button type="button" className="secondary" onClick={()=>openCompanyProfile(c)}><UiIcon name="store" size={15}/> Abrir perfil</button><div className="actions">{account?.isOwner&&<button type="button" className="secondary" onClick={()=>editCompany(c)}><UiIcon name="edit" size={14}/> Editar</button>}<button type="button" className="secondary" disabled title="Requiere autenticación del propietario"><UiIcon name="trash" size={14}/> Eliminar</button></div></div></article>})}{account?.isOwner&&<button type="button" className="companyProfileCard companyAddCard" onClick={createCompanyProfile}><span>＋</span><strong>Agregar empresa</strong><small>Crea un nuevo perfil para tus comprobantes.</small></button>}</div></section>:
 tab==='backups'?null:
 tab==='dashboard'?<DashboardPanel companyId={selected} company={current}/>: 
 tab==='valuation'?<InventoryValuationPanel companyId={selected} company={current}/>: 
 tab==='kardex'?<KardexPanel companyId={selected}/>: 
 tab==='cash'?<CashPanel companyId={selected} company={current}/>: 
 tab==='sales'?<SalesPanel companyId={selected} company={current} askConfirm={askConfirm} canReadHistory={!!(account?.isOwner||account?.companies?.some(c=>c.company_id===selected&&c.role!=='cashier'))}/>: 
 tab==='quotes'?<QuotesPanel companyId={selected} company={current}/>: 
 !current?<div className="card">Primero registre una empresa.</div>:
 <section className="grid"><div className="card"><h3>{editing?'Editar':'Registrar'} {tab==='clients'?'cliente':'producto o servicio'}</h3><form onSubmit={saveItem} onKeyDown={e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault()}}}>
 {tab==='clients'?<>
  <h4>Identificación</h4>
  <Field title="Nombre o razón social *"><input required maxLength="100" value={form.name} onChange={e=>change('name',e.target.value)}/></Field>
  <Field title="Nombre comercial"><input maxLength="80" value={form.trade_name} onChange={e=>change('trade_name',e.target.value)}/></Field>
  <div className="two"><Field title="Tipo de identificación"><select value={form.identification_type} onChange={e=>change('identification_type',e.target.value)}><option value="01">01 · Cédula física</option><option value="02">02 · Cédula jurídica</option><option value="03">03 · DIMEX</option><option value="04">04 · NITE</option><option value="05">05 · Extranjero no domiciliado</option></select></Field>
  <Field title="Número de identificación *"><input required maxLength="20" value={form.identification} onChange={e=>change('identification',e.target.value.replace(/[-\s]/g,''))}/></Field></div>
  <Field title="Código de actividad económica del receptor"><input inputMode="decimal" pattern="([0-9]{4}\.[0-9]|[0-9]{6})?" maxLength="6" value={form.activity_code} onChange={e=>change('activity_code',e.target.value)} placeholder="Ejemplo: 3333.3"/></Field>
  <h4>Dirección</h4>
  <div className="three"><Field title="Provincia"><select value={form.province} onChange={e=>{change('province',e.target.value);setForm(prev=>({...prev,province:e.target.value,canton:'',district:''}))}}><option value="">Seleccione</option>{Object.entries(provinces).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
  <Field title="Cantón"><select value={form.canton} disabled={!form.province||!Object.keys(geoCantons).length} onChange={e=>setForm(prev=>({...prev,canton:e.target.value,district:''}))}><option value="">Seleccione cantón</option>{Object.entries(geoCantons).map(([k,v])=><option key={k} value={pad2(k)}>{v}</option>)}</select></Field>
  <Field title="Distrito"><select value={form.district} disabled={!form.canton||!Object.keys(geoDistricts).length} onChange={e=>change('district',e.target.value)}><option value="">Seleccione distrito</option>{Object.entries(geoDistricts).map(([k,v])=><option key={k} value={pad2(k)}>{v}</option>)}</select></Field></div>
  {geoError&&<p className="hint" role="alert">{geoError}</p>}
  <p className="hint">Selecciona provincia → cantón → distrito. Los códigos se guardan internamente. Los catálogos se consultan en línea y se almacenan localmente para reutilizarlos.</p>
  <Field title="Dirección exacta / otras señas"><textarea rows="3" maxLength="160" value={form.address} onChange={e=>change('address',e.target.value)}/></Field>
  <h4>Contacto</h4>
  <div className="three"><Field title="Código país"><input maxLength="3" value={form.country_code} onChange={e=>change('country_code',e.target.value)}/></Field><Field title="Teléfono"><input maxLength="20" value={form.phone} onChange={e=>change('phone',e.target.value)}/></Field><Field title="Teléfono alternativo"><input maxLength="20" value={form.phone_alt} onChange={e=>change('phone_alt',e.target.value)}/></Field></div>
  <Field title="Correo electrónico"><input type="email" maxLength="160" value={form.email} onChange={e=>change('email',e.target.value)}/></Field>
  <Field title="Notas internas"><textarea rows="2" maxLength="500" value={form.notes} onChange={e=>change('notes',e.target.value)}/></Field>
 </>:<>
  <div className="two"><Field title="Tipo"><select value={form.kind} onChange={e=>{change('kind',e.target.value);if(e.target.value==='servicio')change('track_stock','0')}}><option value="producto">Producto</option><option value="servicio">Servicio</option></select></Field>
  <Field title="Código interno / SKU"><input maxLength="40" value={form.product_code} onChange={e=>change('product_code',e.target.value)}/></Field></div>
  <Field title="Descripción *"><textarea rows="2" required maxLength="250" value={form.description} onChange={e=>change('description',e.target.value)}/></Field>
  <div className="two"><Field title="CABYS (13 dígitos)"><input maxLength="13" pattern="([0-9]{13})?" value={form.cabys} onChange={e=>change('cabys',e.target.value)} placeholder="Consultar catálogo oficial"/></Field>
  <Field title="Código de barras"><input maxLength="60" value={form.barcode} onChange={e=>change('barcode',e.target.value)}/></Field></div>
  <h4>Precios e impuestos</h4>
  <div className="three"><Field title="Precio final con IVA incluido *"><input type="number" min="0" step="0.00001" required value={form.price} onChange={e=>change('price',e.target.value)}/></Field>
  <Field title="Costo"><input type="number" min="0" step="0.00001" value={form.cost} onChange={e=>change('cost',e.target.value)}/></Field>
  <Field title="Moneda"><select value={form.currency} onChange={e=>change('currency',e.target.value)}><option value="CRC">CRC · Colones</option><option value="USD">USD · Dólares</option></select></Field></div>
  <div className="posPricePreview"><span>Precio base sin IVA (calculado)</span><strong>{form.currency==='USD'?'$':'₡'}{(Number(form.price||0)/(1+Number(form.tax_rate||0)/100)).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>El precio final incluye el impuesto seleccionado. En Ventas se mostrará el precio base.</small></div>
  <Field title="Tarifa de IVA"><select value={form.tax_code} onChange={e=>change('tax_code',e.target.value)}>{tariffs.map(([k,v])=><option key={k} value={k}>{v.replace(' · Código 10','')}</option>)}</select></Field>
  <p className="hint">Los códigos tributarios se conservan internamente para la futura integración con Hacienda. La tarifa se debe elegir según la clasificación tributaria del producto. Las tarifas transitorias solo aplican a los ajustes permitidos por Hacienda.</p>
  <h4>Inventario</h4>
  <div className="two"><Field title="Unidad de medida"><select value={form.unit} onChange={e=>change('unit',e.target.value)}>{['Unid','Kg','g','L','mL','m','m2','m3','h','d','Sp','Otros'].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
  <Field title="Controlar existencias"><select value={form.kind==='servicio'?'0':form.track_stock} disabled={form.kind==='servicio'} onChange={e=>change('track_stock',e.target.value)}><option value="1">Sí</option><option value="0">No</option></select></Field></div>
  {form.kind==='producto'&&<div className="two"><Field title="Existencias actuales"><input type="number" min="0" step="1" value={form.stock} onChange={e=>change('stock',e.target.value)}/></Field><Field title="Avisar cuando queden estas unidades o menos"><input type="number" min="0" step="1" value={form.min_stock} onChange={e=>change('min_stock',e.target.value)}/></Field></div>}
  {form.kind==='producto'&&<Field title="Alertas de pocas unidades"><select value={form.alert_enabled} onChange={e=>change('alert_enabled',e.target.value)}><option value="1">Activadas</option><option value="0">Desactivadas</option></select></Field>}
  <p className="hint">Para cambiar existencias de productos guardados, utiliza Registrar movimiento. Así queda constancia de cada cambio.</p>
  <h4>Fotografía</h4><Field title="Foto del producto (JPG, PNG o WebP · hasta 700 KB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage}/></Field>
  {form.image_data&&<div className="photo"><img src={form.image_data} alt="Vista previa"/><button type="button" className="secondary" onClick={()=>change('image_data','')}>Quitar foto</button></div>}
  <Field title="Notas internas"><textarea rows="2" maxLength="500" value={form.notes} onChange={e=>change('notes',e.target.value)}/></Field>
 </>}
 <div className="actions"><button type="submit">{editing?'Guardar cambios':'Guardar registro'}</button>{editing&&<button type="button" className="secondary" onClick={()=>{setEditing(null);setForm(tab==='products'?blankProduct:blankClient)}}>Cancelar</button>}</div></form></div>
 <div className="card"><h3>Registros de {current.legal_name}</h3>
 {tab==='products'&&<div className="catalogTools"><h4>Importar / exportar catálogo</h4><p className="hint">Exporta CSV para Excel de Windows (acentos legibles y códigos como texto). Para importar, usa un archivo CSV con las columnas de FacturaCR. No modifica artículos existentes ni importa fotografías.</p>
 <div className="actions"><button type="button" className="secondary" onClick={exportCatalog}>Exportar CSV para Excel</button><button type="button" className="secondary" onClick={()=>exportPdfFromRoute(`/api/companies/${selected}/products/export.html`,'FacturaCR_catalogo')}>Guardar PDF catálogo</button><button type="button" className="secondary" onClick={()=>catalogInput.current?.click()}>Seleccionar CSV</button></div>
 <input ref={catalogInput} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={selectCatalog}/>
 {catalogPreview&&<div className="catalogPreview"><strong>Vista previa: {catalogPreview.name} · {catalogPreview.rows.length} artículos</strong><div className="movementHistory"><table><thead><tr><th>Descripción</th><th>Código / SKU</th><th>Precio</th><th>Existencias</th></tr></thead><tbody>{catalogPreview.rows.slice(0,8).map((r,i)=><tr key={i}><td>{r.description}</td><td>{r.product_code}</td><td>{r.price}</td><td>{r.stock||0}</td></tr>)}</tbody></table></div><p className="hint">Se muestran los primeros 8 artículos. La importación es todo o nada: si una fila falla, no se guarda ninguna.</p><div className="actions"><button type="button" disabled={catalogBusy} onClick={importCatalog}>Confirmar importación</button><button type="button" className="secondary" onClick={()=>setCatalogPreview(null)}>Cancelar</button></div></div>}
 </div>}{tab==='products'&&<div className="catalogTools"><h4>Actualizar precios, existencias y CABYS desde CSV</h4>
 <p className="hint">Exporta el catálogo CSV anterior, edita en Excel las columnas de precio, existencias y/o CABYS y guárdalo como CSV. Se buscan artículos existentes por SKU o código de barras. No se crean productos ni se modifican los que falten en el archivo.</p>
 <div className="actions"><button type="button" className="secondary" onClick={()=>bulkInput.current?.click()} disabled={bulkBusy}>Seleccionar CSV para actualizar</button><label><input type="checkbox" checked={bulkPrice} onChange={e=>{setBulkPrice(e.target.checked);setBulkPreview(null)}}/> Actualizar precios</label><label><input type="checkbox" checked={bulkStock} onChange={e=>{setBulkStock(e.target.checked);setBulkPreview(null)}}/> Ajustar existencias</label><label><input type="checkbox" checked={bulkCabys} onChange={e=>{setBulkCabys(e.target.checked);setBulkPreview(null)}}/> Actualizar CABYS</label></div>
 <input ref={bulkInput} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={selectBulkFile}/>
 {bulkFile&&<div className="catalogPreview"><strong>{bulkFile.name} · {bulkFile.rows.length} filas</strong><p className="hint">La actualización es atómica: si hay errores, no se cambia ningún producto. Las existencias son el conteo final, no entradas adicionales. Se registran sus movimientos.</p><div className="actions"><button type="button" disabled={bulkBusy||(!bulkPrice&&!bulkStock&&!bulkCabys)} onClick={previewBulk}>Validar y mostrar cambios</button><button type="button" className="secondary" onClick={()=>{setBulkFile(null);setBulkPreview(null)}}>Cancelar</button></div></div>}
 {bulkPreview&&<div className="catalogPreview bulkPreview"><strong>Vista previa: {bulkPreview.changed} artículos cambian de {bulkPreview.rows.length}</strong><div className="bulkPreviewList">{bulkPreview.rows.slice(0,20).map(r=><div className="bulkPreviewItem" key={r.id}><div className="bulkProduct"><strong>{r.description}</strong><small>SKU / código: {r.product_code||r.barcode}</small></div><div className="bulkChanges">{bulkPreview.updatePrice&&<div><span>Precio</span><strong>{r.old_price} → {r.new_price}</strong></div>}{bulkPreview.updateStock&&<div><span>Existencias</span><strong>{r.old_stock} → {r.new_stock}</strong></div>}{bulkPreview.updateCabys&&<div><span>CABYS</span><strong className="bulkCabysValue">{r.old_cabys||'Sin código'} → {r.new_cabys}</strong></div>}</div></div>)}</div><p className="hint">Se muestran hasta 20 filas. Revisa el archivo antes de confirmar; cualquier error cancela el lote completo.</p><button type="button" disabled={bulkBusy||!bulkPreview.changed} onClick={applyBulk}>Confirmar actualización de {bulkPreview.changed} artículos</button></div>}
 </div>}{tab==='products'&&<div className="catalogTools"><h4>Exportar movimientos de inventario</h4><p className="hint">Incluye todo el historial, también de artículos eliminados. El archivo CSV conserva códigos y nombres con acentos.</p><div className="two"><Field title="Artículos incluidos"><select value={movementExportStatus} onChange={e=>setMovementExportStatus(e.target.value)}><option value="all">Activos y eliminados</option><option value="active">Solo activos</option><option value="deleted">Solo eliminados</option></select></Field><Field title="Orden de exportación"><select value={movementExportSort} onChange={e=>setMovementExportSort(e.target.value)}><option value="az">Artículo A–Z</option><option value="za">Artículo Z–A</option><option value="newest">Movimientos más recientes</option><option value="oldest">Movimientos más antiguos</option></select></Field></div><div className="actions"><button type="button" className="secondary" onClick={exportMovements}>Exportar movimientos CSV</button><button type="button" className="secondary" onClick={()=>exportPdfFromRoute(`/api/companies/${selected}/inventory/movements/export.html?status=${encodeURIComponent(movementExportStatus)}&sort=${encodeURIComponent(movementExportSort)}`,'FacturaCR_movimientos')}>Guardar movimientos PDF</button></div></div>}{tab==='products'&&<div className="inventoryDashboard"><div className="inventoryDashboardHead"><h4>Estado del inventario</h4><p className="hint">Solo productos con control de existencias. Las alertas de stock bajo respetan el mínimo configurado por artículo.</p></div><div className="inventoryFilterCards">
 <button type="button" className={'inventoryFilterCard '+(stockFilter==='all'?'inventoryFilterActive':'')} onClick={()=>setStockFilter('all')}><span>Todos</span><strong>{trackedProducts.length}</strong></button>
 <button type="button" className={'inventoryFilterCard inventoryDanger '+(stockFilter==='out'?'inventoryFilterActive':'')} onClick={()=>setStockFilter('out')}><span>Agotados</span><strong>{stockOut.length}</strong></button>
 <button type="button" className={'inventoryFilterCard inventoryWarning '+(stockFilter==='low'?'inventoryFilterActive':'')} onClick={()=>setStockFilter('low')}><span>Stock bajo</span><strong>{stockLow.length}</strong></button>
 <button type="button" className={'inventoryFilterCard '+(stockFilter==='normal'?'inventoryFilterActive':'')} onClick={()=>setStockFilter('normal')}><span>Disponibles</span><strong>{stockNormal.length}</strong></button>
 </div>{stockFilter!=='all'&&<div className="actions"><span className="hint">Filtro activo: {stockFilter==='out'?'agotados':stockFilter==='low'?'stock bajo':'disponibles'}</span><button type="button" className="secondary" onClick={()=>setStockFilter('all')}>Quitar filtro</button></div>}
 <section className="inventoryReplenishment" aria-label="Lista de reposición">
 <div className="inventoryReplenishmentHeading"><div><h4>Lista de reposición</h4><p className="hint">Prioriza agotados y artículos que llegaron al mínimo. Las cantidades son sugerencias, no compras automáticas.</p></div>
 <div className="actions"><button type="button" className="secondary" disabled={alertsBusy} onClick={refreshInventoryAlerts}>{alertsBusy?'Consultando…':'Actualizar alertas'}</button><button type="button" className="secondary" disabled={!inventoryAlerts?.rows?.length||alertsBusy} onClick={downloadInventoryAlerts}>Exportar reposición CSV</button><button type="button" className="secondary" disabled={!inventoryAlerts?.rows?.length||alertsBusy} onClick={()=>exportPdfFromRoute(`/api/companies/${selected}/inventory/alerts/export.html`,`FacturaCR_reposicion_empresa_${selected}`)}>Guardar reposición PDF</button></div></div>
 {inventoryAlerts&&<><div className="inventoryReplenishmentTotals"><div><small>Artículos por reponer</small><strong>{inventoryAlerts.summary.total}</strong></div><div><small>Agotados</small><strong>{inventoryAlerts.summary.out}</strong></div><div><small>Unidades sugeridas</small><strong>{inventoryAlerts.summary.suggestedUnits}</strong></div><div><small>Costo estimado conocido</small><strong>₡{Number(inventoryAlerts.summary.estimatedCostCRC).toLocaleString('es-CR',{maximumFractionDigits:2})}</strong></div></div>
 {inventoryAlerts.summary.missingCost>0&&<p className="hint">{inventoryAlerts.summary.missingCost} artículo(s) sin costo CRC válido; el costo total mostrado es parcial.</p>}
 {inventoryAlerts.rows.length===0?<p className="hint">No hay artículos con alertas habilitadas que requieran reposición.</p>:<div className="inventoryReplenishmentScroll"><table><thead><tr><th>Prioridad</th><th>Artículo</th><th>Existencias</th><th>Mínimo</th><th>Sugerido</th><th>Costo estimado</th></tr></thead><tbody>{inventoryAlerts.rows.map(r=><tr key={r.id}><td><span className={'inventoryAlertBadge '+(r.status==='agotado'?'inventoryAlertOut':'inventoryAlertLow')}>{r.status==='agotado'?'Agotado':'Stock bajo'}</span></td><td><strong>{r.description}</strong><small>{r.code||'Sin SKU'}</small></td><td>{r.stock}</td><td>{r.minimum}</td><td><strong>{r.suggested} {r.unit}</strong></td><td>{r.costKnown?'₡'+Number(r.estimatedCostCRC).toLocaleString('es-CR',{maximumFractionDigits:2}):'Sin costo válido'}</td></tr>)}</tbody></table></div>}</>}
 </section></div>}<Field title="Buscar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==='clients'?'Nombre e identificación':'Producto, código y SKU'}/></Field><Field title="Ordenar por"><select value={sortBy} onChange={e=>changeSort(e.target.value)}>
 <option value="az">Nombre A–Z</option><option value="za">Nombre Z–A</option>
 <option value="newest">Más recientes</option><option value="oldest">Más antiguos</option>
 {tab==='clients'?<option value="identification">Número de identificación</option>:<>
 <option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option>
 <option value="stock_asc">Existencias: menor a mayor</option><option value="stock_desc">Existencias: mayor a menor</option>
 </>}</select></Field><p className="hint">{filtered.length} registro(s) encontrados · Preferencia guardada por empresa y módulo.</p><div className="records">{filtered.length===0?<p>No hay registros.</p>:filtered.map(item=><article className="record" key={item.id}>
 {tab==='products'&&<div className="thumbWrap">{item.image_data?<img className="thumb" src={item.image_data} alt={`Foto de ${item.description}`}/>:<div className="thumb thumbEmpty">Sin foto</div>}</div>}
 <div className="recordcontent"><b>{tab==='clients'?item.name:item.description}</b><small>{tab==='clients'?`${item.identification} · ${item.email||'Sin correo'} · ${item.phone||'Sin teléfono'}`:`${item.product_code||'Sin SKU'} · ${item.currency} ${Number(item.price).toFixed(2)} · IVA ${item.tax_rate}% · ${item.kind}`}</small>
 {tab==='products'&&item.kind==='producto'&&Number(item.track_stock)===1&&<small className={Number(item.stock)<=0?'stockOut':Number(item.alert_enabled)===1&&Number(item.stock)<=Number(item.min_stock)?'low':''}>Existencias: {item.stock} {item.unit} · Mínimo: {item.min_stock} {Number(item.stock)<=0?'· AGOTADO':Number(item.alert_enabled)===1&&Number(item.stock)<=Number(item.min_stock)?'· STOCK BAJO':''}</small>}</div>
 <div className="actions">{tab==='products'&&item.kind==='producto'&&Number(item.track_stock)===1&&<button className="secondary" onClick={()=>openMovement(item)}>Movimientos</button>}<button className="secondary" onClick={()=>edit(item)}><UiIcon name="edit" size={14}/> Editar</button><button className="danger" onClick={()=>remove(item)}><UiIcon name="trash" size={14}/> Eliminar</button></div></article>)}</div></div></section>}
 {tab==='products'&&movementProduct&&<section className="card movementPanel"><h3>Entradas, salidas y ajustes · {items.find(p=>p.id===movementProduct)?.description||'Producto'}</h3>
 <form onSubmit={saveMovement}><div className="three"><Field title="Tipo de movimiento"><select value={moveForm.movement_type} onChange={e=>setMoveForm({...moveForm,movement_type:e.target.value,reason:e.target.value==='entrada'?'Compra':e.target.value==='salida'?'Venta':'Conteo físico'})}><option value="entrada">Entrada (sumar)</option><option value="salida">Salida (restar)</option><option value="ajuste">Ajuste (saldo final)</option></select></Field><Field title={moveForm.movement_type==='ajuste'?'Existencias finales (permite 0)':'Cantidad'}><input type="number" min={moveForm.movement_type==='ajuste'?'0':'1'} max="1000000000" step="1" required disabled={movementBusy} value={moveForm.quantity} onChange={e=>setMoveForm({...moveForm,quantity:e.target.value})}/></Field><Field title="Motivo"><input required minLength="5" maxLength="120" disabled={movementBusy} list="inventoryAdjustmentReasons" value={moveForm.reason} onChange={e=>setMoveForm({...moveForm,reason:e.target.value})}/><datalist id="inventoryAdjustmentReasons"><option value="Compra a proveedor"/><option value="Devolución de cliente"/><option value="Conteo físico"/><option value="Mercadería dañada"/><option value="Producto vencido"/><option value="Merma o pérdida"/><option value="Corrección de registro"/><option value="Devolución a proveedor"/></datalist></Field></div><Field title="Observaciones"><input maxLength="500" disabled={movementBusy} value={moveForm.notes} onChange={e=>setMoveForm({...moveForm,notes:e.target.value})} placeholder="Detalles o referencia del ajuste (opcional)"/></Field><div className="inventoryAdjustmentPreview">{(()=>{const product=items.find(p=>p.id===movementProduct);const before=Number(product?.stock||0),qty=Number(moveForm.quantity);const valid=moveForm.quantity!==''&&Number.isSafeInteger(qty)&&qty>=(moveForm.movement_type==='ajuste'?0:1);const after=valid?(moveForm.movement_type==='ajuste'?qty:before+(moveForm.movement_type==='entrada'?qty:-qty)):null;return <><strong>Vista previa del movimiento</strong><span>Existencias actuales: <b>{before}</b></span><span>Variación: <b>{after===null?'—':`${after-before>0?'+':''}${after-before}`}</b></span><span>Existencias finales: <b>{after===null?'—':after}</b></span>{after!==null&&after<0&&<small className="stockOut">No hay existencias suficientes.</small>}{after===before&&<small>Este movimiento no cambia el inventario.</small>}</>})()}</div><div className="actions"><button type="submit" disabled={movementBusy}>{movementBusy?'Registrando…':'Revisar y registrar movimiento'}</button><button type="button" className="secondary" disabled={movementBusy} onClick={()=>setMovementProduct(null)}>Cerrar</button></div></form>
 <h4>Historial de movimientos (últimos 300 registros)</h4><div className="movementFilters"><Field title="Tipo"><select value={movementTypeFilter} onChange={e=>setMovementTypeFilter(e.target.value)}><option value="all">Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option><option value="ajuste">Ajustes</option></select></Field><Field title="Desde"><input type="date" value={movementFrom} onChange={e=>setMovementFrom(e.target.value)} max={movementTo||undefined}/></Field><Field title="Hasta"><input type="date" value={movementTo} onChange={e=>setMovementTo(e.target.value)} min={movementFrom||undefined}/></Field></div><p className="hint">{filteredMovements.length} movimiento(s) visibles · Total de entradas: {filteredMovements.filter(m=>Number(m.delta)>0).reduce((sum,m)=>sum+Number(m.delta),0)} unidades · Total de salidas: {Math.abs(filteredMovements.filter(m=>Number(m.delta)<0).reduce((sum,m)=>sum+Number(m.delta),0))} unidades. Los ajustes se reflejan según su diferencia real.</p><div className="movementHistory"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cambio</th><th>Antes</th><th>Después</th><th>Motivo / observaciones</th></tr></thead><tbody>{filteredMovements.map(m=><tr key={m.id}><td>{m.created_at}</td><td>{m.movement_type}</td><td>{m.delta>0?'+':''}{m.delta}</td><td>{m.stock_before}</td><td>{m.stock_after}</td><td>{m.reason}{m.notes?<><br/><small>{m.notes}</small></>:null}</td></tr>)}{filteredMovements.length===0&&<tr><td colSpan="6">No hay movimientos para los filtros seleccionados.</td></tr>}</tbody></table></div></section>}
 <p className="warning">Versión de desarrollo: la eliminación de empresas está bloqueada hasta implementar autenticación. El catálogo territorial se carga desde una fuente pública y debe revisarse antes de emitir comprobantes; CABYS requiere verificación oficial. El inventario registra movimientos manuales y automáticos por ventas internas. No emite XML ni factura electrónica de Hacienda.</p>
 </main>{companyModalOpen&&<div className="companyModalOverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeCompanyModal()}}><section className="companyModal" role="dialog" aria-modal="true" aria-labelledby="company-modal-title" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeCompanyModal()}}}>
  <div className="companyModalHeader"><div><p className="companiesOverline">Perfiles independientes</p><h2 id="company-modal-title">{editingCompany?'Editar empresa':'Registrar nueva empresa'}</h2><p>Los datos comerciales se guardarán únicamente en este perfil.</p></div><button type="button" className="companyModalClose" aria-label="Cerrar ventana" onClick={closeCompanyModal} disabled={companySaving}><UiIcon name="close" size={19}/></button></div>
  <form className="companyModalForm" onSubmit={saveCompany}>
   {companyModalError&&<p className="companyModalError" role="alert">{companyModalError}</p>}
   <div className="companyModalFields"><Field title="Razón social o nombre de la empresa *"><input autoFocus required maxLength="160" placeholder="Ej. Comercial La Esperanza S.A." value={companyForm.legal_name} onChange={e=>setCompanyForm({...companyForm,legal_name:e.target.value})}/></Field>
   <div className="companyModalTwo"><Field title="Identificación *"><input required pattern="[0-9]{9,12}" maxLength="12" inputMode="numeric" placeholder="Cédula de 9 a 12 dígitos" value={companyForm.identification} onChange={e=>setCompanyForm({...companyForm,identification:e.target.value})}/></Field><Field title="Teléfono"><input maxLength="160" placeholder="8888-8888" value={companyForm.phone} onChange={e=>setCompanyForm({...companyForm,phone:e.target.value})}/></Field></div>
   <Field title="Nombre comercial"><input maxLength="160" placeholder="Nombre que verá en el punto de venta" value={companyForm.trade_name} onChange={e=>setCompanyForm({...companyForm,trade_name:e.target.value})}/></Field>
   <Field title="Correo electrónico"><input type="email" maxLength="300" placeholder="contabilidad@empresa.com" value={companyForm.email} onChange={e=>setCompanyForm({...companyForm,email:e.target.value})}/></Field>
   <Field title="Dirección comercial"><textarea rows="2" maxLength="300" placeholder="Ubicación de la empresa" value={companyForm.address} onChange={e=>setCompanyForm({...companyForm,address:e.target.value})}/></Field>
   <div className="companyModalTwo"><Field title="Sitio web"><input maxLength="300" placeholder="https://..." value={companyForm.website} onChange={e=>setCompanyForm({...companyForm,website:e.target.value})}/></Field><Field title="Redes sociales"><input maxLength="300" placeholder="Cuenta o enlace" value={companyForm.social} onChange={e=>setCompanyForm({...companyForm,social:e.target.value})}/></Field></div>
   <div className="companyColorArea"><div><strong className="companyColorHeading">Color de identificación</strong><p className="hint">Identifica visualmente tu empresa en las tarjetas y el menú lateral.</p><div className="companyColorChoices" role="group" aria-label="Color de identificación">{COMPANY_COLORS.map(color=><button key={color} type="button" aria-label={`Elegir color ${color}`} aria-pressed={companyForm.avatar_color===color} className={'companyColorOption '+(companyForm.avatar_color===color?'isActive':'')} style={{backgroundColor:color}} onClick={()=>setCompanyForm(prev=>({...prev,avatar_color:color}))}>{companyForm.avatar_color===color&&<UiIcon name="check" size={19}/>}</button>)}</div></div><div className="companyColorPreview"><small>Vista previa</small><div className="companyColorPreviewRow"><span className="companyColorPreviewAvatar" style={{background:`linear-gradient(180deg, ${companyForm.avatar_color||COMPANY_COLORS[0]}, ${companyForm.avatar_color||COMPANY_COLORS[0]})`}}>{(companyForm.trade_name||companyForm.legal_name||'E').charAt(0).toUpperCase()}</span><span><strong>{companyForm.trade_name||companyForm.legal_name||'Nombre de empresa'}</strong><small>{companyForm.identification||'Identificación'}</small></span></div></div></div><p className="companyModalInfo"><UiIcon name="shield" size={16}/> La información permanece en tu equipo. La identificación es obligatoria para registrar la empresa.</p></div>
   <div className="companyModalFooter"><button type="button" className="secondary" onClick={closeCompanyModal} disabled={companySaving}>Cancelar</button><button type="submit" disabled={companySaving}>{companySaving?'Guardando…':editingCompany?'Guardar cambios':'✓ Crear empresa'}</button></div>
  </form>
 </section></div>}{dialog&&<div className="dialogOverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeDialog()}}><section className="dialogCard" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeDialog()}}}>
  <div className={'dialogSymbol '+(dialog.kind==='success'?'dialogSymbolSuccess':dialog.kind==='error'?'dialogSymbolError':'')} aria-hidden="true">{dialog.kind==='error'?'!':dialog.danger?'!':'✓'}</div>
  <h3 id="dialog-title">{dialog.title}</h3><p id="dialog-description">{dialog.description}</p>
  <div className="dialogActions">{dialog.kind!=='success'&&dialog.kind!=='error'&&<button type="button" className="secondary" autoFocus onClick={closeDialog}>Cancelar</button>}<button type="button" autoFocus={dialog.kind==='success'||dialog.kind==='error'} className={dialog.danger?'danger':''} onClick={dialog.kind==='success'||dialog.kind==='error'?closeDialog:confirmDialog}>{dialog.confirmLabel||(dialog.kind==='success'||dialog.kind==='error'?'Aceptar':dialog.danger?'Eliminar':'Confirmar')}</button></div>
 </section></div>}</div>;
}

// Seguridad: las ventas en curso permanecen montadas debajo de la pantalla bloqueada.
function SecureApp(){
 const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [username,setUsername]=useState(''),[displayName,setDisplayName]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[newPassword,setNewPassword]=useState('');
 const [locked,setLocked]=useState(false),[minutes,setMinutes]=useState(15),[savedMinutes,setSavedMinutes]=useState(15),[settingsBusy,setSettingsBusy]=useState(false),[accountMenuOpen,setAccountMenuOpen]=useState(false),[securitySettingsOpen,setSecuritySettingsOpen]=useState(false);
 const [settingsFeedback,setSettingsFeedback]=useState(null);
 const sessionUser=state?.authenticated && state?.user ? state.user : null;
 const hasSession=!!sessionUser;
 useEffect(()=>{if(!settingsFeedback)return;const timer=setTimeout(()=>setSettingsFeedback(null),6000);return()=>clearTimeout(timer)},[settingsFeedback]);
 const activity=useRef(Date.now()),lastTouch=useRef(0);
 const lockNow=()=>{setAccountMenuOpen(false);setSecuritySettingsOpen(false);setSettingsFeedback(null);setLocked(true);setPassword('');void fetch('/api/auth/lock',{method:'POST'}).catch(()=>{});};
 const reload=async()=>{
  try{
   const r=await fetch('/api/auth/status',{cache:'no-store'});
   if(!r.ok)throw Error('No se pudo consultar la seguridad.');
   const v=await r.json();
   // El estado inicial o una sesión vencida pueden no incluir usuario.
   const authenticated=!!(v.authenticated&&v.user);
   setState({...v,authenticated});
   const currentMinutes=Number(v.idle_lock_minutes??15);
   setMinutes(currentMinutes);setSavedMinutes(currentMinutes);
   if(authenticated)setLocked(false);
   else {setLocked(false);setSecuritySettingsOpen(false);setAccountMenuOpen(false)}
   setError('');
  }catch(e){setError(e.message)}
 };
 useEffect(()=>{void reload()},[]);
 useEffect(()=>{
   if(!hasSession||locked)return;
   const onActivity=()=>{
     activity.current=Date.now();
     if(Date.now()-lastTouch.current>30000){lastTouch.current=Date.now();fetch('/api/auth/touch',{method:'POST'}).then(r=>{if(r.status===401){setLocked(true);setPassword('')}}).catch(()=>{});}
   };
   // Solo el valor confirmado por SQLite rige el tiempo, no una selección pendiente.
   const monitor=()=>{if(savedMinutes>0&&Date.now()-activity.current>=savedMinutes*60000)lockNow()};
   for(const event of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(event,onActivity,{passive:true});
   const timer=setInterval(monitor,3000);
   return()=>{clearInterval(timer);for(const event of ['pointerdown','keydown','wheel','touchstart'])window.removeEventListener(event,onActivity)};
 },[hasSession,locked,savedMinutes]);
 // Cuando cualquier usuario cambia el tiempo global, las otras sesiones lo adoptan sin reiniciar.
 useEffect(()=>{
  if(!hasSession||locked)return;
  let cancelled=false;
  const sync=async()=>{
   try{
    const response=await fetch('/api/auth/status',{cache:'no-store'});
    if(!response.ok)return;
    const current=await response.json();
    if(cancelled)return;
    if(!current.authenticated||!current.user){lockNow();return;}
    const globalMinutes=Number(current.idle_lock_minutes);
    if(![0,5,15,30,60].includes(globalMinutes))return;
    setSavedMinutes(globalMinutes);
    if(!securitySettingsOpen||minutes===savedMinutes)setMinutes(globalMinutes);
   }catch{/* Sin conexión: volverá a comprobarse; no se informa guardado. */}
  };
  const timer=setInterval(sync,15000);
  return()=>{cancelled=true;clearInterval(timer)};
 },[hasSession,locked,securitySettingsOpen,minutes,savedMinutes]);
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
    if(state?.setupRequired&&password!==confirm)throw Error('Las contraseñas no coinciden.');
    if(state?.setupRequired){await api('/api/auth/setup',{method:'POST',body:JSON.stringify({username,displayName,password})});}
    const loginUsername=locked && sessionUser?.username ? sessionUser.username : username;
    const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username:loginUsername,password})});
    setPassword('');setConfirm('');setAccountMenuOpen(false);setUsername(result.user.username);activity.current=Date.now();lastTouch.current=Date.now();
    await reload();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const logout=async()=>{try{await fetch('/api/auth/logout',{method:'POST'});}finally{setLocked(false);setPassword('');setSecuritySettingsOpen(false);setAccountMenuOpen(false);setSettingsFeedback(null);setState(null);await reload();}};
 const saveMinutes=async()=>{
  if(!hasSession||sessionUser?.passwordChangeRequired||settingsBusy)return;
  setSettingsBusy(true);setSettingsFeedback(null);
  try{
   const saved=await api('/api/auth/settings',{method:'PUT',body:JSON.stringify({idle_lock_minutes:Number(minutes)})});
   const confirmed=Number(saved.idle_lock_minutes);
   if(!Number.isFinite(confirmed)||confirmed!==Number(minutes))throw Error('El servidor no confirmó el tiempo seleccionado.');
   setMinutes(confirmed);setSavedMinutes(confirmed);activity.current=Date.now();
   setSettingsFeedback({type:'success',message:`Configuración guardada: ${confirmed?confirmed+' minutos de inactividad':'bloqueo automático desactivado'} para todos los usuarios.`});
  }catch(e){setSettingsFeedback({type:'error',message:'No se guardaron los cambios: '+e.message})}
  finally{setSettingsBusy(false)}
 };
 const changeTemporaryPassword=async e=>{
   e.preventDefault();setBusy(true);setError('');
   try{if(newPassword!==confirm)throw Error('Las contraseñas no coinciden.');await api('/api/auth/password-change',{method:'POST',body:JSON.stringify({oldPassword:password,newPassword})});setPassword('');setNewPassword('');setConfirm('');await reload();}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const needsGate=!state||!!state.setupRequired||!hasSession||locked||!!sessionUser?.passwordChangeRequired;
 return <div className="secureRoot">
  {hasSession&&<div className="sessionBar"><div className="sessionIdentity"><div className="sessionAvatar"><UiIcon name="shield" size={18}/></div><div><small>Sesión activa</small><strong>{sessionUser.displayName}</strong><span>{sessionUser.isOwner?'Propietario de instalación':'Usuario autorizado'}</span></div></div><div className="sessionTools"><span className="sessionState"><span className="sessionLiveDot"/> Conectado</span><div className="sessionMenuWrap"><button type="button" className="sessionMenuButton" aria-expanded={accountMenuOpen} onClick={()=>setAccountMenuOpen(v=>!v)}><UiIcon name="users" size={17}/> Mi sesión <UiIcon name="chevron" size={15}/></button>{accountMenuOpen&&<div className="sessionMenu"><div className="sessionMenuHeading">{sessionUser.username}<small>Acceso protegido</small></div><button type="button" onClick={lockNow}><UiIcon name="lock" size={17}/> Bloquear ahora</button><button type="button" onClick={()=>{setMinutes(savedMinutes);setSettingsFeedback(null);setSecuritySettingsOpen(v=>!v);setAccountMenuOpen(false)}}><UiIcon name="settings" size={17}/> Seguridad y bloqueo</button><button type="button" className="menuLogout" onClick={logout}><UiIcon name="logout" size={17}/> Cerrar sesión</button></div>}</div></div></div>}
  {hasSession&&securitySettingsOpen&&!sessionUser.passwordChangeRequired&&(
   <section className="securitySettingsPanel" aria-label="Seguridad y bloqueo">
    <div className="securitySettingsInner">
     <div className="securitySettingsIntro">
      <span className="securitySettingsIcon" aria-hidden="true"><UiIcon name="clock" size={20}/></span>
      <div className="securitySettingsCopy">
       <strong>Bloqueo automático para todos</strong>
       <p>Todos los usuarios pueden modificar el tiempo de inactividad. El cambio se aplica a todas las sesiones y queda registrado.</p>
       <small className={minutes!==savedMinutes?'securityPending':'securityCurrent'} role="status">
        {minutes!==savedMinutes?'Hay cambios sin guardar.':`Tiempo actual: ${savedMinutes?savedMinutes+' minutos':'desactivado'}.`}
       </small>
      </div>
     </div>
     <div className="securitySettingsControls">
      <label htmlFor="global-idle-lock-minutes">Tiempo para todos los usuarios
       <select id="global-idle-lock-minutes" aria-label="Tiempo de bloqueo de sesión para todos los usuarios" value={minutes} disabled={settingsBusy} onChange={e=>{setMinutes(Number(e.target.value));setSettingsFeedback(null)}}>
        {[5,15,30,60,0].map(n=><option key={n} value={n}>{n?n+' minutos':'Desactivado (no recomendado)'}</option>)}
       </select>
      </label>
      <div className="securitySettingsActions">
       <button type="button" onClick={saveMinutes} disabled={settingsBusy||minutes===savedMinutes}>{settingsBusy?'Guardando…':'Guardar configuración'}</button>
       <button type="button" className="secondary" onClick={()=>{setMinutes(savedMinutes);setSecuritySettingsOpen(false)}} disabled={settingsBusy}>Cerrar</button>
      </div>
     </div>
    </div>
   </section>
  )}
   {settingsFeedback&&<div className={'securitySaveToast '+(settingsFeedback.type==='error'?'securitySaveToastError':'securitySaveToastSuccess')} role={settingsFeedback.type==='error'?'alert':'status'} aria-live={settingsFeedback.type==='error'?'assertive':'polite'}><UiIcon name={settingsFeedback.type==='error'?'close':'check'} size={18}/><span>{settingsFeedback.message}</span><button type="button" onClick={()=>setSettingsFeedback(null)} aria-label="Cerrar notificación"><UiIcon name="close" size={15}/></button></div>}
  {hasSession&&!sessionUser.passwordChangeRequired&&<div aria-hidden={locked} className={locked?'securityCovered':''}><App key={sessionUser.id} account={sessionUser}/></div>}
  {needsGate&&<div className="authOverlay"><section className="authPanel" aria-label="Acceso seguro a FacturaCR"><div className="authBrand">◈ FACTURACR <span>v{APP_VERSION}</span></div><h1>{!state?'Conectando…':state.setupRequired?'Configurar propietario':locked?'Sesión bloqueada':sessionUser?.passwordChangeRequired?'Cambiar contraseña temporal':'Iniciar sesión'}</h1><p>{state?.setupRequired?'Esta cuenta tendrá control de todas las empresas existentes. No hay contraseñas de desarrollador.':locked?'Tu venta y el carrito permanecen abiertos. Ingresa tu contraseña para continuar.':sessionUser?.passwordChangeRequired?'Por seguridad, debes establecer una contraseña personal antes de usar FacturaCR.':'Accede a las empresas y operaciones autorizadas.'}</p>
   {hasSession&&sessionUser?.passwordChangeRequired&&!locked&&<form onSubmit={changeTemporaryPassword}><label>Contraseña temporal<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Nueva contraseña personal<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Confirmar nueva contraseña<input type="password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="authError" role="alert">{error}</p>}<button disabled={busy}>Guardar contraseña personal</button></form>}
   {state&&(!hasSession||locked)&&<form onSubmit={submit}>
    {(!locked||!sessionUser)&&<label>Usuario<input autoComplete="username" required minLength={3} maxLength={80} value={username} onChange={e=>setUsername(e.target.value)} placeholder="usuario"/></label>}
    {state.setupRequired&&<label>Nombre del propietario<input required minLength={2} maxLength={160} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nombre completo"/></label>}
    {locked&&sessionUser&&<label>Cuenta<input readOnly value={sessionUser.username}/></label>}
    <label>Contraseña<input required autoFocus type="password" autoComplete={state.setupRequired?'new-password':'current-password'} minLength={state.setupRequired?12:1} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {state.setupRequired&&<label>Confirmar contraseña<input required type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
    {state.setupRequired&&<small>Usa 12 caracteres como mínimo, letras y números. Guarda estas credenciales en un lugar seguro.</small>}
    {error&&<p className="authError" role="alert">{error}</p>}
    <button disabled={busy} type="submit">{busy?'Comprobando…':state.setupRequired?'Crear propietario y entrar':locked?'Desbloquear':'Entrar a FacturaCR'}</button>
   </form>}
   {!state&&error&&<p className="authError">{error} <button onClick={reload}>Reintentar</button></p>}
   <footer>Protegido en este equipo · Los datos permanecen locales</footer>
  </section></div>}
 </div>
}

createRoot(document.getElementById('root')).render(<ScreenErrorBoundary><SecureApp/></ScreenErrorBoundary>);
