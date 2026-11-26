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

export interface DashboardData {
    from: string;
    to: string;
    days: DayFocus[];
    outcomes: Outcomes;
    streaks: Streaks;
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

// GitHub-style year: 53 Monday-start columns, the last one holding today. Days after today are null.
export function yearGrid(today: string): (string | null)[][] {
    const start = addDays(today, -(isoWeekday(today) - 1) - 52 * 7);
    return Array.from({length: 53}, (_, w) =>
        Array.from({length: 7}, (_, d) => {
            const date = addDays(start, w * 7 + d);
            return date > today ? null : date;
        }),
    );
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

export function dashboard(db: Db, today: string): DashboardData {
    const grid = yearGrid(today);
    const from = grid[0][0] as string;
    const allActive = select<{ date: string }>(db,
        `SELECT local_date AS date FROM sessions WHERE kind = 'focus'
         GROUP BY local_date HAVING SUM(focused_ms) >= 60000`, []);
    return {
        from,
        to: today,
        days: dailyFocus(db, from, today),
        outcomes: outcomes(db, from, today),
        streaks: streaks(allActive.map((d) => d.date), today),
    };
}
