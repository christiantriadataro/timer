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

const select = <T>(db: Db, sql: string, bind: (string | number)[]) =>
    db.exec({sql, bind, rowMode: "object", returnValue: "resultRows"}) as unknown as T[];

// Focus minutes per day in [from, to]; days without focus are omitted.
export function dailyFocus(db: Db, from: string, to: string): DayFocus[] {
    return select<DayFocus>(db,
        `SELECT local_date AS date, SUM(focused_ms) / 60000.0 AS minutes FROM sessions
         WHERE kind = 'focus' AND local_date BETWEEN ? AND ? AND focused_ms > 0
         GROUP BY local_date ORDER BY local_date`, [from, to])
        .map(({date, minutes}) => ({date, minutes}));
}

export function outcomes(db: Db, from: string, to: string): Outcomes {
    const r = select<Record<string, number | null>>(db,
        `SELECT COUNT(*) AS started,
                SUM(status = 'finished') AS finished,
                SUM(status = 'stopped') AS stopped,
                SUM(status IN ('running','paused')) AS open,
                SUM(pause_count > 0) AS pausedSessions,
                SUM(pause_count) AS pauseCount,
                SUM(paused_ms) / 60000.0 AS pausedMinutes,
                SUM(focused_ms) / 60000.0 AS focusMinutes
         FROM sessions WHERE kind = 'focus' AND local_date BETWEEN ? AND ?`, [from, to])[0];
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
export function hourlyFocus(db: Db, date: string): number[] {
    const hours = Array<number>(24).fill(0);
    for (const r of select<{ hour: number; minutes: number }>(db,
        `SELECT local_hour AS hour, SUM(focused_ms) / 60000.0 AS minutes FROM sessions
         WHERE kind = 'focus' AND local_date = ? GROUP BY local_hour`, [date])) {
        hours[r.hour] = r.minutes;
    }
    return hours;
}

// Every session (focus and break) in a drill-down bucket: a date range, optionally one start hour.
export function sessionsIn(db: Db, from: string, to: string, hour: number | null = null): SessionSummary[] {
    const byHour = hour === null ? "" : " AND local_hour = ?";
    return select<SessionSummary>(db,
        `SELECT id, kind, tag, status, started_at, ended_at, planned_seconds, focused_ms, pause_count, paused_ms
         FROM sessions WHERE local_date BETWEEN ? AND ?${byHour} ORDER BY started_at`,
        hour === null ? [from, to] : [from, to, hour])
        .map((r) => ({...r}));
}

export function dashboard(db: Db, today: string, scale: Scale = "year", anchor: string = today): DashboardData {
    const {from, to} = periodRange(scale, anchor);
    const allActive = select<{ date: string }>(db,
        `SELECT local_date AS date FROM sessions WHERE kind = 'focus'
         GROUP BY local_date HAVING SUM(focused_ms) >= 60000`, []);
    return {
        scale, anchor, today, from, to,
        days: dailyFocus(db, from, to),
        hours: scale === "day" ? hourlyFocus(db, anchor) : null,
        outcomes: outcomes(db, from, to),
        streaks: streaks(allActive.map((d) => d.date), today),
    };
}
