import React,{useEffect,useState} from 'react';
import {useConfirm} from './ConfirmProvider.jsx';
const request=async(url,options={})=>{const r=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});const j=await r.json();if(!r.ok)throw Error(j.error||'Operación fallida');return j};
const roleName={company_admin:'Administrador',supervisor:'Supervisor',cashier:'Cajero'};
export default function UsersPanel({account}){
 const confirmAction=useConfirm();
 const isOwner=!!account?.isOwner;
 const [users,setUsers]=useState([]),[companies,setCompanies]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({username:'',displayName:'',password:'',companyId:'',role:'cashier'});
 const [deleteUser,setDeleteUser]=useState(null),[deleteConfirm,setDeleteConfirm]=useState(''),[deletePassword,setDeletePassword]=useState('');
 const load=async()=>{const [u,c]=await Promise.all([request('/api/auth/users'),request('/api/companies')]);setUsers(u);setCompanies(c)};
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 const adminCompanies=isOwner?companies:companies.filter(c=>account?.companies?.some(a=>a.company_id===c.id&&a.role==='company_admin'));
 const delegated=account?.delegatedCashierCompanies||[];
 const allowedCompanies=isOwner?companies:companies.filter(c=>adminCompanies.some(a=>a.id===c.id)||delegated.includes(c.id));
 const action=async(fn)=>{setBusy(true);setError('');setMessage('');try{await fn();await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const create=e=>{e.preventDefault();action(async()=>{await request('/api/auth/users',{method:'POST',body:JSON.stringify({...form,companyId:Number(form.companyId)})});setForm({username:'',displayName:'',password:'',companyId:'',role:'cashier'});setMessage('Usuario creado. En el primer ingreso deberá cambiar la contraseña temporal.')})};
 const update=(u,body)=>action(async()=>{await request('/api/auth/users/'+u.id,{method:'PUT',body:JSON.stringify(body)});setMessage('Cambios guardados correctamente.')});
 const revoke=async(u,c)=>{if(!await confirmAction(`La cuenta @${u.username} perderá el acceso a esta empresa y se cerrarán sus sesiones.`,{title:'Retirar acceso a empresa',confirmLabel:'Quitar acceso',danger:true}))return;action(async()=>{await request(`/api/auth/users/${u.id}/companies/${c.company_id}`,{method:'DELETE'});setMessage('Acceso retirado; sesiones anteriores cerradas.')})};
 const canAdminister=u=>isOwner||u.companies.length>0&&u.companies.every(c=>c.role!=='company_admin'&&adminCompanies.some(a=>a.id===c.company_id));
 const canSuspend=u=>canAdminister(u)||u.companies.length>0&&u.companies.every(c=>c.role==='cashier'&&delegated.includes(c.company_id));
 const applyDelete=e=>{e.preventDefault();if(!deleteUser)return;action(async()=>{await request('/api/auth/users/'+deleteUser.id,{method:'DELETE',body:JSON.stringify({confirmation:deleteConfirm,currentPassword:deletePassword})});setMessage('Perfil eliminado de la lista activa. Sus ventas y auditoría permanecen registradas.');setDeleteUser(null);setDeleteConfirm('');setDeletePassword('')})};
 const delegate=(u,c,allow)=>action(async()=>{await request(`/api/auth/users/${u.id}/delegation`,{method:'PUT',body:JSON.stringify({companyId:c.company_id,allowed:allow})});setMessage(allow?'Delegación concedida. El supervisor debe iniciar sesión de nuevo.':'Delegación revocada. Se cerraron sus sesiones anteriores.')});
 const companyName=id=>{const c=companies.find(x=>x.id===id);return c?.trade_name||c?.legal_name||`Empresa ${id}`};
 const delegationOf=(u,c)=>Boolean(c.cashierDelegation);
 return <div className="usersWorkspace"><section className="card"><h3>Usuarios y permisos</h3><p className="hint">El propietario gestiona todos los usuarios; el administrador puede eliminar perfiles subordinados de sus empresas y los supervisores autorizados pueden crear o administrar cajeros, sin aumentar sus privilegios. Eliminar un perfil no borra su historial comercial.</p>
 {error&&<p className="authError" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 <div className="usersGrid"><form className="userEditor" onSubmit={create}><h4>Crear usuario</h4><small>Contraseña temporal de al menos 12 caracteres con letras y números. El primer ingreso exige cambiarla.</small>
 <label>Usuario<input required minLength={3} maxLength={80} autoComplete="off" value={form.username} onChange={e=>setForm(v=>({...v,username:e.target.value}))}/></label>
 <label>Nombre visible<input required minLength={2} maxLength={160} value={form.displayName} onChange={e=>setForm(v=>({...v,displayName:e.target.value}))}/></label>
 <label>Contraseña temporal<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={e=>setForm(v=>({...v,password:e.target.value}))}/></label>
 <label>Empresa<select required value={form.companyId} onChange={e=>setForm(v=>({...v,companyId:e.target.value,role:adminCompanies.some(c=>c.id===Number(e.target.value))?v.role:'cashier'}))}><option value="">Seleccionar empresa</option>{allowedCompanies.map(c=><option key={c.id} value={c.id}>{companyName(c.id)}</option>)}</select></label>
 <label>Rol<select value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))}><option value="cashier">Cajero</option>{adminCompanies.some(c=>c.id===Number(form.companyId))&&<option value="supervisor">Supervisor</option>}{isOwner&&<option value="company_admin">Administrador de empresa</option>}</select></label>
 <button disabled={busy||!allowedCompanies.length}>Crear usuario</button></form>
 <div className="userList"><h4>Cuentas registradas</h4>{users.map(u=><article className="userCard" key={u.id}>
 <div><strong>{u.display_name}</strong><small>@{u.username} · {u.is_owner?'Propietario':u.companies.map(c=>`${companyName(c.company_id)}: ${roleName[c.role]||c.role}`).join(' · ')||'Sin empresa'}</small></div>
 <span className={u.is_active?'userActive':'userInactive'}>{u.is_active?'Activo':'Suspendido'}</span>
 {!u.is_owner&&<div className="userAssignedCompanies">{u.companies.map(c=><div key={c.company_id}><span>{companyName(c.company_id)} · {roleName[c.role]}</span>{canAdminister(u)&&<button type="button" className="secondary" disabled={busy} onClick={()=>revoke(u,c)}>Quitar acceso</button>}{isOwner&&c.role==='supervisor'&&<button type="button" className="secondary" disabled={busy} onClick={()=>delegate(u,c,!delegationOf(u,c))}>{delegationOf(u,c)?'Revocar administración de cajeros':'Permitir administrar cajeros'}</button>}</div>)}</div>}
 {!u.is_owner&&<div className="actions">{canSuspend(u)&&<button type="button" className="secondary" disabled={busy} onClick={()=>update(u,{isActive:!u.is_active})}>{u.is_active?'Suspender':'Reactivar'}</button>}
 {canAdminister(u)&&<select aria-label={'Asignar rol de '+u.username} defaultValue="" onChange={e=>{const [companyId,role]=e.target.value.split(':');if(companyId&&role)update(u,{companyId:Number(companyId),role});e.target.value=''}}><option value="">Asignar rol…</option>{adminCompanies.flatMap(c=>(isOwner?[['cashier','Cajero'],['supervisor','Supervisor'],['company_admin','Administrador']]:[['cashier','Cajero'],['supervisor','Supervisor']]).map(([r,label])=><option key={c.id+r} value={`${c.id}:${r}`}>{companyName(c.id)} · {label}</option>))}</select>}
 {canAdminister(u)&&<button type="button" className="danger" disabled={busy} onClick={()=>{setDeleteUser(u);setDeleteConfirm('');setDeletePassword('')}}>Eliminar perfil</button>}</div>}</article>)}
 </div></div></section>
 {deleteUser&&<div className="accountDeleteBackdrop" role="presentation"><form className="accountDeleteDialog" onSubmit={applyDelete} role="dialog" aria-modal="true" aria-labelledby="delete-account-title"><h3 id="delete-account-title">Eliminar perfil de {deleteUser.display_name}</h3><p>Se bloqueará la cuenta y desaparecerá de los perfiles activos. <strong>Las ventas, movimientos y la auditoría se conservarán.</strong> Esta acción no permite borrar al propietario.</p>
 <label>Escribe exactamente <strong>{deleteUser.username}</strong><input autoFocus required value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)}/></label>
 <label>Tu contraseña actual<input type="password" required autoComplete="current-password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)}/></label>
 <div className="actions"><button type="button" className="secondary" onClick={()=>{setDeleteUser(null);setDeletePassword('')}}>Cancelar</button><button type="submit" className="danger" disabled={busy||deleteConfirm!==deleteUser.username||!deletePassword}>Confirmar eliminación</button></div></form></div>}
 </div>
}
