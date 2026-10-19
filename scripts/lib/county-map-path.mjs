// Remove only exactly collinear intermediate vertices on the existing 0.1-unit
// grid. Every retained segment occupies precisely the original geometry.
export function compactCountyPath(path) {
  return path.split('Z').filter(Boolean).map(ring => {
    if(!/^M[-\d.,L]+$/.test(ring))throw Error('Unexpected county path syntax');
    const points=ring.slice(1).split('L').map(point=>point.split(',').map(n=>Math.round(Number(n)*10)));
    const stack=[];
    for(const c of points) {
      while(stack.length>=2) {
        const a=stack.at(-2),b=stack.at(-1);
        if((b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]) ||
          (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)break;
        stack.pop();
      }
      stack.push(c);
    }
    if(new Set(stack.map(p=>p.join(','))).size<3)throw Error('County ring collapsed');
    return 'M'+stack.map(p=>p.map(n=>n/10).join(',')).join('L')+'Z';
  }).join('');
}
