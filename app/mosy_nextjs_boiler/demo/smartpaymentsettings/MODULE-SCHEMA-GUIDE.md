# Mosy Module Schema Guide

How this app's "clone-a-module" system works: one pair of schema files
plus one action-registry file gives you a full CRUD entity — grid, form,
permissions, buttons, cross-entity links — with no custom React beyond
that. This doc explains the pattern itself, generically, so it can be
applied to build ANY entity in ANY kind of application: a POS system's
products/orders/payments, a voting system's ballots/candidates/voters, a
shipping/dispatch app's shipments/drivers/vehicles, a booking app's
reservations/rooms/guests — anything. The pattern doesn't care what
domain it's used in.

Read this before cloning the module template for a new entity, or before
modifying an existing one.

---

## 1. The five files behind every entity

| File | Layer | Contains |
|---|---|---|
| `app/<app>/<entity>/<Entity>Schema.js` | **Frontend schema** | Full UI shape: fields (labels/types/options), `sections`, `showInList`, `profileActions`, `apiBase`, `moduleRole`, `gridOptions`, `filters` |
| `app/api/.../<entity>/list/<Entity>Schema.js` | **Backend schema** | Trimmed data-shape-only counterpart: `entity`, `fields` (key/type/searchable, no labels or UI concerns), `batchMutations`, `roles` |
| `app/<app>/<entity>/logicControl/actionsRegistry.js` | **Behavior** | One function per custom `profileActions` key — the code that actually runs when a button is clicked |
| `app/<app>/<entity>/uiControl/<Entity>List.jsx` / `<Entity>Profile.jsx` | **UI** | Grid/list and form/profile React components — generic, schema-driven, rarely need hand-edits |
| `app/<app>/<entity>/{list,profile,import}/page.jsx` | **Routes** | Next.js route wrappers |

Both schema files are meant to be regenerated together from the live DB
table (`db-cli.js`, rule-based column matching), then hand-tuned:
`sections`, `profileActions`, and `groupedSelect` fields almost always
need manual adjustment after a fresh generation — the tool gets you 80%
of the way, not 100%.

**Everything UI-only lives only in the frontend schema.** Labels,
sections, buttons, permission gating, filters — none of it belongs on
the backend schema. The backend schema exists only to shape/validate
data server-side: field types, `searchable`, `system`/`editable` flags,
join config (`batchMutations`), and role names.

This split is what makes the pattern domain-agnostic: swap the entity
name and field list, and the exact same two-file/one-registry shape
produces a working module whether the "record" is a customer, a
ballot, a delivery, or a hotel room.

---

## 2. Frontend schema anatomy

```js
export const EntitySchema = {
  entity: 'entity_table_name',   // DB table; drives default role names
                                   // (view_<entity>/manage_<entity>) and apiBase
  label: 'Display Name',
  apiBase: moduleApi,
  importDataEndpoint: apiRoutes.entity.import,

  // Page-level gate — checked once for the WHOLE grid AND WHOLE
  // profile page. No moduleRole set = open to anyone.
  moduleRole: 'view_entity',

  gridOptions: { checkBoxes: false, checkFunction: 'gridCheckBoxAction' },

  profileActions: [ /* buttons — see §4 */ ],

  showInList: ['field_a', 'field_b'],      // grid columns, in order
  exportColumns: ['field_a', 'field_b'],   // CSV template columns

  sections: [
    { key: 'section_key', label: 'Section Label', columns: 4, fields: ['field_a', 'field_b'] },
  ],

  fields: [ /* see §3 */ ],

  filters: [ { key: 'all', label: 'All', query: {} } ],

  actions: [], // reserved for query-shaped conditional actions (appliesTo) — rarely used directly

  // Optional override if permission keys don't follow the default
  // view_<entity> / manage_<entity> convention.
  // roles: { view: 'view_entity', manage: 'manage_entity' },
};
```

### moduleRole vs per-action role

- `moduleRole` (top-level) — gates the WHOLE grid + WHOLE profile page.
- `role` (inside one `profileActions` entry) — gates just that one
  button once the user is already on the page.

Both are **UI-only**. The matching `route.js` needs the equivalent
server-side check for this to be real enforcement, not just a hidden
button — a hidden delete button is not access control.

---

## 3. Field option reference

```js
{ key: 'db_column', label: 'Shown Label', type: 'text', /* ...flags */ }
```

- `key` — DB column name
- `label` — UI display label (frontend schema only)
- `type` — drives both the input widget and, on the backend schema, the
  SQL/validation type. Types available: `text`, `tel`, `email`,
  `number`, `money`, `datetime`, `textarea`, `richtext`, `select` (fixed
  `options` array — use for small closed sets defined up front, e.g. a
  status enum), `groupedSelect` (options loaded live from DISTINCT
  values already on the table via `endpoint` + `groupByField` — use
  when the option set should grow with real data instead of being
  hardcoded, e.g. "assigned staff member" or "category"), `image`,
  `hidden`, `liveSearch` (cross-table search-and-pick field — points at
  another entity's table via `searchTable`/`valueField`/`displayField`)
- `system: true` — framework-managed column (`primkey`, `record_id`),
  never hand-edited
- `editable: false` — shown but not user-editable, typically because an
  action sets it programmatically (most often a foreign-key-style
  pointer to another entity's record)
- `computed: true` — derived at render time (e.g. a row-number column)
- `searchable: true` — backend schema only; included in text search
- `title: true` — this field can serve as the row's display title
- `sum: true` — grid footer sums this column (numeric/money fields)
- `colSpan` — form-grid width out of 12 columns
- `options` — fixed dropdown values (`select` type only)
- `endpoint` / `groupByField` / `searchable` / `allowAddNew` —
  `groupedSelect` config
- `searchTable` / `valueField` / `displayField` / `labelKey` —
  `liveSearch` config, points at another entity's schema/table

`primkey`, `record_id`, and a computed row-count column are boilerplate
present on every entity regardless of domain.

---

## 4. profileActions — buttons

```js
{
  key: 'action_key',        // matches a function in logicControl/actionsRegistry.js,
                             // OR a reserved key: back, save, delete, view, new, clone
  label: 'Button Label',
  icon: 'icon-name',
  grid: true,                 // show in grid toolbar/row-dropdown
  form: true,                 // show on profile/form page
  rowAction: true,             // show in the grid row's dropdown menu
  type: 'action',              // marks it as routed through actionsRegistry
  variant: 'outline-primary',  // Bootstrap-style variant
  colorClass: 'dyn-btn-accent-blue', // custom accent class
  navigateTo: '/app/<entity>/profile', // for plain link buttons only
  confirm: 'Are you sure...?',   // confirmation prompt (typically delete)
  editOnly: true,                // only show once a record exists (hide on "new" form)
  role: 'manage_entity',         // per-action permission gate
}
```

`delete` and `clone` are intercepted directly by the form controller
before reaching the registry — never register functions under those two
keys, they will never fire.

---

## 5. actionsRegistry.js — wiring behavior

Every registered function gets ONE `ctx` object instead of positional
args — the extensibility point for adding new capability later without
changing every call site:

- `ctx.rows` — matched rows (bulk actions: every matched row;
  single-row dropdown/profile actions: `[row]`; list-level actions
  with no row, e.g. a "register new X" toolbar button: `[]`)
- `ctx.schema` — the full schema object (`apiBase`, `entity`, etc.)
- `ctx.router` — Next.js router, present for grid-toolbar and
  single-row actions; use for `router.push()`
- `ctx.refresh` — reloads whatever list/grid/form triggered the action
- `ctx.create` / `ctx.update` / `ctx.remove` — the SAME data-engine
  instance's bound methods the calling grid/form already uses — not a
  separate codepath, so it auto-reloads on success the same way a
  normal form submit would
- `ctx.filter` / `ctx.setFilterValue` / `ctx.setAdvancedQuery` /
  `ctx.setDateRange` / `ctx.applyFilter` / `ctx.clearFilterValue` —
  grid-toolbar-only filter controls

### Reusable action shapes (copy the one that matches, rename keys)

**Bulk-select hook** — bound via `gridOptions.checkFunction`:
```js
gridCheckBoxAction: async ({ rows }) => {
  alert(`${rows.length} record(s) selected`);
},
```

**Direct mutation/fetch** (bulk export, sync, send — no form needed):
```js
export_selected: async ({ rows }) => {
  const ids = rows.map((r) => r.record_id).filter(Boolean);
  await fetch('/api/<app>/<entity>/export', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
},
```

**Plain navigation** (works from grid dropdown OR profile button —
unlike schema's own `navigateTo`, whose calling convention differs
between the two):
```js
view_on_map: ({ rows, router }) => {
  const row = rows?.[0];
  if (!row || !router) return;
  router.push(`/app/<entity>/map?record_id=${row.record_id}`);
},
```

**Navigate to a linked record's profile** (this row carries a pointer
to another entity's record):
```js
view_linked_record: ({ rows, router }) => {
  const row = rows?.[0];
  if (!row?.other_entity_id || !router) return;
  router.push(`/app/<other_entity>/profile?<other_entity>_dataNode=${btoa(row.other_entity_id)}`);
},
```

**Popup a related list from ANOTHER entity**, scoped to this row via
`fixedQuery`. `fixedQuery` keys are camelCase URL params the OTHER
entity's own `route.js` resolves back to a real DB column — check that
target's fields before inventing a param name; `recordId` is always
safe (built-in alias every table has):
```js
import OtherEntityList from "../../otherEntity/uiControl/OtherEntityList";
import { MosyCard } from "../../../components/MosyCard";

view_related: ({ rows }) => {
  const row = rows?.[0];
  if (!row) return;
  MosyCard("", <OtherEntityList
    customProfilePath="../otherEntity/profile"
    title={`Related records for ${row.title || ''}`}
    fixedQuery={{ relatedRecordId: btoa(row.record_id) }}
    hiddenActions={['new']}
  />, true, "modal1", "mosycard_wide");
},
```

**Popup a preset "create" form for ANOTHER entity**, some fields
pre-filled/locked from this row. `fieldOverrides` only touches fields
that already exist on the target schema — it can't inject new ones:
```js
import OtherEntityProfile from "../../otherEntity/uiControl/OtherEntityProfile";
import { OtherEntitySchema } from "../../otherEntity/OtherEntitySchema";
import { buildPresetFromRow, openEntityCreateModal } from "../../moduleControl/UiControl/EntityCreateModal";

add_related: ({ rows, refresh }) => {
  const row = rows?.[0];
  if (!row) return;
  openEntityCreateModal({
    ProfileComponent: OtherEntityProfile,
    schema: OtherEntitySchema,
    title: `New record — ${row.title || ''}`,
    presetValues: buildPresetFromRow(row, [
      { sourceKey: 'record_id', destKey: 'related_record_id' }, // must exist on OtherEntitySchema
    ]),
    fieldOverrides: { related_record_id: { editable: false, type: 'hidden' } },
    sectionFieldOrder: { basic_information: ['title', 'related_record_id'] },
    onSaved: refresh,
  });
},
```

**Quick-edit modal** — edit a SUBSET of this row's own fields without
leaving the grid/list:
```js
import { quickEditFromRow } from "../../moduleControl/UiControl/QuickEditModal";

update_status: (ctx) => {
  quickEditFromRow(ctx, {
    fieldKeys: ['status', 'notes'],       // must be real schema.fields keys
    title: 'Update status — {{title}}',   // {{field}} templated against the row
    fieldOverrides: { status: { colSpan: 6 }, notes: { colSpan: 12 } },
    // getId defaults to (row) => row.record_id — override if this
    // entity's update endpoint keys off something else, e.g. primkey:
    // getId: (row) => btoa(row.primkey),
  });
},
```
Do NOT call `openQuickEditModal(ctx, opts)` directly with two args — it
takes ONE options object; calling it wrong silently breaks.

**Grid-toolbar smart filter** — pick a value, re-scope the grid.
Exclusive by default (replaces the active filter); pass `combine: true`
to stack instead. Only wire as `type: 'action'` with `grid: true` —
needs `ctx.setAdvancedQuery`, only present in grid-toolbar ctx:
```js
import { openSmartTagFilter, openSmartDateFilter, openSmartMapFilter } from "../../moduleControl/UiControl/smartFilterActions";

filter_by_status: (ctx) => openSmartTagFilter(ctx, { title: 'Filter by status', columnKey: 'status' }),
filter_by_date: (ctx) => openSmartDateFilter(ctx, { title: 'Filter by date', columnKey: 'created_on' }),
filter_by_related: (ctx) => openSmartMapFilter(ctx, {
  title: 'Filter by related record',
  searchSchema: OtherEntitySchema,
  displayField: 'title', valueField: 'record_id',
  localColumnKey: 'related_id', // real column on THIS table
}),
```

---

## 6. Modeling relationships between entities

Cross-entity links in this pattern are **plain text columns storing
another table's `record_id`** — not real DB foreign keys, and not typed
to one specific target table. The same pointer column can mean "points
at entity A or entity B" depending on which flow created the record
(e.g. a generic `related_record_id` used for both "linked to a
customer" and "linked to an order").

Resolution happens entirely at the UI layer: whichever popup/list
component is opened passes `fixedQuery={{ someKey: btoa(pointerValue)
}}`, and the TARGET entity's `route.js` maps that camelCase key to a
real column. This is what lets one module reuse another module's list
component as a lookup/filter view with zero changes to that component.

This loose-pointer approach is exactly what makes the same schema
pattern reusable across unrelated domains: a POS app's `order` can
point at a `customer` or a `table`; a shipping app's `shipment` can
point at a `driver` or a `vehicle`; a voting app's `ballot` can point at
a `voter` or a `precinct` — same mechanism, different entity names.

**When designing a new module set:**
1. Decide which entities need to reference each other.
2. Add a plain text pointer field (`editable: false`, set only by an
   action) on the "child" entity for each relationship.
3. Write the "create linked record" action on the parent using
   `buildPresetFromRow` + `openEntityCreateModal` to set that pointer.
4. Write the "view linked records" action on the parent using
   `fixedQuery` to filter the child's list by that pointer.
5. If the child needs to jump back to its parent, add a plain
   navigation action using the `${entity}_dataNode` query convention.

---

## 7. Worked example skeletons across different domains

These aren't real modules in this codebase — they illustrate how the
exact same five-file pattern maps onto unrelated apps.

**POS (products / orders):**
- `products` entity: fields like `product_name`, `sku`, `price`
  (money), `category` (groupedSelect), `stock_quantity` (number)
- `orders` entity: `order_number`, `customer_id` (text, not editable —
  set by an order-creation action), `order_status` (select), `total_amount`
  (money, summed)
- Action on `products`: `add_to_order` — preset-create an order line
  item, locking `product_id` to this product's `record_id`
- Action on `orders`: `view_line_items` — popup listing order lines
  scoped by `fixedQuery={{ orderId: btoa(order.record_id) }}`

**Voting system (candidates / ballots):**
- `candidates` entity: `candidate_name`, `party` (select),
  `district` (groupedSelect)
- `ballots` entity: `voter_id` (text, not editable), `candidate_id`
  (text, not editable), `cast_on` (datetime, not editable)
- Action on `candidates`: `view_ballots` — popup listing ballots scoped
  by `candidate_id`
- Grid-toolbar filter on `ballots`: `filter_by_district` via
  `openSmartTagFilter`

**Shipping/dispatch (shipments / drivers):**
- `drivers` entity: `driver_name`, `phone_number` (tel), `vehicle_type`
  (groupedSelect), `availability_status` (select)
- `shipments` entity: `tracking_number`, `driver_id` (text, not
  editable), `delivery_status` (select), `destination_address`
  (textarea)
- Action on `drivers`: `assign_shipment` — preset-create a shipment,
  locking `driver_id`
- Action on `shipments`: `update_status` — quick-edit modal on just
  `delivery_status`

Same five files, same `ctx` shape, same action patterns — only the
entity name, field list, and option values change.

---

## 8. Building a new module — checklist

1. Copy the template's `<Entity>Schema.js` (frontend) and backend
   `<Entity>Schema.js`, rename `entity`, `label`, and `apiBase`.
2. Define `fields[]` for the new domain, keeping `primkey`/`record_id`/
   row-count boilerplate. Mirror the field list between frontend and
   backend schema (frontend adds `label`; backend adds `searchable`).
3. Group fields into `sections[]` for the form layout.
4. Pick `showInList` (grid columns) and `exportColumns` (CSV template).
5. Add `profileActions` entries for anything beyond the built-in
   back/save/delete/view/new/clone buttons.
6. Register a same-keyed function per custom action in
   `logicControl/actionsRegistry.js`, using the shapes in §5.
7. Set `moduleRole`/per-action `role` if the module needs permission
   gating — then mirror that check server-side in `route.js`.
8. If this entity links to another one, follow §6's relationship
   checklist.
