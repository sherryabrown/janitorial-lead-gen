// Recognize the evidenced contracting-forecast table, never arbitrary PDF prose.
// Rows remain candidates: this publication does not establish routine scope or
// an actual performance city, and publishes no stable solicitation identifiers.
export function inspectForecastText(text) {
  if(!text.includes('CONTRACTING OPPORTUNITIES FORECAST')||
      !text.includes('Forecast listings do not represent a commitment')||
      !text.includes('Solicitation Method Department Description')||!text.startsWith('Qtr Year '))return null;
  const table=text.slice('Qtr Year '.length,text.indexOf(' CONTRACTING OPPORTUNITIES FORECAST'));
  const pattern=/(.+?) (Facilities|Information Services|External Affairs|Infrastructure Dev\.) (Quote|RFP|RFQ|IFB|Co-op) (Q[1-4] \d{4})(?: |$)/g;
  const rows=[];let end=0;
  for(const match of table.matchAll(pattern)) {
    if(match.index!==end)return null;
    const [,title,department,method,period]=match;
    if(/\bQ\d\s+\d{4}\b/.test(title))return null;
    rows.push({title,department,solicitation_method:method,planned_advertisement_period:period,excerpt:match[0].trim()});
    end=match.index+match[0].length;
  }
  if(!rows.length||rows.length>100||end!==table.length)return null;
  return rows;
}
