# Maira Payload Guide: from first message to expert

Oct 2, 2026 · @Jeremy

## 1. What Maira is

Maira turns a short note called a payload into a finished message about one business's own data. You say what to look up and what the message should read like; Maira does the counting, comparing and wording, and hands back plain text.

A payload has three working parts, always in this order:

1. **fetch**: what to look up (a table, a filter, the columns to add up).
2. **lines** (optional): small sentences that change with the data, such as "All receipts sent" or "3 waiting".
3. **message**: the text itself, with `{placeholders}` where the numbers go.

Maira never sends anything. It returns the text and a status. A separate step puts a ready message into the reminders table, and the reminders system sends it.

Here is a complete payload that works:

```json
{
  "persona": "SALES MONITOR",
  "fetch": {
    "Sales": { "table": "fuel_sales", "where": "sale_date = today", "columns": ["total_amount"] }
  },
  "message": "Today the system recorded {Sales.count} sales worth {Sales.total_amount.total|money}.",
  "formats": { "money": "KES #,###" }
}
```

It produces:

```
SALES MONITOR
Today the system recorded 212 sales worth KES 84,200.
```

Everything else in this guide is a way to look up more, say it more cleverly, or stay quiet when there is nothing worth saying.

## 2. Your first message in five minutes

Write the payload, send it to the Maira route, and read the status. That loop is all there is.

1. **Pick one table and one number.** Which table holds what you want to talk about (for example `fuel_sales`), and which column do you want to add up (`total_amount`)?
2. **Write the payload.** Copy the example in section 1 and change the table, the column and the sentence.
3. **Send it.** The route is `POST /api/mairaagent` with a login token. The body is:

```json
{
  "record_id": "daily_impact",
  "payload": { ...your payload... },
  "variables": { }
}
```

`payload` can also be the JSON text exactly as saved in the `maira_data` table.

**Step 4. Read the answer.** Look at `status` first.

| status | What it means | What you do |
| --- | --- | --- |
| ready | A finished message is in `send.text` | Nothing; it is ready to go to reminders |
| skipped | Your own `skip_if` said there is nothing worth saying today | Nothing; this is normal on quiet days |
| failed | A table, column or placeholder could not be filled | Read `problems`: each one names the place, what is wrong and how to fix it |

The business is always taken from the login token. You never write a business id in a payload, and Maira refuses payloads that try.

A good habit: build the payload one piece at a time. Get the count working, then add a total, then a filter, then the wording. When something fails, the `problems` list points at the exact piece you just added.

## 3. The payload at a glance

A payload is one JSON object with thirteen possible keys. Only `message` is needed to make text; `fetch` is needed to put real numbers in it.

| Key | What it does | Needed? | Example |
| --- | --- | --- | --- |
| `message` | The text, with `{placeholders}` for values and named lines | Yes | `"Sales: {Sales.count}"` |
| `fetch` | Named lookups against your tables | For real data | `{ "Sales": { "table": "fuel_sales" } }` |
| `lines` | Named smart sentences (rules, or one block per item) | No | `{ "KRA": { "rules": [...], "if_none": "..." } }` |
| `formats` | Your own formats for money, litres, dates | No | `{ "money": "KES #,###" }` |
| `persona` | A label printed as the first line, and the sender name | No | `"SALES MONITOR"` |
| `footer` | A closing line printed after the message | No | `"Open the app to see more."` |
| `skip_if` | A condition that means "nothing worth saying today" | No | `"Sales.count is 0"` |
| `fallback_message` | What to send instead when `skip_if` matches | No | `"Quiet day so far."` |
| `audience` | Who it is for; today always `admin` | No (default `admin`) | `"admin"` |
| `weight` | Importance from 1 to 10, used when the daily cap forces a choice | No (default 5) | `9` |
| `timezone` | The business's clock for words like `today` | No (default `Africa/Nairobi`) | `"Africa/Nairobi"` |
| `date_column` | The column that the word `date` means in every fetch | No (default `reg_date`) | `"sale_date"` |
| `variables` | Fixed values you can use in filters as `{name}` | No | `{ "branch": "Trio fuels" }` |

The order Maira works in: it checks the payload, runs every fetch, then builds the message. If any fetch or placeholder cannot be filled, you get `failed` and a list of problems, never a half-filled message.

The next sections take the three big keys in turn: `fetch` (sections 4 to 6), `message` (section 7) and `lines` (sections 8 and 9). Section 10 covers the small keys.

## 4. fetch: asking your tables questions

Each entry in `fetch` is one named question. The name (`Sales`, `Failed`, `Shift`) is what you use later in the message, so pick names a human can read. Names use letters, numbers and `_`, cannot be `Today`, and a payload can hold up to 20 fetches.

```json
"Sales": {
  "table": "fuel_sales",
  "where": "sale_date = today",
  "columns": ["total_amount", "quantity_sold_litres"],
  "lookup": ["fuel_type"],
  "group_by": "fuel_type",
  "rank_by": "total_amount",
  "compare_with": "sale_date = yesterday"
}
```

| Key | Plain meaning | Notes |
| --- | --- | --- |
| `table` | Which table to read | Required. Letters, numbers and `_` only |
| `where` | Which rows to include | Leave out to take every row (capped, see section 14). Language in section 5 |
| `columns` | Number columns to add up | You get total, average, highest and lowest for each. Text in these columns is ignored |
| `lookup` | Columns whose value you want to quote | You get the `first` and `latest` row's value, for example who opened the shift |
| `group_by` | Split the rows by this column | You get `top`, `bottom` and `groups`. One column only, and it must not also be in `columns` |
| `rank_by` | What decides which group is top | One of your `columns`, or `count`. Default: the first column in `columns`, or `count` if there are none |
| `order_by` | What decides which row is `first` and `latest` | Default: the table's `primkey`, so `first` is the oldest row |
| `compare_with` | A second where to compare against | Gives you `before` and `change`. Replaces the same-column filters from `where`, keeps the rest |
| `date_column` | Which column the word `date` means in this fetch | Overrides the payload-level `date_column` |
| `if_empty` | Words to use when nothing matched | Used when you quote `first`, `latest` or similar from a fetch with no rows |

**Count only.** A fetch with just `table` and `where` is the simplest and most useful: you get `{Name.count}`. Failed receipts, open flags and expiring customers are all count-only fetches.

**Columns that clash.** A column cannot be called `name`, `table`, `where`, `found`, `count`, `first`, `latest`, `top`, `bottom`, `groups`, `before` or `if_empty`, because Maira uses those words itself. Columns named `hive_site_id`, `hive_site_name` or `tenant_id` are refused entirely: the business comes from the login, never from the payload.

**Read-only.** Maira only reads. A payload cannot change, add or delete anything, whatever it contains.

## 5. The where language

A `where` is a list of simple tests joined by `AND`. Each test is a column, an operator and a value, written the way you would say it: `status = 'open' AND sale_date = today`.

**Operators**

| Write | Means | Example |
| --- | --- | --- |
| `=` and `!=` | equals, does not equal | `status = 'sent'` |
| `>` `>=` `<` `<=` | bigger, at least, smaller, at most | `total_amount > 5000` |
| `like` | contains this text | `item like 'diesel'` |
| `in ('a','b')` | is any of these (up to 20) | `fuel_type in ('Diesel','Petrol')` |
| `in <period>` | falls inside a period (below) | `sale_date in last week` |
| `is empty`, `is not empty` | blank or filled | `closed_at is empty` |

**Values**

| Kind | Write it as | Example |
| --- | --- | --- |
| Text | in quotes | `'closed'` |
| Number | bare | `5000` |
| A day | a date word, or `YYYY-MM-DD` | `today`, `2026-06-01` |
| A variable | in braces, sent with the request | `shift_id = {shift_id}` |

**Date words.** `today`, `yesterday`, `tomorrow`, and any of them plus or minus days: `today - 7 days`, `tomorrow + 2 days`. A day always means the whole day: `sale_date = today` catches every sale from 00:00 to 23:59, and `sale_date <= 2026-10-01` includes all of 1 October.

**Periods** for `in`:

| Period | Covers |
| --- | --- |
| `today`, `yesterday`, `tomorrow` | that one day |
| `this week`, `last week` | Monday to Sunday |
| `this month`, `last month` | the whole calendar month |
| `last 7 days` | seven days ending today (any number works) |
| `next 3 days` | tomorrow up to three days ahead (any number works) |

**The word `date`.** In any test you can write `date` instead of the real column name. It stands for the fetch's `date_column`, then the payload's `date_column`, then `reg_date`. If your table calls it `sale_date`, either write `sale_date` each time or set `date_column` once.

**Rules that catch people out**

- Only `AND` works. `OR` is refused, with a message. For "either of two values" use `in (...)`; for two different conditions, make two fetches and combine them in a line.
- Text goes in quotes and numbers do not. `status = open` is refused.
- A value cannot be empty. `status = ''` is refused because the database would quietly ignore it; write `status is empty`.
- The same column cannot be tested twice with the same operator in one `where`.
- Column names are letters, numbers and `_`. Anything else is refused before the database is touched.
- Values are never pasted into the query. They travel separately, so quotes and symbols inside a value are harmless.

## 6. What a fetch gives back

Every fetch becomes a small bundle of facts, and each fact has a path: the fetch name, then dots. You write the path inside braces in the message (`{Sales.total_amount.total}`) or in a condition (`Sales.count is 0`). This is the whole menu.

Take this fetch:

```json
"Sales": {
  "table": "fuel_sales",
  "where": "sale_date = today",
  "columns": ["total_amount"],
  "lookup": ["fuel_type"],
  "group_by": "fuel_type",
  "compare_with": "sale_date = yesterday"
}
```

It produces these facts (sample numbers):

| Path | Example value | Meaning |
| --- | --- | --- |
| `Sales.count` | 212 | How many rows matched |
| `Sales.found` | true | Whether any row matched |
| `Sales.total_amount.total` | 84200 | Sum of the column |
| `Sales.total_amount.average` | 397 | Average per row |
| `Sales.total_amount.highest` | 6500 | Biggest single row |
| `Sales.total_amount.lowest` | 120 | Smallest single row |
| `Sales.first.fuel_type` | Diesel | Lookup value from the first row (oldest, or by `order_by`) |
| `Sales.latest.fuel_type` | Petrol | Lookup value from the last row |
| `Sales.top.fuel_type` | Diesel | The group ranked first |
| `Sales.top.count` | 140 | Rows in that group |
| `Sales.top.total_amount.total` | 52000 | That group's total |
| `Sales.bottom.fuel_type` | Petrol | The group ranked last |
| `Sales.groups` | a list | Every group, for the `each` line (section 8) |
| `Sales.before.count` | 198 | Rows in the comparison period |
| `Sales.before.total_amount.total` | 76000 | Comparison total |
| `Sales.before.change.total_amount.difference` | 8200 | This period minus the comparison (can be negative) |
| `Sales.before.change.total_amount.percent` | 10.8 | Size of the move as a percentage, never negative |
| `Sales.before.change.total_amount.trend` | up | The word `up`, `down` or `same` |
| `Sales.before.change.count.trend` | up | The same, for the row count |

**Things to remember**

- With no matching rows, `count` is 0 and every column total is 0. Nothing breaks, so "Sales.count is 0" works as a quiet-day test.
- `before.change` only exists when the comparison period had rows. When it had none, there is nothing to compare, so test `Sales.before.count is 0` first and say so ("No sales yesterday to compare with"), as the sample payloads do.
- `percent` has no sign. Use `trend` to choose between "Up" and "Down" wording, as in section 8.
- Groups are ranked by `rank_by`, biggest first. Ties are broken alphabetically.
- A path that has no value (a column you did not list, a typo) makes the message `failed` with the exact path named. It never prints a blank.

## 7. message: writing the text

The `message` is ordinary text. Wherever a number or word should come from the data, write its path in braces. Line breaks are written as `\n` inside the JSON.

```json
"message": "Today the system:\n • Recorded {Sales.count} sales worth {Sales.total_amount.total|money}\n • {KRA}\n\nTop seller: {Sales.top.fuel_type}"
```

Three kinds of thing go inside braces:

- **A value path**: `{Sales.count}`, `{Shift.first.closed_by}`.
- **A value with a format**: `{Sales.total_amount.total|money}`. The part after `|` says how to show it.
- **A line name**: `{KRA}` inserts the line called `KRA` from the `lines` section (section 8). A line name cannot also be a fetch name.

One built-in value is always available: `{Today}`, today's date in the business timezone (use it as `{Today|date}`).

**Built-in formats**

| Format | Shows 84200 / a date as | Use for |
| --- | --- | --- |
| `money` | KES 84,200 | Amounts of money |
| `number` | 84,200 (up to 2 decimals) | Plain numbers |
| `percent` | 10.8% | Percentages |
| `litres` | 84,200 L | Fuel volume |
| `date` | Thu 1 Oct 2026 | Date or datetime columns |
| `time` | 8:05 PM | Datetime columns |
| `upper`, `lower` | DIESEL, diesel | Text |

**Your own formats.** Add them under `formats` and they replace the built-in of the same name. A number format is a pattern showing how the number should look: text before it, the digits, text after it.

| Pattern | 162879.85 becomes | 0 becomes |
| --- | --- | --- |
| `KES #,###` | KES 162,880 | KES 0 |
| `KES #,###.00` | KES 162,879.85 | KES 0.00 |
| `#,###.00 L` | 162,879.85 L | 0.00 L |
| `#,###.#%` | 162,879.9% | 0% |

A `.00` always shows two decimals; a `.##` shows them only when needed.

A pattern containing `YYYY` is a date pattern. The pieces are `YYYY` year, `MM` month, `DD` day, `HH` hour on a 24-hour clock, `hh` hour on a 12-hour clock, `mm` minutes, `ss` seconds and `A` for AM or PM.

```json
"formats": { "stamp": "YYYY-MM-DD hh:mm:ss A" }
```

With that, `{Shift.first.close_time|stamp}` shows `2026-10-01 08:00:07 PM`. The built-in `date` always shows the weekday, month name and year; there is no short version of it yet.

**What goes wrong.** A number format on text (`{Sales.top.fuel_type|money}`) fails with "That value is not a number". A path that names a whole group instead of one value (`{Sales.top}`) fails with a hint to add a field. Always check that `lookup` includes the column you quote.

## 8. lines: sentences that change with the data

A message that says "All receipts sent" every day is useless on the day three failed. A line is a named piece of text that picks its wording from the data. You define it under `lines`, then drop its name into the message like a placeholder: `{KRA}`.

There are two kinds.

### Rule lines: pick one sentence

Maira reads the rules from top to bottom and uses the first one whose `if` is true. If none is true it uses `if_none`.

```json
"KRA": {
  "rules": [
    { "if": "Failed.count is not 0", "say": "{Sent.count} receipts sent to KRA, {Failed.count} waiting. The system retries at 8 PM." },
    { "if": "Sent.count is 0",       "say": "No receipts have reached KRA yet today ⚠️" }
  ],
  "if_none": "All {Sent.count} receipts sent to KRA ✅"
}
```

Read it aloud: if any receipt failed, say how many are waiting; otherwise, if none were sent at all, warn; otherwise everything is fine. The `if` language is in section 9. Both `say` and `if_none` can contain any placeholder, including other line names.

**Order matters.** Put the most important or most specific rule first. A good trend line checks "nothing to compare with" before it checks "up" or "down", because there is no `change` to read when the comparison period was empty:

```json
"Trend": {
  "rules": [
    { "if": "Sales.before.count is 0",                       "say": "No sales yesterday to compare with" },
    { "if": "Sales.before.change.total_amount.trend is up",   "say": "Up {Sales.before.change.total_amount.percent}% on yesterday" },
    { "if": "Sales.before.change.total_amount.trend is down", "say": "Down {Sales.before.change.total_amount.percent}% on yesterday" }
  ],
  "if_none": "Same as yesterday"
}
```

### Each lines: one block per item

When the message must list things (every product, every depot), use `each`. It repeats the `say` text once for every group of a fetch that has a `group_by`.

```json
"Products": {
  "each": "Sales.groups",
  "say": "{item.fuel_type} {item.quantity_sold_litres.total|litres}",
  "separator": " · ",
  "if_none": "No sales recorded"
}
```

With two fuel types it prints `Diesel 5,100 L · Petrol 13,400 L`.

| Key | Meaning |
| --- | --- |
| `each` | The path of the group list, such as `Sales.groups` |
| `say` | The text for one item. Inside it, `item` is the current group |
| `separator` | What goes between items. Default is a line break; `"\n\n"` leaves a blank line; `" · "` keeps them on one line |
| `limit` | Show at most this many items (default 50) |
| `if_none` | What to print when there are no items |

Inside `say` you can use `{item.fuel_type}` (the group's label), `{item.count}`, and `{item.<column>.total}` (also `average`, `highest`, `lowest`) for every column the fetch lists. Items come in rank order, biggest `rank_by` first, so `limit: 3` gives a top three.

**Tips for smart sentences**

- Start with the plain sentence you would say to the owner. Then ask what data would change it, and make one rule per change.
- A line is a good place to say nothing special: `"if_none": "nothing."` reads well after "Needs you:".
- Lines can use other lines, up to five levels deep. Keep it to one or two; deeper chains are hard to read.
- A line name cannot also be a fetch name.

## 9. The conditions language

A condition is a path, a comparison and a value, read like English: `Failed.count is not 0`. Conditions are used in two places: the `if` of a line rule, and `skip_if`.

| Write | Means | Example |
| --- | --- | --- |
| `is` (or `=`) | equals | `Shift.first.cash_difference is 0` |
| `is not` (or `!=`) | does not equal | `Failed.count is not 0` |
| `is under` (or `<`) | smaller than | `Stock.days is under 2` |
| `is over` (or `>`) | bigger than | `Delivery.count is over 1` |
| `is at least` (or `>=`) | bigger or equal | `Sales.count is at least 100` |
| `is at most` (or `<=`) | smaller or equal | `Flags.count is at most 5` |
| `is empty` | has no value | `Shift.first.closed_at is empty` |
| `is not empty` | has a value | `Shift.first.closed_by is not empty` |

**Combining.** Join tests with `AND` and `OR` (whole words, with spaces). `AND` binds tighter than `OR`, and there are no brackets, so `A OR B AND C` means `A OR (B AND C)`. If you need something more complicated, split it into two lines.

**Values.** Numbers are compared as numbers, so a database value of `0.00` is equal to `0`. Words can be written plainly (`trend is up`) or in quotes (`status is 'open'`) and are compared ignoring capital letters.

**What you can test.** Any path from section 6 (`Sales.count`, `Sales.before.change.total_amount.trend`, `Shift.first.closed_by`), the built-in `Today`, and any variable you sent with the request.

**Missing values.** A value that does not exist is never equal to anything, and is never under or over anything. It only counts as empty. So `is not` is true for a missing value, and a test like `Shift.first.cash_difference is over 0` is simply false when the column is empty.

**Common patterns**

| You want | Write |
| --- | --- |
| Say nothing on a quiet day | `"skip_if": "Sales.count is 0"` |
| Warn when something is waiting | `Failed.count is not 0` |
| Trend wording | `Sales.before.change.total_amount.trend is up` |
| Nothing to compare with | `Sales.before.count is 0` |
| Only mention a shift that is still open | `Shift.first.closed_at is empty` |
| One thing or several | `Delivery.count is 1`, then `Delivery.count is over 1` |

## 10. Quiet days, identity and the small keys

**Staying quiet: `skip_if` and `fallback_message`.** A message sent when nothing happened teaches the owner to ignore you. `skip_if` is a condition that means "there is nothing worth saying".

- With only `skip_if`: when it is true, Maira returns status `skipped` and no message. Nothing is sent.
- With `skip_if` and `fallback_message`: when it is true, the fallback text is sent instead of the main message. Use it for a short "quiet day" note you do want the owner to see. The response carries `used_fallback: true`, so a later step can give it low priority.

The fallback goes through the same placeholders, persona and footer as the main message.

**Who it is from: `persona`.** A label such as `SALES MONITOR` or `STOCK MANAGER`. It is printed as the first line of the message and returned as `send.from`. Leave it out if you want to write your own first line, as in `SHIFT CLOSED · Sam · Thu 1 Oct 2026`. Different personas make different topics feel like different people watching different things.

**Closing line: `footer`.** Text added as the last line, such as `Open the app to see the details.` Optional.

**Who it is for: `audience`.** Returned as `send.to`. Today every Maira message is for the business admin, and the default is `admin`. It is a label, not a phone number: the step that adds the reminder uses it to pick the contacts.

**How much it matters: `weight`.** A number from 1 to 10 (default 5), returned as `send.weight`. The business gets at most three Maira messages a day, and one strong message beats three weak ones. When several are ready, weight decides which to keep. A shift report that the owner is waiting for is a 9; a gentle "did you know" is a 3.

**The clock: `timezone`.** Words like `today` and `yesterday` follow this clock. Default `Africa/Nairobi`. Use a name like `Africa/Kampala` for another country.

**The date column: `date_column`.** Tells Maira which column the word `date` means. Set it once to `sale_date` instead of writing the column in every `where`. A single fetch can override it with its own `date_column`.

**Variables: `variables`.** Values you can use in a `where` as `{name}`. There are two sources, and the request wins when both set the same name:

| Source | Use for | Example |
| --- | --- | --- |
| `variables` inside the payload | Fixed values for this message | `{ "branch": "Trio fuels" }` |
| `variables` in the request body | Values that change each run | `{ "shift_id": 123 }` |

The second is how an event-style message works. When a shift closes, the system sends the shift's id with the request, and the payload says `primkey = {shift_id}`. The same saved payload then reports on whichever shift just closed.

## 11. When something goes wrong

Maira never sends a half-filled message. If anything cannot be filled, `status` is `failed`, `send` is empty, and `problems` lists every issue found. Each problem has three parts: `where` (which fetch, line or the message), `what` (what is wrong) and `fix` (what to do).

Only three HTTP codes are ever used for the request itself: **403** for a missing or bad login (or a login with no business), **400** for a body that is not valid JSON, and **500** for something unexpected. A wrong payload is not an error code; it is a 200 with `status: failed`.

**The most common problems**

| What you see | Why | Fix |
| --- | --- | --- |
| `{Sales.amount.total} has no value` | The path does not exist: the column is not in `columns`, or the name is misspelled | Check the column is listed in the fetch and the path matches it exactly |
| `Column 'x' was not returned by 'table'` | The column name does not exist in that table | Correct the name |
| `OR is not supported in where` | A `where` used `OR` | Use `in ('a','b')`, or two fetches |
| `Cannot read value: open` | Text without quotes | Write `'open'` |
| `A filter value cannot be empty` | `status = ''` | Use `status is empty` |
| `Unknown variable {shift_id}` | The payload uses a variable the request did not send | Send it in the request `variables` |
| `Invalid fetch.A.table: ...` | A table or column name has a space or symbol | Letters, numbers and `_` only |
| `... is reserved` | A column named `hive_site_id`, `tenant_id` and so on | Remove it; the business comes from the login |
| `Cannot show 'Diesel' as money` | A number format on text | Use the format only on number values |
| `{Sales.top} is a group of values, not one value` | The path stops too early | Add the field: `{Sales.top.fuel_type}` |
| `Cannot read condition: ...` | A rule or `skip_if` is not in the conditions language | Use `path is value`, see section 9 |
| `group_by ... clashes with a column` | The same column is in `columns` and `group_by` | Remove it from `columns` |
| `rank_by ... is not in columns` | Ranking by a column that is not listed | Add it to `columns`, or use `count` |
| `More than 5000 rows matched` | The `where` is too wide for exact totals | Narrow it, for example a shorter date range |
| `Line 'X' refers back to itself` | Two lines use each other | Remove the loop |
| The server or database failed while reading this table | The query itself errored | Check the server log for the real error |

**Debugging routine**

1. Read the first problem only. Later ones are often caused by it.
2. Look at `values` in the response: it lists every placeholder that did fill, so you can see how far the message got.
3. Add `"debug": true` to the request while testing. The response then includes `data`, the full facts for every fetch, so you can see the exact paths that exist. Never leave debug on in a scheduled run.
4. Shrink the payload until it works, then add pieces back one at a time.

**A message that is wrong but not failed.** The most dangerous mistakes are filters that are valid but mean the wrong thing: a date range that is too wide, a status filter that matches every shift instead of the one that closed, a credit total with no shift filter. Maira cannot know your intent, so always read the first real message against what you expected.

## 12. Worked recipes

Four real payloads, each tested against sample data. Table and column names are examples; swap in your own.

### Recipe 1: the daily impact message

Goal: show the owner that the system worked all day without them. It uses a count fetch, a grouped fetch with a comparison, two rule lines, and a quiet-day fallback.

```json
{
  "persona": "SALES MONITOR",
  "weight": 5,
  "fetch": {
    "Sales":  { "table": "fuel_sales", "where": "sale_date = today", "columns": ["total_amount"],
                "group_by": "fuel_type", "rank_by": "total_amount", "compare_with": "sale_date = yesterday" },
    "Sent":   { "table": "sales_kra_logs", "where": "status = 'sent' AND created_at = today" },
    "Failed": { "table": "sales_kra_logs", "where": "status = 'failed' AND created_at = today" }
  },
  "lines": {
    "KRA": {
      "rules": [
        { "if": "Failed.count is not 0", "say": "{Sent.count} receipts sent to KRA, {Failed.count} waiting. The system retries at 8 PM." },
        { "if": "Sent.count is 0",       "say": "No receipts have reached KRA yet today ⚠️" }
      ],
      "if_none": "All {Sent.count} receipts sent to KRA ✅"
    },
    "Trend": {
      "rules": [
        { "if": "Sales.before.count is 0", "say": "No sales yesterday to compare with" },
        { "if": "Sales.before.change.total_amount.trend is up",   "say": "Up {Sales.before.change.total_amount.percent}% on yesterday" },
        { "if": "Sales.before.change.total_amount.trend is down", "say": "Down {Sales.before.change.total_amount.percent}% on yesterday" }
      ],
      "if_none": "Same as yesterday"
    }
  },
  "message": "Today the system:\n • Recorded {Sales.count} sales worth {Sales.total_amount.total|money}\n • {KRA}\n\nTop seller: {Sales.top.fuel_type}\n{Trend}\n\nYou did none of it manually.",
  "skip_if": "Sales.count is 0",
  "fallback_message": "Quiet day so far. No sales recorded yet.",
  "formats": { "money": "KES #,###" }
}
```

On a day with 48,200 of sales, up from 40,000 yesterday, and one failed receipt, it produces:

```
SALES MONITOR
Today the system:
 • Recorded 2 sales worth KES 48,200
 • 2 receipts sent to KRA, 1 waiting. The system retries at 8 PM.

Top seller: Diesel
Up 20.5% on yesterday

You did none of it manually.
```

On a day with no sales it sends only: `Quiet day so far. No sales recorded yet.`

### Recipe 2: a compact shift-closed message

Goal: one tight message when a shift closes. The request sends `variables: { "shift_id": 123 }`, and every fetch is limited to that shift. There is no `persona`, so the message starts with its own first line.

```json
{
  "audience": "admin",
  "weight": 9,
  "fetch": {
    "Shift":    { "table": "shifts", "where": "primkey = {shift_id}",
                  "lookup": ["closed_by", "close_time", "cash_difference"] },
    "Sales":    { "table": "fuel_sales", "where": "shift_id = {shift_id}",
                  "columns": ["total_amount", "quantity_sold_litres"], "group_by": "fuel_type", "rank_by": "total_amount" },
    "Credit":   { "table": "fuel_sales", "where": "shift_id = {shift_id} AND sale_method = 'credit'",
                  "columns": ["total_amount"] },
    "Failed":   { "table": "sales_kra_logs", "where": "status = 'failed' AND created_at = today" },
    "Delivery": { "table": "fuel_deliveries", "where": "expected_date = tomorrow AND status = 'pending'",
                  "lookup": ["supplier_name", "fuel_type"] }
  },
  "lines": {
    "Difference": {
      "rules": [ { "if": "Shift.first.cash_difference is 0", "say": "KES 0 ✅" } ],
      "if_none": "{Shift.first.cash_difference|money} ⚠️"
    },
    "Products": {
      "each": "Sales.groups",
      "say": "{item.fuel_type} {item.quantity_sold_litres.total|litres}",
      "separator": " · ",
      "if_none": "No sales recorded"
    },
    "NeedsYou": {
      "rules": [
        { "if": "Failed.count is not 0", "say": "{Failed.count} KRA receipts are waiting." },
        { "if": "Shift.first.cash_difference is not 0", "say": "check the cash difference." }
      ],
      "if_none": "nothing."
    },
    "Tomorrow": {
      "rules": [
        { "if": "Delivery.count is over 1", "say": "{Delivery.count} deliveries are due, first {Delivery.first.supplier_name} {Delivery.first.fuel_type}. I'll confirm when they're recorded." },
        { "if": "Delivery.count is 1", "say": "{Delivery.first.supplier_name} {Delivery.first.fuel_type} delivery is due. I'll confirm when it's recorded." }
      ],
      "if_none": "no deliveries due."
    }
  },
  "message": "SHIFT CLOSED · {Shift.first.closed_by} · {Shift.first.close_time|date}\nSales {Sales.total_amount.total|money} · Difference {Difference}\nCredit {Credit.total_amount.total|money} · Top seller {Sales.top.fuel_type}\n{Products}\n\nNeeds you: {NeedsYou}\nTomorrow: {Tomorrow}",
  "formats": { "money": "KES #,###", "litres": "#,### L" }
}
```

Result:

```
SHIFT CLOSED · Sam · Thu 1 Oct 2026
Sales KES 48,200 · Difference KES 0 ✅
Credit KES 9,500 · Top seller Diesel
Diesel 5,100 L · Petrol 13,400 L

Needs you: nothing.
Tomorrow: Kiambu Depot diesel delivery is due. I'll confirm when it's recorded.
```

Notice how little text there is in the message itself. The intelligence is in the four lines.

### Recipe 3: a longer period

To report on months instead of a day, change only the filters. Maira has no "last 4 months" word, so give explicit dates (or use `in last month` or `in this month`). Use the same bounds on every fetch, and set `compare_with` to the period before.

```json
"Sales": {
  "table": "fuel_sales",
  "where": "sale_date >= 2026-06-01 AND sale_date <= 2026-10-01",
  "columns": ["total_amount"],
  "compare_with": "sale_date >= 2026-02-01 AND sale_date < 2026-06-01"
}
```

Both dates are whole days, so 1 October is fully included and 2 October is not. Remember the 5,000-row limit: a busy station can pass it in four months, and then Maira says so instead of giving a wrong total. Narrow the dates or ask for the limit to be raised.

### Recipe 4: an expectation message

Goal: tell the owner the system noticed something that should have happened and did not. This works because the message says what was expected, which proves the system is watching.

```json
{
  "persona": "STOCK MANAGER",
  "weight": 8,
  "fetch": {
    "Due": { "table": "fuel_deliveries", "where": "expected_date = today AND status = 'pending'",
             "lookup": ["supplier_name", "fuel_type"] }
  },
  "lines": {
    "What": {
      "rules": [ { "if": "Due.count is over 1", "say": "{Due.count} deliveries were due today and are not recorded yet." } ],
      "if_none": "{Due.first.supplier_name} {Due.first.fuel_type} delivery was due today and is not recorded yet."
    }
  },
  "message": "{What}\nKindly confirm.",
  "skip_if": "Due.count is 0"
}
```

With one pending delivery it sends:

```
STOCK MANAGER
Kiambu Depot diesel delivery was due today and is not recorded yet.
Kindly confirm.
```

With two it says "2 deliveries were due today and are not recorded yet." With none it is `skipped` and nothing is sent. That is the pattern for every alert: describe the problem as a count, say nothing when the count is 0.

## 13. Writing messages that stick

Maira exists to keep the business owner using the app and feeling what it does for them. A message that only repeats numbers they already expect does neither. Everything below follows from that.

**The rules**

| Rule | Weak | Strong |
| --- | --- | --- |
| Say what the system did, not just what happened | `Sales: 212` | `Today the system recorded 212 sales worth KES 84,200` |
| Prove the system is watching by naming what was expected | `Delivery not recorded` | `Kiambu Depot diesel delivery was due this morning and is not recorded yet` |
| Add context a number cannot give | `Sales KES 48,200` | `Sales KES 48,200, up 20.5% on yesterday` |
| Say what needs the owner, or say nothing does | (silence) | `Needs you: nothing.` |
| End with one next step or promise | (nothing) | `I'll confirm when it's recorded.` |
| Sound like one watcher with one job | `Notification` | `STOCK MANAGER`, `SHIFT MONITOR`, `COLLECTIONS DESK` |
| Be honest when there is no data | `Same as yesterday` (with no history) | `No sales yesterday to compare with` |

**Length.** Aim for six lines or fewer. Owners read these on a phone between other things. If a line does not change what the owner thinks or does, delete it.

**Silence is a feature.** An alert that fires only when there is something to say gets read. Use `skip_if` on every alert-style message, and keep quiet-day fallbacks short and rare.

**Admin only.** Maira messages go to the business admin. The system already sends its own messages to customers and staff; Maira's job is to keep the person who pays for the system feeling it works.

**The daily cap.** An admin gets at most three Maira messages a day. Prefer one very strong message, or two when the owner's behaviour suggests they like it. That is what `weight` is for: when more messages are ready than the cap allows, the highest weights go out.

| Weight | Use for |
| --- | --- |
| 9 to 10 | Something the owner is waiting for, or a problem that needs them today (shift closed, failed payments) |
| 6 to 8 | A useful expectation or alert (delivery due, month-end tomorrow) |
| 3 to 5 | A pleasant summary (daily impact) |
| 1 to 2 | Nice to know; fine to drop |

**Before you save a payload**

1. Does it read like a person said it?
2. Is every number one the owner would care about?
3. What does it say on a day with no data, and on a day with a problem? Test both.
4. Does every filter limit to the right thing (the right shift, the right day)? Read the first real message against what you expected.
5. Would you be glad to receive it three days in a row?

## 14. Limits, safety and the quick reference card

**Limits**

| Limit | Value | What happens past it |
| --- | --- | --- |
| Fetches per payload | 20 | The payload is refused |
| Rows read per fetch | 5,000 | The message fails rather than show a wrong total; narrow the `where` |
| Values in one `in (...)` | 20 | The payload is refused |
| `each` items shown | 50 by default (`limit` changes it) | The rest are not shown |
| Line nesting | 5 levels | The line fails with a loop message |
| Time zone | Africa/Nairobi unless `timezone` is set | n/a |

**Safety, in plain words**

- Maira only reads. It cannot add, change or delete anything.
- The business is taken from the login token. A payload cannot name another business, and columns such as `hive_site_id` and `tenant_id` are refused.
- Table and column names are checked before anything runs. Anything with a space, quote or symbol is refused.
- Values in a `where` are sent separately from the query text, so a quote or a semicolon inside a value is only text.
- Only `AND` is allowed, which keeps every query simple and predictable.
- A message is either complete or `failed`. It is never sent with a hole in it.

**Quick reference card**

```json
{
  "persona":  "LABEL",                         // first line, and send.from
  "audience": "admin",                         // send.to
  "weight":   5,                               // 1 to 10, wins under the daily cap
  "timezone": "Africa/Nairobi",
  "date_column": "sale_date",                  // what the word date means
  "variables": { "name": "fixed value" },      // use as {name} in where

  "fetch": {
    "Name": {
      "table": "table_name",
      "where": "col = 'x' AND day_col = today",   // = != > >= < <= like in(...) in period, is empty
      "columns": ["number_col"],                 // total average highest lowest
      "lookup": ["text_col"],                    // first.text_col, latest.text_col
      "group_by": "text_col",                    // top, bottom, groups
      "rank_by": "number_col",                   // or count
      "order_by": "col",                         // decides first and latest
      "compare_with": "day_col = yesterday",     // before, before.change
      "date_column": "day_col",
      "if_empty": "words when no rows"
    }
  },

  "lines": {
    "RuleLine": { "rules": [ { "if": "Name.count is 0", "say": "text" } ], "if_none": "text" },
    "EachLine": { "each": "Name.groups", "say": "{item.text_col}", "separator": " · ", "limit": 5, "if_none": "text" }
  },

  "message": "Text {Name.count} {Name.number_col.total|money} {RuleLine} {EachLine}",
  "skip_if": "Name.count is 0",
  "fallback_message": "Shorter text for a quiet day",
  "footer": "Closing line",

  "formats": { "money": "KES #,###", "litres": "#,### L", "stamp": "YYYY-MM-DD hh:mm:ss A" }
}
```

(The `//` notes are for reading only; real JSON cannot contain them.)

**Every path**

| Path | Gives |
| --- | --- |
| `Name.count`, `Name.found` | Rows matched, and whether any |
| `Name.col.total / average / highest / lowest` | Number column statistics |
| `Name.first.col`, `Name.latest.col` | Lookup values |
| `Name.top.label`, `Name.top.count`, `Name.top.col.total` | Best group |
| `Name.bottom...` | Worst group |
| `Name.before.count`, `Name.before.col.total` | The comparison period |
| `Name.before.change.col.difference / percent / trend` | Movement, never negative percent, `up` `down` `same` |
| `item.label`, `item.count`, `item.col.total` | Inside an `each` line |
| `Today` | Today's date, in the business timezone |

**Every operator**

| Where | Conditions |
| --- | --- |
| `=` `!=` `>` `>=` `<` `<=` `like` `in (...)` `in <period>` `is empty` `is not empty` | `is` `is not` `is under` `is over` `is at least` `is at most` `is empty` `is not empty`, joined with `AND` `OR` |

**Every format**

`money` `number` `percent` `litres` `date` `time` `upper` `lower`, plus anything you define: number patterns such as `KES #,###.00`, and date patterns using `YYYY MM DD HH hh mm ss A`.
