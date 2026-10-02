// ============================================================
// Maira Data Interpreter
// ============================================================
// Pure functions only: no database, no HTTP, no business rules.
//
//   rows             -> summarize()      -> the data structure
//   payload + data   -> buildMessage()   -> the finished message
//
// What a payload author writes inside a message:
//
//   {Sales.count}                  a value from a fetch
//   {Sales.amount.total|money}     the same value, formatted
//   {Sales.top.item}               the top group
//   {KRA}                          a named line (rules -> text)
//
// Anything a placeholder cannot fill is reported as a problem,
// so a half-filled message is never produced.
// ============================================================


export const DEFAULT_TIMEZONE = 'Africa/Nairobi';

export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Top-level keys of a fetch summary. A numeric column with one of
// these names would overwrite them, so it is rejected up front.
const RESERVED_KEYS = new Set([
    'name', 'table', 'where', 'found', 'count', 'first', 'latest',
    'top', 'bottom', 'groups', 'before', 'if_empty',
]);

export function isReservedKey(key) {
    return RESERVED_KEYS.has(key);
}


// ============================================================
// ERRORS
// ============================================================
// A PayloadError means "the payload is wrong", and carries a
// plain-language hint on how to fix it.

export class PayloadError extends Error {
    constructor(message, fix = null) {
        super(message);
        this.name = 'PayloadError';
        this.fix = fix;
    }
}


// ============================================================
// SMALL HELPERS
// ============================================================

export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// Two decimals, no floating-point noise.
function clean(number) {
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function round1(number) {
    return Math.round(number * 10) / 10;
}

export function getPath(object, path) {
    return String(path)
        .split('.')
        .reduce(
            (current, key) =>
                current !== null &&
                typeof current === 'object' &&
                Object.prototype.hasOwnProperty.call(current, key)
                    ? current[key]
                    : undefined,
            object
        );
}

function isEmptyValue(value) {
    return value === undefined || value === null || value === '';
}

// Splits on a whole word (AND / OR) that is surrounded by spaces
// and is NOT inside quotes:  status = 'a and b' AND x = 1
export function splitOutsideQuotes(text, word) {
    const pattern = new RegExp(`^\\s+${word}\\s+`, 'i');
    const parts = [];
    let current = '';
    let quote = null;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (quote) {
            current += char;
            if (char === quote) quote = null;
            continue;
        }

        if (char === "'" || char === '"') {
            quote = char;
            current += char;
            continue;
        }

        if (/\s/.test(char)) {
            const match = pattern.exec(text.slice(i));
            if (match) {
                parts.push(current.trim());
                current = '';
                i += match[0].length - 1;
                continue;
            }
        }

        current += char;
    }

    parts.push(current.trim());
    return parts;
}


// ============================================================
// DATES
// ============================================================
// Dates are plain 'YYYY-MM-DD' strings in the business timezone,
// so "today" means the owner's today, not the server's.

export function todayIn(timezone = DEFAULT_TIMEZONE, now = new Date()) {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

// today | yesterday | tomorrow, optionally "- 7 days" / "+ 2 days",
// or a plain 2026-10-01. Returns 'YYYY-MM-DD' or null.
export function resolveDateWord(text, today) {
    const value = String(text).trim().toLowerCase();

    const word = /^(today|yesterday|tomorrow)(?:\s*([+-])\s*(\d+)\s*days?)?$/.exec(value);
    if (word) {
        const base = { today: 0, yesterday: -1, tomorrow: 1 }[word[1]];
        const offset = word[2]
            ? (word[2] === '-' ? -1 : 1) * Number(word[3])
            : 0;
        return addDays(today, base + offset);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(`${value}T00:00:00Z`);
        if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
            return value;
        }
    }

    return null;
}

// Returns { from, to } (both inclusive) or null.
//   this week / last week      Monday to Sunday
//   this month / last month
//   last N days                N days ending today
//   next N days                tomorrow to today + N
export function resolveDateRange(text, today) {
    const value = String(text).trim().toLowerCase();

    const single = resolveDateWord(value, today);
    if (single) return { from: single, to: single };

    if (value === 'this week' || value === 'last week') {
        const dayOfWeek = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
        const monday = addDays(today, -((dayOfWeek + 6) % 7));
        const from = value === 'this week' ? monday : addDays(monday, -7);
        return { from, to: addDays(from, 6) };
    }

    if (value === 'this month' || value === 'last month') {
        const [year, month] = today.split('-').map(Number);
        const first = new Date(Date.UTC(year, month - 1 + (value === 'last month' ? -1 : 0), 1));
        const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
        return {
            from: first.toISOString().slice(0, 10),
            to: last.toISOString().slice(0, 10),
        };
    }

    const last = /^last\s+(\d+)\s+days?$/.exec(value);
    if (last) return { from: addDays(today, -(Number(last[1]) - 1)), to: today };

    const next = /^next\s+(\d+)\s+days?$/.exec(value);
    if (next) return { from: addDays(today, 1), to: addDays(today, Number(next[1])) };

    return null;
}

// 2026-10-01T18:00:02+03:00 style timestamp in the business timezone.
export function isoIn(timezone = DEFAULT_TIMEZONE, now = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'longOffset',
        })
            .formatToParts(now)
            .map(part => [part.type, part.value])
    );

    const offset = (parts.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}


// ============================================================
// SUMMARIZE  (rows -> the data structure)
// ============================================================
//
// summarize(rows, spec, beforeRows)
//
// spec: { name, table, where, columns, lookup, groupBy, orderBy,
//         rankBy, ifEmpty, beforeWhere }
//
// Returns:
//
// {
//   name, table, where, found, count,
//   amount: { total, average, highest, lowest },     (per column)
//   first:  { item: ... },  latest: { item: ... },   (per lookup)
//   top, bottom, groups,                             (with groupBy)
//   before: { found, count, amount: {...},
//             change: { count: {...}, amount: { difference, percent, trend } } }
// }
//
// Notes
//  - percent is always positive; trend ('up' | 'down' | 'same')
//    carries the direction.
//  - With no rows, count is 0 and each column has { total: 0 }.
//    Averages, first, top etc. are left out rather than shown as 0.

export function summarize(rows, spec = {}, beforeRows = null) {
    const {
        name = '',
        table = '',
        where = '',
        columns = [],
        lookup = [],
        groupBy = null,
        orderBy = null,
        rankBy = null,
        ifEmpty,
        beforeWhere = '',
    } = spec;

    const list = Array.isArray(rows) ? rows : [];

    requireReturned(list, table, [
        ...columns,
        ...lookup,
        ...(groupBy ? [groupBy] : []),
        ...(orderBy ? [orderBy] : []),
    ]);

    const result = {
        name,
        table,
        where,
        found: list.length > 0,
        count: list.length,
    };

    if (ifEmpty !== undefined) result.if_empty = ifEmpty;

    for (const column of columns) {
        result[column] = columnStats(list, column);
    }

    // first = oldest row, latest = newest row
    // (by orderBy, else by primkey, else the order received)
    const ordered = sortRows(list, orderBy);

    if (lookup.length && ordered.length) {
        result.first = pick(ordered[0], lookup);
        result.latest = pick(ordered[ordered.length - 1], lookup);
    }

    if (groupBy && list.length) {
        const groups = buildGroups(list, groupBy, columns, rankBy);
        result.top = groups[0];
        result.bottom = groups[groups.length - 1];
        result.groups = groups;
    }

    if (Array.isArray(beforeRows)) {
        result.before = summarizeBefore(beforeRows, columns, result, beforeWhere);
    }

    return result;
}

function requireReturned(rows, table, columns) {
    if (!rows.length) return;

    for (const column of columns) {
        if (rows.every(row => row?.[column] === undefined)) {
            throw new PayloadError(
                `Column '${column}' was not returned by '${table}'`,
                'Check the column name exists in that table'
            );
        }
    }
}

function columnStats(rows, column) {
    const numbers = [];

    for (const row of rows) {
        const number = toNumber(row?.[column]);
        if (number !== null) numbers.push(number);
    }

    if (!numbers.length) return { total: 0 };

    let total = 0;
    let highest = numbers[0];
    let lowest = numbers[0];

    for (const number of numbers) {
        total += number;
        if (number > highest) highest = number;
        if (number < lowest) lowest = number;
    }

    return {
        total: clean(total),
        average: clean(total / numbers.length),
        highest: clean(highest),
        lowest: clean(lowest),
    };
}

function compareValues(a, b) {
    const numberA = toNumber(a);
    const numberB = toNumber(b);

    if (numberA !== null && numberB !== null) return numberA - numberB;

    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function sortRows(rows, orderBy) {
    const column = orderBy || 'primkey';

    if (!rows.length || rows.some(row => isEmptyValue(row?.[column]))) {
        return rows;
    }

    return [...rows].sort((a, b) => compareValues(a[column], b[column]));
}

function pick(row, columns) {
    const result = {};
    for (const column of columns) result[column] = row?.[column] ?? null;
    return result;
}

function buildGroups(rows, groupBy, columns, rankBy) {
    if (groupBy === 'count' || columns.includes(groupBy)) {
        throw new PayloadError(
            `group_by '${groupBy}' clashes with a column or built-in name`,
            "Use a different group_by column, or remove it from 'columns'"
        );
    }

    const measure = rankBy || (columns.length ? columns[0] : 'count');

    if (measure !== 'count' && !columns.includes(measure)) {
        throw new PayloadError(
            `rank_by '${measure}' is not in columns`,
            "Use 'count' or one of the listed columns"
        );
    }

    const buckets = new Map();

    for (const row of rows) {
        const raw = row?.[groupBy];
        const label = isEmptyValue(raw) ? '(none)' : String(raw);

        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push(row);
    }

    const groups = [];

    for (const [label, members] of buckets) {
        const group = { [groupBy]: label, count: members.length };
        for (const column of columns) group[column] = columnStats(members, column);
        groups.push(group);
    }

    const score = group =>
        measure === 'count' ? group.count : group[measure].total;

    groups.sort(
        (a, b) =>
            score(b) - score(a) ||
            String(a[groupBy]).localeCompare(String(b[groupBy]))
    );

    return groups;
}

function summarizeBefore(beforeRows, columns, now, beforeWhere) {
    const count = beforeRows.length;

    const before = { where: beforeWhere, found: count > 0, count };

    for (const column of columns) {
        before[column] = columnStats(beforeRows, column);
    }

    // Nothing to compare against -> no change figures at all.
    if (count > 0) {
        before.change = { count: change(now.count, count) };

        for (const column of columns) {
            before.change[column] = change(now[column].total, before[column].total);
        }
    }

    return before;
}

function change(current, previous) {
    const difference = clean(current - previous);

    return {
        difference,
        percent: previous !== 0
            ? round1((Math.abs(difference) / Math.abs(previous)) * 100)
            : null,
        trend: difference > 0 ? 'up' : difference < 0 ? 'down' : 'same',
    };
}


// ============================================================
// CONDITIONS
// ============================================================
// Plain-English comparisons used by skip_if and line rules:
//
//   Failed.count is not 0
//   Sales.before.change.amount.trend is up
//   Petrol.days is under 2
//   Shift.first.opened_by is empty
//   Sales.count > 10  AND  Flags.count is 0
//
// Words: is, is not, is under, is over, is at least, is at most,
//        is empty, is not empty   (or  =  !=  <  >  <=  >=)
// A missing value is never equal to anything and never "under"
// or "over" anything; it only counts as empty.

const OPERATORS = [
    'is not empty',
    'is empty',
    'is at least',
    'is at most',
    'is not',
    'is under',
    'is over',
    'is',
    '>=',
    '<=',
    '!=',
    '<>',
    '==',
    '=',
    '<',
    '>',
];

export function evaluateCondition(expression, context) {
    const source = String(expression || '').trim();

    if (!source) {
        throw new PayloadError('Empty condition', "Write it like: Failed.count is not 0");
    }

    return splitOutsideQuotes(source, 'or')
        .map(group => splitOutsideQuotes(group, 'and'))
        .some(group => group.every(part => evaluateComparison(part, context)));
}

function evaluateComparison(text, context) {
    const space = text.search(/\s/);

    if (space === -1) {
        throw conditionError(text);
    }

    const path = text.slice(0, space);
    const rest = text.slice(space).trim();
    const lower = rest.toLowerCase();

    let operator = null;

    for (const candidate of OPERATORS) {
        if (!lower.startsWith(candidate)) continue;

        const next = lower[candidate.length];
        const isWord = /[a-z]/.test(candidate[0]);

        if (isWord && next !== undefined && !/\s/.test(next)) continue;

        operator = candidate;
        break;
    }

    if (!operator) throw conditionError(text);

    const rawRight = rest.slice(operator.length).trim();
    const left = getPath(context, path);

    if (operator === 'is empty') return isEmptyValue(left);
    if (operator === 'is not empty') return !isEmptyValue(left);

    if (rawRight === '') throw conditionError(text);

    const right = parseLiteral(rawRight);

    switch (operator) {
        case 'is':
        case '=':
        case '==':
            return looseEquals(left, right);

        case 'is not':
        case '!=':
        case '<>':
            return !looseEquals(left, right);

        case 'is under':
        case '<':
            return numericCompare(left, right, (a, b) => a < b);

        case 'is over':
        case '>':
            return numericCompare(left, right, (a, b) => a > b);

        case 'is at least':
        case '>=':
            return numericCompare(left, right, (a, b) => a >= b);

        case 'is at most':
        case '<=':
            return numericCompare(left, right, (a, b) => a <= b);

        default:
            throw conditionError(text);
    }
}

function conditionError(text) {
    return new PayloadError(
        `Cannot read condition: ${text}`,
        'Write it like: Failed.count is not 0   (is, is not, is under, is over, is empty)'
    );
}

function parseLiteral(text) {
    const quoted = /^'(.*)'$/s.exec(text) || /^"(.*)"$/s.exec(text);
    if (quoted) return quoted[1];

    const number = toNumber(text);
    return number !== null ? number : text;
}

function looseEquals(left, right) {
    if (isEmptyValue(left)) return false;

    const numberLeft = toNumber(left);
    const numberRight = toNumber(right);

    if (numberLeft !== null && numberRight !== null) {
        return numberLeft === numberRight;
    }

    return String(left).toLowerCase() === String(right).toLowerCase();
}

function numericCompare(left, right, test) {
    const numberLeft = toNumber(left);
    const numberRight = toNumber(right);

    if (numberLeft === null || numberRight === null) return false;

    return test(numberLeft, numberRight);
}


// ============================================================
// FORMATS
// ============================================================
// {value|money}  ->  KES 184,300
//
// A format is a pattern: text around a number mask.
//   "KES #,###"      thousands separators, no decimals
//   "#,###.##"       up to two decimals
//   "#,###.00"       always two decimals
//   "#,### L"        suffix
// The payload's "formats" block can add or override names.
// Built-ins: money, number, percent, litres, date, time, upper, lower.

const BUILTIN_PATTERNS = {
    money: 'KES #,###',
    number: '#,###.##',
    percent: '#,###.#%',
    litres: '#,### L',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function patternFormat(number, pattern) {
    const match = /^([^#0]*)([#0][#0,]*(?:\.[#0]+)?)(.*)$/s.exec(pattern);

    if (!match) {
        throw new PayloadError(
            `Bad format pattern: ${pattern}`,
            "Use something like 'KES #,###' or '#,###.##'"
        );
    }

    const [, prefix, mask, suffix] = match;
    const [integerMask, fractionMask = ''] = mask.split('.');

    const minimumFractionDigits = (fractionMask.match(/0/g) || []).length;
    const maximumFractionDigits = fractionMask.length;

    // Avoid "-0" after rounding
    let value = number;
    if (Number(value.toFixed(maximumFractionDigits)) === 0) value = 0;

    const body = new Intl.NumberFormat('en-US', {
        useGrouping: integerMask.includes(','),
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(value);

    return `${prefix}${body}${suffix}`;
}

// 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss' (business wall clock) or an
// ISO timestamp with a zone (converted to the business timezone).
function parseMoment(value, timezone) {
    const text = String(value).trim();

    const wall = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(text);

    if (wall) {
        return {
            year: Number(wall[1]),
            month: Number(wall[2]),
            day: Number(wall[3]),
            hour: wall[4] === undefined ? null : Number(wall[4]),
            minute: wall[5] === undefined ? null : Number(wall[5]),
            second: wall[6] === undefined ? 0 : Number(wall[6]),
        };
    }

    if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
        const date = new Date(text);

        if (!Number.isNaN(date.getTime())) {
            const parts = Object.fromEntries(
                new Intl.DateTimeFormat('en-GB', {
                    timeZone: timezone,
                    hourCycle: 'h23',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                })
                    .formatToParts(date)
                    .map(part => [part.type, Number(part.value)])
            );

            return {
                year: parts.year,
                month: parts.month,
                day: parts.day,
                hour: parts.hour,
                minute: parts.minute,
                second: parts.second,
            };
        }
    }

    return null;
}

function formatValue(raw, format, state) {
    if (format === 'upper') return String(raw).toUpperCase();
    if (format === 'lower') return String(raw).toLowerCase();

    if (format === 'date' || format === 'time') {
        const moment = parseMoment(raw, state.timezone);

        if (!moment || (format === 'time' && moment.hour === null)) {
            throw new PayloadError(
                `Cannot show '${raw}' as ${format}`,
                'Use it on a date/datetime column'
            );
        }

        if (format === 'time') {
            const hour12 = moment.hour % 12 || 12;
            return `${hour12}:${String(moment.minute).padStart(2, '0')} ${moment.hour < 12 ? 'AM' : 'PM'}`;
        }

        const weekday = WEEKDAYS[new Date(Date.UTC(moment.year, moment.month - 1, moment.day)).getUTCDay()];
        return `${weekday} ${moment.day} ${MONTHS[moment.month - 1]} ${moment.year}`;
    }

    const pattern = typeof state.formats[format] === 'string'
        ? state.formats[format]
        : BUILTIN_PATTERNS[format];

    // A pattern with YYYY is a date pattern: YYYY MM DD HH hh mm ss A
    // e.g. "YYYY-MM-DD hh:mm:ss A" -> 2026-10-01 08:00:19 AM
    if (typeof pattern === 'string' && pattern.includes('YYYY')) {
        const moment = parseMoment(raw, state.timezone);
        const needsTime = /HH|hh|mm|ss|A/.test(pattern.replace(/YYYY|MM|DD/g, ''));

        if (!moment || (needsTime && moment.hour === null)) {
            throw new PayloadError(
                `Cannot show '${raw}' as ${format}`,
                needsTime ? 'Use it on a datetime column' : 'Use it on a date/datetime column'
            );
        }

        const two = n => String(n).padStart(2, '0');

        return pattern.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, token => ({
            YYYY: moment.year,
            MM: two(moment.month),
            DD: two(moment.day),
            HH: two(moment.hour),
            hh: two(moment.hour % 12 || 12),
            mm: two(moment.minute),
            ss: two(moment.second),
            A: moment.hour < 12 ? 'AM' : 'PM',
        })[token]);
    }

    if (!pattern) {
        throw new PayloadError(
            `Unknown format '${format}'`,
            'Use money, number, percent, litres, date, time, upper, lower, or add it under formats'
        );
    }

    const number = toNumber(raw);

    if (number === null) {
        throw new PayloadError(
            `Cannot show '${raw}' as ${format}`,
            'That value is not a number'
        );
    }

    return patternFormat(number, pattern);
}


// ============================================================
// PATH LIST  (so nobody needs the documentation to find a path)
// ============================================================
//
// listPaths(data) -> [{ path, value, meaning }, ...]
//
// Every fact a message can quote, in the exact words to put inside
// braces, with its current value and what it means. Returned when
// a request asks for paths: true.

const STAT_WORDS = {
    total: 'sum of',
    average: 'average of',
    highest: 'biggest single value of',
    lowest: 'smallest single value of',
};

const PATH_SKIP = new Set(['name', 'table', 'where', 'if_empty']);

function describePath(segments) {
    let rest = segments;
    let scope = '';

    if (rest[0] === 'before') {
        scope = ' in the comparison period';
        rest = rest.slice(1);
    }

    if (rest[0] === 'change') {
        const [, column, kind] = rest;
        const what = column === 'count' ? 'the number of rows' : column;

        return ({
            difference: `this period minus the comparison, for ${what} (negative means down)`,
            percent: `size of the change in ${what} as a percentage, never negative`,
            trend: `'up', 'down' or 'same' for ${what}`,
        })[kind] || `change in ${what}`;
    }

    if (rest[0] === 'top' || rest[0] === 'bottom') {
        const which = rest[0] === 'top' ? 'the top group' : 'the bottom group';
        const sub = rest.slice(1);

        if (sub.length === 1 && sub[0] === 'count') return `rows in ${which}`;
        if (sub.length === 1) return `${sub[0]} of ${which}`;
        if (sub.length === 2 && STAT_WORDS[sub[1]]) return `${STAT_WORDS[sub[1]]} ${sub[0]} for ${which}`;
        return '';
    }

    if (rest[0] === 'first' || rest[0] === 'latest') {
        return `${rest[1]} from the ${rest[0] === 'first' ? 'first (oldest)' : 'latest (newest)'} row`;
    }

    if (rest.length === 1 && rest[0] === 'count') return `number of rows${scope || ' matched'}`;
    if (rest.length === 1 && rest[0] === 'found') return `true when any row matched${scope}`;
    if (rest.length === 2 && STAT_WORDS[rest[1]]) return `${STAT_WORDS[rest[1]]} ${rest[0]}${scope}`;

    return '';
}

function collectPaths(name, node, trail, out) {
    for (const [key, value] of Object.entries(node)) {
        if (PATH_SKIP.has(key)) continue;

        const segments = [...trail, key];

        if (key === 'groups' && Array.isArray(value)) {
            out.push({
                path: `${name}.groups`,
                value: `${value.length} groups`,
                meaning: 'the list of groups; use it in an each line',
            });

            if (value.length) {
                const items = [];
                collectPaths('item', value[0], ['top'], items);

                for (const entry of items) {
                    out.push({
                        path: entry.path,
                        value: entry.value,
                        meaning: `inside an each line over ${name}.groups: ${entry.meaning.replace('the top group', 'this item')}`,
                    });
                }
            }

            continue;
        }

        if (isObject(value)) {
            collectPaths(name, value, segments, out);
            continue;
        }

        out.push({
            path: `${name}.${segments.join('.')}`.replace(/^item\.top\./, 'item.'),
            value,
            meaning: describePath(segments),
        });
    }
}

export function listPaths(data) {
    const out = [];

    for (const [name, summary] of Object.entries(data || {})) {
        if (isObject(summary)) collectPaths(name, summary, [], out);
    }

    return out;
}


// ============================================================
// TEMPLATE RENDERING
// ============================================================

const MAX_LINE_DEPTH = 5;

// A path with nothing behind it. For a fetch that found no rows:
//   - the fetch's if_empty text is used when it has one,
//   - lookups (first / latest) read "none",
// everything else is a genuine gap and is reported.
function lookupValue(context, path) {
    const value = getPath(context, path);

    if (!isEmptyValue(value)) return value;

    const [root, section] = path.split('.');
    const fetched = context[root];

    if (isObject(fetched) && fetched.found === false && path.includes('.')) {
        if (fetched.if_empty !== undefined) return fetched.if_empty;
        if (section === 'first' || section === 'latest') return 'none';
    }

    return undefined;
}

function addProblem(state, what, fix) {
    const key = `${state.section}|${what}`;

    if (state.seen.has(key)) return;
    state.seen.add(key);

    state.problems.push({ where: state.section, what, fix });
}

function renderLine(name, state, depth) {
    if (depth >= MAX_LINE_DEPTH) {
        addProblem(state, `Line '${name}' refers back to itself`, 'Remove the loop between lines');
        return '';
    }

    const definition = state.lines[name];

    if (!isObject(definition)) {
        addProblem(state, `Line '${name}' is not defined properly`, 'A line needs rules and if_none');
        return '';
    }

    const previousSection = state.section;
    state.section = `lines.${name}`;

    let text = '';

    try {
      if (typeof definition.each === 'string') {
        // One block of text per item of a group list: "each": "Sales.groups"
        // Inside "say", use {item.fuel_type}, {item.total_amount.total|money} ...
        const items = getPath(state.context, definition.each);

        if (!Array.isArray(items) || !items.length) {
            text = renderText(String(definition.if_none ?? ''), state, depth + 1);
        } else {
            const separator = typeof definition.separator === 'string' ? definition.separator : '\n';
            const limit = Number.isInteger(definition.limit) && definition.limit > 0 ? definition.limit : 50;
            const outer = state.context;

            try {
                text = items
                    .slice(0, limit)
                    .map(item => {
                        state.context = { ...outer, item };
                        return renderText(String(definition.say ?? ''), state, depth + 1);
                    })
                    .join(separator);
            } finally {
                state.context = outer;
            }
        }
      } else {
        const rules = Array.isArray(definition.rules) ? definition.rules : [];
        const matched = rules.find(rule => evaluateCondition(rule?.if, state.context));

        text = renderText(
            String(matched ? matched.say ?? '' : definition.if_none ?? ''),
            state,
            depth + 1
        );
      }
    } catch (error) {
        if (!(error instanceof PayloadError)) throw error;
        addProblem(state, error.message, error.fix);
    }

    state.section = previousSection;
    state.values[name] = text;

    return text;
}

function renderText(template, state, depth = 0) {
    return template.replace(/\{([^{}]+)\}/g, (whole, inner) => {
        const [path, format] = inner.split('|').map(part => part.trim());

        if (Object.prototype.hasOwnProperty.call(state.lines, path)) {
            return renderLine(path, state, depth);
        }

        const raw = lookupValue(state.context, path);

        if (isEmptyValue(raw)) {
            addProblem(
                state,
                `{${path}} has no value`,
                'Check the fetch name and field, or use skip_if / if_empty for quiet days'
            );
            return whole;
        }

        if (typeof raw === 'object') {
            addProblem(
                state,
                `{${path}} is a group of values, not one value`,
                'Add a field, e.g. {Sales.top.item}'
            );
            return whole;
        }

        try {
            const text = format ? formatValue(raw, format, state) : String(raw);
            state.values[format ? `${path}|${format}` : path] = text;
            return text;
        } catch (error) {
            if (!(error instanceof PayloadError)) throw error;
            addProblem(state, error.message, error.fix);
            return whole;
        }
    });
}

// Standalone renderer for tests and other callers.
export function renderTemplate(template, context = {}, options = {}) {
    const state = {
        context,
        lines: options.lines || {},
        formats: options.formats || {},
        timezone: options.timezone || DEFAULT_TIMEZONE,
        values: {},
        problems: [],
        seen: new Set(),
        section: 'message',
    };

    const text = renderText(String(template), state);

    return { text, values: state.values, problems: state.problems };
}


// ============================================================
// BUILD MESSAGE
// ============================================================
//
// buildMessage({ payload, data, variables, timezone })
//
// data       { Sales: <summary>, Failed: <summary>, ... }
// variables  extra fixed values such as { Name: 'Sam' }
//
// Returns { status, send, values, problems, ... } where status is
//   ready    send.text is the finished message
//   skipped  skip_if matched and there is no fallback_message
//   failed   a placeholder or rule could not be filled; see problems

export function buildMessage({
    payload,
    data = {},
    variables = {},
    timezone = DEFAULT_TIMEZONE,
    now = new Date(),
}) {
    const context = {
        ...variables,
        Today: todayIn(timezone, now),
        ...data,
    };

    const state = {
        context,
        lines: isObject(payload.lines) ? payload.lines : {},
        formats: isObject(payload.formats) ? payload.formats : {},
        timezone,
        values: {},
        problems: [],
        seen: new Set(),
        section: 'message',
    };

    let template = payload.message;
    let usedFallback = false;

    // Quiet-day rule
    if (typeof payload.skip_if === 'string' && payload.skip_if.trim()) {
        let skip = false;

        try {
            skip = evaluateCondition(payload.skip_if, context);
        } catch (error) {
            if (!(error instanceof PayloadError)) throw error;

            return failure(state, [
                { where: 'skip_if', what: error.message, fix: error.fix },
            ]);
        }

        if (skip) {
            const fallback = payload.fallback_message;

            if (typeof fallback !== 'string' || !fallback.trim()) {
                return {
                    status: 'skipped',
                    reason: 'Nothing to report',
                    detail: `skip_if matched: ${payload.skip_if}`,
                    send: null,
                    values: {},
                    problems: [],
                };
            }

            template = fallback;
            usedFallback = true;
            state.section = 'fallback_message';
        }
    }

    // A message saved with a doubled backslash would show "\n" literally.
    if (!template.includes('\n') && template.includes('\\n')) {
        template = template.replace(/\\n/g, '\n');
    }

    const body = renderText(template, state);

    // persona, subject and footer can use {variables} and data paths too,
    // e.g. "{Branch.first.branch_name} STOCK MONITOR".
    const renderPart = (name, value) => {
        if (typeof value !== 'string' || !value.trim()) return null;
        state.section = name;
        return renderText(value, state).trim();
    };

    const persona = renderPart('persona', payload.persona);
    const subject = renderPart('subject', payload.subject);
    const footer = renderPart('footer', payload.footer);

    if (state.problems.length) return failure(state, state.problems);

    const text = [persona, body, footer]
        .filter(part => typeof part === 'string' && part.trim() !== '')
        .join('\n');

    const weight = Number(payload.weight);

    return {
        status: 'ready',
        send: {
            to: payload.audience || 'admin',
            from: persona,
            subject: subject || persona,
            text,
            weight: Number.isFinite(weight) ? weight : 5,
        },
        used_fallback: usedFallback,
        values: state.values,
        problems: [],
    };
}

function failure(state, problems) {
    return {
        status: 'failed',
        send: null,
        values: state.values,
        problems,
    };
}
