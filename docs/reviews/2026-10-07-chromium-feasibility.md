# Render Free bounded Chromium feasibility

## Result

Passed the authorized one-page public benchmark on the existing Render Free backend. This is browser feasibility evidence, not lead coverage or authenticated portal acceptance.

| Check | Measured evidence |
| --- | --- |
| Deployment | `dep-db2uka59fdbs739buop0`, live, commit `9ce37de2a1f6237eabf5b75c7255c076649523c8` |
| Existing official source | North Little Rock Commerce, source `48d818ae-7718-5381-8045-ceae7fc8404d` |
| One page | https://nlr.ar.gov/departments/finance/commerce/ |
| Timing | 2026-10-07 06:45:05.063–06:45:19.145 UTC; 14.082 seconds |
| Container limit | 536,870,912 bytes (512 MiB), read from cgroup |
| Kernel container peak | 458,637,312 bytes (437.4 MiB); includes API and Chromium |
| Sampled peak | 457,842,688 bytes (436.6 MiB), 100 ms sampling |
| Headroom | 78,233,600 bytes (74.6 MiB) below limit |
| Sanitized capture | 34,916 bytes; private persistence and hash readback passed |
| Cleanup | Context and browser closed; browser disconnected |
| Inference | 0 calls, 0 tokens, $0 inference spend |

Private immutable sanitized artifact hash: `6eb8598fcac6e5aba088a24ebc4b82e508faa4c5906b670ff8a1d971e5db008d`. Receipt hash: `a15e0fb0885e4e44082ee325fcc10f127cd16295911921e40bc604bb1bd365e2`. Private operator receipt: `outputs/deployment/render/chromium-benchmark-result.json`. Benchmark ID: `231d0ea8-a58f-4c4a-90ab-252262fc6bd8`.

## Controls and tests

Disabled by default; operator flag removed from Render and read back after completion. A private immutable attempt marker prevents cold-start replay. Request-driven heavy processing pauses only during the benchmark, and an existing active worker lease prevents launch. No signup, sign-in, cookies, source-method changes, candidates, imports, schedules or frontend changes. Network limited to HTTPS GET/HEAD on the registered host; downloads and service workers disabled. Capture sanitization reuses the existing browser helper.

Five focused offline tests passed: sanitized capture/readback/cleanup, capture-failure cleanup, memory-limit rejection, other-URL rejection and attempt replay prevention. Touched-file ESLint and diff whitespace checks passed.

## Limits and next action

Kernel peak is the container's lifetime high-water mark on this new deployment, not an isolated browser-only allocation. Sampling does not prove every transient memory point; the kernel peak supplies that stronger measurement. Cleanup proves Playwright closure/disconnection, not an independently enumerated OS-process inventory.

No blocker remains for this one-page feasibility check. The 74.6 MiB margin is modest: do not infer that large pages, authenticated portals, concurrent PDF processing or discovery fit. Subsequent authorized discovery/access implementation must serialize heavy stages and retain truthful memory/access blockers. No discovery/access acceptance was performed here. Keep the shared plan in todo.
