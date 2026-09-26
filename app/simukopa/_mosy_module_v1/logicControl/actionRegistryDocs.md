# actionsRegistry.js — worked examples

Every action SHAPE actually in production use across this app's cloned
modules (leads/deals/callhistory/messages), collected here so you don't
have to go hunting through those files to remember the pattern. Copy the
block that matches what you're building into your module's own
`logicControl/actionsRegistry.js`, rename the key/fields, done. Each
example cites the real module it was lifted from, in case you want to see
it wired end-to-end (schema.js `profileActions` entry + registry function
together).

## ctx — what every registered function receives

Every function in the registry gets ONE `ctx` object instead of a fixed
list of positional args. That's the extensibility point: need a new
capability for some action later (current user, a toast helper, whatever)
— add a field to `ctx`, every caller passes it through, no per-action
signature changes.

- `ctx.rows` — array (bulk actions get every `appliesTo`-matched row;
  single-row actions from a dropdown/profile get `[row]`; list-level
  actions with no row, like grid-toolbar filters, get `[]`)
- `ctx.schema` — the full schema object (`apiBase`, `entity`, etc.)
- `ctx.router` — Next.js router, present for grid-toolbar and single-row
  dropdown/profile actions; use it to `router.push()` for anything that
  should navigate
- `ctx.refresh` — reload whatever list/grid/form triggered this action
- `ctx.create` / `ctx.update` / `ctx.remove` — the SAME `EntityDataEngine`
  instance's bound methods the calling grid/form is already using, not a
  separate import. Calling `ctx.create(values)` here hits the exact same
  engine that `grid.create()` or `form.submit()` would, including its own
  auto-reload on success — no parallel "create a record" codepath to keep
  in sync.
- `ctx.filter` / `ctx.setFilterValue` / `ctx.setAdvancedQuery` /
  `ctx.setDateRange` / `ctx.applyFilter` / `ctx.clearFilterValue` — grid
  filter controls, only present for grid-toolbar `type: 'action'` buttons
  (see #8 below — `smartFilterActions.jsx`'s helpers are built for
  exactly these).

**NOTE:** `"delete"` and `"clone"` are intercepted directly by
`useEntityFormController` before they ever reach this registry — don't
register functions under those two keys, they will never fire.

---

## 1. `gridCheckBoxAction` — bulk-select toolbar hook

Bound by `gridOptions.checkFunction` in schema.js (`{ checkBoxes: true,
checkFunction: "gridCheckBoxAction" }`). Fires with every row the user
ticked in the grid's checkbox column. Real usage: leads/deals/
callhistory/messages all keep a version of this — swap the display-name
fallback chain for whatever field this module's rows actually have.

```js
gridCheckBoxAction: async ({ rows }) => {
  const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
  alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
},
```

## 2. Simple mutation / fetch

Hits an endpoint directly with the checked/matched rows, no UI beyond the
result. Good for bulk send/export/sync actions that don't need a form.

```js
export_selected: async ({ rows }) => {
  const ids = rows.map((r) => r.record_id).filter(Boolean);
  const response = await fetch('/api/novaerpv4/<module>/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return response.ok
    ? { ok: true, message: `Exported ${ids.length} record(s)` }
    : { ok: false, message: 'Export failed' };
},
```

## 3. Plain navigation

Works from a grid dropdown OR a profile button, since actionsRegistry
functions always get `ctx.router` regardless of which context fired them
(unlike schema.js's own `navigateTo`, whose calling convention differs
between grid rowActions and form buttons — going through the registry
sidesteps that entirely).

```js
view_on_map: ({ rows, router }) => {
  const row = rows?.[0];
  if (!row || !router) return;
  router.push(`/novaerpv4/<module>/map?record_id=${row.record_id}`);
},
```

## 4. Navigate to a LINKED record's profile

When this row carries a FK to another module's record (e.g.
`deals.client_id -> leads.record_id`), reuse the SAME `${entity}_dataNode`
query param `EntityRowActionsMenu.jsx` builds for every other profile
link in the app, so the target module's Profile component picks it up
with zero special-casing.

Real usage: `deals/logicControl/actionsRegistry.js`'s earlier
`view_client_profile` (before it got upgraded to the popup version in
#5) — kept here since plain navigation is sometimes exactly what you want
instead of a modal.

```js
view_linked_lead: ({ rows, router }) => {
  const row = rows?.[0];
  if (!row?.lead_id || !router) return;
  router.push(`/novaerpv4/leads/profile?leads_dataNode=${btoa(row.lead_id)}`);
},
```

## 5. Popup a related list from ANOTHER module

Scoped to this row via `fixedQuery`. `fixedQuery` keys are camelCase URL
params that the OTHER module's own `route.js` resolves back to real DB
columns — the key you pass must be a column that actually exists on THAT
table (check its `columnDictionary` / `schema.fields` before picking a
name; `recordId` is always safe, it's a built-in alias every table has).

Real usage: leads' `view_deals` (deals scoped by `clientId` == this
lead's `record_id`), leads' `message_history`/`call_history` (scoped by
`relatedRecordId`), deals' `view_client_profile` (leads scoped by
`recordId` == this deal's `client_id`).

```js
import OtherModuleList from "../../otherModule/uiControl/OtherModuleList";
import { MosyCard } from "../../../components/MosyCard";

view_related: ({ rows }) => {
  const row = rows?.[0];
  if (!row) return;
  MosyCard(
    "",
    <OtherModuleList
      customProfilePath="../otherModule/profile"
      title={`Related records for ${row.title || row.name || ''}`}
      fixedQuery={{ relatedRecordId: btoa(row.record_id) }}
      hiddenActions={['new']}
    />,
    true,
    "modal1",
    "mosycard_wide"
  );
},
```

## 6. Popup a preset "create" form for ANOTHER module

Some fields pre-filled/locked from this row. `fieldOverrides` only
touches fields that ALREADY exist on the target schema — it can't inject
new ones, so if you need a field hidden-and-locked (like the FK back to
this row), it has to be a real field on that schema first.

Real usage: leads' `add_lead_deal` (pops a preset Deals create form,
locking `deals.client_id` to the clicked lead's `record_id`).

```js
import OtherModuleProfile from "../../otherModule/uiControl/OtherModuleProfile";
import { OtherModuleSchema } from "../../otherModule/OtherModuleSchema";
import { buildPresetFromRow, openEntityCreateModal } from "../../moduleControl/UiControl/EntityCreateModal";

add_related: ({ rows, refresh }) => {
  const row = rows?.[0];
  if (!row) return;
  openEntityCreateModal({
    ProfileComponent: OtherModuleProfile,
    schema: OtherModuleSchema,
    title: `New record — ${row.title || row.name || ''}`,
    presetValues: buildPresetFromRow(row, [
      { sourceKey: 'record_id', destKey: 'related_record_id' }, // must exist on OtherModuleSchema
    ]),
    fieldOverrides: {
      related_record_id: { editable: false, type: 'hidden' },
    },
    sectionFieldOrder: {
      basic_information: ['title', 'related_record_id'],
    },
    onSaved: refresh,
  });
},
```

## 7. Quick-edit modal

Edits a SUBSET of THIS row's own fields in a small modal, without leaving
the grid/list. `quickEditFromRow(ctx, opts)` is the two-arg convenience
wrapper: it pulls `row` from `ctx.rows[0]` and wires `onSubmit` through
`ctx.update` automatically.

**Do NOT** call `openQuickEditModal(ctx, opts)` directly with two args —
that function takes ONE options object (`{schema, fieldKeys, row,
onSubmit, ...}`), not `(ctx, opts)`; calling it the wrong way silently
breaks (`fieldKeys` ends up `undefined` and it crashes on `.map`).

Real usage: callhistory's `update_log`, deals' `update_deal_status`.

```js
import { quickEditFromRow } from "../../moduleControl/UiControl/QuickEditModal";

update_status: (ctx) => {
  quickEditFromRow(ctx, {
    fieldKeys: ['status', 'notes'],           // must be real schema.fields keys
    title: 'Update status — {{title}}',       // {{field}} templated against the row
    fieldOverrides: {
      status: { colSpan: 6 },
      notes: { colSpan: 12 },
    },
    // getId defaults to (row) => row.record_id — override only if this
    // module's update endpoint wants something else, e.g. primkey:
    // getId: (row) => btoa(row.primkey),
  });
},
```

## 8. Grid-toolbar smart filters

Pick a value and re-scope the grid. These are EXCLUSIVE by default
(replace whatever filter was active); pass `combine: true` to stack
instead. Only wire these as `type: 'action'` `profileActions` entries
with `grid: true` — they need `ctx.setAdvancedQuery`, which is only
present in the grid-toolbar ctx.

- `openSmartTagFilter` — pick from DISTINCT values already on THIS
  table's own column (e.g. leads' `filter_by_status`/`filter_by_source`).
- `openSmartDateFilter` — date-range picker on one column.
- `openSmartMapFilter` — pick a row from ANOTHER schema to filter by a
  local FK column (e.g. filter deals by picking a company).

```js
import { openSmartTagFilter, openSmartDateFilter, openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";

filter_by_status: (ctx) => openSmartTagFilter(ctx, {
  title: 'Filter by status',
  columnKey: 'status',
}),

filter_by_date_created: (ctx) => openSmartDateFilter(ctx, {
  title: 'Filter by date created',
  columnKey: 'created_on',
}),

filter_by_company: (ctx) => openSmartMapFilter(ctx, {
  title: 'Filter by company',
  searchSchema: CompaniesSchema, // import from the other module
  displayField: 'company_name',
  valueField: 'record_id',
  localColumnKey: 'company_id',  // real column on THIS table
}),
```

## 9. Send a message

Opens the shared smart-message composer. It reads recipient info off
GENERIC keys (`full_name`/`business_name`/`name`,
`email_address`/`primary_email`/`email`, `phone_number`/`tel`/`phone`) —
if this row uses different column names (e.g. messages' own
`recipient_name`/`recipient_email`/`recipient_phone`), map them across
first, don't pass the raw row straight through.

Real usage: leads' `send_message` (raw row, field names already match),
messages' `resend_message`/`forward_message` (mapped via a small
`toProfileDataNode()` helper since `recipient_*` names don't match).

```js
import { MosySendSmartMessage } from "../../UiControl/MosySmartComms";

send_message: ({ rows }) => {
  const row = rows?.[0];
  if (!row) return;
  MosySendSmartMessage({ profileDataNode: row });
},
```
