-- Stop future automatic wake delivery. Preserve schedules, runs, audit and imports.
begin;
update public.procurement_scheduler_settings set enabled=false where id;
select cron.unschedule(jobid) from cron.job where jobname='procurement-scheduler-dispatch';
commit;
-- Pause individual schedules through /v1/schedules/:id/pause (CAS) to prevent
-- their already-pending scheduled continuations. In-flight sends may complete;
-- use explicit Stop run for cancellation. Do not delete evidence or extensions.
