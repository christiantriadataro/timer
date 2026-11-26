import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";
import init from "@sqlite.org/sqlite-wasm";
import {type Db, endSession, migrate, pauseSession, resumeSession, startSession} from "./sessions.ts";
import {
    addDays, band, dashboard, hourlyFocus, isoWeekday, monthGrid, outcomes, periodRange, sessionsIn, shiftAnchor,
    streaks, weekDates, yearGrid,
} from "./stats.ts";

const sqlite3 = await init();
let db: Db;
const MIN = 60_000;
const at = (date: string, hour = 9) => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour).getTime();
const focus = (date: string, minutes: number, status: "finished" | "stopped" = "finished", hour = 9) => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: at(date, hour)});
    endSession(db, id, status, at(date, hour) + minutes * MIN);
    return id;
};

beforeEach(() => {
    db = new sqlite3.oo1.DB(":memory:") as unknown as Db;
    migrate(db);
});

test("bands follow the fixed minute edges", () => {
    assert.deepEqual([0, 0.5, 24.9, 25, 49, 50, 99, 100, 400].map(band), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("date helpers cross month, year and DST boundaries", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-03-29", 1), "2026-03-30"); // EU DST change
    assert.equal(isoWeekday("2026-11-23"), 1);
    assert.equal(isoWeekday("2026-11-29"), 7);
});

test("year grid has 53 Monday-start columns ending with today's week", () => {
    const grid = yearGrid("2026-11-26"); // Thursday
    assert.equal(grid.length, 53);
    assert.ok(grid.every((w) => w.length === 7));
    assert.equal(isoWeekday(grid[0][0]!), 1);
    assert.equal(grid[52][3], "2026-11-26");
    assert.deepEqual(grid[52].slice(4), [null, null, null]); // Fri–Sun still in the future
    assert.equal(grid[51][0], "2026-11-16");
});

test("streaks: today without focus keeps the run alive; gaps break it", () => {
    const today = "2026-11-26";
    assert.deepEqual(streaks(["2026-11-24", "2026-11-25"], today), {current: 2, longest: 2});
    assert.deepEqual(streaks(["2026-11-24", "2026-11-25", today], today), {current: 3, longest: 3});
    assert.deepEqual(streaks(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-25"], today), {current: 1, longest: 3});
    assert.deepEqual(streaks(["2026-11-23"], today), {current: 0, longest: 1});
    assert.deepEqual(streaks([], today), {current: 0, longest: 0});
});

test("outcomes count focus sessions only, with completion rate and pauses", () => {
    focus("2026-11-20", 25);
    focus("2026-11-21", 25);
    focus("2026-11-22", 10, "stopped");
    const p = startSession(db, {kind: "focus", plannedSeconds: 1500, now: at("2026-11-23")});
    pauseSession(db, p, at("2026-11-23") + 5 * MIN);
    resumeSession(db, p, at("2026-11-23") + 7 * MIN);
    endSession(db, p, "stopped", at("2026-11-23") + 8 * MIN);
    const b = startSession(db, {kind: "break", plannedSeconds: 300, now: at("2026-11-23", 10)});
    endSession(db, b, "finished", at("2026-11-23", 10) + 5 * MIN);

    const o = outcomes(db, "2026-11-01", "2026-11-30");
    assert.equal(o.started, 4);
    assert.equal(o.finished, 2);
    assert.equal(o.stopped, 2);
    assert.equal(o.completionRate, 0.5);
    assert.equal(o.pausedSessions, 1);
    assert.equal(o.pauseCount, 1);
    assert.equal(o.pausedMinutes, 2);
    assert.equal(o.focusMinutes, 25 + 25 + 10 + 6);
});

test("outcomes with no sessions report a null completion rate", () => {
    assert.equal(outcomes(db, "2026-01-01", "2026-12-31").completionRate, null);
});

test("dashboard: a midnight session counts on its start day; breaks don't colour the graph", () => {
    const id = startSession(db, {kind: "focus", plannedSeconds: 1500, now: at("2026-11-24", 23) + 50 * MIN});
    endSession(db, id, "finished", at("2026-11-24", 23) + 75 * MIN);
    focus("2026-11-25", 20);
    const b = startSession(db, {kind: "break", plannedSeconds: 600, now: at("2026-11-26")});
    endSession(db, b, "finished", at("2026-11-26") + 10 * MIN);

    const d = dashboard(db, "2026-11-26");
    assert.equal(d.from, "2025-11-24");
    assert.deepEqual(d.days, [{date: "2026-11-24", minutes: 25}, {date: "2026-11-25", minutes: 20}]);
    assert.deepEqual(d.streaks, {current: 2, longest: 2});
});

test("dashboard streak needs a full focus minute on the day, summed across sessions", () => {
    focus("2026-11-25", 0.5);
    focus("2026-11-25", 0.6, "stopped", 10);
    focus("2026-11-24", 0.5);
    assert.deepEqual(dashboard(db, "2026-11-26").streaks, {current: 1, longest: 1});
});

test("period ranges per scale (Monday weeks, calendar months, rolling year)", () => {
    assert.deepEqual(periodRange("day", "2026-11-26"), {from: "2026-11-26", to: "2026-11-26"});
    assert.deepEqual(periodRange("week", "2026-11-26"), {from: "2026-11-23", to: "2026-11-29"});
    assert.deepEqual(periodRange("month", "2026-02-14"), {from: "2026-02-01", to: "2026-02-28"});
    assert.deepEqual(periodRange("month", "2028-02-10"), {from: "2028-02-01", to: "2028-02-29"});
    assert.deepEqual(periodRange("year", "2026-11-26"), {from: "2025-11-24", to: "2026-11-29"});
});

test("shifting periods: months land on the 1st, years keep the weekday", () => {
    assert.equal(shiftAnchor("month", "2026-01-31", 1), "2026-02-01");
    assert.equal(shiftAnchor("month", "2026-01-15", -1), "2025-12-01");
    assert.equal(shiftAnchor("week", "2026-11-26", -1), "2026-11-19");
    assert.equal(shiftAnchor("day", "2026-01-01", -1), "2025-12-31");
    assert.equal(isoWeekday(shiftAnchor("year", "2026-11-26", -1)), isoWeekday("2026-11-26"));
});

test("month grid has Monday-start rows with out-of-month days null", () => {
    const feb = monthGrid("2026-02-10"); // 1 Feb 2026 is a Sunday
    assert.equal(feb.length, 5);
    assert.deepEqual(feb[0], [null, null, null, null, null, null, "2026-02-01"]);
    assert.equal(feb[4][5], "2026-02-28");
    assert.equal(feb[4][6], null);
    assert.equal(feb.flat().filter(Boolean).length, 28);
    assert.deepEqual(weekDates("2026-11-26"), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
});

test("hourly focus buckets by start hour; drill-down lists every kind, optionally by hour", () => {
    focus("2026-11-26", 25, "finished", 9);
    focus("2026-11-26", 10, "stopped", 9);
    focus("2026-11-26", 20, "finished", 14);
    const b = startSession(db, {kind: "break", plannedSeconds: 300, tag: "walk", now: at("2026-11-26", 14)});
    endSession(db, b, "finished", at("2026-11-26", 14) + 5 * MIN);

    const hours = hourlyFocus(db, "2026-11-26");
    assert.equal(hours.length, 24);
    assert.equal(hours[9], 35);
    assert.equal(hours[14], 20);
    assert.equal(hours.reduce((a, m) => a + m, 0), 55);

    assert.equal(sessionsIn(db, "2026-11-26", "2026-11-26").length, 4);
    const at14 = sessionsIn(db, "2026-11-26", "2026-11-26", 14);
    assert.deepEqual(at14.map((s) => [s.kind, s.status, s.tag]), [["focus", "finished", null], ["break", "finished", "walk"]]);
    assert.equal(sessionsIn(db, "2026-11-20", "2026-11-25").length, 0);
});

test("dashboard tiles follow the chosen period; streaks stay all-time", () => {
    focus("2026-11-16", 25); // last week
    focus("2026-11-24", 25);
    focus("2026-11-25", 10, "stopped");
    const week = dashboard(db, "2026-11-26", "week", "2026-11-26");
    assert.deepEqual([week.from, week.to], ["2026-11-23", "2026-11-29"]);
    assert.equal(week.outcomes.started, 2);
    assert.equal(week.outcomes.completionRate, 0.5);
    assert.equal(week.hours, null);
    assert.deepEqual(week.streaks, {current: 2, longest: 2});

    const lastWeek = dashboard(db, "2026-11-26", "week", "2026-11-19");
    assert.equal(lastWeek.outcomes.started, 1);
    assert.deepEqual(lastWeek.streaks, {current: 2, longest: 2});

    const day = dashboard(db, "2026-11-26", "day", "2026-11-24");
    assert.equal(day.hours?.[9], 25);
    assert.equal(day.outcomes.finished, 1);
});
