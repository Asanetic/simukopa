// app/api/maira/route.js
//
// Maira receiving route
//
// Receives ONE Maira payload (the JSON saved in maira_data),
// fetches every named piece of data it asks for, and returns the
// finished message text for the caller to put into mosy_reminders.
//
//   payload
//      |
//   fetch entries --> where parser --> mosySecureSelect (tenant-scoped)
//      |
//   summarize() --> data structure (count, totals, top, before...)
//      |
//   buildMessage() --> text
//
// SECURITY
//  - Auth token decides the tenant. mosySecureSelect adds
//    hive_site_id from authData; the request body is never
//    consulted for it.
//  - Read-only: batchMutations / recordIdColumn / searchableColumns
//    are not accepted from the request.
//  - Every table, column and value is validated, and values travel
//    Base64-encoded in search params, never inside SQL text.
//  - The dictionary given to mosySecureSelect is built from the
//    columns the payload references, so a filter can never be
//    silently ignored for being "unknown".
//
// REQUEST
//   {
//     record_id: "daily_impact",          (optional, echoed back)
//     payload:   { ...maira payload... }  (object, or the JSON string
//                                          straight from maira_data)
//     variables: { user_id: 10 },         (optional, for {user_id} in where)
//     debug:     true                     (optional, adds `data`)
//     paths:     true                     (optional, adds `paths`: every
//                                          path the message could quote,
//                                          its value and what it means)
//   }
//   The payload may also be sent as the whole body.
//
// RESPONSE (HTTP 200 unless the request itself is unusable)
//   {
//     status: "ready" | "skipped" | "failed",
//     record_id,
//     send:   { to, from, text, weight } | null,
//     reason, detail,                     (skipped)
//     problems: [{ where, what, fix }],   (failed)
//     values: { "Sales.count": "212", ... },
//     paths: [{ path, value, meaning }],  (paths: true only)
//     data,                               (debug only)
//     generated_at
//   }

import {
    mosySecureSelect,
    base64Encode,
} from '../apiUtils/dataControl/dataUtils';

import {
    processAuthToken,
} from '../auth/authManager';

import {
    DEFAULT_TIMEZONE,
    NAME_PATTERN,
    PayloadError,
    addDays,
    buildMessage,
    isObject,
    isReservedKey,
    isoIn,
    resolveDateRange,
    resolveDateWord,
    splitOutsideQuotes,
    summarize,
    listPaths,
    todayIn,
} from './dataInterpreter';


// ============================================================
// CONFIG
// ============================================================

const PAGE_SIZE = 100;          // rows per mosySecureSelect page
const MAX_ROWS = 5000;          // per fetch; above this the fetch fails
const MAX_FETCHES = 20;
const MAX_IN_VALUES = 20;
const MAX_WHERE_LENGTH = 1000;
const DEFAULT_DATE_COLUMN = 'reg_date';

// Optional table allowlist, e.g. new Set(['sales', 'etims_log']).
// null = any valid table name (still tenant-scoped).
const ALLOWED_TABLES = null;


// ============================================================
// RESPONSE HELPERS
// ============================================================

function errorResponse(message, status = 400) {
    return Response.json({ status: 'error', message }, { status });
}


// ============================================================
// VALIDATION
// ============================================================

// The tenant comes from the token only. A payload may never name
// these columns, so it cannot filter, read or group on another tenant.
const TENANT_COLUMNS = new Set(['hive_site_id', 'hive_site_name', 'tenant_id']);

function validateIdentifier(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new PayloadError(`${label} is required`);
    }

    const identifier = value.trim();

    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier)) {
        throw new PayloadError(
            `Invalid ${label}: ${identifier}`,
            'Use letters, numbers and _ only'
        );
    }

    if (TENANT_COLUMNS.has(identifier.toLowerCase())) {
        throw new PayloadError(
            `${label} '${identifier}' is reserved`,
            'The business is taken from the login token, not the payload'
        );
    }

    return identifier;
}

function identifierList(value, label) {
    if (value === undefined || value === null) return [];

    if (!Array.isArray(value)) {
        throw new PayloadError(`${label} must be a list`, `Write it like ["amount"]`);
    }

    return [...new Set(value.map(item => validateIdentifier(item, label)))];
}

function normalizePayload(raw) {
    let payload = raw;

    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (error) {
            throw new PayloadError(
                `payload is not valid JSON: ${String(error?.message || 'cannot be read').slice(0, 160)}`,
                'Fix that spot in the payload text saved in maira_data. The usual causes are a comma after the last item, a missing quote, or a missing comma between items'
            );
        }
    }

    if (!isObject(payload)) {
        throw new PayloadError('payload must be an object');
    }

    if (typeof payload.message !== 'string' || !payload.message.trim()) {
        throw new PayloadError('payload.message is required', 'Add the message text with {placeholders}');
    }

    const fetchBlock = payload.fetch === undefined ? {} : payload.fetch;

    if (!isObject(fetchBlock)) {
        throw new PayloadError('payload.fetch must be an object', 'Name each fetch: { "Sales": { ... } }');
    }

    if (Object.keys(fetchBlock).length > MAX_FETCHES) {
        throw new PayloadError(`Too many fetches (limit ${MAX_FETCHES})`);
    }

    const lineNames = isObject(payload.lines) ? Object.keys(payload.lines) : [];

    for (const name of Object.keys(fetchBlock)) {
        if (!NAME_PATTERN.test(name)) {
            throw new PayloadError(
                `Fetch name '${name}' can only use letters, numbers and _`,
                'Rename it, e.g. SalesToday'
            );
        }

        if (name === 'Today' || lineNames.includes(name)) {
            throw new PayloadError(`'${name}' is used twice (fetch and line/built-in)`, 'Rename one of them');
        }
    }

    return payload;
}

// join: show a name instead of an id.
//   "join": { "closed_by": "staff.name" }                 staff.primkey = closed_by
//   "join": { "closed_by": "staff.name|record_id",         staff.record_id = closed_by
//             "location_id": "branches.name|branch_id" }   branches.branch_id = location_id
// Each column may point at a different table and a different key.
// ("staff.name by record_id" also works.)
// Works on lookup columns and on the group_by column.
function parseJoins(raw, { where, lookup, groupBy, columns }) {
    if (raw === undefined || raw === null) return {};

    if (!isObject(raw)) {
        throw new PayloadError(`${where}.join must be an object`, 'Write it like { "closed_by": "staff.name" }');
    }

    const joins = {};

    for (const [column, target] of Object.entries(raw)) {
        const name = validateIdentifier(column, `${where}.join`);

        if (columns.includes(name)) {
            throw new PayloadError(
                `${where}.join '${name}' is a number column`,
                'Only lookup columns and the group_by column can show a name'
            );
        }

        if (!lookup.includes(name) && groupBy !== name) {
            throw new PayloadError(
                `${where}.join '${name}' is not in lookup or group_by`,
                'Add it to lookup, or use it as group_by'
            );
        }

        const match = /^\s*([A-Za-z_][A-Za-z0-9_$]*)\.([A-Za-z_][A-Za-z0-9_$]*)(?:(?:\s*\|\s*|\s+by\s+)([A-Za-z_][A-Za-z0-9_$]*))?\s*$/i.exec(String(target));

        if (!match) {
            throw new PayloadError(
                `Cannot read join: ${target}`,
                'Write it like "staff.name" or "staff.name|record_id"'
            );
        }

        const table = validateIdentifier(match[1], `${where}.join table`);

        if (ALLOWED_TABLES && !ALLOWED_TABLES.has(table)) {
            throw new PayloadError(`Table '${table}' is not allowed`, 'Ask for it to be added to the allowed tables');
        }

        joins[name] = {
            table,
            show: validateIdentifier(match[2], `${where}.join column`),
            key: match[3] ? validateIdentifier(match[3], `${where}.join key`) : 'primkey',
        };
    }

    return joins;
}

function normalizeFetch(name, raw) {
    const where = `fetch.${name}`;

    if (!isObject(raw)) {
        throw new PayloadError(`${where} must be an object`, 'Give it a table, e.g. { "table": "sales" }');
    }

    const table = validateIdentifier(raw.table, `${where}.table`);

    if (ALLOWED_TABLES && !ALLOWED_TABLES.has(table)) {
        throw new PayloadError(`Table '${table}' is not allowed`, 'Ask for it to be added to the allowed tables');
    }

    const columns = identifierList(raw.columns, `${where}.columns`);

    for (const column of columns) {
        if (isReservedKey(column)) {
            throw new PayloadError(
                `Column '${column}' clashes with a built-in name (${where})`,
                'Rename the column in the table, or compute it another way'
            );
        }
    }

    const groupBy = raw.group_by ? validateIdentifier(raw.group_by, `${where}.group_by`) : null;
    const rankBy = raw.rank_by ? String(raw.rank_by) : null;

    // Caught here so a mistake never costs a table read.
    if (groupBy && (groupBy === 'count' || columns.includes(groupBy))) {
        throw new PayloadError(
            `${where}.group_by '${groupBy}' clashes with a column or built-in name`,
            "Use a different group_by column, or remove it from 'columns'"
        );
    }

    if (rankBy && rankBy !== 'count' && !columns.includes(rankBy)) {
        throw new PayloadError(
            `${where}.rank_by '${rankBy}' is not in columns`,
            "Use 'count' or one of the listed columns"
        );
    }

    const whereText = raw.where === undefined || raw.where === null ? '' : String(raw.where);
    const compareWith = raw.compare_with === undefined || raw.compare_with === null ? '' : String(raw.compare_with);

    if (whereText.length > MAX_WHERE_LENGTH || compareWith.length > MAX_WHERE_LENGTH) {
        throw new PayloadError(`${where} where text is too long`);
    }

    const lookup = identifierList(raw.lookup, `${where}.lookup`);
    const join = parseJoins(raw.join, { where, lookup, groupBy, columns });

    return {
        name,
        table,
        where: whereText,
        columns,
        lookup,
        join,
        groupBy,
        orderBy: raw.order_by ? validateIdentifier(raw.order_by, `${where}.order_by`) : null,
        rankBy,
        compareWith,
        dateColumn: raw.date_column ? validateIdentifier(raw.date_column, `${where}.date_column`) : null,
        ifEmpty: raw.if_empty === undefined ? undefined : String(raw.if_empty),
    };
}


// ============================================================
// WHERE PARSER
// ============================================================
//
// where is plain English, joined by AND:
//
//   status = 'sent' AND date = today
//   expires in next 3 days AND status = 'active'
//   closed_at is empty
//   type in ('sale', 'refund')
//   amount >= 5000 AND cashier = {user_id}
//
// Operators:  =  !=  >  >=  <  <=  like  in (...)  in <range>
//             is empty  is not empty
// Values:     'text'  number  today/yesterday/tomorrow [+- N days]
//             2026-10-01  {variable}
// Ranges:     today, yesterday, this week, last week, this month,
//             last month, last N days, next N days
//
// "date" means the fetch's date column (default reg_date).
//
// Not supported (reported clearly, never guessed): OR, unquoted
// words, two comparisons that land on the same filter slot.
//
// Parsed conditions look like
//   { column, op, value | values | from/to, source }

function parseConditions(text, ctx) {
    const source = String(text || '').trim();

    if (!source) return [];

    if (splitOutsideQuotes(source, 'or').length > 1) {
        throw new PayloadError(
            'OR is not supported in where',
            "Use in ('a','b') for several values, or make two fetches"
        );
    }

    return splitOutsideQuotes(source, 'and').map(clause => parseCondition(clause, ctx));
}

function columnName(raw, ctx) {
    const name = validateIdentifier(raw, 'where column');
    return name.toLowerCase() === 'date' ? ctx.dateColumn : name;
}

// A variable such as "today - 30 days" becomes 2026-09-02 once, up front,
// so every where and every {placeholder} sees the same date.
function resolveVariableDates(variables, today) {
    const out = {};
    for (const [name, value] of Object.entries(variables)) {
        out[name] = typeof value === 'string' ? (resolveDateWord(value, today) || value) : value;
    }
    return out;
}

function parseValue(raw, ctx) {
    const parsed = parseValueInner(raw, ctx);

    // mosySecureSelect silently drops a filter whose value is empty,
    // which would widen the query to every row.
    if (parsed.kind === 'text' && parsed.value === '') {
        throw new PayloadError(
            'A filter value cannot be empty',
            "Use 'is empty' or 'is not empty' to test for blanks"
        );
    }

    return parsed;
}

function parseValueInner(raw, ctx) {
    const text = String(raw).trim();

    const quoted = /^'(.*)'$/s.exec(text) || /^"(.*)"$/s.exec(text);
    if (quoted) return { kind: 'text', value: quoted[1] };

    const variable = /^\{(\w+)\}$/.exec(text);
    if (variable) {
        if (!Object.prototype.hasOwnProperty.call(ctx.variables, variable[1])) {
            throw new PayloadError(`Unknown variable {${variable[1]}}`, 'Send it in the request variables');
        }
        const given = String(ctx.variables[variable[1]]).trim();
        // A date variable is a whole day, same as a typed date.
        const asDay = /^\d{4}-\d{2}-\d{2}$/.test(given) ? resolveDateWord(given, ctx.today) : null;
        if (asDay) return { kind: 'day', value: asDay };
        return { kind: 'text', value: String(ctx.variables[variable[1]]) };
    }

    const day = resolveDateWord(text, ctx.today);
    if (day) return { kind: 'day', value: day };

    if (/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'text', value: text };

    throw new PayloadError(
        `Cannot read value: ${text}`,
        "Put text in quotes, e.g. status = 'open'"
    );
}

function splitList(text) {
    const items = [];
    let current = '';
    let quote = null;

    for (const char of text) {
        if (quote) {
            current += char;
            if (char === quote) quote = null;
        } else if (char === "'" || char === '"') {
            quote = char;
            current += char;
        } else if (char === ',') {
            items.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    items.push(current.trim());
    return items.filter(item => item !== '');
}

function parseCondition(clause, ctx) {
    const source = clause.trim();
    let match;

    if ((match = /^(\w+)\s+is\s+not\s+empty$/i.exec(source))) {
        return { column: columnName(match[1], ctx), op: 'not_empty', source };
    }

    if ((match = /^(\w+)\s+is\s+empty$/i.exec(source))) {
        return { column: columnName(match[1], ctx), op: 'empty', source };
    }

    if ((match = /^(\w+)\s+in\s*\((.*)\)$/is.exec(source))) {
        const values = [...new Set(
            splitList(match[2]).map(item => {
                const parsed = parseValue(item, ctx);
                if (parsed.kind !== 'text') {
                    throw new PayloadError(`in (...) takes text or numbers: ${item}`);
                }
                return parsed.value;
            })
        )];

        if (!values.length) throw new PayloadError(`Empty list in: ${source}`);

        if (values.length > MAX_IN_VALUES) {
            throw new PayloadError(`Too many values in: ${source}`, `Limit is ${MAX_IN_VALUES}`);
        }

        return { column: columnName(match[1], ctx), op: 'in', values, source };
    }

    if ((match = /^(\w+)\s+in\s+(.+)$/i.exec(source))) {
        let rangeText = match[2].trim();
        const rangeVariable = /^\{(\w+)\}$/.exec(rangeText);

        if (rangeVariable) {
            if (!Object.prototype.hasOwnProperty.call(ctx.variables, rangeVariable[1])) {
                throw new PayloadError(`Unknown variable {${rangeVariable[1]}}`, 'Send it in the request variables');
            }
            rangeText = String(ctx.variables[rangeVariable[1]]);
        }

        const range = resolveDateRange(rangeText, ctx.today);

        if (!range) {
            throw new PayloadError(
                `Unknown range '${rangeText}'`,
                'Use today, yesterday, this week, last week, this month, last month, last N days, next N days'
            );
        }

        return { column: columnName(match[1], ctx), op: 'range', from: range.from, to: range.to, source };
    }

    if ((match = /^(\w+)\s+like\s+(.+)$/i.exec(source))) {
        return {
            column: columnName(match[1], ctx),
            op: 'like',
            value: parseValue(match[2], ctx),
            source,
        };
    }

    if ((match = /^(\w+)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/.exec(source))) {
        const op = match[2] === '==' ? '=' : match[2] === '<>' ? '!=' : match[2];

        return {
            column: columnName(match[1], ctx),
            op,
            value: parseValue(match[3], ctx),
            source,
        };
    }

    throw new PayloadError(
        `Cannot read condition: ${source}`,
        "Write it like: status = 'open'  or  date = today"
    );
}

// compare_with overrides the same columns in the base where:
//   where "date = today AND type = 'sale'" + compare_with "date = yesterday"
//   -> "type = 'sale' AND date = yesterday"
function mergeConditions(base, overrides) {
    const overridden = new Set(overrides.map(condition => condition.column));

    return [
        ...base.filter(condition => !overridden.has(condition.column)),
        ...overrides,
    ];
}

const SUFFIX = {
    '=': '',
    '!=': '_not',
    '>': '_above',
    '>=': '_start',
    '<': '_below',
    '<=': '_end',
    like: '_like',
};

// Conditions -> Mosy search variables.
//
// Day comparisons use half-open ranges on date-only strings
// (>= day AND < next day), which behaves the same on DATE,
// DATETIME, TIMESTAMP and 'YYYY-MM-DD ...' text columns.
function compileConditions(conditions) {
    const params = new Map();
    const post = [];
    const columns = new Set();
    let inClause = null;

    const set = (key, value, column) => {
        if (params.has(key)) {
            throw new PayloadError(
                `Two conditions on '${column}' want the same filter (${key})`,
                'Use each comparison once per column, e.g. one >= and one <'
            );
        }
        params.set(key, value);
    };

    for (const condition of conditions) {
        const { column } = condition;
        columns.add(column);

        switch (condition.op) {
            case 'empty':
            case 'not_empty':
                post.push({ column, empty: condition.op === 'empty' });
                break;

            case 'in':
                if (inClause) {
                    throw new PayloadError('Only one in (...) is allowed per where', 'Split it into two fetches');
                }
                inClause = { column, values: condition.values };
                break;

            case 'range':
                set(`${column}_start`, condition.from, column);
                set(`${column}_below`, addDays(condition.to, 1), column);
                break;

            default: {
                const { op, value } = condition;

                if (value.kind === 'day') {
                    const day = value.value;

                    if (op === '=') {
                        set(`${column}_start`, day, column);
                        set(`${column}_below`, addDays(day, 1), column);
                    } else if (op === '>') {
                        set(`${column}_start`, addDays(day, 1), column);
                    } else if (op === '>=') {
                        set(`${column}_start`, day, column);
                    } else if (op === '<') {
                        set(`${column}_below`, day, column);
                    } else if (op === '<=') {
                        set(`${column}_below`, addDays(day, 1), column);
                    } else {
                        throw new PayloadError(
                            `'${condition.source}' is not supported for dates`,
                            'Use = , > , >= , < , <= or "in <range>"'
                        );
                    }
                } else {
                    set(`${column}${SUFFIX[op]}`, value.value, column);
                }
            }
        }
    }

    return { params, post, columns, inClause };
}


// ============================================================
// FETCHING
// ============================================================

function isEmptyColumn(value) {
    return (
        value === undefined ||
        value === null ||
        value === '' ||
        value === '0000-00-00' ||
        value === '0000-00-00 00:00:00'
    );
}

async function pagedSelect({ table, dictionary, params, authData }) {
    const rows = [];
    const maxPages = Math.ceil(MAX_ROWS / PAGE_SIZE) + 1;

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
        const searchParams = new URLSearchParams();

        for (const [key, value] of params) {
            searchParams.set(key, base64Encode(String(value)));
        }

        // A stable order is what makes paging safe.
        searchParams.set('orderBy', 'primkey');
        searchParams.set('orderType', 'ASC');
        searchParams.set('pageNo', String(pageNo));
        searchParams.set('pageSize', String(PAGE_SIZE));

        const result = await mosySecureSelect({
            table,
            recordIdColumn: 'record_id',
            dictionary,
            searchParams,
            authData,
            searchableColumns: null,
            defaultOrderColumn: 'primkey',
            batchMutations: null,
        });

        const batch = Array.isArray(result?.data) ? result.data : [];
        const pagination = result?.pagination;

        // mosySecureSelect clamps a page past the end back to the last
        // page. Taking that batch would count the same rows twice.
        if (pagination && pagination.current_page !== undefined && Number(pagination.current_page) !== pageNo) {
            return rows;
        }

        rows.push(...batch);

        if (rows.length > MAX_ROWS) {
            throw new PayloadError(
                `More than ${MAX_ROWS} rows matched, so the totals would be incomplete`,
                'Narrow the where (for example a shorter date range)'
            );
        }

        if (typeof pagination?.has_next === 'boolean') {
            if (!pagination.has_next) return rows;
        } else if (batch.length < PAGE_SIZE) {
            return rows;
        }
    }

    throw new PayloadError(
        `More than ${MAX_ROWS} rows matched, so the totals would be incomplete`,
        'Narrow the where (for example a shorter date range)'
    );
}

async function loadRows(spec, conditions, env) {
    const { params, post, columns, inClause } = compileConditions(conditions);

    const dictionary = {};

    for (const column of [
        'primkey',
        ...columns,
        ...spec.columns,
        ...spec.lookup,
        ...(spec.groupBy ? [spec.groupBy] : []),
        ...(spec.orderBy ? [spec.orderBy] : []),
    ]) {
        dictionary[column] = column;
    }

    // Mosy has no IN: run one query per value and join the rows.
    const runs = inClause
        ? inClause.values.map(value => new Map(params).set(inClause.column, value))
        : [params];

    let rows = [];

    for (const runParams of runs) {
        rows.push(
            ...(await pagedSelect({
                table: spec.table,
                dictionary,
                params: runParams,
                authData: env.authData,
            }))
        );
    }

    if (rows.length > MAX_ROWS) {
        throw new PayloadError(
            `More than ${MAX_ROWS} rows matched, so the totals would be incomplete`,
            'Narrow the where'
        );
    }

    // "is empty" cannot be asked of Mosy, so it is applied here.
    for (const { column, empty } of post) {
        if (rows.length && rows.every(row => !(column in row))) {
            throw new PayloadError(
                `Column '${column}' was not returned by '${spec.table}'`,
                'Check the column name exists in that table'
            );
        }

        rows = rows.filter(row => isEmptyColumn(row?.[column]) === empty);
    }

    return rows;
}

// Replaces ids with names, one small read per different id.
async function applyJoins(spec, rows, env) {
    const entries = Object.entries(spec.join || {});

    if (!entries.length || !rows.length) return rows;

    const result = rows.map(row => ({ ...row }));

    for (const [column, { table, show, key }] of entries) {
        if (result.every(row => !(column in row))) continue;

        const ids = [
            ...new Set(
                result
                    .map(row => row[column])
                    .filter(value => !isEmptyColumn(value))
                    .map(String)
            ),
        ];

        if (ids.length > MAX_IN_VALUES) {
            throw new PayloadError(
                `Too many different ${column} values to look up (${ids.length}, limit ${MAX_IN_VALUES})`,
                'Narrow the where, or keep the name on the row itself'
            );
        }

        const dictionary = {};
        for (const name of ['primkey', key, show]) dictionary[name] = name;

        const names = new Map();

        for (const id of ids) {
            const found = await pagedSelect({
                table,
                dictionary,
                params: new Map([[key, id]]),
                authData: env.authData,
            });

            if (found.length && !(show in found[0])) {
                throw new PayloadError(
                    `Column '${show}' was not returned by '${table}'`,
                    'Check the column name exists in that table'
                );
            }

            if (found.length) names.set(id, found[0][show]);
        }

        for (const row of result) {
            if (!(column in row) || isEmptyColumn(row[column])) continue;

            const name = names.get(String(row[column]));
            row[column] = isEmptyColumn(name) ? 'unknown' : String(name);
        }
    }

    return result;
}

async function runFetch(spec, env) {
    const ctx = {
        dateColumn: spec.dateColumn || env.dateColumn,
        today: env.today,
        variables: env.variables,
    };

    const conditions = parseConditions(spec.where, ctx);

    let beforeConditions = null;

    if (spec.compareWith) {
        beforeConditions = mergeConditions(conditions, parseConditions(spec.compareWith, ctx));
    }

    const rows = await applyJoins(spec, await loadRows(spec, conditions, env), env);
    const beforeRows = beforeConditions ? await loadRows(spec, beforeConditions, env) : null;

    return summarize(
        rows,
        {
            ...spec,
            beforeWhere: beforeConditions
                ? beforeConditions.map(condition => condition.source).join(' AND ')
                : '',
        },
        beforeRows
    );
}


// ============================================================
// POST
// ============================================================

export async function POST(request) {
    try {

        // ----------------------------------------------------
        // 1. AUTH
        // ----------------------------------------------------

        const {
            valid,
            reason,
            data: authData,
        } = processAuthToken(request);

        if (!valid) {
            return errorResponse(reason || 'Unauthorized', 403);
        }

        // mosySecureSelect only adds its tenant filter when this is set.
        // Without it a query would read every business, so refuse.
        if (!authData?.hive_site_id) {
            return errorResponse('Token has no business (hive_site_id)', 403);
        }

        // ----------------------------------------------------
        // 2. BODY
        // ----------------------------------------------------

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse('Invalid JSON request body', 400);
        }

        if (!isObject(body)) {
            return errorResponse('Request body must be an object', 400);
        }

        const rawPayload = body.payload !== undefined ? body.payload : body;
        const debug = body.debug === true;
        const wantPaths = body.paths === true;
        const recordId = body.record_id ?? null;

        let timezone = DEFAULT_TIMEZONE;

        const respond = result =>
            Response.json({
                record_id: recordId,
                ...result,
                generated_at: isoIn(timezone),
            });

        // ----------------------------------------------------
        // 3. PAYLOAD
        // ----------------------------------------------------

        let payload;
        let specs;
        let env;

        try {
            payload = normalizePayload(rawPayload);

            const requestedZone = payload.timezone ? String(payload.timezone) : DEFAULT_TIMEZONE;

            let today;

            try {
                today = todayIn(requestedZone);
                isoIn(requestedZone);
            } catch {
                throw new PayloadError(`Unknown timezone '${requestedZone}'`, 'Use a name like Africa/Nairobi');
            }

            timezone = requestedZone;

            env = {
                authData,
                today,
                variables: resolveVariableDates({
                    ...(isObject(payload.variables) ? payload.variables : {}),
                    ...(isObject(body.variables) ? body.variables : {}),
                }, today),
                dateColumn: payload.date_column
                    ? validateIdentifier(String(payload.date_column), 'date_column')
                    : DEFAULT_DATE_COLUMN,
            };

            specs = Object.entries(payload.fetch || {}).map(([name, raw]) => normalizeFetch(name, raw));
        } catch (error) {
            if (!(error instanceof PayloadError)) throw error;

            return respond({
                status: 'failed',
                send: null,
                problems: [{ where: 'payload', what: error.message, fix: error.fix }],
                values: {},
            });
        }

        // ----------------------------------------------------
        // 4. FETCH EVERYTHING THE MESSAGE NEEDS
        // ----------------------------------------------------

        const settled = await Promise.allSettled(specs.map(spec => runFetch(spec, env)));

        const data = {};
        const problems = [];

        settled.forEach((outcome, index) => {
            const name = specs[index].name;

            if (outcome.status === 'fulfilled') {
                data[name] = outcome.value;
                return;
            }

            const error = outcome.reason;

            if (!(error instanceof PayloadError)) {
                console.error(`Maira fetch '${name}' failed:`, error);
            }

            problems.push({
                where: `fetch.${name}`,
                what: error?.message || 'Fetch failed',
                fix: error instanceof PayloadError ? error.fix : 'The server or database failed while reading this table. Check the server log for the real error.',
            });
        });

        if (problems.length) {
            return respond({
                status: 'failed',
                send: null,
                problems,
                values: {},
                ...(wantPaths ? { paths: listPaths(data) } : {}),
                ...(debug ? { data } : {}),
            });
        }

        // ----------------------------------------------------
        // 5. BUILD THE MESSAGE
        // ----------------------------------------------------

        const built = buildMessage({
            payload,
            data,
            variables: env.variables,
            timezone,
        });

        return respond({
            ...built,
            ...(wantPaths ? { paths: listPaths(data) } : {}),
            ...(debug ? { data } : {}),
        });

    } catch (error) {

        console.error('Maira Route Error:', error);

        return errorResponse(error?.message || 'Maira failed', 500);
    }
}
