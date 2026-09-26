# SHIFT REPORT MODULE

## OBJECTIVE

Build one simple READ-ONLY reporting module that generates a complete shift report from existing system data.

The user selects:

```text
Date
Shift
```

The system gets the shift opening and closing times from `system_shifts`, creates the reporting datetime range, and generates the report.

Do NOT reference any external report/document name in the code or UI.

Do NOT mention or depend on the name of any uploaded/reference document.

The module is simply a generic:

```text
SHIFT REPORT
```

---

# 1. REPORT SECTIONS

The report should contain these sections:

```text
1. SALES PER PRODUCT
2. SALES PER PUMP / NOZZLE
3. TANK MOVEMENT REPORT
4. ATTENDANT REPORT
5. COLLECTION REPORT
```

Do NOT include:

```text
Meter Opening Readings
Meter Closing Readings
```

The report is based on actual sales, tank movement history, attendants and payment/collection records.

---

# 2. EXISTING SHIFT LOGIC

Use the existing:

```text
system_shifts
```

columns:

```text
primkey
record_id
location_id
shift_name
shift_code
opening_time
closing_time
remark
created_by
reg_date
hive_site_id
hive_site_name
```

User selects:

```text
Date
[ 23 Sep 2026 ]

Shift
[ Day Shift ▼ ]

[ VIEW SHIFT REPORT ]
```

The user does NOT enter start/end times.

If the selected shift is:

```text
opening_time = 07:00:00
closing_time = 19:00:00
```

and date is:

```text
2026-09-23
```

the system calculates:

```text
START:
2026-09-23 07:00:00

END:
2026-09-23 19:00:00
```

Use:

```sql
date_time >= start_datetime
AND date_time < end_datetime
```

---

# 3. OVERNIGHT SHIFTS

Support shifts such as:

```text
22:00 → 06:00
```

For:

```text
2026-09-23
```

calculate:

```text
START:
2026-09-23 22:00:00

END:
2026-09-24 06:00:00
```

Use the same overnight logic throughout every report section.

---

# 4. IMPORTANT SITE FILTER

Every section must respect:

```text
hive_site_id
```

The backend must use the active site.

Never allow a request to retrieve another site's data by changing a frontend parameter.

Use parameterized SQL.

---

# 5. SECTION 1 — SALES PER PRODUCT

Use:

```text
fuel_sales
```

Existing columns include:

```text
fuel_type
quantity_sold_litres
total_amount
sale_date
hive_site_id
```

Query sales within:

```text
shift_start
shift_end
```

using:

```sql
WHERE hive_site_id = ?
AND sale_date >= ?
AND sale_date < ?
```

Group by:

```text
fuel_type
```

Return:

```text
Fuel Type
Transaction Count
Volume (Litres)
Sales Amount
```

Example:

```text
-----------------------------------------------
PRODUCT        TRANSACTIONS    LITRES    SALES
-----------------------------------------------
Unleaded            554       1,539.02   330,271.48
Diesel               34       1,734.78   379,654.73
V-Power             278         436.44   100,236.70
-----------------------------------------------
TOTAL               866       3,710.24   810,162.91
```

The actual values must come from the selected shift.

Do not hard-code product names.

---

# 6. SECTION 2 — SALES PER PUMP / NOZZLE

Use:

```text
fuel_sales
```

Relevant fields:

```text
pump
pump_nozzle_id
fuel_type
quantity_sold_litres
total_amount
sale_date
hive_site_id
```

Group sales by:

```text
pump
pump_nozzle_id
fuel_type
```

Return:

```text
Pump
Nozzle
Fuel
Transaction Count
Litres
Sales Amount
```

Example:

```text
---------------------------------------------------------
PUMP   NOZZLE   FUEL        TXNS    LITRES     SALES
---------------------------------------------------------
1      1        Unleaded     80      447.95    96,000
1      2        Diesel       12       11.17     2,500
1      3        V-Power      65      670.75   145,000
---------------------------------------------------------
```

Do not use meter readings.

The volume comes directly from:

```text
quantity_sold_litres
```

---

# 7. SECTION 3 — TANK MOVEMENT REPORT

Use:

```text
tanks
tank_level_history
```

## TANKS

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

## TANK LEVEL HISTORY

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

For each tank calculate:

```text
Opening Volume
Received
Tank Out / Sales
Closing Volume
```

Opening volume:

Find the latest:

```text
new_volume
```

before:

```text
shift_start
```

using:

```sql
movement_time < shift_start
```

Closing volume:

Find the latest:

```text
new_volume
```

at or before:

```text
shift_end
```

using:

```sql
movement_time <= shift_end
```

Received:

```text
SUM(liters_in)
```

during the shift.

Outgoing:

```text
SUM(liters_out)
```

during the shift.

Use existing `movement_type` rules if the application has them.

Do not invent movement type values.

Report:

```text
Tank
Fuel
Opening
Received
Out
Closing
Variance
```

Calculate:

```text
expected_closing =
opening
+ received
- out
```

Then:

```text
variance =
actual_closing
- expected_closing
```

Do NOT use:

```text
tanks.current_liters
```

as historical opening or closing data.

If historical opening/closing data is unavailable, show:

```text
—
```

rather than inventing zero.

---

# 8. SECTION 4 — ATTENDANT REPORT

Build an attendant sales report from the sales records.

Use:

```text
fuel_sales
```

Relevant field:

```text
sold_by_staff_id
```

Group by:

```text
sold_by_staff_id
```

Return:

```text
Attendant
Transaction Count
Volume (Litres)
Sales Amount
```

Example:

```text
------------------------------------------------
ATTENDANT          TXNS     LITRES      SALES
------------------------------------------------
John Kamau          85       667.15     146,180.30
Mary Wanjiku       120       981.60     215,172.50
Peter Mwangi        92       812.74     178,081.30
------------------------------------------------
TOTAL              297     2,461.49     539,434.10
```

Use the existing staff/user lookup mechanism to resolve:

```text
sold_by_staff_id
```

to the staff name.

Do not create a new staff table for this report.

If a staff record cannot be resolved, display the ID rather than failing the entire report.

---

# 9. SECTION 5 — COLLECTION REPORT

Generate a collection/payment report from the existing payment data.

IMPORTANT:

First inspect the existing project payment schema and existing payment logic.

Do NOT create a new payments table.

Do NOT invent payment column names if an existing payment table already exists.

Use the existing payment records associated with the selected site's sales.

The report should show:

```text
Payment Method
Transaction Count
Amount Collected
```

Example:

```text
----------------------------------------------
PAYMENT METHOD       TXNS        COLLECTED
----------------------------------------------
Cash                 120         180,500.00
M-Pesa               230         420,250.00
Card                  35          85,000.00
Fleet/Credit          12          40,000.00
----------------------------------------------
TOTAL                397         725,750.00
```

The exact payment methods must come from the existing payment data.

Do not hard-code:

```text
Cash
M-Pesa
Card
```

unless those values already exist in the application.

The collection section must use the same:

```text
site
shift start
shift end
```

reporting period.

---

# 10. COLLECTION RECONCILIATION

Where the existing payment system supports it, show:

```text
Sales Total
Collections Total
Difference
```

Calculate:

```text
difference =
sales_total
- collections_total
```

Do not invent adjustments or force the values to match.

If the payment system does not provide enough information for a reliable reconciliation, simply show the collection totals without creating a fake difference.

---

# 11. OVERALL SHIFT SUMMARY

At the top of the report show:

```text
SHIFT REPORT

Date:
23 Sep 2026

Shift:
Day Shift

From:
07:00

To:
19:00
```

Then summary cards:

```text
Total Transactions
XXX

Total Litres
X,XXX.XX L

Total Sales
KES XXX,XXX.XX

Total Collections
KES XXX,XXX.XX
```

Use the same underlying shift filters.

---

# 12. FRONTEND UI

Keep it very simple.

```text
SHIFT REPORT

Date
[ 23 Sep 2026 ]

Shift
[ Day Shift ▼ ]

[ VIEW REPORT ]
```

After loading:

```text
SHIFT REPORT

Day Shift
23 Sep 2026
07:00 AM → 07:00 PM

[ Export PDF ] [ Export Excel ]
```

Then sections:

```text
SALES PER PRODUCT
```

```text
SALES PER PUMP / NOZZLE
```

```text
TANK MOVEMENTS
```

```text
ATTENDANT SALES
```

```text
COLLECTIONS
```

Do not build a complicated dashboard.

This is a reporting screen.

---

# 13. PDF EXPORT

Add:

```text
[ Export PDF ]
```

The PDF must contain the complete report.

Recommended order:

```text
SHIFT REPORT

1. SHIFT SUMMARY
2. SALES PER PRODUCT
3. SALES PER PUMP / NOZZLE
4. TANK MOVEMENT REPORT
5. ATTENDANT REPORT
6. COLLECTION REPORT
```

The PDF must use server-side data.

Do not export only the visible/current UI page.

If there are many rows, the PDF should automatically span multiple pages.

---

# 14. EXCEL EXPORT

Add:

```text
[ Export Excel ]
```

Use separate sheets:

```text
Summary
Sales Per Product
Sales Per Pump
Tank Movements
Attendants
Collections
```

This makes the report useful for accounting and further analysis.

Export complete datasets, not only currently visible rows.

---

# 15. API STRUCTURE

Suggested:

```text
GET /api/fuel/shift-report/shifts
GET /api/fuel/shift-report
GET /api/fuel/shift-report/export/pdf
GET /api/fuel/shift-report/export/excel
```

Example:

```text
/api/fuel/shift-report?date=2026-09-23&shift_id=SHIFT001
```

The backend calculates:

```text
shift_start
shift_end
```

Do NOT trust the frontend to send the datetime range.

The frontend only sends:

```text
date
shift_id
```

---

# 16. API RESPONSE

Suggested structure:

```json
{
    "success": true,

    "report": {
        "date": "2026-09-23",
        "shift_name": "Day Shift",
        "start_datetime": "2026-09-23 07:00:00",
        "end_datetime": "2026-09-23 19:00:00"
    },

    "summary": {
        "transactions": 866,
        "litres": 3710.24,
        "sales": 810162.91,
        "collections": 805000.00
    },

    "sales_per_product": [],

    "sales_per_pump": [],

    "tank_movements": [],

    "attendants": [],

    "collections": []
}
```

Use the project's existing response conventions if different.

---

# 17. PERFORMANCE

All report calculations must happen server-side.

Do NOT:

```text
load all fuel sales into React
load all tank history into React
calculate totals in the browser
filter large datasets in JavaScript
```

Use SQL aggregation:

```text
COUNT
SUM
GROUP BY
```

where appropriate.

The frontend receives only the report data it needs.

---

# 18. DATABASE INDEXES

Before adding indexes, inspect existing indexes.

Useful indexes may include:

```sql
fuel_sales:
(hive_site_id, sale_date)

fuel_sales:
(hive_site_id, pump, pump_nozzle_id, sale_date)

tank_level_history:
(hive_site_id, tank_id, movement_time)
```

Do not create duplicate indexes.

---

# 19. TIMEZONE

Use the application's existing timezone configuration.

Do not create a separate timezone implementation.

All:

```text
sale_date
movement_time
shift opening
shift closing
```

must be interpreted consistently.

If the application already uses:

```text
Africa/Nairobi
```

continue using it.

---

# 20. NO NEW DATABASE TABLES

Do not create any new database table for this reporting module.

Use the existing data sources.

Known sources:

```text
system_shifts
fuel_sales
tanks
tank_level_history
```

For collections:

```text
USE THE EXISTING PAYMENT TABLE / PAYMENT SYSTEM
```

after inspecting the project's existing implementation.

Do not invent a new payment schema.

---

# 21. READ-ONLY

This module is strictly READ ONLY.

It may:

```text
READ
CALCULATE
GROUP
SUM
DISPLAY
EXPORT
```

It must NOT:

```text
INSERT
UPDATE
DELETE
CREATE MOVEMENTS
CREATE SALES
CREATE PAYMENTS
ADJUST STOCK
```

---

# 22. ERROR HANDLING

Simple messages:

```text
Please select a date.
```

```text
Please select a shift.
```

```text
We couldn't load the shift report.
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

# 23. EMPTY STATES

If there are no sales:

```text
No sales found for this shift.
```

If there are no tank movements:

```text
No tank movements found for this shift.
```

If there are no attendant sales:

```text
No attendant sales found for this shift.
```

If there are no payment records:

```text
No collection records found for this shift.
```

Do not turn missing data into fake zero-value transactions.

---

# 24. SUGGESTED FILE STRUCTURE

```text
shift-report/
│
├── page.jsx
│
├── components/
│   ├── ShiftReportFilter.jsx
│   ├── ShiftReportSummary.jsx
│   ├── ProductSalesReport.jsx
│   ├── PumpNozzleSalesReport.jsx
│   ├── TankMovementReport.jsx
│   ├── AttendantReport.jsx
│   └── CollectionReport.jsx
│
└── api/
    └── route.js
```

If the project already has a reporting/module structure, follow it instead.

Do not create unnecessary architecture.

---

# 25. ACCEPTANCE CRITERIA

- [ ] User selects date.
- [ ] User selects shift.
- [ ] Shift times come from `system_shifts`.
- [ ] Normal shifts work.
- [ ] Overnight shifts work.
- [ ] Site filtering is enforced.
- [ ] Sales per product works.
- [ ] Sales per pump/nozzle works.
- [ ] Tank movement report works.
- [ ] Attendant report works.
- [ ] Collection report works using the existing payment system.
- [ ] No meter readings are used.
- [ ] No pump meter opening readings are used.
- [ ] No pump meter closing readings are used.
- [ ] `fuel_sales.shift_id` is NOT required for sales reporting.
- [ ] Sales are filtered by `sale_date`.
- [ ] Tank movements are filtered by `movement_time`.
- [ ] Tank opening volume comes from historical `new_volume`.
- [ ] Tank closing volume comes from historical `new_volume`.
- [ ] Tank received volume uses `liters_in`.
- [ ] Tank outgoing volume uses `liters_out` and existing movement type rules where applicable.
- [ ] Attendants are grouped from `sold_by_staff_id`.
- [ ] Payment/collection data comes from the existing payment system.
- [ ] Summary totals are calculated server-side.
- [ ] PDF export works.
- [ ] Excel export works.
- [ ] Excel contains separate sheets for each report section.
- [ ] No new database tables are created.
- [ ] No source data is modified.
- [ ] SQL uses parameterized queries.
- [ ] Existing project architecture is reused.

---

# 26. DO NOT OVERENGINEER

Do NOT add:

- Meter reading reports
- Opening meter readings
- Closing meter readings
- Meter reconciliation
- New tank management
- New payment tables
- New sales tables
- Charts
- Complex dashboards
- Advanced filters
- Manual start/end time fields
- Client-side processing of large datasets
- Fake data
- Fake payment records
- Dependency on `fuel_sales.shift_id`

Core flow:

```text
DATE + SHIFT
     ↓
GET SHIFT TIMES
     ↓
CREATE REPORT DATETIME RANGE
     ↓
┌─────────────────────────────┐
│ SALES PER PRODUCT           │
│ SALES PER PUMP / NOZZLE     │
│ TANK MOVEMENTS               │
│ ATTENDANT SALES              │
│ COLLECTIONS                  │
└─────────────────────────────┘
     ↓
SHIFT SUMMARY
     ↓
PDF / EXCEL
```

Build this as one clean, simple, READ-ONLY Shift Report module.
