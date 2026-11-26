import type {Outcomes} from "../db/stats.ts";

interface Metric {
    label: string;
    now: number | null;
    before: number | null;
    format: (v: number) => string;
    delta: (now: number, before: number) => string; // signed text, e.g. "+12 min", "−8 pts"
}

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const minutes = (v: number) => `${Math.round(v)} min`;

// This period vs the one before (spec Q22). An in-progress period is compared as it stands.
function Compare({now, before, previousLabel, inProgress}: {
    now: Outcomes;
    before: Outcomes;
    previousLabel: string;
    inProgress: boolean;
}) {
    const metrics: Metric[] = [
        {
            label: "Focus minutes", now: now.focusMinutes, before: before.focusMinutes, format: minutes,
            delta: (a, b) => `${sign(Math.round(a) - Math.round(b))}${Math.abs(Math.round(a) - Math.round(b))} min`,
        },
        {
            label: "Sessions started", now: now.started, before: before.started, format: String,
            delta: (a, b) => `${sign(a - b)}${Math.abs(a - b)}`,
        },
        {
            label: "Completion rate", now: now.completionRate, before: before.completionRate, format: (v) => `${Math.round(v * 100)}%`,
            delta: (a, b) => {
                const pts = Math.round(a * 100) - Math.round(b * 100);
                return `${sign(pts)}${Math.abs(pts)} pts`;
            },
        },
    ];

    return (
        <div className="compare">
            <p className="compare-caption">
                vs <span className="compare-previous">{previousLabel}</span>
                {inProgress && <span className="compare-note"> · this period is still in progress</span>}
            </p>
            <dl className="compare-grid">
                {metrics.map((m) => {
                    const both = m.now !== null && m.before !== null;
                    const diff = both ? (m.now as number) - (m.before as number) : 0;
                    const trend = !both ? "none" : diff > 0 ? "up" : diff < 0 ? "down" : "flat";
                    return (
                        <div key={m.label} className="compare-item" data-trend={trend}>
                            <dt className="compare-label">{m.label}</dt>
                            <dd className="compare-now">{m.now === null ? "—" : m.format(m.now)}</dd>
                            <dd className="compare-delta">
                                {both ? m.delta(m.now as number, m.before as number) : "no comparison"}
                            </dd>
                            <dd className="compare-before">before: {m.before === null ? "—" : m.format(m.before)}</dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}

export default Compare;
