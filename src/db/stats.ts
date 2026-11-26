// Dashboard read model. SQL over the sessions table plus pure calendar helpers.
// Dates are local 'YYYY-MM-DD' strings (the sessions.local_date convention); date math
// runs in UTC so DST shifts never skip or repeat a day.
import type {Db} from "./sessions.ts";

export interface DayFocus {
    date: string;
    minutes: number;
}

export interface Outcomes {
    started: number;
    finished: number;
    stopped: number;
    open: number;
    completionRate: number | null; // finished / (finished + stopped); null with no closed sessions
    pausedSessions: number;
    pauseCount: number;
    pausedMinutes: number;
    focusMinutes: number;
}

export interface Streaks {
    current: number;
    longest: number;
}

export type Scale = "day" | "week" | "month" | "year";

export interface DashboardData {
    scale: Scale;
    anchor: string;
    today: string;
    from: string;
    to: string;
    days: DayFocus[];
    hours: number[] | null; // focus minutes per start hour (0–23), Day scale only
    outcomes: Outcomes;     // for [from, to] (spec Q19: tiles follow the toggle)
    streaks: Streaks;       // all-time
    patterns: Patterns;     // for [from, to] (spec Q20)
    tags: TagTotal[];       // for [from, to]
    allTags: (string | null)[]; // every tag ever used, for the filter menu
}

export interface SessionSummary {
    id: number;
    kind: "focus" | "break";
    tag: string | null;
    status: string;
    started_at: number;
    ended_at: number | null;
    planned_seconds: number;
    focused_ms: number;
    pause_count: number;
    paused_ms: number;
}

const DAY_MS = 86_400_000;
const toUtc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => fromUtc(toUtc(date) + n * DAY_MS);
// 1 = Monday … 7 = Sunday (spec Q9)
export const isoWeekday = (date: string) => ((new Date(toUtc(date)).getUTCDay() + 6) % 7) + 1;

// Fixed colour bands (spec Q10): 0 · 1–24 · 25–49 · 50–99 · 100+ focus minutes.
export function band(minutes: number): 0 | 1 | 2 | 3 | 4 {
    if (minutes <= 0) return 0;
    if (minutes < 25) return 1;
    if (minutes < 50) return 2;
    if (minutes < 100) return 3;
    return 4;
}

export const weekStart = (date: string) => addDays(date, -(isoWeekday(date) - 1));
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthEnd = (date: string) => fromUtc(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0));

// GitHub-style year: 53 Monday-start columns, the last one holding `end`. Days after `today` are null.
export function yearGrid(end: string, today: string = end): (string | null)[][] {
    const start = addDays(weekStart(end), -52 * 7);
    return Array.from({length: 53}, (_, w) =>
        Array.from({length: 7}, (_, d) => {
            const date = addDays(start, w * 7 + d);
            return date > today ? null : date;
        }),
    );
}

// Monday-start week rows covering the anchor's month; days outside the month are null.
export function monthGrid(anchor: string): (string | null)[][] {
    const first = monthStart(anchor);
    const last = monthEnd(anchor);
    const rows: (string | null)[][] = [];
    for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
        rows.push(Array.from({length: 7}, (_, d) => {
            const date = addDays(start, d);
            return date < first || date > last ? null : date;
        }));
    }
    return rows;
}

export const weekDates = (anchor: string) => Array.from({length: 7}, (_, d) => addDays(weekStart(anchor), d));

// The period a scale shows around an anchor date. Year is the rolling 53 weeks ending at the anchor's week.
export function periodRange(scale: Scale, anchor: string): { from: string; to: string } {
    switch (scale) {
        case "day": return {from: anchor, to: anchor};
        case "week": return {from: weekStart(anchor), to: addDays(weekStart(anchor), 6)};
        case "month": return {from: monthStart(anchor), to: monthEnd(anchor)};
        case "year": return {from: addDays(weekStart(anchor), -52 * 7), to: addDays(weekStart(anchor), 6)};
    }
}

// Step one period back (-1) or forward (1). Months land on the 1st so short months never skip.
export function shiftAnchor(scale: Scale, anchor: string, dir: 1 | -1): string {
    switch (scale) {
        case "day": return addDays(anchor, dir);
        case "week": return addDays(anchor, 7 * dir);
        case "month": return fromUtc(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1 + dir, 1));
        case "year": return addDays(anchor, 364 * dir);
    }
}

// No-zero-day streaks over dates with ≥ 1 focus minute. Today without focus yet doesn't break
// the current streak; it counts from yesterday instead.
export function streaks(activeDates: string[], today: string): Streaks {
    const days = [...new Set(activeDates)].sort();
    let longest = 0;
    let run = 0;
    for (let i = 0; i < days.length; i++) {
        run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
        longest = Math.max(longest, run);
    }
    const set = new Set(days);
    let cursor = set.has(today) ? today : addDays(today, -1);
    let current = 0;
    while (set.has(cursor)) {
        current++;
        cursor = addDays(cursor, -1);
    }
    return {current, longest};
}

type Bind = (string | number | null)[];
const select = <T>(db: Db, sql: string, bind: Bind) =>
    db.exec({sql, bind, rowMode: "object", returnValue: "resultRows"}) as unknown as T[];

// Tag filter: undefined = all tags; a string = that tag; null = untagged sessions only.
// `tag IS ?` matches both a value and NULL with one clause.
export type TagFilter = string | null | undefined;
const byTag = (tag: TagFilter): [string, Bind] => (tag === undefined ? ["", []] : [" AND tag IS ?", [tag]]);

// Focus minutes per day in [from, to]; days without focus are omitted.
export function dailyFocus(db: Db, from: string, to: string, tag?: TagFilter): DayFocus[] {
    const [t, tb] = byTag(tag);
    return select<DayFocus>(db,
        `SELECT local_date AS date, SUM(focused_ms) / 60000.0 AS minutes FROM sessions
         WHERE kind = 'focus' AND local_date BETWEEN ? AND ? AND focused_ms > 0${t}
         GROUP BY local_date ORDER BY local_date`, [from, to, ...tb])
        .map(({date, minutes}) => ({date, minutes}));
}

export function outcomes(db: Db, from: string, to: string, tag?: TagFilter): Outcomes {
    const [t, tb] = byTag(tag);
    const r = select<Record<string, number | null>>(db,
        `SELECT COUNT(*) AS started,
                SUM(status = 'finished') AS finished,
                SUM(status = 'stopped') AS stopped,
                SUM(status IN ('running','paused')) AS open,
                SUM(pause_count > 0) AS pausedSessions,
                SUM(pause_count) AS pauseCount,
                SUM(paused_ms) / 60000.0 AS pausedMinutes,
                SUM(focused_ms) / 60000.0 AS focusMinutes
         FROM sessions WHERE kind = 'focus' AND local_date BETWEEN ? AND ?${t}`, [from, to, ...tb])[0];
    const n = (k: string) => Number(r?.[k] ?? 0);
    const closed = n("finished") + n("stopped");
    return {
        started: n("started"), finished: n("finished"), stopped: n("stopped"), open: n("open"),
        completionRate: closed === 0 ? null : n("finished") / closed,
        pausedSessions: n("pausedSessions"), pauseCount: n("pauseCount"),
        pausedMinutes: n("pausedMinutes"), focusMinutes: n("focusMinutes"),
    };
}

// Focus minutes by start hour on one day (a session counts in the hour it started, like Q14's start-day rule).
export function hourlyFocus(db: Db, date: string, tag?: TagFilter): number[] {
    const [t, tb] = byTag(tag);
    const hours = Array<number>(24).fill(0);
    for (const r of select<{ hour: number; minutes: number }>(db,
        `SELECT local_hour AS hour, SUM(focused_ms) / 60000.0 AS minutes FROM sessions
         WHERE kind = 'focus' AND local_date = ?${t} GROUP BY local_hour`, [date, ...tb])) {
        hours[r.hour] = r.minutes;
    }
    return hours;
}

// Every session (focus and break) in a drill-down bucket: a date range, optionally one start hour.
export function sessionsIn(db: Db, from: string, to: string, hour: number | null = null, tag?: TagFilter): SessionSummary[] {
    const [t, tb] = byTag(tag);
    const byHour = hour === null ? "" : " AND local_hour = ?";
    return select<SessionSummary>(db,
        `SELECT id, kind, tag, status, started_at, ended_at, planned_seconds, focused_ms, pause_count, paused_ms
         FROM sessions WHERE local_date BETWEEN ? AND ?${byHour}${t} ORDER BY started_at`,
        [from, to, ...(hour === null ? [] : [hour]), ...tb])
        .map((r) => ({...r}));
}

export const MIN_EFFECTIVE_SAMPLE = 3; // closed sessions per slot before a score shows (spec Q15b)

export interface Slot {
    weekday: number; // 1 = Monday … 7 = Sunday
    hour: number;
    minutes: number;
    closed: number;
    finished: number;
    avgPauses: number;
}

export interface Patterns {
    usual: number[][];                 // [weekday-1][hour] focus minutes ("when you usually study")
    effective: (number | null)[][];    // [weekday-1][hour] completion rate, null below the sample size
    samples: number[][];               // [weekday-1][hour] closed sessions behind each score
    mostEffective: Slot & { rate: number } | null;
    peakHour: number | null;
    bestWeekday: number | null;
    avgSessionMinutes: number | null;  // over finished + stopped focus sessions
    breakRatio: number | null;         // break minutes ÷ focus minutes
}

export interface TagTotal {
    tag: string | null;
    sessions: number;
    minutes: number;
}

const grid = <T>(fill: T) => Array.from({length: 7}, () => Array<T>(24).fill(fill));
const argmax = (values: number[]) => {
    let best = -1;
    values.forEach((v, i) => { if (v > 0 && (best < 0 || v > values[best])) best = i; });
    return best < 0 ? null : best;
};

// Weekday × start-hour patterns for focus sessions in [from, to].
export function patterns(db: Db, from: string, to: string, tag?: TagFilter): Patterns {
    const [t, tb] = byTag(tag);
    const slots = select<Slot>(db,
        `SELECT local_weekday AS weekday, local_hour AS hour, SUM(focused_ms) / 60000.0 AS minutes,
                SUM(status IN ('finished','stopped')) AS closed, SUM(status = 'finished') AS finished,
                AVG(pause_count) AS avgPauses
         FROM sessions WHERE kind = 'focus' AND local_date BETWEEN ? AND ?${t}
         GROUP BY local_weekday, local_hour`, [from, to, ...tb]);
    const usual = grid(0), effective = grid<number | null>(null), samples = grid(0);
    let mostEffective: Patterns["mostEffective"] = null;
    for (const s of slots) {
        usual[s.weekday - 1][s.hour] = s.minutes;
        samples[s.weekday - 1][s.hour] = s.closed;
        if (s.closed < MIN_EFFECTIVE_SAMPLE) continue;
        const rate = s.finished / s.closed;
        effective[s.weekday - 1][s.hour] = rate;
        // Best rate wins; ties go to fewer pauses per session (spec Q5), then to more evidence.
        if (!mostEffective || rate > mostEffective.rate
            || (rate === mostEffective.rate && (s.avgPauses < mostEffective.avgPauses
                || (s.avgPauses === mostEffective.avgPauses && s.closed > mostEffective.closed)))) {
            mostEffective = {...s, rate};
        }
    }
    const byHour = Array.from({length: 24}, (_, h) => usual.reduce((sum, row) => sum + row[h], 0));
    const byWeekday = usual.map((row) => row.reduce((a, b) => a + b, 0));
    const weekday = argmax(byWeekday);
    const totals = select<Record<string, number | null>>(db,
        `SELECT AVG(CASE WHEN kind = 'focus' AND status IN ('finished','stopped') THEN focused_ms END) / 60000.0 AS avg,
                SUM(CASE WHEN kind = 'break' THEN focused_ms ELSE 0 END) AS breakMs,
                SUM(CASE WHEN kind = 'focus' THEN focused_ms ELSE 0 END) AS focusMs
         FROM sessions WHERE local_date BETWEEN ? AND ?${t}`, [from, to, ...tb])[0] ?? {};
    const focusMs = Number(totals.focusMs ?? 0);
    return {
        usual, effective, samples, mostEffective,
        peakHour: argmax(byHour),
        bestWeekday: weekday === null ? null : weekday + 1,
        avgSessionMinutes: totals.avg === null || totals.avg === undefined ? null : Number(totals.avg),
        breakRatio: focusMs === 0 ? null : Number(totals.breakMs ?? 0) / focusMs,
    };
}

// Focus minutes and sessions per tag in [from, to], biggest first; untagged is tag = null.
export function tagTotals(db: Db, from: string, to: string, tag?: TagFilter): TagTotal[] {
    const [t, tb] = byTag(tag);
    return select<TagTotal>(db,
        `SELECT tag, COUNT(*) AS sessions, SUM(focused_ms) / 60000.0 AS minutes FROM sessions
         WHERE kind = 'focus' AND local_date BETWEEN ? AND ?${t}
         GROUP BY tag ORDER BY minutes DESC, sessions DESC`, [from, to, ...tb])
        .map(({tag, sessions, minutes}) => ({tag, sessions, minutes}));
}

// Every tag ever used on a focus session (for the filter menu), most used first, untagged (null) last.
export function allTags(db: Db): (string | null)[] {
    return select<{ tag: string | null }>(db,
        `SELECT tag FROM sessions WHERE kind = 'focus' GROUP BY tag ORDER BY tag IS NULL, COUNT(*) DESC, tag`, [])
        .map((r) => r.tag);
}

export function dashboard(db: Db, today: string, scale: Scale = "year", anchor: string = today, tag?: TagFilter): DashboardData {
    const {from, to} = periodRange(scale, anchor);
    const [t, tb] = byTag(tag);
    const allActive = select<{ date: string }>(db,
        `SELECT local_date AS date FROM sessions WHERE kind = 'focus'${t}
         GROUP BY local_date HAVING SUM(focused_ms) >= 60000`, tb);
    return {
        scale, anchor, today, from, to,
        days: dailyFocus(db, from, to, tag),
        hours: scale === "day" ? hourlyFocus(db, anchor, tag) : null,
        outcomes: outcomes(db, from, to, tag),
        streaks: streaks(allActive.map((d) => d.date), today), // filtered by tag too (spec Q21)
        patterns: patterns(db, from, to, tag),
        tags: tagTotals(db, from, to, tag),
        allTags: allTags(db),
    };
}
