import React from 'react';

/** Notificación transitoria: el cierre solo limpia su estado de presentación. */
export default function DismissibleNotice({children,onClose,variant='info',className=''}){
 const role=variant==='error'?'alert':'status';
 return <div className={`dismissibleNotice dismissibleNotice-${variant} ${className}`} role={role}>
   <span className="dismissibleNoticeText">{children}</span>
   <button type="button" className="dismissibleNoticeClose" aria-label="Cerrar notificación" title="Cerrar notificación" onClick={onClose}>×</button>
 </div>;
}
