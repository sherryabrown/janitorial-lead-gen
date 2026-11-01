# Scheduling release: owner-accepted backup scope

## Decision

On November 1 the owner stated that no Supabase support request would be filed, reported holding schemas/data for populated tables, and accepted moving forward once `procurement_public_captures`, database Functions and Edge Functions were backed up. This supersedes the previously proposed complete-database-restoration release gate. Do not request that waiver again or keep support/password diagnosis as a release blocker.

This is acceptance of the stated recovery coverage, not a claim that a full database/Auth/Storage-service restore has passed. It is also **not the final production deployment GO**: the explicit instruction not to deploy Netlify Production remains until the owner approves the coordinated cutover.

## Verified capture backup

Completed November 1 at 17:42 UTC (12:42 PM America/New_York, EST).

- **3,985 complete capture records**, including every exported metadata field.
- **1,680 byte-identical encoded bodies** stored once by SHA-256; all row references remain in the encrypted manifest.
- Logical encoded content: **1,240,169,532 bytes**. Unique encoded bodies: **674,545,648 bytes**. Production records were not deduplicated, deleted or changed.
- Every exact base64-text SHA-256 and decoded evidence SHA-256 matched. Deduplication keys include the actual encoding's hash, so different encodings are not silently normalized into one value.
- Original and final full metadata/hash inventories matched. No missing, duplicated or changed record was accepted.
- Each encrypted file was recovered from disk. A **separate process** then recovered the saved DPAPI key, authenticated/decrypted the complete manifest and all bodies and checked all hashes again. Unique recovered decoded bytes: **505,907,596**.
- The original owner-held schema/CSV folder and existing manual capture CSVs were not written to.

Private local receipts:

- `outputs/deployment/scheduling-backup-readiness/capture-bodies-1793384089260/export-receipt.json`
- `outputs/deployment/scheduling-backup-readiness/capture-bodies-1793384089260/independent-restore-receipt.json`
- Saved key reference is in the private receipt; no key, credentials, captured content or backup manifest is committed.

The resumed exporter reused 216 verified bodies, retried interrupted reads with bounded backoff, paced requests and used bounded batches. Temporary or incomplete cached files are not mistaken for verified bodies. Tests cover transport termination, HTTP-400 throttles, permanent permission denial, the five-attempt bound, duplicate-body reconstruction, omitted metadata rows and ciphertext tampering.

## Other preserved recovery evidence

- All **seven deployed Edge Function source/config exports** passed encrypted archive recovery: 12 files, including normalized deployment metadata and JWT settings. No Function was invoked or redeployed. Source recovery does not certify runtime deployment or provider-secret recovery.
- The refreshed encrypted export contains **117 public database routine definitions**, including identities, ownership/ACL/configuration metadata and the owner's auxiliary export Function. The prior 116-routine encrypted copy is preserved. The auxiliary Function's presence/removal must be recorded in live preflight rather than silently treated as part of the application release. Current versions and JWT settings of all seven Edge Functions match the verified source archive.
- All **2,013 private Storage objects**, totaling **364,874,247 bytes**, passed independent saved-key recovery/hash checks. Full Storage-service import was not tested.
- Additional catalog recovery captured **106 relations**, **11 enum types**, **121 policies**, **44 triggers**, constraints/indexes/grants/default privileges/extension and sequence metadata, plus both legacy membership records. The encrypted catalog passed byte recovery. It contains no Auth user records or password verifiers.
- A disposable native restore passed for the owner's 102 source records. Applying the genuinely captured role enum resolved that dependency; that partial test did not load Auth user schema/data and stopped there. No fake users or disabled constraints were used. Subsequent inspection located the owner's added Auth user CSV (34 rows), membership CSV (2 rows), workflow-step CSV (63,680 rows) and membership schema. Their CSV widths validate. These supplied files resolve the earlier "not supplied" finding; a full Auth service restore has not been performed and is not being claimed.
- The exact eight-file atomic cutover was rehearsed with synthetic data, including dependency-failure rollback, lossless retry and membership archival. This was not a restored full production snapshot.

## Residual limitations accepted for this release

There is no demonstrated complete PostgreSQL/Auth restore, no isolated Edge/Storage service rebuild and no verified independent off-site secret/key escrow. Owner-held schema/data exports are accepted; the newly supplied files were inspected for structure/counts only, not certified as a complete restore. The original 124 files retain their hashes and modification timestamps; the owner has added 17 files, for 141 total, and this work wrote none of them. Native database-password authentication still fails, and a full compatible Docker restore runtime has not been demonstrated. These facts remain documented; under the owner's instruction they are not reasons to reopen the full-backup/support gate.

## Path to production

The prepared cutover SQL and maintenance/hold artifacts remain pinned and unchanged in application behavior. `prepare-scheduling-cutover-api.mjs` additionally prepares exact authenticated Management API request bodies without making any network calls. Supabase documents this query endpoint with a `read_only` option and write capability; it is a beta endpoint, so verify operator capability first and do not assume it will succeed. See [API reference](https://supabase.com/docs/reference/api/v1-run-a-query).

After final GO, first use the operator preflight body, which requests the operator route but encloses all SQL in **BEGIN READ ONLY**. It must demonstrate a trusted operator and required capabilities **before maintenance**. Then follow the existing maintenance/hold/drain, atomic migration, approved eight-version history reconciliation, matching Render/CORS and Netlify Production publishing plan. Do not use the backup transport's automatic retries for DDL: an uncertain response requires a read-only state check, not blind resubmission. If the API operator route is unavailable, stop before maintenance and use the same reviewed SQL through the owner's SQL Editor; do not create login roles or reset passwords as a workaround.

No production DDL, permissions, data changes, Render changes or Netlify Production publishing were performed by this preparation. Final live drift/lease checks, bounded smoke checks, the maintenance window and the owner's deployment GO still apply. No further Scheduling redesign is proposed.

## Final preparation checks

Five targeted offline tests pass: interrupted/throttled read retries, bounded/permanent failures, encrypted recovery/tampering, the exact atomic cutover rollback/retry with guarded eight-version history reconciliation, and hold-server routing. Targeted ESLint and PowerShell syntax checks pass. The native source-data/actual-enum partial restore also passed its stated checks. Application/migration inputs remain at the previously accepted runtime; no new UI behavior was introduced.

The production frontend build passed into `outputs/deployment/scheduling-cutover/production-assets/`. Its public key role was validated, the pinned project/backend were confirmed, local-preview strings were absent, and a scan for private environment values passed. Five built assets have a separate hash manifest. They have **not** been published. The build's existing large-chunk warning was not turned into another Scheduling refactor or release gate.
