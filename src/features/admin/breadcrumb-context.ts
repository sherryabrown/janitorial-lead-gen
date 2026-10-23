import {createContext} from 'react';
export type Crumb={label:string;ariaLabel?:string;onClick?:()=>void};
export const BreadcrumbParents=createContext<Crumb[]>([]);
export const SettingsNavigation=createContext<(()=>void)|null>(null);
