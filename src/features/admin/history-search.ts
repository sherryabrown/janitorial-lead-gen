export const historyDefaults={schedule:'',run:'',target:'',geography:'',origin:'',outcome:'',from:'',through:''};
export type HistoryFilters=typeof historyDefaults;
export const chicagoDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function initialHistoryFilters():HistoryFilters{const today=chicagoDate();return {...historyDefaults,from:today,through:today};}
export function historyDateError(filters:HistoryFilters){
 for(const value of [filters.from,filters.through]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)return 'Choose valid From and Through dates.';
 }
 return filters.from>filters.through?'From must be on or before Through.':'';
}
const filters=(value:unknown):HistoryFilters|null=>{
 if(!value||typeof value!=='object')return null;
 const record=value as Record<string,unknown>;
 if(Object.keys(historyDefaults).some(k=>typeof record[k]!=='string'||(record[k] as string).length>100))return null;
 return Object.fromEntries(Object.keys(historyDefaults).map(k=>[k,record[k]])) as HistoryFilters;
};
export function readHistorySearch(key?:string){
 const empty={draft:initialHistoryFilters(),applied:null as HistoryFilters|null,loaded:50};
 if(!key)return empty;
 try{
  const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(saved?.version!==1)return empty;
  const draft=filters(saved.draft),applied=filters(saved.applied);
  return {draft:draft??empty.draft,applied:applied&&!historyDateError(applied)?applied:null,loaded:Number.isInteger(saved.loaded)&&saved.loaded>=50&&saved.loaded<=5000?saved.loaded:50};
 }catch{return empty;}
}
export function saveHistorySearch(key:string|undefined,draft:HistoryFilters,applied:HistoryFilters|null,loaded:number){
 if(key)try{sessionStorage.setItem(key,JSON.stringify({version:1,draft,applied,loaded}));}catch{/* Mounted search remains usable without storage. */}
}
