import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';

// Confirmaciones de la aplicación: nunca usar el cuadro genérico del navegador.
// Un Promise<boolean> mantiene el flujo original de las operaciones sensibles.
const ConfirmContext=createContext(null);
export function useConfirm(){
 const confirm=useContext(ConfirmContext);
 if(!confirm)throw Error('La confirmación requiere el proveedor visual de FacturaCR.');
 return confirm;
}
export function ConfirmProvider({children}){
 const [request,setRequest]=useState(null);
 const pending=useRef(null),origin=useRef(null),dialog=useRef(null),cancel=useRef(null);
 const confirm=useCallback((description,{title='Confirmar operación',confirmLabel='Continuar',danger=false}={})=>{
  if(pending.current)return Promise.resolve(false);
  origin.current=document.activeElement;
  return new Promise(resolve=>{
   pending.current=resolve;
   setRequest({title,description:String(description??''),confirmLabel,danger});
  });
 },[]);
 const settle=useCallback(value=>{
  const resolve=pending.current;
  if(!resolve)return;
  pending.current=null;setRequest(null);
  resolve(Boolean(value));
  requestAnimationFrame(()=>origin.current?.isConnected&&origin.current?.focus?.());
 },[]);
 useEffect(()=>{
  if(!request)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  cancel.current?.focus();
  const keydown=e=>{
   if(e.key==='Escape'){e.preventDefault();settle(false)}
   if(e.key!=='Tab'||!dialog.current)return;
   const focusables=[...dialog.current.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
   if(!focusables.length)return;
   const first=focusables[0],last=focusables.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=previousOverflow};
 },[request,settle]);
 useEffect(()=>()=>{if(pending.current){pending.current(false);pending.current=null}},[]);
 return <ConfirmContext.Provider value={confirm}>
  {children}
  {request&&<div className="fcrOverlay fcrConfirmOverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)settle(false)}}>
   <section className="fcrModal fcrConfirmModal" ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="fcr-confirm-title" aria-describedby="fcr-confirm-description">
    <div className={'fcrModalIcon'+(request.danger?' fcrModalIconDanger':'')} aria-hidden="true">{request.danger?'!':'✓'}</div>
    <h3 id="fcr-confirm-title">{request.title}</h3>
    <p id="fcr-confirm-description">{request.description}</p>
    <div className="fcrModalActions"><button type="button" className="secondary" ref={cancel} onClick={()=>settle(false)}>Cancelar</button><button type="button" className={request.danger?'danger':''} onClick={()=>settle(true)}>{request.confirmLabel}</button></div>
   </section>
  </div>}
 </ConfirmContext.Provider>;
}
