# Scheduling reference states

Implementation reference for the agreed three-section layout. This records intended copy and automated scenarios, not human usability approval. User/Admin review of the isolated dev preview remains pending.

| Evidence/state | Heading and impact | Next action / responsibility |
| --- | --- | --- |
| No run exists | No runs yet. Save or run this schedule to see results. | Run now / User |
| Pending or running | Checking sources. Results are still being collected; totals may change. | View saved leads / User; wait for checks |
| Stopped | Run stopped. Saved results remain available; some checks may be incomplete. | View leads / User; Admin reviews technical recovery |
| Completed, known lead counts | Run finished. Show the verified new, updated and unchanged counts. | View leads / User |
| Completed with source gaps | Finished with source gaps. Saved leads are available; some websites were not fully checked. | View leads, then Sources / User; review source / Admin |
| Unknown totals or uncertain import | Results need confirmation. A saved operation must be reconciled before claiming final totals or sending again. | View existing leads / User; reconcile saved operation / Admin |
| Completed source check, records found | Checked · records found. Captured records still require validation before being counted as saved leads. | View leads / User |
| Completed source check, no records | Checked · no matching records. Applies only to this completed category/location check. | View status / User |
| Source queued | Waiting to check. No completed check is recorded for this attempt. | View status / User |
| Missing site | No verified website. This location has no verified website for this check. | Provide website / Admin |
| Missing method | Bid listings need setup. A working website alone does not verify its listings. | Verify supported listing or Needs developer / Admin |
| Incomplete/access blocked | Website could not be checked. Other independent sources can continue. | Review source / Admin; unsupported access routes to developer |
| Verified repair/readback | Fixed and verified. Current setup was saved; earlier run results remain unchanged. | Re-enable checks explicitly if excluded, or Next source / Admin |
| No website | No website recorded. Checks disabled by admin decision; other source checks continue. | Provide usable website, verify, then explicitly re-enable / Admin |
| No issue | Reviewed · no issue. Original check evidence remains; future checking remains enabled. | Continue / Admin |
| Won't address | Accepted gap. Checks disabled by admin decision; limitation remains visible. | Re-enable only after explicit review / Admin |
| Developer handoff | Needs developer. Technical source support/access requires developer review. | Copy internal handoff summary / Admin; no automatic message |
| Scope changed | Saved scope needs review. Show saved locations separately from current registry relationships. | View Schedule scope / User; existing edit/archive constraints apply |
| Missing historic actor/time | Actor not recorded / Time unavailable. Never substitute a UUID or invented date. | View retained history / User |
| Archived | Archived. Saved history remains; this schedule cannot start another run. | Back to schedules / User |
| Evidence unavailable/read failure | Saved information could not load. Do not replace it with zero results or success. | Retry the failed read in context / current role |
| Permission loss | Admin review required. Users can view source status; Admin manages repairs. | Back to source status / User; abort private reads and clear private panels |

Results, Sources and technical disclosure share the same selected run. A newly available run is an explicit selection, never an automatic switch from an older open run. Sources labels current registry setup separately from the selected run's checks and current Admin decisions. Schedule scope is read-only; legacy geography links never open an editor. Review completion keeps the same item and offers Next source or Back. Admin technical evidence retains candidate validation and unknown-save reconciliation.

Automated acceptance covers actual components, both roles, decision choices, exclusions, native enforcement, concurrent/replayed writes and historical evidence. Browser checks include desktop/mobile, zoom, keyboard, failed reads and role loss. Actual nontechnical acceptance must be recorded by the testers after the preview is handed over; no sign-off is asserted here.
