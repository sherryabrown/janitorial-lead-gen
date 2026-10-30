# Export captures without oversized text cells

This helper splits `content_base64` into ordered pieces of at most **8,000 characters**. It does not shorten, delete or update stored captures. Run the SQL as `postgres` in Supabase SQL Editor. Creating this helper is a persistent Function change; no production data or table changes are needed. The helper has no SECURITY DEFINER privileges and grants no application-role access. It is not part of the release migration bundle.

## 1. Install once

Paste and run the complete contents of `scripts/sql/install-procurement-capture-export.sql`. If you already installed it, go straight to step 2. Do not repeatedly run the CREATE FUNCTION statement.

## 2. Export the first page

First run this read-only inventory query and save its single-row result as `captures-inventory-before.csv`:

```sql
select count(*) as captures,
       sum((length(content_base64) + 7999) / 8000) as expected_parts,
       md5(string_agg(run_id::text || ':' || content_sha256 || ':' || length(content_base64)::text,
                      ',' order by run_id)) as inventory_fingerprint
from public.procurement_public_captures;
```

Then run:

```sql
select *
from public.procurement_export_public_captures(null, 0, 500)
order by run_id, part_number;
```

Export that result directly to a CSV named `captures-part-001.csv`. Keep it in a **new** backup folder; do not overwrite the owner's existing backup. Keep the CSV header and do not open/save the files through a spreadsheet that may truncate long cells.

The query returns at most 500 rows. Ensure the SQL Editor result/export limit is at least 500 and that every returned row is downloaded. One capture may occupy several rows or span files; that is expected.

## 3. Export following pages

Read the **last row in the downloaded CSV**. Copy its `run_id` and `part_number` into the next call:

```sql
select *
from public.procurement_export_public_captures(
  'PASTE-LAST-RUN-ID-HERE'::uuid,
  7, -- replace 7 with that last row's part_number
  500
)
order by run_id, part_number;
```

Save each page with a new sequential filename. Repeat using each newly downloaded file's last row until the query returns **zero rows**. Do not use a truncated on-screen preview to choose the cursor. The `(run_id, part_number)` cursor avoids OFFSET pagination and handles page boundaries inside large captures.

## 4. Verify the export

For each `run_id`, combine `content_base64_part` in ascending `part_number`, without separators. There must be exactly one of every part from 1 through `part_count`, no duplicates or gaps, matching metadata across parts, and the resulting string length must equal `content_base64_characters`. Decode the base64 and compare the bytes' SHA-256 with `content_sha256`. The exported metadata plus the reconstructed value can then restore the original row.

These checks should be performed by a script, not by manually editing long fields. Give the release operator the new folder path after export. The chunks preserve the original value; they do not change the application schema to store chunks.

Run the inventory query again and save `captures-inventory-after.csv`. The before/after counts and fingerprint must match. The combined page files must contain exactly `expected_parts` data rows and `captures` distinct run IDs. If the inventory changes or these totals differ, the release operator must reconcile/repeat the export; do not assume the CSV collection is complete. The inventory fingerprint is a change detector, not a replacement for each capture's SHA-256 verification.

This is a paginated export of **one table**, not a complete consistent database snapshot. Active inserts or changes during multiple calls can affect coverage. Record/export timing and compare inventory/hashes; a final release recovery point still requires the coordinated backup procedure. Do not pause production workers as an implied part of installing this helper.

## Optional cleanup after recovery verification

Only after the export is complete and checked, the owner can remove the helper with:

```sql
drop function public.procurement_export_public_captures(uuid, integer, integer);
```

This removes the export helper only, not the table or captured data. Leaving it in place changes the routine inventory, so record its presence/removal in the release preflight.
