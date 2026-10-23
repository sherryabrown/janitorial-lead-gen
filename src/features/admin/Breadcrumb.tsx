import {useContext} from 'react';
import {BreadcrumbParents,SettingsNavigation,type Crumb} from './breadcrumb-context';
export function Breadcrumb({items}:{items:Crumb[]}){
 const parents=useContext(BreadcrumbParents),settings=useContext(SettingsNavigation);
 const path=[...parents,...items].map(item=>item.label==='Settings'&&!item.onClick?{...item,ariaLabel:item.ariaLabel??'Settings home',onClick:settings??undefined}:item);
 return <nav className="schedule-breadcrumb" aria-label="Breadcrumb"><ol>{path.map((item,i)=><li key={i}>{item.onClick&&i<path.length-1?<button type="button" className="text-button" aria-label={item.ariaLabel} onClick={item.onClick}>{item.label}</button>:<span aria-current={i===path.length-1?'page':undefined}>{item.label}</span>}</li>)}</ol></nav>;
}
