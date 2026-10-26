// app/api/mairaagent/agentAggregates.js
//
// ============================================================
// Agent Aggregates
// ============================================================
//
// Adds SQL-like aggregates to the Universal Agent WITHOUT
// touching mosySecureSelect and WITHOUT generating SQL.
//
// Request shape:
//
//   aggregates: {
//     total_amount: "SUM(amount)",
//     net_sales:    "SUM(qty * buying_price - discount)",
//     avg_ticket:   "AVG(amount)",
//     biggest:      "MAX(amount)",
//     payments:     "COUNT(*)",
//   },
//   groupBy: ["shift_id"],
//
// Flow:
//
//   mosySecureSelect (raw rows, hive_site_id enforced, all pages)
//        ↓
//   group in JS by groupBy fields
//        ↓
//   evaluate each expression per row (safe arithmetic parser)
//        ↓
//   SUM / AVG / MIN / MAX / COUNT per group
//        ↓
//   grouped rows  +  grand totals
//
// Expressions support ONLY:
//   column names, numbers, + - * /, parentheses, unary minus.
// No function calls, no strings, no SQL. Nothing reaches the DB.
//
// Null / empty / non-numeric column values count as 0 inside an
// expression (so "qty * price - discount" still works when
// discount is NULL). Division by zero makes that row's value
// null, and null values are skipped by the aggregate (like SQL).
//
// ============================================================

const FUNCTIONS = new Set(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

const MAX_EXPRESSION_LENGTH = 300;


// ============================================================
// PUBLIC: PARSE THE aggregates BLOCK
// ============================================================

export function parseAggregates(input) {
    if (input === undefined || input === null) return [];

    if (typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('aggregates must be an object: { alias: "SUM(column)" }');
    }

    const result = [];

    for (const [alias, definition] of Object.entries(input)) {
        if (!IDENTIFIER.test(alias)) {
            throw new Error(`Invalid aggregate alias: ${alias}`);
        }

        if (typeof definition !== 'string' || !definition.trim()) {
            throw new Error(`Aggregate ${alias} must be a string like "SUM(amount)"`);
        }

        const text = definition.trim();

        if (text.length > MAX_EXPRESSION_LENGTH) {
            throw new Error(`Aggregate ${alias} is too long`);
        }

        const match = text.match(/^([A-Za-z]+)\s*\(([\s\S]*)\)$/);

        if (!match) {
            throw new Error(`Aggregate ${alias} must look like FN(expression), got: ${text}`);
        }

        const fn = match[1].toUpperCase();
        const inner = match[2].trim();

        if (!FUNCTIONS.has(fn)) {
            throw new Error(`Unsupported aggregate function ${fn} in ${alias}. Use SUM, AVG, MIN, MAX or COUNT`);
        }

        // COUNT(*) counts rows
        if (fn === 'COUNT' && inner === '*') {
            result.push({ alias, fn, expression: '*', columns: [], evaluate: () => 1 });
            continue;
        }

        if (!inner) {
            throw new Error(`Aggregate ${alias} has an empty expression`);
        }

        const { evaluate, columns } = compileExpression(inner, alias);

        result.push({ alias, fn, expression: inner, columns, evaluate });
    }

    return result;
}


// ============================================================
// PUBLIC: ALL COLUMNS THE AGGREGATES NEED
// ============================================================

export function aggregateColumns(aggregates) {
    const set = new Set();
    for (const aggregate of aggregates) {
        aggregate.columns.forEach(c => set.add(c));
    }
    return [...set];
}


// ============================================================
// PUBLIC: GROUP + AGGREGATE
// ============================================================

export function aggregateRows({ rows, groupBy = [], aggregates }) {
    const groups = new Map();
    const grand = createAccumulators(aggregates);
    let grandCount = 0;

    for (const row of rows) {
        const key = groupBy.map(f => String(row?.[f] ?? '')).join('\u0001');

        if (!groups.has(key)) {
            const labels = {};
            for (const field of groupBy) labels[field] = row?.[field] ?? null;

            groups.set(key, {
                labels,
                count: 0,
                accumulators: createAccumulators(aggregates),
            });
        }

        const group = groups.get(key);
        group.count++;
        grandCount++;

        for (const aggregate of aggregates) {
            const value = aggregate.evaluate(row);
            accumulate(group.accumulators[aggregate.alias], value);
            accumulate(grand[aggregate.alias], value);
        }
    }

    const grouped = [...groups.values()].map(group => {
        const out = { ...group.labels, total_count: group.count };
        for (const aggregate of aggregates) {
            out[aggregate.alias] = finalize(aggregate.fn, group.accumulators[aggregate.alias]);
        }
        return out;
    });

    const totals = { total_count: grandCount };
    for (const aggregate of aggregates) {
        totals[aggregate.alias] = finalize(aggregate.fn, grand[aggregate.alias]);
    }

    return { rows: grouped, totals };
}


// ============================================================
// PUBLIC: SORT GROUPED ROWS
// ============================================================

export function sortRows(rows, field, direction = 'DESC') {
    const sign = String(direction).toUpperCase() === 'ASC' ? 1 : -1;

    return [...rows].sort((a, b) => {
        const av = a?.[field];
        const bv = b?.[field];

        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;   // nulls last
        if (bv === null || bv === undefined) return -1;

        if (typeof av === 'number' && typeof bv === 'number') {
            return (av - bv) * sign;
        }

        return String(av).localeCompare(String(bv)) * sign;
    });
}


// ============================================================
// PUBLIC: PAGINATE GROUPED ROWS (same shape as mosy pagination)
// ============================================================

export function paginateRows(rows, pageNo, pageSize) {
    const total = rows.length;
    const pageCount = Math.max(Math.ceil(total / pageSize), 1);
    const current = Math.min(Math.max(pageNo, 1), pageCount);
    const start = (current - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    return {
        data: slice.map((row, index) => ({ row_count: start + index + 1, ...row })),
        pagination: {
            total_records: total,
            page_count: pageCount,
            current_page: current,
            page_size: pageSize,
            first_row: total ? start + 1 : 0,
            last_row: start + slice.length,
            has_next: current < pageCount,
            has_prev: current > 1,
        },
    };
}


// ============================================================
// ACCUMULATORS
// ============================================================

function createAccumulators(aggregates) {
    const result = {};
    for (const aggregate of aggregates) {
        result[aggregate.alias] = { sum: 0, count: 0, min: null, max: null };
    }
    return result;
}

function accumulate(acc, value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    acc.sum += value;
    acc.count++;
    if (acc.min === null || value < acc.min) acc.min = value;
    if (acc.max === null || value > acc.max) acc.max = value;
}

function finalize(fn, acc) {
    switch (fn) {
        case 'SUM': return acc.count ? clean(acc.sum) : 0;
        case 'AVG': return acc.count ? clean(acc.sum / acc.count) : null;
        case 'MIN': return acc.min === null ? null : clean(acc.min);
        case 'MAX': return acc.max === null ? null : clean(acc.max);
        case 'COUNT': return acc.count;
        default: return null;
    }
}

function clean(value) {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? value : Number(value.toFixed(6));
}


// ============================================================
// SAFE ARITHMETIC EXPRESSION COMPILER
// ============================================================
//
// Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := '-' factor | '+' factor | number | column | '(' expr ')'
//
// ============================================================

function compileExpression(source, alias) {
    const tokens = tokenize(source, alias);
    const columns = new Set();
    let position = 0;

    const peek = () => tokens[position];
    const next = () => tokens[position++];

    const fail = message => {
        throw new Error(`Aggregate ${alias}: ${message} in "${source}"`);
    };

    function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
            const op = next().value;
            const right = parseTerm();
            const l = left;
            left = op === '+'
                ? row => combine(l(row), right(row), (a, b) => a + b)
                : row => combine(l(row), right(row), (a, b) => a - b);
        }
        return left;
    }

    function parseTerm() {
        let left = parseFactor();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
            const op = next().value;
            const right = parseFactor();
            const l = left;
            left = op === '*'
                ? row => combine(l(row), right(row), (a, b) => a * b)
                : row => combine(l(row), right(row), (a, b) => (b === 0 ? null : a / b));
        }
        return left;
    }

    function parseFactor() {
        const token = next();
        if (!token) fail('unexpected end of expression');

        if (token.value === '-') {
            const inner = parseFactor();
            return row => {
                const v = inner(row);
                return v === null ? null : -v;
            };
        }

        if (token.value === '+') return parseFactor();

        if (token.type === 'number') {
            const n = token.value;
            return () => n;
        }

        if (token.type === 'identifier') {
            const column = token.value;
            columns.add(column);
            return row => numeric(row?.[column]);
        }

        if (token.value === '(') {
            const inner = parseExpr();
            const closing = next();
            if (!closing || closing.value !== ')') fail('missing closing parenthesis');
            return inner;
        }

        fail(`unexpected "${token.value}"`);
    }

    const evaluate = parseExpr();

    if (position < tokens.length) fail(`unexpected "${tokens[position].value}"`);

    return { evaluate, columns: [...columns] };
}

function tokenize(source, alias) {
    const tokens = [];
    const pattern = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_$]*)|([-+*/()]))/y;
    let index = 0;

    while (index < source.length) {
        if (/^\s*$/.test(source.slice(index))) break;

        pattern.lastIndex = index;
        const match = pattern.exec(source);

        if (!match) {
            throw new Error(`Aggregate ${alias}: invalid character near "${source.slice(index).trim().slice(0, 10)}"`);
        }

        if (match[1] !== undefined) tokens.push({ type: 'number', value: Number(match[1]) });
        else if (match[2] !== undefined) tokens.push({ type: 'identifier', value: match[2] });
        else tokens.push({ type: 'operator', value: match[3] });

        index = pattern.lastIndex;
    }

    if (!tokens.length) throw new Error(`Aggregate ${alias}: empty expression`);

    return tokens;
}

function combine(a, b, op) {
    if (a === null || b === null) return null;
    const result = op(a, b);
    return Number.isFinite(result) ? result : null;
}

function numeric(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
}
