# Restore Applied as the Interested Primary Action

## Problem

The last Interested/Hold action update removed the full-width Applied action from Interested cards. The intended Interested card hierarchy is:

```text
[ Applied ]
[ Hold ] [ Not interested ]
```

## Implementation plan

### Phase 1: Restore the Interested action order

1. In `ContractActions` in `src/App.tsx`, prepend a primary `Applied` button to the Interested branch.
2. Keep it first in DOM order so the existing `.contract-card-actions > button:first-child` rule makes it full width.
3. Keep `Hold` and `Not interested` as the following paired actions. Retain their `pair-action` classes/override so the first paired button does not span the grid when it is no longer first overall.
4. Keep Withdrew absent from Interested. Do not change the Hold branch, terminal reason UI, persistence helpers, or database schema.

### Phase 2: Verify

1. Run `npm.cmd run lint` and `npm.cmd run build`.
2. Verify Interested shows Applied full width above Hold and Not interested.
3. Verify Applied uses the existing stage RPC/history update path, and Not interested still requires a reason.
4. Confirm Hold continues to show Interested full width above Applied and Not interested.

## Success criteria

- Interested cards show Applied as the primary full-width action.
- Hold and Not interested remain a paired secondary row.
- No Withdrew action is visible for Interested.
