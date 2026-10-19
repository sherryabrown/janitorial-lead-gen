import {localDate} from './schedule-recurrence.mjs';

export function samRequest(input) {
  if(!['opportunity','award'].includes(input?.category))throw Error('Separate opportunity/award SAM request required; forecasts use agency sources');
  const window=input.publication_window;
  const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!valid(window?.from)||!valid(window?.to)||window.from>window.to)throw Error('Explicit bounded SAM publication/modification window required');
  // Application safety bound for both categories; GSA opportunities also cap posted dates at one year.
  if(Date.parse(window.to)-Date.parse(window.from)>365*86400000)throw Error('SAM date window must not exceed 365 days');
  const date=d=>`${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(0,4)}`;
  const filters=input.category==='opportunity'?{postedFrom:date(window.from),postedTo:date(window.to),state:'AR',ncode:'561720',limit:100,offset:0}:
    {lastModifiedDate:`[${date(window.from)},${date(window.to)}]`,placeOfPerformStateCode:'AR',naicsCode:'561720',limit:100,offset:0};
  return {category:input.category,publication_window:{from:window.from,to:window.to},filters};
}

export function samTrigger(input) {
  if(!input||Object.keys(input).some(k=>!['target_kind','requested_categories','publication_window','confirmed_scope','preview_hash'].includes(k))||
      input.target_kind!=='sam'||!Array.isArray(input.requested_categories)||input.requested_categories.length!==1)
    throw Error('SAM requires one category and its own statewide date window; county/source filters are not allowed');
  const normalized=samRequest({category:input.requested_categories[0],publication_window:input.publication_window});
  return {target_kind:'sam',requested_categories:[normalized.category],publication_window:normalized.publication_window};
}

export function samRollingWindow(policy,category,at) {
  const days=policy?.[category]?.lookback_days;
  if(!Number.isInteger(days)||days<1||days>366||Object.keys(policy??{}).length!==1)throw Error('Choose 1–366 SAM lookback days');
  const to=localDate(at),from=new Date(Date.parse(`${to}T00:00:00Z`)-(days-1)*86400000).toISOString().slice(0,10);
  return {from,to};
}
