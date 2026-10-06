import{writeFileSync,readFileSync,mkdirSync}from'node:fs';
import{execFileSync}from'node:child_process';
const dir='outputs/sam-search/deadline-check-20261006';mkdirSync(dir,{recursive:true});
const queries=[{ncode:'561720',state:'AR'},{title:'janitorial',state:'AR'},{title:'custodial',state:'AR'},{title:'cleaning',state:'AR'},{title:'housekeeping',state:'AR'},{ncode:'561720',title:'Arkansas'}];
const captures=[];
for(let i=0;i<queries.length;i++){
 for(let offset=0;offset<10;offset++){
  const filters={postedFrom:'10/07/2025',postedTo:'10/06/2026',...queries[i],limit:1000,offset};
  const path=dir+'/filters-'+i+'-'+offset+'.json';writeFileSync(path,JSON.stringify(filters));
  let receipt;
  try{receipt=JSON.parse(execFileSync(process.execPath,['scripts/sam-search.mjs','opportunities','@'+path],{encoding:'utf8',windowsHide:true,timeout:110000}));}
  catch(error){console.log(error.stdout?.toString()??'Invocation failed; inspect audit before retry.');writeFileSync(dir+'/receipts.json',JSON.stringify(captures,null,2));process.exitCode=1;break;}
  captures.push(receipt);writeFileSync(dir+'/receipts.json',JSON.stringify(captures,null,2));console.log(JSON.stringify(receipt));
  if(receipt.complete_for_query)break;
 }
 if(process.exitCode)break;
}
const notices=new Map();
for(const r of captures){const c=JSON.parse(readFileSync(r.file));for(const n of c.response?.opportunitiesData??[])notices.set(n.noticeId,n);}
const rows=[...notices.values()].map(n=>({id:n.noticeId,title:n.title,type:n.type,active:n.active,posted:n.postedDate,deadline:n.responseDeadLine??n.reponseDeadLine,place:n.placeOfPerformance,solicitation:n.solicitationNumber,url:n.uiLink,resourceLinks:n.resourceLinks}));
writeFileSync(dir+'/notices.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify({distinct_notices:rows.length,deadline_matches:rows.filter(n=>{let d=n.deadline?.slice(0,10);return d&&d>='2026-10-06'&&d<='2027-10-06';})},null,2));
