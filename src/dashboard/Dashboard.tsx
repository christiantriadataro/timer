import {useEffect, useState, useSyncExternalStore} from "react";
import {Link} from "react-router";
import {sessionTracker} from "../db/sessionTracker.ts";
import type {DashboardData} from "../db/stats.ts";
import Heatmap from "./Heatmap.tsx";

const hours = (minutes: number) => (minutes / 60).toFixed(minutes < 600 ? 1 : 0);
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

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
    const [data, setData] = useState<DashboardData | null>(null);
    const [loaded, setLoaded] = useState(false);
    const storageError = useSyncExternalStore(sessionTracker.subscribe, sessionTracker.getError);

    useEffect(() => {
        sessionTracker.dashboard().then((d) => {
            setData(d ?? null);
            setLoaded(true);
        });
    }, []);

    const o = data?.outcomes;
    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <Link to="/" className="dashboard-back">← Timer</Link>
                <h1 className="dashboard-title">Focus stats</h1>
            </header>

            {!loaded && <p className="dashboard-status" role="status">Loading your sessions…</p>}
            {loaded && !data && (
                <p className="dashboard-status dashboard-status--error" role="alert">
                    Couldn't read your stats{storageError ? `: ${storageError}` : "."}
                </p>
            )}

            {data && o && (
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

                    <section aria-labelledby="year-heading" className="dashboard-section">
                        <h2 id="year-heading" className="dashboard-subtitle">
                            {Math.round(o.focusMinutes)} focus minutes in the last year
                        </h2>
                        <Heatmap days={data.days} today={data.to}/>
                        {o.started === 0 && (
                            <p className="dashboard-empty">No focus sessions yet. Start a 25-minute lock-in from the timer and it will show up here.</p>
                        )}
                    </section>

                    <div className="dashboard-columns">
                        <section aria-labelledby="streak-heading" className="dashboard-section">
                            <h2 id="streak-heading" className="dashboard-subtitle">Streaks</h2>
                            <dl className="stat-grid stat-grid--stack">
                                <Stat label="Current streak" value={`${data.streaks.current} d`} hint="days in a row with focus"/>
                                <Stat label="Longest streak" value={`${data.streaks.longest} d`}/>
                            </dl>
                        </section>

                        <section aria-labelledby="outcome-heading" className="dashboard-section">
                            <h2 id="outcome-heading" className="dashboard-subtitle">Sessions (last year)</h2>
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
