import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";
import init from "@sqlite.org/sqlite-wasm";
import {
    type Db, endSession, localFields, migrate, normalizeTag, pauseSession, reconcile, resumeSession, startSession,
} from "./sessions.ts";

const sqlite3 = await init();
let db: Db;
const get = (id: number) => db.exec({sql: "SELECT * FROM sessions WHERE id = ?", bind: [id], rowMode: "object", returnValue: "resultRows"})[0];

const T0 = new Date(2026, 10, 26, 9, 0, 0).getTime(); // Thu 26 Nov 2026 09:00 local
const MIN = 60_000;

beforeEach(() => {
    db = new sqlite3.oo1.DB(":memory:") as unknown as Db;
    migrate(db);
});

test("migrate is idempotent and sets user_version", () => {
    migrate(db);
    assert.equal(Number(db.selectValue("PRAGMA user_version")), 1);
});

test("a full focus run finishes with focused time equal to planned", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, tag: "  DSA ", now: T0});
    endSession(db, id, "finished", T0 + 25 * MIN);
    const r = get(id);
    assert.equal(r.status, "finished");
    assert.equal(r.focused_ms, 25 * MIN);
    assert.equal(r.tag, "DSA");
    assert.equal(r.ended_at, T0 + 25 * MIN);
    assert.deepEqual([r.local_date, r.local_hour, r.local_weekday], ["2026-11-26", 9, 4]);
});

test("pauses are counted and excluded from focused time", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0});
    pauseSession(db, id, T0 + 5 * MIN);
    resumeSession(db, id, T0 + 8 * MIN);
    pauseSession(db, id, T0 + 10 * MIN);
    resumeSession(db, id, T0 + 11 * MIN);
    endSession(db, id, "stopped", T0 + 12 * MIN);
    const r = get(id);
    assert.equal(r.status, "stopped");
    assert.equal(r.focused_ms, 8 * MIN); // 5 + 2 + 1
    assert.equal(r.pause_count, 2);
    assert.equal(r.paused_ms, 4 * MIN);
    assert.equal(r.tag, null);
});

test("stopping while paused counts the open pause", () => {
    const id = startSession(db, {kind: "break", plannedSeconds: 300, now: T0});
    pauseSession(db, id, T0 + MIN);
    endSession(db, id, "stopped", T0 + 3 * MIN);
    const r = get(id);
    assert.equal(r.focused_ms, MIN);
    assert.equal(r.paused_ms, 2 * MIN);
});

test("focused time never exceeds planned, and ending twice is a no-op", () => {
    const id = startSession(db, {kind: "break", plannedSeconds: 300, now: T0});
    endSession(db, id, "finished", T0 + 7 * MIN);
    endSession(db, id, "stopped", T0 + 9 * MIN);
    const r = get(id);
    assert.equal(r.focused_ms, 5 * MIN);
    assert.equal(r.status, "finished");
});

test("starting a session stops any session left open", () => {
    const a = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0});
    const b = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0 + 2 * MIN});
    assert.equal(get(a).status, "stopped");
    assert.equal(get(a).focused_ms, 2 * MIN);
    assert.equal(get(b).status, "running");
});

test("reconcile resumes a running session with the right remaining time", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0});
    const s = reconcile(db, T0 + 10 * MIN);
    assert.equal(s?.id, id);
    assert.equal(s?.remaining_ms, 15 * MIN);
    assert.equal(s?.ends_at, T0 + 25 * MIN, "absolute end, independent of when the reply is read");
});

test("reconcile restores a paused session without counting the pause as focus", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0});
    pauseSession(db, id, T0 + 10 * MIN);
    const s = reconcile(db, T0 + 60 * MIN);
    assert.equal(s?.status, "paused");
    assert.equal(s?.remaining_ms, 15 * MIN);
    assert.equal(s?.ends_at, null);
});

test("reconcile finishes a session that ran out while the app was closed, at its real end", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: T0});
    pauseSession(db, id, T0 + 5 * MIN);
    resumeSession(db, id, T0 + 6 * MIN);
    assert.equal(reconcile(db, T0 + 120 * MIN), null);
    const r = get(id);
    assert.equal(r.status, "finished");
    assert.equal(r.ended_at, T0 + 26 * MIN);
    assert.equal(r.focused_ms, 25 * MIN);
});

test("tags are trimmed, capped and empty becomes null", () => {
    assert.equal(normalizeTag("   "), null);
    assert.equal(normalizeTag(undefined), null);
    assert.equal(normalizeTag("x".repeat(60))?.length, 40);
});

test("local weekday is Monday-based", () => {
    assert.equal(localFields(new Date(2026, 10, 23, 0, 30).getTime()).local_weekday, 1); // Mon
    assert.equal(localFields(new Date(2026, 10, 29, 23, 59).getTime()).local_weekday, 7); // Sun
});
