// Owns the SQLite database. OPFS sync access handles only exist in workers; the SAH-pool VFS
// needs no COOP/COEP headers, so the static Vercel deploy stays as it is.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {type Db, endSession, migrate, pauseSession, reconcile, resumeSession, SCHEMA_VERSION, startSession} from "./sessions.ts";
import {allSessions, dashboard, sessionsIn} from "./stats.ts";
import {validateBackup} from "./backup.ts";

// The SAH pool takes exclusive handles, so only one tab can hold the database (spec Q16).
const OTHER_TAB_MESSAGE = "The timer is open in another tab: close that tab and reload this one to track sessions or see stats here.";
const DB_FILE = "/timer.sqlite3";

type Pool = Awaited<ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]>>;
interface State {
    pool: Pool;
    db: Db & { close(): void };
}
const open = (pool: Pool) => {
    const db = new pool.OpfsSAHPoolDb(DB_FILE) as unknown as State["db"];
    migrate(db);
    return db;
};

const ready: Promise<State> = (async () => {
    const sqlite3 = await sqlite3InitModule();
    try {
        const pool = await sqlite3.installOpfsSAHPoolVfs({name: "timer"});
        return {pool, db: open(pool)};
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
    allSessions,
};

// Whole-database operations (TIMER-0010). They swap the db handle, so they take the state.
const admin = {
    exportDb: (s: State) => s.pool.exportFile(DB_FILE),
    // Replace the database with a validated backup. If the new file won't open as a timer
    // database, the previous bytes are put back, so a failed restore never loses data.
    importDb: async (s: State, bytes: Uint8Array) => {
        const problem = validateBackup(bytes, SCHEMA_VERSION);
        if (problem) throw new Error(problem);
        const previous = s.pool.exportFile(DB_FILE);
        s.db.close();
        try {
            await s.pool.importDb(DB_FILE, bytes);
            s.db = open(s.pool);
            return {sessions: Number(s.db.selectValue("SELECT COUNT(*) FROM sessions"))};
        } catch (error) {
            try { s.db.close(); } catch { /* already closed */ }
            await s.pool.importDb(DB_FILE, previous);
            s.db = open(s.pool);
            throw new Error(`That file couldn't be opened as timer data (${error instanceof Error ? error.message : String(error)}). Your existing stats were kept.`);
        }
    },
};

type Args<F> = F extends (first: never, ...rest: infer A) => unknown ? A : never;
export type DbOps = typeof ops;
export type AdminOps = typeof admin;
export type DbRequest =
    | { [K in keyof DbOps]: { id: number; admin?: false; op: K; args: Args<DbOps[K]> } }[keyof DbOps]
    | { [K in keyof AdminOps]: { id: number; admin: true; op: K; args: Args<AdminOps[K]> } }[keyof AdminOps];

const post = (message: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer);

self.onmessage = async ({data}: MessageEvent<DbRequest>) => {
    try {
        const s = await ready;
        if (data.admin) {
            const fn = admin[data.op] as (s: State, ...args: unknown[]) => unknown;
            const result = await fn(s, ...data.args);
            post({id: data.id, result}, result instanceof Uint8Array ? [result.buffer] : []);
        } else {
            const fn = ops[data.op] as (db: Db, ...args: unknown[]) => unknown;
            post({id: data.id, result: fn(s.db, ...data.args)});
        }
    } catch (error) {
        post({id: data.id, error: error instanceof Error ? error.message : String(error)});
    }
};
