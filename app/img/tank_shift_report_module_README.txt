# TANK SHIFT REPORT MODULE

## OBJECTIVE

Build a simple READ-ONLY module that generates the Tank Farm / Tank Shift section of the station shift report.

The supplied SHELL EMCO Day Shift report contains:
- Sale Summary
- Fleet Sale Summary
- Meter Reading Report
- End Of Shift Tank Farm Sales
- End Of Shift Attendant Sales

For this module, DO NOT implement or depend on the Meter Reading Report.

The reference Tank Farm section uses:

Tank ID | Opening Volume (l) | Quantity Received (l) | Tank Sales Sub-total (l) | Closing volume (l)

The supplied report shows this tank section on page 1. fileciteturn0file0L106-L112

This module must obtain tank information from:
- `tanks`
- `tank_level_history`

It must NOT depend on pump meter readings.

---

# 1. TABLES

## TANKS

Table:

`tanks`

Columns:

```text
primkey
tank_id
tank_name
fuel_type
capacity_liters
current_liters
site_location
min_threshold
max_threshold
status
tank_type
reg_date
hive_site_id
hive_site_name
```

Important fields:

```text
tank_id
tank_name
fuel_type
capacity_liters
current_liters
site_location
min_threshold
max_threshold
status
tank_type
hive_site_id
hive_site_name
```

## TANK LEVEL HISTORY

Table:

`tank_level_history`

Columns:

```text
primkey
movement_id
tank_id
device_id
movement_type
liters_in
liters_out
new_volume
reference_no
remarks
movement_time
reg_date
hive_site_id
hive_site_name
```

Important fields:

```text
movement_id
tank_id
movement_type
liters_in
liters_out
new_volume
reference_no
remarks
movement_time
hive_site_id
hive_site_name
```

---

# 2. CORE FLOW

The report is based on:

```text
SELECTED DATE
+
SELECTED SYSTEM SHIFT
+
SHIFT OPENING TIME
+
SHIFT CLOSING TIME
```

Example:

```text
Date: 2026-07-15
Shift: Day Shift
Opening: 07:00:00
Closing: 19:00:00
```

Calculate:

```text
START:
2026-07-15 07:00:00

END:
2026-07-15 19:00:00
```

Then use `tank_level_history.movement_time` to determine tank movements.

The user must NOT manually enter start/end times.

---

# 3. NO PUMP METER READINGS

Do NOT use:

```text
Opening Meter Reading
Closing Meter Reading
Pump
Nozzle
```

The Meter Reading Report in the supplied report is intentionally excluded.

The tank report is generated from:

```text
tanks
+
tank_level_history
```

The reference report's Meter Reading section is separate from the Tank Farm section. fileciteturn0file0L12-L14

---

# 4. REPORT OUTPUT

The module should generate:

```text
END OF SHIFT TANK FARM SALES

Date: 15 Jul 2026
Shift: Day Shift
From: 07:00
To: 19:00

------------------------------------------------------------------
Tank        Fuel       Opening   Received   Sales    Closing  Var.
------------------------------------------------------------------
UNLEADED 1  Unleaded   15522.35   0.00     2647.75  12874.60  0.00
DIESEL 2    Diesel         0.00   0.00        0.00      0.00  0.00
DIESEL 3    Diesel      6260.29   0.00     2529.06   3731.23  0.00
V POWER 4   V-Power     3479.52   0.00      138.59   3340.93  0.00
------------------------------------------------------------------
```

The example values above come from the supplied report; the application must calculate its own values from the database. The supplied report shows the original four tank rows and their opening, received, sales and closing values. fileciteturn0file0L108-L112

---

# 5. LOAD TANKS

Use:

```sql
SELECT
    tank_id,
    tank_name,
    fuel_type,
    capacity_liters,
    current_liters,
    site_location,
    min_threshold,
    max_threshold,
    status,
    tank_type
FROM tanks
WHERE hive_site_id = ?
ORDER BY tank_id ASC
```

Use the existing application's standard rule for active/inactive tanks if one already exists.

Do not invent a separate tank-selection system.

---

# 6. OPENING VOLUME

Opening volume means the latest known tank volume immediately before the shift starts.

Use `tank_level_history.new_volume`.

Find:

```text
movement_time < shift_start
```

ordered newest first:

```sql
SELECT
    new_volume,
    movement_time
FROM tank_level_history
WHERE tank_id = ?
AND hive_site_id = ?
AND movement_time < ?
ORDER BY movement_time DESC, primkey DESC
LIMIT 1
```

The returned `new_volume` becomes:

```text
Opening Volume
```

IMPORTANT:

Do NOT use `tanks.current_liters` as the historical opening volume.

`current_liters` represents the tank's current state, not necessarily its state at the selected historical shift.

---

# 7. CLOSING VOLUME

Closing volume means the latest known tank volume at or before the shift end.

Use:

```text
movement_time <= shift_end
```

ordered newest first:

```sql
SELECT
    new_volume,
    movement_time
FROM tank_level_history
WHERE tank_id = ?
AND hive_site_id = ?
AND movement_time <= ?
ORDER BY movement_time DESC, primkey DESC
LIMIT 1
```

The returned `new_volume` becomes:

```text
Closing Volume
```

IMPORTANT:

Do NOT use `tanks.current_liters` for historical closing volume.

---

# 8. QUANTITY RECEIVED

Quantity received during the shift comes primarily from:

```text
tank_level_history.liters_in
```

Use:

```sql
SELECT
    COALESCE(SUM(liters_in), 0) AS quantity_received
FROM tank_level_history
WHERE tank_id = ?
AND hive_site_id = ?
AND movement_time >= ?
AND movement_time < ?
```

If the existing application has standardized `movement_type` values for receiving/incoming stock, use those definitions.

Do not invent movement type strings.

---

# 9. TANK SALES

Tank sales during the shift come primarily from:

```text
tank_level_history.liters_out
```

Use:

```sql
SELECT
    COALESCE(SUM(liters_out), 0) AS tank_sales
FROM tank_level_history
WHERE tank_id = ?
AND hive_site_id = ?
AND movement_time >= ?
AND movement_time < ?
```

If the existing application distinguishes sales from other outgoing movements using `movement_type`, apply the existing business rules.

Do not assume every `liters_out` movement is a sale if the database contains other legitimate outgoing movement types.

---

# 10. RECONCILIATION

Calculate:

```text
expected_closing =
    opening_volume
    + quantity_received
    - tank_sales
```

Then:

```text
variance =
    actual_closing
    - expected_closing
```

Example:

```text
Opening:          15,522.35
Received:              0.00
Sales:             2,647.75
Expected Closing: 12,874.60
Actual Closing:   12,874.60
Variance:              0.00
```

The supplied report's Tank Farm section follows the same opening + received - sales = closing stock relationship. fileciteturn0file0L108-L112

Do not modify source data to make the values balance.

---

# 11. MISSING HISTORY

If no history exists before shift start:

```text
opening_volume = null
```

Do NOT silently use zero.

If no history exists at/before shift end:

```text
closing_volume = null
```

Do NOT silently use `tanks.current_liters`.

Display:

```text
—
```

and optionally:

```text
Historical tank level unavailable
```

If opening or closing is unavailable, do not present a fake variance.

---

# 12. SHIFT SELECTION

Use the existing `system_shifts` table.

User interface:

```text
TANK SHIFT REPORT

Date
[ 15 Jul 2026 ]

Shift
[ Day Shift ▼ ]

[ VIEW REPORT ]
```

The selected shift supplies:

```text
opening_time
closing_time
```

The user does not manually enter times.

---

# 13. OVERNIGHT SHIFTS

Support overnight shifts.

Example:

```text
Night Shift
22:00 → 06:00
```

For date:

```text
2026-07-15
```

calculate:

```text
START:
2026-07-15 22:00:00

END:
2026-07-16 06:00:00
```

Use the same overnight logic as the Shift Sales History module.

---

# 14. API

Suggested endpoint:

```text
GET /api/fuel/tank-shift-report
```

Parameters:

```text
date
shift_id
```

Example:

```text
/api/fuel/tank-shift-report?date=2026-07-15&shift_id=SHIFT001
```

Backend flow:

1. Validate date.
2. Validate selected system shift.
3. Load shift from `system_shifts`.
4. Calculate start datetime.
5. Calculate end datetime.
6. Load tanks.
7. Find opening volume per tank.
8. Calculate received volume.
9. Calculate tank sales.
10. Find closing volume.
11. Calculate expected closing.
12. Calculate variance.
13. Return report.

---

# 15. API RESPONSE

Suggested:

```json
{
    "success": true,
    "report": {
        "date": "2026-07-15",
        "shift_name": "Day Shift",
        "start_datetime": "2026-07-15 07:00:00",
        "end_datetime": "2026-07-15 19:00:00"
    },
    "summary": {
        "total_received": 0,
        "total_sales": 5315.40,
        "tank_count": 4
    },
    "tanks": [
        {
            "tank_id": "1",
            "tank_name": "UNLEADED 1",
            "fuel_type": "UNLEADED",
            "opening_volume": 15522.35,
            "quantity_received": 0,
            "tank_sales": 2647.75,
            "expected_closing": 12874.60,
            "closing_volume": 12874.60,
            "variance": 0
        }
    ]
}
```

Field names may follow existing project conventions.

---

# 16. FRONTEND

Page:

```text
Tank Shift Report
```

Top controls:

```text
Date
[ date picker ]

Shift
[ shift dropdown ]

[ VIEW REPORT ]
```

After loading:

```text
END OF SHIFT TANK FARM SALES

Day Shift
15 Jul 2026
07:00 AM → 07:00 PM

[ Export PDF ] [ Export Excel ]
```

Then the tank table.

---

# 17. TANK TABLE

Recommended columns:

```text
Tank
Fuel
Opening
Received
Sales
Expected Closing
Closing
Variance
```

Use number formatting:

```text
15,522.35
2,647.75
12,874.60
```

Keep the table compact and readable.

---

# 18. SUMMARY

Show:

```text
Total Tanks
4

Total Received
0.00 L

Total Tank Sales
5,315.40 L

Total Variance
0.00 L
```

All summary values must come from the selected site's tanks and selected reporting period.

---

# 19. PDF EXPORT

Add:

```text
[ Export PDF ]
```

The PDF should contain:

```text
END OF SHIFT TANK FARM SALES

Station: [Station Name]

Date: 15 Jul 2026
Shift: Day Shift

From: 07:00
To: 19:00
```

Table:

```text
Tank
Fuel
Opening Volume
Quantity Received
Tank Sales
Expected Closing
Closing Volume
Variance
```

The PDF should be suitable for printing and visually similar to the Tank Farm section of the supplied station report.

The supplied report uses the original columns:

```text
Tank ID
Opening Volume (l)
Quantity Received (l)
Tank Sales Sub-total (l)
Closing volume (l)
```

fileciteturn0file0L106-L112

`Expected Closing` and `Variance` are additional calculated reconciliation fields for this module.

---

# 20. EXCEL EXPORT

Add:

```text
[ Export Excel ]
```

Recommended workbook:

```text
Summary
Tank Report
```

Summary:

```text
Station
Date
Shift
Opening Time
Closing Time
Total Tanks
Total Received
Total Tank Sales
Total Variance
```

Tank Report:

```text
Tank ID
Tank Name
Fuel Type
Opening Volume
Quantity Received
Tank Sales
Expected Closing
Closing Volume
Variance
```

Export ALL tanks in the report.

---

# 21. READ-ONLY RULE

This module is READ ONLY.

It may:

```text
READ tanks
READ tank_level_history
READ system_shifts
CALCULATE
DISPLAY
EXPORT
```

It must NOT:

```text
UPDATE tank_level_history
UPDATE tanks
DELETE movements
CREATE fake movements
CREATE adjustment records
```

---

# 22. NO NEW DATABASE TABLES

Do not create a new table for this report.

Use:

```text
system_shifts
tanks
tank_level_history
```

only.

---

# 23. PERFORMANCE

Do not load the entire `tank_level_history` table into the browser.

For a small number of tanks, clean server-side per-tank queries are acceptable for the first version.

For optimization later, the backend can:

1. Load all tanks.
2. Load relevant movements for the selected period.
3. Load latest pre-shift records per tank.
4. Load latest end-of-shift records per tank.
5. Calculate in application code.

All heavy processing remains server-side.

---

# 24. INDEXES

Check existing indexes before adding anything.

Useful index:

```sql
INDEX idx_tank_history_tank_time
(
    tank_id,
    movement_time
)
```

Potential site-aware index:

```sql
INDEX idx_tank_history_site_tank_time
(
    hive_site_id,
    tank_id,
    movement_time
)
```

Do not create duplicate indexes.

---

# 25. TIMEZONE

Use the application's existing timezone configuration.

The system operates in Kenya.

Do not introduce a separate timezone implementation.

`movement_time` must be compared consistently with the calculated shift start/end datetime.

If the existing application uses:

```text
Africa/Nairobi
```

continue using that convention.

---

# 26. SECURITY

Backend must validate:

```text
date
shift_id
hive_site_id
```

The selected system shift must belong to the active site.

Tank history must be restricted to:

```text
hive_site_id
```

Never trust a client-provided site ID to access another site.

Use parameterized SQL.

---

# 27. MOVEMENT TYPE

The table contains:

```text
movement_type
```

but this README does not assume exact movement type names.

The implementation must inspect the existing project's movement type conventions.

Primary calculations:

### Received

```text
liters_in
```

### Outgoing / Tank Sales

```text
liters_out
```

If the application has standardized movement types such as receiving, sale, transfer or adjustment, use those existing definitions.

Do not invent movement type values.

---

# 28. EMPTY STATES

No tanks:

```text
No tanks found

There are no tanks configured for this station.
```

No historical data:

```text
Tank history unavailable

No tank movement history was found for the selected period.
```

Do not generate misleading zero values when historical data is genuinely missing.

---

# 29. ERROR HANDLING

Use simple user-facing messages:

```text
Please select a date.
```

```text
Please select a shift.
```

```text
We couldn't load the tank report.
Please try again.
```

```text
We couldn't generate the PDF.
Please try again.
```

```text
We couldn't generate the Excel report.
Please try again.
```

Do not expose raw SQL/database errors.

Log technical errors server-side.

---

# 30. SUGGESTED FILE STRUCTURE

```text
tank-shift-report/
│
├── page.jsx
│
├── components/
│   ├── TankShiftFilter.jsx
│   ├── TankShiftSummary.jsx
│   ├── TankShiftTable.jsx
│   └── TankShiftExportButtons.jsx
│
└── api/
    └── route.js
```

Follow the existing project architecture if it already has a standard pattern.

Do not create unnecessary architecture.

---

# 31. ACCEPTANCE CRITERIA

- [ ] User can select a date.
- [ ] User can select a shift.
- [ ] Shift times come from `system_shifts`.
- [ ] Normal shifts work.
- [ ] Overnight shifts work.
- [ ] Tanks come from `tanks`.
- [ ] Tank history comes from `tank_level_history`.
- [ ] Meter readings are NOT used.
- [ ] Pump meter opening readings are NOT used.
- [ ] Pump meter closing readings are NOT used.
- [ ] Opening tank volume comes from the latest `new_volume` before shift start.
- [ ] Closing tank volume comes from the latest `new_volume` at/before shift end.
- [ ] Quantity received is calculated from `liters_in`.
- [ ] Tank sales are calculated from `liters_out`, respecting existing movement type rules.
- [ ] Expected closing is calculated.
- [ ] Variance is calculated.
- [ ] `tanks.current_liters` is NOT used as historical opening/closing data.
- [ ] Missing historical values are not silently replaced with zero.
- [ ] `hive_site_id` is enforced.
- [ ] No new database tables are created.
- [ ] Existing tank history is never modified.
- [ ] PDF export works.
- [ ] Excel export works.
- [ ] PDF contains the complete tank report.
- [ ] Excel contains the complete tank report.
- [ ] SQL uses parameterized queries.
- [ ] No duplicate indexes are created.
- [ ] Existing project architecture is reused.

---

# 32. DO NOT OVERENGINEER

Do NOT add:

- Meter reading management
- Pump/nozzle meter calculations
- Tank movement creation
- Tank movement editing
- Tank movement deletion
- New database tables
- Complex dashboards
- Charts
- Unnecessary filters
- Client-side loading of the complete movement history
- Fake opening/closing values
- Dependency on `fuel_sales.shift_id`

Core flow:

```text
DATE + SYSTEM SHIFT
        ↓
GET SHIFT START / END
        ↓
LOAD TANKS
        ↓
GET TANK HISTORY
        ↓
OPENING VOLUME
        ↓
+ RECEIVED
        ↓
- TANK SALES
        ↓
EXPECTED CLOSING
        ↓
COMPARE WITH ACTUAL CLOSING
        ↓
VARIANCE
        ↓
DISPLAY / PDF / EXCEL
```

Build this as a clean READ-ONLY reporting module.
