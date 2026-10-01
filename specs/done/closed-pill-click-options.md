# Closed Pill Click Options Plan

## Problem Statement

The current `Closed` pill uses a native dropdown/select box for closed subcategories. That is not the intended interaction. The desired behavior is:

- Click `Closed` to show the closed subcategory options.
- Click one of the options to filter by that subcategory and close the subcategory options.
- if no subcategory is clicked, clicking `Closed` again will hide the subcategory options.

This applies to both Contracts and Companies. This remains UI-only and should keep the existing local mock state.

## Current Repository Context

- `src/App.tsx` contains all React state and UI.
- `src/styles.css` contains summary pill and filter styling.
- `SummaryItem` already supports:
  - `closedSubcategories`
  - `selectedClosedSubcategory`
- `SummaryPill` currently renders a native `<select>` when `item.closedSubcategories` exists.
- `contractFilters.closedSubcategory` and `companyFilters.closedSubcategory` already exist.
- Filtering behavior already works for the selected closed subcategory.
- The company main-card `Close` action already reveals close reason buttons; do not change that behavior for this request.

## Objectives

1. Remove the native dropdown/select UI from the `Closed` summary pill.
2. Add click-revealed subcategory buttons under or inside the `Closed` pill.
3. Allow clicking `Closed` again to hide those options.
4. Keep all existing counts and filtering behavior.
5. Apply the same interaction to Contracts and Companies.
6. Keep the UI compact and visually subordinate to the main summary pill.

## Interaction Design

Behavior for `Closed` pill:

- If another status is active and user clicks `Closed`:
  - Set that mode's status filter to `closed`.
  - Show the subcategory options.
  - Preserve current subcategory selection if one exists, otherwise `all`.
- If `Closed` is already active and options are hidden:
  - Show the subcategory options.
- If `Closed` is already active and options are visible:
  - Hide the subcategory options.
  - Keep `Closed` active.
  - Keep the currently selected subcategory filter.

Behavior for subcategory options:

- Clicking a subcategory sets the mode's `closedSubcategory`.
- It should keep `Closed` active.
- It can leave the options visible so the user can switch quickly.
- The selected option should have a clear active state.

Behavior for non-closed summary pills:

- Hide any open closed subcategory options.
- Reset that mode's `closedSubcategory` to `all`, matching current behavior.

## State Changes

Add local UI state in `App`:

```ts
const [expandedClosedMode, setExpandedClosedMode] = useState<WorkMode | null>(null);
```

This keeps the expansion UI independent from filtering. Only one mode is visible at a time, but storing mode prevents stale expansion if the user switches modes.

Alternative:

```ts
const [showClosedSubcategories, setShowClosedSubcategories] = useState(false);
```

The `expandedClosedMode` version is clearer and safer.

## SummaryPill API

Replace the select-oriented prop with option click support:

```ts
type SummaryItem<T extends string> = {
  key: T;
  label: string;
  shortLabel: string;
  count: number;
  icon: typeof Building2;
  closedSubcategories?: Array<{ key: ClosedSubcategory; label: string; count: number }>;
  selectedClosedSubcategory?: ClosedSubcategory;
  isClosedSubcategoryExpanded?: boolean;
};
```

Update `SummaryPill` props:

```ts
onClosedSubcategoryChange?: (value: ClosedSubcategory) => void;
```

Inside `SummaryPill`, replace `<select>` with buttons:

```tsx
{item.closedSubcategories && item.isClosedSubcategoryExpanded ? (
  <div className="summary-suboptions" aria-label={`${item.label} subcategories`}>
    {item.closedSubcategories.map((subcategory) => (
      <button
        className={subcategory.key === item.selectedClosedSubcategory ? 'is-active' : ''}
        key={subcategory.key}
        onClick={(event) => {
          event.stopPropagation();
          onClosedSubcategoryChange?.(subcategory.key);
        }}
        type="button"
      >
        <span>{subcategory.label}</span>
        <strong>{subcategory.count}</strong>
      </button>
    ))}
  </div>
) : null}
```

Important: `SummaryPill` currently returns a `<button>` root. Do not put `<button>` elements inside another `<button>`, because that is invalid HTML.

Preferred implementation:

- Change `SummaryPill` root from `<button>` to a wrapper `<div className="summary-pill-shell">`.
- Put the main clickable summary area in a child `<button className="summary-pill-main">`.
- Render subcategory buttons as sibling buttons inside the wrapper.

This avoids nested interactive elements and keeps accessibility clean.

Suggested structure:

```tsx
<div className={`summary-pill-shell ${isActive ? 'is-active' : ''}`}>
  <button className="summary-pill summary-pill-main" onClick={onClick} type="button">
    ...
  </button>
  {expanded ? <div className="summary-suboptions">...</div> : null}
</div>
```

## App Wiring

For contract summary rendering:

- Pass `isClosedSubcategoryExpanded: expandedClosedMode === 'contracts'` on the closed item.
- `onClick` for `Closed` should toggle `expandedClosedMode` when `item.key === 'closed'`.
- `onClick` for non-closed items should set `expandedClosedMode(null)`.

Pseudo-code:

```ts
const selectContractSummary = (key: ContractStatusFilter) => {
  setContractFilters((current) => ({
    ...current,
    status: key,
    closedSubcategory: key === 'closed' ? current.closedSubcategory : 'all',
  }));
  setExpandedClosedMode((current) =>
    key === 'closed' ? (current === 'contracts' ? null : 'contracts') : null,
  );
  setCheckedContractIds(new Set());
};
```

For company summary rendering:

```ts
const selectCompanySummary = (key: CompanyStatusCategory) => {
  setCompanyFilters((current) => ({
    ...current,
    status: key,
    closedSubcategory: key === 'closed' ? current.closedSubcategory : 'all',
  }));
  setExpandedClosedMode((current) =>
    key === 'closed' ? (current === 'companies' ? null : 'companies') : null,
  );
  setContextMode(key === 'ready-to-email' ? 'email' : 'note');
  setCheckedCompanyIds(new Set());
};
```

When changing subcategory:

- Set status to `closed`.
- Keep `expandedClosedMode` set to the current mode.

## Styling Plan

Replace `.summary-pill select` styling with compact suboption styling.

Suggested CSS:

```css
.summary-pill-shell {
  display: grid;
  gap: 5px;
}

.summary-pill-main {
  width: 100%;
}

.summary-suboptions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0 2px 3px 22px;
}

.summary-suboptions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fffdfb;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 800;
}

.summary-suboptions button.is-active {
  border-color: rgba(255, 145, 77, 0.45);
  background: var(--soft);
  color: var(--brand-strong);
}
```

The suboptions should feel like quick choices, not a form control.

## Implementation Steps

1. Add `expandedClosedMode` state in `App`.
2. Add or update summary selection helpers for Contracts and Companies.
3. Add `isClosedSubcategoryExpanded` to the closed summary item for the current mode.
4. Replace the native `<select>` in `SummaryPill` with click-option buttons.
5. Refactor `SummaryPill` to avoid nested buttons by using a wrapper plus child main button.
6. Ensure subcategory button clicks call `event.stopPropagation()`.
7. Remove `.summary-pill select` CSS.
8. Add `.summary-pill-shell`, `.summary-pill-main`, and `.summary-suboptions` CSS.
9. Verify existing company main-card close reason buttons remain unchanged.

## Edge Cases

- Clicking a closed subcategory should not collapse the options unless explicitly desired later.
- Clicking `Closed` twice should show, then hide, the options.
- Switching from Contracts to Companies should not show stale contract suboptions.
- Selecting a non-closed status should hide suboptions and reset the subcategory to `all`.
- Subcategories with zero count should remain clickable and show the existing empty state.
- Avoid nested `<button>` elements.

## Testing Strategy

Run:

```bash
npm.cmd run lint
npm.cmd run build
```

Manual checks:

1. Contracts: clicking `Closed` shows subcategory options.
2. Contracts: clicking `Closed` again hides subcategory options.
3. Contracts: clicking a subcategory filters the contract list and keeps options visible.
4. Companies: clicking `Closed` shows subcategory options.
5. Companies: clicking `Closed` again hides subcategory options.
6. Companies: clicking a subcategory filters the company list and keeps options visible.
7. No native dropdown/select box appears in the summary bar.
8. Company card `Close` still reveals close reason buttons.
9. Lint and build pass.

## Success Criteria

- Closed subcategories are shown as clickable options, not a dropdown box.
- The options toggle open/closed from the `Closed` pill.
- Existing closed filtering and counts continue to work for Contracts and Companies.
- The prototype remains UI-only with local state.
