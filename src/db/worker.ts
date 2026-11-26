// Owns the SQLite database. OPFS sync access handles only exist in workers; the SAH-pool VFS
// needs no COOP/COEP headers, so the static Vercel deploy stays as it is.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {type Db, endSession, migrate, pauseSession, reconcile, resumeSession, startSession} from "./sessions.ts";
import {dashboard, sessionsIn} from "./stats.ts";

// The SAH pool takes exclusive handles, so only one tab can hold the database (spec Q16).
const OTHER_TAB_MESSAGE = "The timer is open in another tab: close that tab and reload this one to track sessions or see stats here.";

const ready: Promise<Db> = (async () => {
    const sqlite3 = await sqlite3InitModule();
    try {
        const pool = await sqlite3.installOpfsSAHPoolVfs({name: "timer"});
        const db = new pool.OpfsSAHPoolDb("/timer.sqlite3") as unknown as Db;
        migrate(db);
        return db;
    } catch (error) {
        const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
        if (/Access Handle|NoModificationAllowed/i.test(text)) throw new Error(OTHER_TAB_MESSAGE);
        throw error;
    }
})();

const ops = {
    start: startSession,
    pause: pauseSession,
    resume: resumeSession,
    end: endSession,
    reconcile,
    dashboard,
    sessionsIn,
};

export type DbOps = typeof ops;
export type DbRequest = { [K in keyof DbOps]: { id: number; op: K; args: Parameters<DbOps[K]> extends [Db, ...infer A] ? A : never } }[keyof DbOps];

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);

self.onmessage = async ({data}: MessageEvent<DbRequest>) => {
    try {
        const db = await ready;
        const fn = ops[data.op] as (db: Db, ...args: unknown[]) => unknown;
        post({id: data.id, result: fn(db, ...data.args)});
    } catch (error) {
        post({id: data.id, error: error instanceof Error ? error.message : String(error)});
    }
};
