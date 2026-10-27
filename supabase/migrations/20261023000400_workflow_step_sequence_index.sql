-- Match run-scoped log pagination and mutable-step refreshes. Retain historical indexes.
begin;
create index if not exists procurement_steps_trigger_sequence
 on public.procurement_workflow_steps(trigger_id,sequence);
commit;
