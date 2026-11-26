import {useEffect, useState} from "react";
import {sessionTracker} from "../db/sessionTracker.ts";
import type {SessionSummary, TagFilter} from "../db/stats.ts";
import type {Bucket} from "./Cells.tsx";
import {clock, formatDate, hourLabel} from "./format.ts";

const STATUS_LABEL: Record<string, string> = {finished: "Finished", stopped: "Stopped early", running: "Running", paused: "Paused"};

// Drill-down panel under the heatmap: every session (focus and break) in the clicked bucket.
function CellSessions({bucket, tag, onClose}: { bucket: Bucket; tag: TagFilter; onClose: () => void }) {
    const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        setSessions(null);
        setFailed(false);
        sessionTracker.sessions(bucket.from, bucket.to, bucket.hour, tag).then((rows) => {
            if (!live) return;
            if (rows === undefined) setFailed(true);
            else setSessions(rows);
        });
        return () => { live = false; };
    }, [bucket.from, bucket.to, bucket.hour, tag]);

    const title = bucket.hour === null
        ? formatDate(bucket.from)
        : `${formatDate(bucket.from)} · ${hourLabel(bucket.hour)}–${hourLabel((bucket.hour + 1) % 24)}`;

    return (
        <section className="cell-sessions" aria-labelledby="cell-sessions-heading" aria-live="polite">
            <header className="cell-sessions-header">
                <h3 id="cell-sessions-heading" className="cell-sessions-title">{title}</h3>
                <button type="button" className="cell-sessions-close" onClick={onClose} aria-label="Close session list">×</button>
            </header>
            {failed && <p className="dashboard-status dashboard-status--error" role="alert">Couldn't load these sessions.</p>}
            {!failed && sessions === null && <p className="dashboard-status" role="status">Loading…</p>}
            {sessions?.length === 0 && <p className="cell-sessions-empty">No sessions {bucket.hour === null ? "on this day" : "started in this hour"}.</p>}
            {sessions && sessions.length > 0 && (
                <ul className="cell-sessions-list">
                    {sessions.map((s) => (
                        <li key={s.id} className={`cell-session cell-session--${s.kind}`} data-status={s.status}>
                            <span className="cell-session-time">
                                {clock(s.started_at)}{s.ended_at !== null && `–${clock(s.ended_at)}`}
                            </span>
                            <span className="cell-session-kind">{s.kind === "focus" ? "Focus" : "Break"}</span>
                            <span className="cell-session-tag">{s.tag ?? "untagged"}</span>
                            <span className={`cell-session-status cell-session-status--${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                            <span className="cell-session-minutes">{Math.round(s.focused_ms / 60000)} / {Math.round(s.planned_seconds / 60)} min</span>
                            <span className="cell-session-pauses">
                                {s.pause_count === 0 ? "no pauses" : `${s.pause_count} pause${s.pause_count === 1 ? "" : "s"} · ${Math.round(s.paused_ms / 60000)} min`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default CellSessions;
