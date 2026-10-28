import {createContext,useContext} from 'react';
export type SchedulingCapabilities={role:'user'|'admin'|null;manage_schedules:boolean;manage_sources:boolean;technical_details:boolean;revision?:string|null};
export const closed:SchedulingCapabilities={role:null,manage_schedules:false,manage_sources:false,technical_details:false};
export const SchedulingRoleContext=createContext<SchedulingCapabilities>(closed);
export function useSchedulingRole(){return useContext(SchedulingRoleContext);}
