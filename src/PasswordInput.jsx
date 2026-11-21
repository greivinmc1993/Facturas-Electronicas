import React,{useEffect,useState} from 'react';

// Visualización temporal de contraseñas: oculta por defecto y limitada al campo actual.
// No modifica la contraseña, no la persiste y jamás la registra en consola.
export default function PasswordInput({disabled=false,...props}){
 const [visible,setVisible]=useState(false);
 // Al borrar el valor o deshabilitar el campo, nunca queda visible para la siguiente captura.
 useEffect(()=>{if(disabled||!props.value)setVisible(false)},[disabled,props.value]);
 return <span className="passwordInputControl">
  <input {...props} disabled={disabled} type={visible&&!disabled?'text':'password'} />
  <button type="button" className="passwordInputToggle" disabled={disabled}
    onClick={()=>setVisible(value=>!value)}
    aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'}
    aria-pressed={visible} title={visible?'Ocultar contraseña':'Mostrar contraseña'}>
   {visible?'Ocultar':'Mostrar'}
  </button>
 </span>;
}
