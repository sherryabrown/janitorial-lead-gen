// A published quarter is a date interval for overlap checks, never an exact date.
// Reuse the existing planned_advertisement_period payload/column verbatim.
export function forecastQuarter(value) {
  const match=typeof value==='string'&&/^Q([1-4]) (\d{4})$/.exec(value);
  if(!match||Number(match[2])<1900)return null;
  const year=Number(match[2]),quarter=Number(match[1]),month=(quarter-1)*3;
  return {literal:value,from:`${year}-${String(month+1).padStart(2,'0')}-01`,
    to:new Date(Date.UTC(year,month+3,0)).toISOString().slice(0,10)};
}
export function forecastPeriodOverlaps(payload,window) {
  if(payload.bid_type!=='forecast'||payload.expected_solicitation_date||!['expected_solicitation','expected_solicitation_date'].includes(window?.date_basis))return false;
  const period=forecastQuarter(payload.planned_advertisement_period);
  return !!period&&period.from<=window.to&&period.to>=window.from;
}
