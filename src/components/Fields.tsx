import type {ReactNode} from 'react';
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="check"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>;}
export function Notice({children,tone='neutral'}:{children:ReactNode;tone?:string}){return <div className={'notice '+tone}>{children}</div>;}
