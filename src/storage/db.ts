import {openDB} from 'idb';
import {sessionSchema,type Session} from '../domain/types';
const db=()=>openDB('cadence-fit',1,{upgrade(d){d.createObjectStore('sessions',{keyPath:'id'});d.createObjectStore('videos');}});
export async function saveSession(s:Session){const d=await db();await d.put('sessions',sessionSchema.parse(s));}
export async function loadSessions():Promise<Session[]>{const d=await db();const records=await d.getAll('sessions');return records.map(r=>sessionSchema.parse(r)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function deleteSession(s:Session){const d=await db(),tx=d.transaction(['sessions','videos'],'readwrite');await tx.objectStore('sessions').delete(s.id);for(const c of s.clips)await tx.objectStore('videos').delete(c.id);await tx.done;}
export async function saveVideo(id:string,file:File){await(await db()).put('videos',file,id);}
export async function loadVideo(id:string):Promise<File|undefined>{return (await db()).get('videos',id);}
export async function deleteVideo(id:string){await(await db()).delete('videos',id);}
