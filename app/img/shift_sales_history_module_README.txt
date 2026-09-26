# SHIFT SALES HISTORY MODULE

## 1. OBJECTIVE

Build a very simple Shift Sales History module for the fuel station system.

The module allows a user to:

1. Select a date.
2. Select a shift.
3. Automatically determine the shift's start and end datetime.
4. Pull all `fuel_sales` records whose `sale_date` falls within that calculated datetime range.
5. Display the sales in a paginated table.
6. Show useful totals for the selected shift.
7. Export the selected shift's complete sales history to:
   - PDF
   - Excel

The UI must be extremely simple and operationally friendly.

The user should NEVER have to manually enter start time or end time.

IMPORTANT:
`fuel_sales.shift_id` MUST NOT be used for this module.

The shift is determined ONLY from:

- selected date
- selected shift
- `system_shifts.opening_time`
- `system_shifts.closing_time`

The actual sales are matched using `fuel_sales.sale_date`.

---

# 2. EXISTING TABLES

## SYSTEM SHIFTS

Table:

`system_shifts`

Columns:

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

Important fields:

```text
record_id
shift_name
shift_code
opening_time
closing_time
hive_site_id
hive_site_name
```

---

## FUEL SALES

Table:

`fuel_sales`

Columns:

```text
primkey
customer_id
record_id
fuel_station_id
pump_nozzle_id
customer_name
customer_pin
vehicle_plate
fuel_type
quantity_sold_litres
sale_price_per_litre
total_amount
sold_by_staff_id
sale_method
sale_date
hive_site_id
hive_site_name
pump
total_paid
shift_id
kra_id
```

Important fields for this module:

```text
record_id
fuel_station_id
fuel_type
quantity_sold_litres
sale_price_per_litre
total_amount
sold_by_staff_id
sale_method
sale_date
hive_site_id
hive_site_name
pump
total_paid
kra_id
```

DO NOT use:

```text
fuel_sales.shift_id
```

The existing column may remain in the database, but this module must not depend on it.

---

# 3. CORE USER FLOW

The page should open with:

```text
SALES HISTORY

Date
[ 23 Sep 2026 ]

Shift
[ Select Shift ▼ ]

[ VIEW SALES ]
```

That is the primary interaction.

Do NOT ask the user for:

```text
Start Time
End Time
```

Those values come automatically from the selected shift.

---

# 4. SHIFT SELECTION

Load available shifts from:

```sql
system_shifts
```

Filter by the active:

```text
hive_site_id
```

Example:

```sql
SELECT
    record_id,
    shift_name,
    shift_code,
    opening_time,
    closing_time
FROM system_shifts
WHERE hive_site_id = ?
ORDER BY opening_time ASC
```

Display:

```text
Morning Shift
Evening Shift
Night Shift
```

The dropdown should display `shift_name`.

The actual value submitted should be:

```text
record_id
```

---

# 5. DATE + SHIFT LOGIC

The user selects:

```text
Date:
2026-09-23

Shift:
Morning Shift
```

Suppose the selected shift contains:

```text
opening_time = 06:00:00
closing_time = 14:00:00
```

The system creates:

```text
START:
2026-09-23 06:00:00

END:
2026-09-23 14:00:00
```

Then retrieve sales using:

```sql
WHERE sale_date >= START
AND sale_date < END
```

IMPORTANT:

Use:

```sql
sale_date >= startDateTime
AND sale_date < endDateTime
```

instead of `BETWEEN`.

This avoids duplicate records when one shift ends exactly when another starts.

---

# 6. OVERNIGHT SHIFTS

The system MUST support overnight shifts.

Example:

```text
Night Shift

opening_time = 22:00:00
closing_time = 06:00:00
```

If user selects:

```text
2026-09-23
Night Shift
```

the system must calculate:

```text
START:
2026-09-23 22:00:00

END:
2026-09-24 06:00:00
```

Logic:

```javascript
if (closing_time <= opening_time) {
    endDate = selectedDate + 1 day;
} else {
    endDate = selectedDate;
}
```

Do not assume every shift happens within one calendar day.

---

# 7. SALES QUERY

When the user clicks:

```text
VIEW SALES
```

call the sales API.

The API should receive something similar to:

```json
{
    "date": "2026-09-23",
    "shift_id": "SHIFT001"
}
```

IMPORTANT:

`shift_id` here means the selected `system_shifts.record_id`.

It does NOT mean `fuel_sales.shift_id`.

The backend should:

1. Validate date.
2. Validate selected system shift ID.
3. Find the shift in `system_shifts`.
4. Determine opening datetime.
5. Determine closing datetime.
6. Handle overnight shifts.
7. Query `fuel_sales` using ONLY the calculated datetime range and site.
8. Return paginated records.
9. Return totals/summary information.

---

# 8. SALES QUERY RULE

The sales query MUST NOT contain:

```sql
AND shift_id = ?
```

Do not match sales using `fuel_sales.shift_id`.

Use:

```sql
SELECT
    primkey,
    customer_id,
    record_id,
    fuel_station_id,
    pump_nozzle_id,
    customer_name,
    customer_pin,
    vehicle_plate,
    fuel_type,
    quantity_sold_litres,
    sale_price_per_litre,
    total_amount,
    sold_by_staff_id,
    sale_method,
    sale_date,
    hive_site_id,
    hive_site_name,
    pump,
    total_paid,
    kra_id
FROM fuel_sales
WHERE hive_site_id = ?
AND sale_date >= ?
AND sale_date < ?
ORDER BY sale_date ASC
LIMIT ?
OFFSET ?
```

The three actual filters are:

```text
hive_site_id
start datetime
end datetime
```

The selected shift determines the datetime range.

---

# 9. PAGINATION

The sales list MUST be paginated.

Do NOT load thousands or tens of thousands of transactions into the browser at once.

Default:

```text
50 records per page
```

Allow:

```text
25
50
100
```

if convenient.

API should support:

```text
page
limit
```

Example:

```text
?page=1&limit=50
```

API response should contain:

```json
{
    "success": true,
    "data": [],
    "pagination": {
        "page": 1,
        "limit": 50,
        "total_records": 187,
        "total_pages": 4
    }
}
```

---

# 10. SALES TABLE

Display the actual sales records.

Recommended columns:

```text
#
Time
Fuel
Pump
Vehicle
Litres
Price/L
Amount
Paid
Method
Staff
```

Example:

```text
---------------------------------------------------------------
#   Time    Fuel       Pump   Vehicle   Litres   Amount
---------------------------------------------------------------
1   06:12   Diesel     01     KDA123A   35.20    7,744
2   06:18   Unleaded   02     KCB456B   22.10    5,083
3   06:31   Diesel     03     KDD789C   41.30    9,086
---------------------------------------------------------------
```

On desktop, additional information can be displayed.

Do not make the table unnecessarily complicated.

---

# 11. SUMMARY

Above the table show:

```text
Morning Shift
23 Sep 2026
06:00 AM → 02:00 PM
```

Then:

```text
Transactions
187

Litres Sold
1,245.60 L

Total Sales
KES 245,850.00

Total Paid
KES 245,850.00
```

The summary must be calculated from the COMPLETE matching result set, NOT just the current page.

Use the same filters:

```text
hive_site_id
start datetime
end datetime
```

Example aggregate query:

```sql
SELECT
    COUNT(*) AS total_transactions,
    COALESCE(SUM(quantity_sold_litres), 0) AS total_litres,
    COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(total_paid), 0) AS total_paid
FROM fuel_sales
WHERE hive_site_id = ?
AND sale_date >= ?
AND sale_date < ?
```

---

# 12. FUEL BREAKDOWN

A small breakdown is useful.

Example:

```text
FUEL BREAKDOWN

Diesel
542.20 L
KES 119,284

Unleaded
510.40 L
KES 109,230

V-Power
192.00 L
KES 27,336
```

Query:

```sql
SELECT
    fuel_type,
    COUNT(*) AS transaction_count,
    COALESCE(SUM(quantity_sold_litres), 0) AS total_litres,
    COALESCE(SUM(total_amount), 0) AS total_amount
FROM fuel_sales
WHERE hive_site_id = ?
AND sale_date >= ?
AND sale_date < ?
GROUP BY fuel_type
ORDER BY fuel_type ASC
```

This is useful but should not complicate the main page.

---

# 13. EMPTY STATE

If no sales exist:

```text
No sales found

There are no sales recorded for this date and shift period.
```

Do not display an empty table with confusing blank rows.

---

# 14. LOADING STATE

When loading:

```text
Loading sales...
```

Disable the search button while the request is running.

Do not allow multiple simultaneous requests from repeated clicks.

---

# 15. EXPORT TO PDF

Add:

```text
[ Export PDF ]
```

The PDF must contain the COMPLETE matching sales history.

IMPORTANT:

PDF export must NOT export only the currently displayed pagination page.

If there are:

```text
1,500 transactions
```

the PDF should contain all 1,500 matching transactions.

PDF header:

```text
FUEL SALES REPORT

Station: [Station Name]

Date: 23 Sep 2026
Shift: Morning Shift

Period:
06:00 AM - 02:00 PM
```

Summary:

```text
Transactions: 187
Litres Sold: 1,245.60
Total Sales: KES 245,850.00
Total Paid: KES 245,850.00
```

Then the detailed transactions.

Suggested PDF columns:

```text
Time
Fuel
Pump
Vehicle
Litres
Price/L
Amount
Paid
Method
```

If there are many transactions, allow the PDF to span multiple pages.

Footer:

```text
Page X of Y
Generated: [date/time]
```

---

# 16. EXPORT TO EXCEL

Add:

```text
[ Export Excel ]
```

Excel must also contain the COMPLETE matching result set, not just the current page.

Recommended workbook:

```text
Summary
Sales
```

## Summary sheet

Include:

```text
Station
Date
Shift
Opening Time
Closing Time
Transactions
Total Litres
Total Sales
Total Paid
```

## Sales sheet

Columns:

```text
Sale Record ID
Sale Date
Fuel Type
Pump
Pump Nozzle
Vehicle Plate
Customer Name
Customer PIN
Quantity Litres
Price Per Litre
Total Amount
Total Paid
Sale Method
Staff ID
KRA ID
```

Do not include `fuel_sales.shift_id` as a report dependency.

It may be omitted from the export entirely.

---

# 17. EXPORT API

Do not rely on the paginated API to generate exports.

Create dedicated export endpoints or export modes.

Example:

```text
GET /api/fuel/sales-history/export/pdf
GET /api/fuel/sales-history/export/excel
```

Request parameters:

```text
date
shift_id
```

Example:

```text
/api/fuel/sales-history/export/pdf?date=2026-09-23&shift_id=SHIFT001
```

IMPORTANT:

The backend must repeat the same shift/date calculation.

DO NOT trust the frontend to send:

```text
start_datetime
end_datetime
```

The backend must calculate these values itself from:

```text
selected date
selected system shift
system_shifts
```

The export query must use:

```text
hive_site_id
calculated start datetime
calculated end datetime
```

and MUST NOT use:

```text
fuel_sales.shift_id
```

---

# 18. FRONTEND STRUCTURE

Suggested structure:

```text
shift-sales-history/
│
├── page.jsx
│
├── components/
│   ├── ShiftSalesFilter.jsx
│   ├── ShiftSalesSummary.jsx
│   ├── ShiftSalesTable.jsx
│   ├── ShiftSalesPagination.jsx
│   └── ShiftSalesExportButtons.jsx
│
└── api/
    └── route.js
```

If the project already has an established architecture, follow the existing project conventions instead of forcing this structure.

---

# 19. API STRUCTURE

Suggested:

```text
/api/fuel/sales-history/shifts
/api/fuel/sales-history
/api/fuel/sales-history/export/pdf
/api/fuel/sales-history/export/excel
```

## GET SHIFTS

```text
GET /api/fuel/sales-history/shifts
```

Returns:

```json
{
    "success": true,
    "data": [
        {
            "record_id": "SHIFT001",
            "shift_name": "Morning Shift",
            "shift_code": "MORNING",
            "opening_time": "06:00:00",
            "closing_time": "14:00:00"
        }
    ]
}
```

## GET SALES

```text
GET /api/fuel/sales-history
```

Parameters:

```text
date
shift_id
page
limit
```

Example:

```text
/api/fuel/sales-history?date=2026-09-23&shift_id=SHIFT001&page=1&limit=50
```

---

# 20. TIMEZONE

The application operates in Kenya.

Use the application's existing database timezone configuration.

Do NOT introduce a second timezone implementation inside this module.

The important requirement is that:

```text
system_shifts.opening_time
system_shifts.closing_time
fuel_sales.sale_date
```

are interpreted consistently.

If the existing application uses:

```text
Africa/Nairobi
```

continue using that convention.

---

# 21. SECURITY / VALIDATION

Backend MUST validate:

```text
date
selected system shift record_id
hive_site_id
```

Do not allow a user to retrieve sales belonging to another:

```text
hive_site_id
```

Always apply the active site restriction.

Never build SQL by directly concatenating user input.

Use parameterized queries.

---

# 22. PERFORMANCE

This module may eventually deal with very large fuel transaction tables.

Therefore use:

```text
server-side pagination
server-side filtering
server-side totals
server-side exports
indexed queries
```

Do NOT:

```text
load all transactions into React
filter thousands of transactions in JavaScript
download all transactions just to calculate totals
export only the current page
```

Recommended indexes, if equivalent indexes do not already exist:

```sql
INDEX idx_fuel_sales_sale_date (sale_date)

INDEX idx_fuel_sales_site_date
(
    hive_site_id,
    sale_date
)
```

Before creating indexes, check whether equivalent indexes already exist.

Do not create duplicate indexes.

IMPORTANT:

Do NOT create an index specifically for:

```text
shift_id
```

for this module.

The module does not use `fuel_sales.shift_id`.

---

# 23. UI DESIGN

Keep the interface extremely simple.

Primary controls:

```text
Date
[ date picker ]

Shift
[ shift dropdown ]

[ VIEW SALES ]
```

After loading:

```text
SHIFT SALES

Morning Shift
23 Sep 2026
06:00 AM → 02:00 PM

[ Export PDF ] [ Export Excel ]

------------------------------------------------
187 Transactions
1,245.60 Litres
KES 245,850.00
------------------------------------------------

SALES TABLE
```

Use the existing project's design system/components.

Do not introduce a completely new UI framework.

Prefer clean cards, readable typography, clear buttons and a compact table.

---

# 24. IMPORTANT UX RULE

The user should understand the entire workflow immediately:

```text
1. Pick date.
2. Pick shift.
3. Click View Sales.
4. See sales.
5. Export if needed.
```

Nothing more.

Do not add unnecessary filters to the first version.

---

# 25. ERROR HANDLING

Display friendly messages.

Examples:

If shift is missing:

```text
Please select a shift.
```

If date is missing:

```text
Please select a date.
```

If API fails:

```text
We couldn't load the sales.
Please try again.
```

If export fails:

```text
We couldn't create the report.
Please try again.
```

Do not expose raw SQL/database errors to the user.

Log technical errors server-side.

---

# 26. IMPORTANT DATA RULE

The report is based ONLY on:

```text
SELECTED DATE
+
SELECTED SYSTEM SHIFT
+
SHIFT OPENING TIME
+
SHIFT CLOSING TIME
```

The selected system shift is used to retrieve its configured times.

The resulting datetime range is then applied to:

```text
fuel_sales.sale_date
```

Example:

User selects:

```text
Date: 23 Sep 2026
Shift: Morning
```

Shift configuration:

```text
Opening: 06:00
Closing: 14:00
```

System calculates:

```text
2026-09-23 06:00:00
to
2026-09-23 14:00:00
```

and queries:

```sql
WHERE hive_site_id = ?
AND sale_date >= ?
AND sale_date < ?
```

There is NO:

```sql
AND fuel_sales.shift_id = ?
```

---

# 27. ACCEPTANCE CRITERIA

The module is complete when:

- [ ] User can select a date.
- [ ] User can select a shift.
- [ ] Shift list comes from `system_shifts`.
- [ ] User does not manually enter shift times.
- [ ] Opening time comes from `system_shifts.opening_time`.
- [ ] Closing time comes from `system_shifts.closing_time`.
- [ ] Normal shifts work.
- [ ] Overnight shifts work.
- [ ] `fuel_sales.shift_id` is NOT used.
- [ ] Sales are matched using `fuel_sales.sale_date`.
- [ ] `hive_site_id` is respected.
- [ ] Sales are ordered chronologically.
- [ ] Sales are paginated server-side.
- [ ] Total transaction count is correct.
- [ ] Total litres is calculated from all matching sales.
- [ ] Total sales is calculated from all matching sales.
- [ ] Total paid is calculated from all matching sales.
- [ ] Empty results have a clear message.
- [ ] PDF export contains all matching sales.
- [ ] Excel export contains all matching sales.
- [ ] Export does not depend on current pagination page.
- [ ] PDF includes shift/date/report information.
- [ ] Excel includes summary and detailed sales.
- [ ] Backend validates inputs.
- [ ] SQL uses parameterized queries.
- [ ] No duplicate database indexes are created.
- [ ] Existing project architecture and components are reused where possible.

---

# 28. DO NOT OVERENGINEER

This is intentionally a simple operational module.

Do NOT add:

- Complex dashboards
- Charts
- Advanced filtering
- Shift editing
- Shift creation
- Shift management
- Manual timestamp selection
- Client-side processing of large datasets
- New database tables
- Unnecessary state-management libraries
- Unnecessary dependencies
- Any dependency on `fuel_sales.shift_id`

The core feature is:

```text
DATE + SYSTEM SHIFT
        ↓
GET SHIFT TIMES FROM system_shifts
        ↓
CREATE DATETIME RANGE
        ↓
FILTER fuel_sales BY sale_date
        ↓
PAGINATED SALES HISTORY
        ↓
PDF / EXCEL EXPORT
```

Build this cleanly, reliably and simply.
