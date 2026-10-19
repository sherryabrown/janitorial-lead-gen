const zone='America/Chicago';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(value) {
  return Object.fromEntries(formatter.formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
const wall=p=>Date.UTC(p.year,p.month-1,p.day,p.hour??0,p.minute??0);
const stamp=p=>`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
export const localDate=value=>stamp(parts(value));
export function validateRecurrence(input) {
  if(input?.timezone!==zone||!['daily','weekly','monthly'].includes(input.frequency))throw Error('Choose Daily, Weekly or Monthly in America/Chicago');
  if(!Array.isArray(input.local_times)||!input.local_times.length||input.local_times.length>24||
    input.local_times.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||new Set(input.local_times).size!==input.local_times.length)
    throw Error('Choose 1–24 unique local times');
  if(input.frequency!=='daily'&&input.local_times.length!==1)throw Error('Weekly and monthly schedules use one time');
  let weekdays=[],month_day=null;
  if(input.frequency==='weekly') {
    if(!Array.isArray(input.weekdays)||!input.weekdays.length||new Set(input.weekdays).size!==input.weekdays.length||
      input.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||input.month_day!=null)throw Error('Choose unique weekdays, Sunday 0 through Saturday 6');
    weekdays=[...input.weekdays].sort();
  }else if(input.weekdays?.length)throw Error('Weekdays apply only to weekly schedules');
  if(input.frequency==='monthly') {
    if(!Number.isInteger(input.month_day)||input.month_day<1||input.month_day>31)throw Error('Choose a monthly date from 1 to 31');
    month_day=input.month_day;
  }else if(input.month_day!=null)throw Error('Monthly date applies only to monthly schedules');
  return {timezone:zone,frequency:input.frequency,local_times:[...input.local_times].sort(),weekdays,month_day};
}
// Use the platform timezone database. Pick the first fold instant; gaps advance to the first valid local minute.
function instant(date,time) {
  const [hour,minute]=time.split(':').map(Number),base=Date.UTC(date.year,date.month-1,date.day,hour,minute);
  const offsets=new Set([-36,0,36].map(h=>{const utc=base+h*3600000;return wall(parts(utc))-utc;}));
  for(let gap=0;gap<=180;gap++) {
    const desired=base+gap*60000;
    const matches=[...offsets].map(offset=>desired-offset).filter(utc=>wall(parts(utc))===desired);
    if(matches.length)return Math.min(...matches);
  }
  throw Error('Local schedule time could not resolve');
}
function matchesDay(recurrence,date) {
  const utc=new Date(Date.UTC(date.year,date.month-1,date.day));
  if(recurrence.frequency==='weekly')return recurrence.weekdays.includes(utc.getUTCDay());
  if(recurrence.frequency==='monthly')return date.day===Math.min(recurrence.month_day,new Date(Date.UTC(date.year,date.month,0)).getUTCDate());
  return true;
}
function occurrence(input,value,direction) {
  const recurrence=validateRecurrence(input),at=new Date(value).getTime();
  if(!Number.isFinite(at))throw Error('Valid occurrence timestamp required');
  const start=parts(at),day=Date.UTC(start.year,start.month-1,start.day);
  for(let n=0;n<370;n++) {
    const d=new Date(day+direction*n*86400000),date={year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
    if(!matchesDay(recurrence,date))continue;
    const choices=[...new Set(recurrence.local_times.map(t=>instant(date,t)))].sort((a,b)=>direction*(a-b));
    const result=choices.find(t=>direction===1?t>at:t<=at);
    if(result!==undefined)return new Date(result).toISOString();
  }
  throw Error('No bounded recurrence found');
}
export const nextOccurrence=(input,after)=>occurrence(input,after,1);
export const latestOccurrence=(input,at)=>occurrence(input,at,-1);
export function rollingWindows(policy,categories,at) {
  const day=localDate(at),base=Date.parse(day+'T00:00:00Z');
  return Object.fromEntries(categories.map(category=>{
    const rule=policy?.[category];
    if(!rule||!Number.isInteger(rule.from_offset_days)||!Number.isInteger(rule.to_offset_days)||
      rule.from_offset_days < -366||rule.to_offset_days>1096||rule.from_offset_days>rule.to_offset_days)
      throw Error('Choose bounded rolling category windows');
    return [category,{from:new Date(base+rule.from_offset_days*86400000).toISOString().slice(0,10),
      to:new Date(base+rule.to_offset_days*86400000).toISOString().slice(0,10),date_basis:rule.date_basis}];
  }));
}
