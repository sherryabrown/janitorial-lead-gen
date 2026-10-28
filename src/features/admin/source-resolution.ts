export type SourceDecision='unreviewed'|'repair_in_progress'|'fixed_verified'|'no_website'|'no_issue'|'wont_address'|'needs_developer';
export type SourceReviewItem={
 task_id:string;id:string|null;version:number;revision:string;
 scope:{geography_id:string;category:string;source_id:string|null;capability_id:string|null};
 name:string;location:string;category:string;title:string;impact:string;
 check:{state:string;observed_at:string|null;last_success_at:string|null};
 current?:{task_id:string;target_id:string;state:string;title:string;impact:string;observed_at:string|null};
 decision:SourceDecision;previous_decision:SourceDecision|null;checks_excluded:boolean;
 reviewed_at:string|null;responsibility:string;allowed_actions:string[];
};
export type RepairStatus={job_id:string;state:string;kind:'website'|'listing';checked_at:string|null;
 can_apply_website:boolean;can_apply_method:boolean;needs_reconciliation:boolean;fixed:boolean;
 title:string;explanation:string;diagnostic_reference:string};
export type SourceResolutionDetail={item:SourceReviewItem;reason:string;website:string;verification:RepairStatus|null;can_reenable:boolean;
 impact:{scope:string;schedules:{id:string;name:string;version:number}[];explanation:string};preview_token:string;
 history:{id:string;at:string;decision:string;reason:string}[];more_history:boolean};
export const sourceDecisionLabels:Record<SourceDecision,string>={unreviewed:'Needs review',repair_in_progress:'Repair in progress',fixed_verified:'Fixed and verified',
 no_website:'No website recorded',no_issue:'Reviewed · no issue',wont_address:'Accepted gap',needs_developer:'Needs developer'};
