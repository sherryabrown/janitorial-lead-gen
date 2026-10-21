// Apptegy's response includes the current published page as indexed JSON. Read
// only that page's content tree; do not execute scripts or inspect draft pages,
// menus, account data or unrelated hydration values.
export function publishedPage(doc, url) {
  const raw=doc.querySelector('script#__NUXT_DATA__[type="application/json"]')?.textContent;
  if(!raw||raw.length>2_000_000)return null;
  let values;try{values=JSON.parse(raw);}catch{return null;}
  if(!Array.isArray(values)||values.length>50000)return null;
  const slug=new URL(url).pathname.match(/\/page\/([a-z0-9-]+)\/?$/)?.[1];
  const pages=values.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)&&'content'in v&&'password_protected'in v&&
    values[v.slug]===slug&&values[v.status]==='published'&&[null,false].includes(values[v.password_protected]));
  if(!slug||pages.length!==1)return null;
  const content=values[pages[0].content];
  if(!content||!Number.isInteger(content.structure))return null;
  const root=doc.createElement('main'),seen=new Set();let count=0;
  function visit(index,parent,depth=0){
    if(!Number.isInteger(index)||seen.has(index)||depth>30||++count>5000)throw Error('Published page tree exceeds verified bounds');
    seen.add(index);const node=values[index];
    if(!node||typeof node!=='object'||Array.isArray(node))throw Error('Published page tree changed');
    let container=parent;
    if(values[node.type]==='CONTENT_NODE_PANEL'){
      container=doc.createElement('section');container.className='published-bid-panel';
      const title=values[values[node.properties]?.text];
      if(typeof title!=='string'||!title.trim())throw Error('Published panel title missing');
      const heading=doc.createElement('h2');heading.textContent=title;container.append(heading);parent.append(container);
    }
    if(Number.isInteger(node.content)){
      const html=values[values[node.content]?.html];
      if(typeof html==='string'){
        const template=doc.createElement('template');template.innerHTML=html;container.append(template.content);
      }else if(['CONTENT_NODE_TEXT','CONTENT_NODE_HEADING'].includes(values[node.type]))throw Error('Published text is not literal HTML');
    }
    if(Number.isInteger(node.nodes)){
      const nodes=values[node.nodes];if(!Array.isArray(nodes))throw Error('Published child list changed');
      for(const child of nodes)visit(child,container,depth+1);
    }
  }
  visit(content.structure,root);
  for(const node of root.querySelectorAll('script,style,iframe,form,input,template'))node.remove();
  return root;
}
