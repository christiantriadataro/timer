// Session lifecycle against SQLite. Pure functions over a db handle so they run in the
// browser worker (OPFS) and in Node tests (in-memory) alike. Times are epoch ms.

export type SessionKind = "focus" | "break";
export type SessionStatus = "running" | "paused" | "finished" | "stopped";

export interface SessionRow {
    id: number;
    kind: SessionKind;
    planned_seconds: number;
    tag: string | null;
    started_at: number;
    ended_at: number | null;
    status: SessionStatus;
    focused_ms: number;
    pause_count: number;
    paused_ms: number;
    segment_started_at: number | null;
    paused_at: number | null;
    local_date: string;
    local_hour: number;
    local_weekday: number;
}

export interface ActiveSession extends SessionRow {
    remaining_ms: number;
    // Absolute end (epoch ms) while running, null while paused. The UI derives remaining time from
    // this when the reply arrives, so worker start-up latency can't inflate the restored countdown.
    ends_at: number | null;
}

// The subset of sqlite-wasm's oo1.DB this module uses.
export interface Db {
    exec(opts: { sql: string; bind?: (string | number | null)[]; rowMode: "object"; returnValue: "resultRows" }): Record<string, unknown>[];
    exec(sql: string): unknown;
    selectValue(sql: string, bind?: (string | number | null)[]): unknown;
}

export const TAG_MAX_LENGTH = 40;

const SCHEMA_V1 = `
CREATE TABLE sessions (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT    NOT NULL CHECK (kind IN ('focus','break')),
  planned_seconds    INTEGER NOT NULL CHECK (planned_seconds > 0),
  tag                TEXT,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  status             TEXT    NOT NULL CHECK (status IN ('running','paused','finished','stopped')),
  focused_ms         INTEGER NOT NULL DEFAULT 0,
  pause_count        INTEGER NOT NULL DEFAULT 0,
  paused_ms          INTEGER NOT NULL DEFAULT 0,
  segment_started_at INTEGER,
  paused_at          INTEGER,
  local_date         TEXT    NOT NULL,
  local_hour         INTEGER NOT NULL,
  local_weekday      INTEGER NOT NULL
);
CREATE INDEX sessions_date ON sessions(local_date);
CREATE INDEX sessions_status ON sessions(status);
PRAGMA user_version = 1;
`;

export function migrate(db: Db) {
    const version = Number(db.selectValue("PRAGMA user_version"));
    if (version < 1) db.exec(`BEGIN; ${SCHEMA_V1} COMMIT;`);
}

const rows = (db: Db, sql: string, bind: (string | number | null)[] = []) =>
    db.exec({sql, bind, rowMode: "object", returnValue: "resultRows"}) as unknown as SessionRow[];

const getSession = (db: Db, id: number) => {
    const row = rows(db, "SELECT * FROM sessions WHERE id = ?", [id])[0];
    if (!row) throw new Error(`session ${id} not found`);
    return row;
};

export function normalizeTag(tag: string | null | undefined) {
    const t = (tag ?? "").trim().slice(0, TAG_MAX_LENGTH);
    return t === "" ? null : t;
}

// Local calendar fields at start; a session belongs to the day it started (spec Q14). Monday = 1 (Q9).
export function localFields(now: number) {
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
        local_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        local_hour: d.getHours(),
        local_weekday: ((d.getDay() + 6) % 7) + 1,
    };
}

export function remainingMs(row: SessionRow, now: number) {
    const running = row.status === "running" && row.segment_started_at !== null ? now - row.segment_started_at : 0;
    return Math.max(0, row.planned_seconds * 1000 - row.focused_ms - running);
}

export function startSession(db: Db, input: { kind: SessionKind; plannedSeconds: number; tag?: string | null; now: number }) {
    // Never leave two open sessions: anything still open is stopped first.
    for (const open of rows(db, "SELECT * FROM sessions WHERE status IN ('running','paused')")) {
        endSession(db, open.id, "stopped", input.now);
    }
    const {local_date, local_hour, local_weekday} = localFields(input.now);
    db.exec({
        sql: `INSERT INTO sessions (kind, planned_seconds, tag, started_at, status, segment_started_at, local_date, local_hour, local_weekday)
              VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
        bind: [input.kind, input.plannedSeconds, normalizeTag(input.tag), input.now, input.now, local_date, local_hour, local_weekday],
        rowMode: "object", returnValue: "resultRows",
    });
    return Number(db.selectValue("SELECT last_insert_rowid()"));
}

export function pauseSession(db: Db, id: number, now: number) {
    const row = getSession(db, id);
    if (row.status !== "running") return;
    const focused = Math.min(row.planned_seconds * 1000, row.focused_ms + (now - (row.segment_started_at ?? now)));
    db.exec({
        sql: `UPDATE sessions SET status = 'paused', focused_ms = ?, pause_count = pause_count + 1,
              segment_started_at = NULL, paused_at = ? WHERE id = ?`,
        bind: [focused, now, id], rowMode: "object", returnValue: "resultRows",
    });
}

export function resumeSession(db: Db, id: number, now: number) {
    const row = getSession(db, id);
    if (row.status !== "paused") return;
    db.exec({
        sql: `UPDATE sessions SET status = 'running', paused_ms = paused_ms + ?, paused_at = NULL,
              segment_started_at = ? WHERE id = ?`,
        bind: [now - (row.paused_at ?? now), now, id], rowMode: "object", returnValue: "resultRows",
    });
}

export function endSession(db: Db, id: number, status: "finished" | "stopped", now: number) {
    const row = getSession(db, id);
    if (row.status === "finished" || row.status === "stopped") return;
    const running = row.status === "running" ? now - (row.segment_started_at ?? now) : 0;
    const focused = Math.min(row.planned_seconds * 1000, row.focused_ms + running);
    const paused = row.paused_ms + (row.status === "paused" ? now - (row.paused_at ?? now) : 0);
    db.exec({
        sql: `UPDATE sessions SET status = ?, ended_at = ?, focused_ms = ?, paused_ms = ?,
              segment_started_at = NULL, paused_at = NULL WHERE id = ?`,
        bind: [status, now, focused, paused, id], rowMode: "object", returnValue: "resultRows",
    });
}

// On app load: finish a running session that ran out while the app was closed (at the moment
// it actually ran out), and return whatever is still open so the UI can pick it up.
export function reconcile(db: Db, now: number): ActiveSession | null {
    const open = rows(db, "SELECT * FROM sessions WHERE status IN ('running','paused') ORDER BY started_at DESC");
    for (const stale of open.slice(1)) endSession(db, stale.id, "stopped", now);
    const row = open[0];
    if (!row) return null;
    const left = remainingMs(row, now);
    if (row.status === "running" && left === 0) {
        endSession(db, row.id, "finished", (row.segment_started_at ?? now) + row.planned_seconds * 1000 - row.focused_ms);
        return null;
    }
    return {...row, remaining_ms: left, ends_at: row.status === "running" ? now + left : null};
}
