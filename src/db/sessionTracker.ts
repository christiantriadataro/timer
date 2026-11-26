// Main-thread side of the session database: forwards timer events to the worker, one at a time
// and in order, and exposes the last storage error so the UI can say stats aren't being saved.
import type {DbOps, DbRequest} from "./worker.ts";
import {type ActiveSession, localFields, type SessionKind} from "./sessions.ts";
import type {Scale, TagFilter} from "./stats.ts";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {type: "module"});
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextId = 1;

worker.onmessage = ({data}: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const p = pending.get(data.id);
    pending.delete(data.id);
    if (data.error !== undefined) p?.reject(new Error(data.error));
    else p?.resolve(data.result);
};
worker.onerror = (e) => setError(e.message || "database worker failed to load");

function call<K extends keyof DbOps>(op: K, ...args: Extract<DbRequest, { op: K }>["args"]) {
    const id = nextId++;
    return new Promise<ReturnType<DbOps[K]>>((resolve, reject) => {
        pending.set(id, {resolve: resolve as (v: unknown) => void, reject});
        worker.postMessage({id, op, args});
    });
}

let error: string | null = null;
const listeners = new Set<() => void>();
function setError(message: string | null) {
    error = message;
    if (message) console.error("[timer stats]", message);
    listeners.forEach((l) => l());
}

let activeId: number | null = null;
let queue: Promise<unknown> = Promise.resolve();
// Serialize so a quick play→pause can't reach the db before the start has returned an id.
function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
    const run = queue.then(task).then(
        (v) => { if (error) setError(null); return v; },
        (e: Error) => { setError(e.message); return undefined; },
    );
    queue = run;
    return run;
}

export const sessionTracker = {
    play(kind: SessionKind, plannedSeconds: number, tag: string) {
        const now = Date.now();
        return enqueue(async () => {
            if (activeId === null) activeId = await call("start", {kind, plannedSeconds, tag, now});
            else await call("resume", activeId, now);
        });
    },
    pause() {
        const now = Date.now();
        return enqueue(async () => { if (activeId !== null) await call("pause", activeId, now); });
    },
    stop() {
        const now = Date.now();
        return enqueue(async () => {
            if (activeId !== null) await call("end", activeId, "stopped", now);
            activeId = null;
        });
    },
    finish(endedAt: number) {
        return enqueue(async () => {
            if (activeId !== null) await call("end", activeId, "finished", endedAt);
            activeId = null;
        });
    },
    restore() {
        const now = Date.now();
        return enqueue(async (): Promise<ActiveSession | null> => {
            const s = await call("reconcile", now);
            activeId = s?.id ?? null;
            return s;
        });
    },
    // Queued behind pending writes, so the dashboard always includes the latest event.
    dashboard(scale: Scale, anchor: string, tag: TagFilter) {
        return enqueue(() => call("dashboard", localFields(Date.now()).local_date, scale, anchor, tag));
    },
    sessions(from: string, to: string, hour: number | null, tag: TagFilter) {
        return enqueue(() => call("sessionsIn", from, to, hour, tag));
    },
    allSessions() {
        return enqueue(() => call("allSessions"));
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getError: () => error,
};
