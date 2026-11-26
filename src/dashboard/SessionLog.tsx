import {useState} from "react";
import {sessionTracker} from "../db/sessionTracker.ts";
import {SESSION_CSV_COLUMNS, toCsv} from "../db/csv.ts";
import {localFields} from "../db/sessions.ts";
import type {SessionSummary} from "../db/stats.ts";
import {clock, formatDate} from "./format.ts";

type SortKey = "started_at" | "kind" | "tag" | "status" | "focused_ms" | "pause_count";
const COLUMNS: { key: SortKey; label: string }[] = [
    {key: "started_at", label: "When"},
    {key: "kind", label: "Kind"},
    {key: "tag", label: "Tag"},
    {key: "status", label: "Outcome"},
    {key: "focused_ms", label: "Focus"},
    {key: "pause_count", label: "Pauses"},
];
const STATUS_LABEL: Record<string, string> = {finished: "Finished", stopped: "Stopped early", running: "Running", paused: "Paused"};
const dateOf = (ms: number) => localFields(ms).local_date;

function compare(a: SessionSummary, b: SessionSummary, key: SortKey) {
    const x = a[key], y = b[key];
    if (x === y) return a.started_at - b.started_at;
    if (x === null) return 1; // untagged sorts last either way round
    if (y === null) return -1;
    return x < y ? -1 : 1;
}

// Sortable list of the period's sessions (spec Q23), plus a full CSV export of every session (Q24).
function SessionLog({sessions}: { sessions: SessionSummary[] }) {
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({key: "started_at", dir: -1});
    const [exportError, setExportError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const rows = [...sessions].sort((a, b) => {
        const c = compare(a, b, sort.key);
        // keep nulls last regardless of direction
        if (sort.key === "tag" && (a.tag === null) !== (b.tag === null)) return c;
        return c * sort.dir;
    });
    const toggle = (key: SortKey) =>
        setSort((s) => (s.key === key ? {key, dir: s.dir === 1 ? -1 : 1} : {key, dir: key === "started_at" ? -1 : 1}));

    const exportCsv = async () => {
        setExporting(true);
        setExportError(null);
        const all = await sessionTracker.allSessions();
        setExporting(false);
        if (all === undefined) {
            setExportError("Export failed: couldn't read the database.");
            return;
        }
        const withIso = all.map((s) => ({
            ...s,
            started_iso: new Date(s.started_at).toISOString(),
            ended_iso: s.ended_at === null ? null : new Date(s.ended_at).toISOString(),
        }));
        const blob = new Blob([toCsv(withIso, [...SESSION_CSV_COLUMNS])], {type: "text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `timer-sessions-${dateOf(Date.now())}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="session-log">
            <div className="session-log-bar">
                <p className="session-log-count">{sessions.length} session{sessions.length === 1 ? "" : "s"}</p>
                <button type="button" className="session-log-export" onClick={exportCsv} disabled={exporting}>
                    {exporting ? "Exporting…" : "Export all as CSV"}
                </button>
            </div>
            {exportError && <p className="dashboard-status dashboard-status--error" role="alert">{exportError}</p>}
            {sessions.length === 0
                ? <p className="dashboard-empty">No sessions in this period.</p>
                : (
                    <div className="session-log-scroll">
                        <table className="session-log-table">
                            <thead>
                            <tr>
                                {COLUMNS.map((c) => (
                                    <th key={c.key} scope="col"
                                        aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                                        <button type="button" className="session-log-sort" onClick={() => toggle(c.key)}>
                                            {c.label}
                                            <span className="session-log-arrow" aria-hidden="true">
                                                {sort.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}
                                            </span>
                                        </button>
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {rows.map((s) => (
                                <tr key={s.id} className={`session-log-row session-log-row--${s.kind}`} data-id={s.id} data-status={s.status}>
                                    <td className="session-log-when">
                                        <span className="session-log-date">{formatDate(dateOf(s.started_at), {month: "short", day: "numeric", year: "numeric"})}</span>
                                        <span className="session-log-time">{clock(s.started_at)}{s.ended_at !== null && `–${clock(s.ended_at)}`}</span>
                                    </td>
                                    <td>{s.kind === "focus" ? "Focus" : "Break"}</td>
                                    <td className={s.tag === null ? "session-log-untagged" : ""}>{s.tag ?? "untagged"}</td>
                                    <td className={`session-log-status session-log-status--${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</td>
                                    <td className="session-log-num">{Math.round(s.focused_ms / 60000)} / {Math.round(s.planned_seconds / 60)} min</td>
                                    <td className="session-log-num">
                                        {s.pause_count === 0 ? "—" : `${s.pause_count} · ${Math.round(s.paused_ms / 60000)} min`}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
        </div>
    );
}

export default SessionLog;
