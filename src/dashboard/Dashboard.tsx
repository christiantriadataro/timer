import {useEffect, useState, useSyncExternalStore} from "react";
import {Link} from "react-router";
import {sessionTracker} from "../db/sessionTracker.ts";
import {localFields} from "../db/sessions.ts";
import {type DashboardData, periodRange, type Scale, shiftAnchor, type TagFilter} from "../db/stats.ts";
import {PatternStats, StudyTimes, TagBreakdown} from "./Patterns.tsx";
import Heatmap from "./Heatmap.tsx";
import {type Bucket, DayGrid, MonthGrid, WeekGrid} from "./Cells.tsx";
import CellSessions from "./CellSessions.tsx";
import {periodLabel} from "./format.ts";

const hours = (minutes: number) => (minutes / 60).toFixed(minutes < 600 ? 1 : 0);
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const SCALES: { scale: Scale; label: string }[] = [
    {scale: "day", label: "Day"}, {scale: "week", label: "Week"}, {scale: "month", label: "Month"}, {scale: "year", label: "Year"},
];
const BAND_LABELS = ["0 min", "1–24 min", "25–49 min", "50–99 min", "100+ min"];
// <select> values: a sentinel for "all" and for untagged (null); anything else is the tag itself.
const ALL = "\u0000all";
const UNTAGGED = "\u0000untagged";
const tagToValue = (t: TagFilter) => (t === undefined ? ALL : t === null ? UNTAGGED : t);
const valueToTag = (v: string): TagFilter => (v === ALL ? undefined : v === UNTAGGED ? null : v);

function Stat({label, value, hint}: { label: string; value: string | number; hint?: string }) {
    return (
        <div className="stat">
            <dt className="stat-label">{label}</dt>
            <dd className="stat-value">{value}</dd>
            {hint && <dd className="stat-hint">{hint}</dd>}
        </div>
    );
}

function Dashboard() {
    const today = localFields(Date.now()).local_date;
    const [scale, setScale] = useState<Scale>("year");
    const [anchor, setAnchor] = useState(today);
    const [selected, setSelected] = useState<Bucket | null>(null);
    const [data, setData] = useState<DashboardData | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [tag, setTag] = useState<TagFilter>(undefined);
    const storageError = useSyncExternalStore(sessionTracker.subscribe, sessionTracker.getError);

    useEffect(() => {
        let live = true;
        sessionTracker.dashboard(scale, anchor, tag).then((d) => {
            if (!live) return;
            setData(d ?? null);
            setLoaded(true);
        });
        return () => { live = false; };
    }, [scale, anchor, tag]);

    const pickTag = (next: TagFilter) => {
        setTag(next);
        setSelected(null);
    };

    const range = periodRange(scale, anchor);
    const hasToday = range.from <= today && today <= range.to;
    const go = (nextScale: Scale, nextAnchor: string) => {
        setScale(nextScale);
        setAnchor(nextAnchor);
        setSelected(null);
    };

    const o = data?.outcomes;
    const label = periodLabel(scale, range.from, range.to, today);
    const inLabel = `${scale === "day" ? "on" : "in"} ${label}`;
    const minutes = new Map((data?.days ?? []).map((d) => [d.date, d.minutes]));
    const grid = data && {anchor: data.anchor, today, minutes, selected, onSelect: setSelected};

    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <Link to="/" className="dashboard-back">← Timer</Link>
                <h1 className="dashboard-title">Focus stats</h1>
            </header>

            <nav className="period-bar" aria-label="Period">
                <div className="scale-toggle" role="group" aria-label="Scale">
                    {SCALES.map((s) => (
                        <button key={s.scale} type="button" className="scale-button" aria-pressed={scale === s.scale}
                                onClick={() => go(s.scale, anchor > today ? today : anchor)}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="period-nav">
                    <button type="button" className="period-step" aria-label={`Previous ${scale}`}
                            onClick={() => go(scale, shiftAnchor(scale, anchor, -1))}>‹</button>
                    <span className="period-label" aria-live="polite">{label}</span>
                    <button type="button" className="period-step" aria-label={`Next ${scale}`} disabled={range.to >= today}
                            onClick={() => go(scale, shiftAnchor(scale, anchor, 1))}>›</button>
                    <button type="button" className="period-today" disabled={hasToday} onClick={() => go(scale, today)}>Today</button>
                </div>
                <label className="tag-filter">
                    <span className="tag-filter-label">Tag</span>
                    <select className="tag-filter-select" value={tagToValue(tag)} onChange={(e) => pickTag(valueToTag(e.target.value))}>
                        <option value={ALL}>All tags</option>
                        {(data?.allTags ?? []).map((t) => <option key={tagToValue(t)} value={tagToValue(t)}>{t ?? "untagged"}</option>)}
                        {tag !== undefined && !(data?.allTags ?? []).includes(tag) && <option value={tagToValue(tag)}>{tag ?? "untagged"}</option>}
                    </select>
                </label>
            </nav>

            {!loaded && <p className="dashboard-status" role="status">Loading your sessions…</p>}
            {loaded && !data && (
                <p className="dashboard-status dashboard-status--error" role="alert">
                    Couldn't read your stats{storageError ? `: ${storageError}` : "."}
                </p>
            )}

            {data && o && grid && (
                <>
                    <dl className="summary" aria-label="Summary">
                        <div>
                            <dt className="summary-label">Focus hours</dt>
                            <dd className="summary-value">{hours(o.focusMinutes)}<span className="summary-unit">h</span></dd>
                        </div>
                        <div>
                            <dt className="summary-label">Current streak</dt>
                            <dd className="summary-value">
                                {data.streaks.current}
                                <span className="summary-unit">{data.streaks.current === 1 ? "day" : "days"}</span>
                            </dd>
                        </div>
                        <div>
                            <dt className="summary-label">Completion rate</dt>
                            <dd className="summary-value">{pct(o.completionRate)}</dd>
                        </div>
                    </dl>

                    <section aria-labelledby="period-heading" className="dashboard-section">
                        <h2 id="period-heading" className="dashboard-subtitle">
                            {Math.round(o.focusMinutes)} focus minutes {inLabel}
                        </h2>
                        <figure className={`heatmap heatmap--${scale}`} aria-label={`Focus heatmap: ${Math.round(o.focusMinutes)} minutes ${inLabel}`}>
                            {scale === "year" && <Heatmap end={data.anchor} {...grid}/>}
                            {scale === "month" && <MonthGrid {...grid}/>}
                            {scale === "week" && <WeekGrid {...grid}/>}
                            {scale === "day" && data.hours && <DayGrid anchor={data.anchor} today={today} hours={data.hours}
                                                                       selected={selected} onSelect={setSelected}/>}
                            <figcaption className="heatmap-legend">
                                <span>Less</span>
                                {BAND_LABELS.map((b, i) => <span key={b} className={`heatmap-swatch heatmap-band-${i}`} title={b} aria-label={b}/>)}
                                <span>More</span>
                            </figcaption>
                        </figure>
                        {selected
                            ? <CellSessions bucket={selected} tag={tag} onClose={() => setSelected(null)}/>
                            : <p className="dashboard-hint">Select a {scale === "day" ? "time slot" : "day"} to see its sessions.</p>}
                        {o.started === 0 && (
                            <p className="dashboard-empty">No focus sessions in this period. Start a 25-minute lock-in from the timer and it will show up here.</p>
                        )}
                    </section>

                    <section aria-labelledby="times-heading" className="dashboard-section">
                        <h2 id="times-heading" className="dashboard-subtitle">When you study {inLabel}</h2>
                        <StudyTimes patterns={data.patterns}/>
                    </section>

                    <div className="dashboard-columns dashboard-columns--even">
                        <section aria-labelledby="patterns-heading" className="dashboard-section">
                            <h2 id="patterns-heading" className="dashboard-subtitle">Patterns</h2>
                            <PatternStats patterns={data.patterns}/>
                        </section>
                        <section aria-labelledby="tags-heading" className="dashboard-section">
                            <h2 id="tags-heading" className="dashboard-subtitle">Tags</h2>
                            <TagBreakdown tags={data.tags} active={tag} onPick={pickTag}/>
                        </section>
                    </div>

                    <div className="dashboard-columns">
                        <section aria-labelledby="streak-heading" className="dashboard-section">
                            <h2 id="streak-heading" className="dashboard-subtitle">Streaks</h2>
                            <dl className="stat-grid stat-grid--stack">
                                <Stat label="Current streak" value={`${data.streaks.current} d`} hint="days in a row with focus"/>
                                <Stat label="Longest streak" value={`${data.streaks.longest} d`}/>
                            </dl>
                        </section>

                        <section aria-labelledby="outcome-heading" className="dashboard-section">
                            <h2 id="outcome-heading" className="dashboard-subtitle">Sessions {inLabel}</h2>
                            <dl className="stat-grid">
                                <Stat label="Focus hours" value={hours(o.focusMinutes)}/>
                                <Stat label="Started" value={o.started}/>
                                <Stat label="Finished" value={o.finished}/>
                                <Stat label="Stopped early" value={o.stopped}/>
                                <Stat label="Completion rate" value={pct(o.completionRate)} hint="finished ÷ (finished + stopped)"/>
                                <Stat label="Sessions paused" value={o.pausedSessions}
                                      hint={`${o.pauseCount} pauses · ${Math.round(o.pausedMinutes)} min paused`}/>
                            </dl>
                        </section>
                    </div>
                </>
            )}
        </main>
    );
}

export default Dashboard;
