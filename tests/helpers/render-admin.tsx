import type {ReactNode} from 'react';
import {render,type RenderOptions} from '@testing-library/react';
import {SchedulingRoleContext} from '../../src/features/admin/scheduling-role';

export const adminCapabilities={role:'admin' as const,manage_schedules:true,manage_sources:true,technical_details:true};
export const userCapabilities={role:'user' as const,manage_schedules:true,manage_sources:false,technical_details:false};
export function renderAdmin(ui:ReactNode,options?:RenderOptions){
 return render(ui,{wrapper:({children})=><SchedulingRoleContext.Provider value={adminCapabilities}>{children}</SchedulingRoleContext.Provider>,...options});
}
