import {test} from "node:test";
import assert from "node:assert/strict";
import init from "@sqlite.org/sqlite-wasm";
import {validateBackup} from "./backup.ts";
import {type Db, migrate, SCHEMA_VERSION, startSession} from "./sessions.ts";

const sqlite3 = await init();
const exportOf = (setup: (db: Db) => void) => {
    const db = new sqlite3.oo1.DB(":memory:");
    setup(db as unknown as Db);
    return sqlite3.capi.sqlite3_js_db_export(db);
};

test("a real timer database passes", () => {
    const bytes = exportOf((db) => { migrate(db); startSession(db, {kind: "focus", plannedSeconds: 1500, now: Date.now()}); });
    assert.equal(validateBackup(bytes, SCHEMA_VERSION), null);
});

test("non-SQLite, truncated and damaged files are rejected", () => {
    assert.match(validateBackup(new TextEncoder().encode("id,kind\n1,focus\n".repeat(64)), 1)!, /isn't a SQLite database/);
    assert.match(validateBackup(new Uint8Array(100), 1)!, /too small/);
    const good = exportOf((db) => migrate(db));
    assert.match(validateBackup(good.slice(0, good.length - 100), 1)!, /damaged/);
    const badPage = good.slice(); badPage[16] = 0x03; badPage[17] = 0x00;
    assert.match(validateBackup(badPage, 1)!, /damaged/);
});

test("WAL files, foreign SQLite files and newer schemas are rejected", () => {
    const wal = exportOf((db) => migrate(db)); wal[18] = 2; wal[19] = 2;
    assert.match(validateBackup(wal, 1)!, /WAL/);
    const foreign = exportOf((db) => db.exec("CREATE TABLE notes(x)"));
    assert.match(validateBackup(foreign, 1)!, /isn't a timer backup/);
    const newer = exportOf((db) => { migrate(db); db.exec("PRAGMA user_version = 7"); });
    assert.match(validateBackup(newer, 1)!, /newer version/);
});
