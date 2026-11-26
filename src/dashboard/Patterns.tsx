import {band, MIN_EFFECTIVE_SAMPLE, type Patterns as PatternData, type TagFilter, type TagTotal} from "../db/stats.ts";
import {hourLabel} from "./format.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({length: 24}, (_, h) => h);
const pct = (rate: number) => `${Math.round(rate * 100)}%`;
// Completion-rate steps for the effectiveness grid: <25 · <50 · <75 · <100 · 100 %.
const effBand = (rate: number) => (rate >= 1 ? 4 : rate >= 0.75 ? 3 : rate >= 0.5 ? 2 : rate >= 0.25 ? 1 : 0);

function HourWeekdayTable({caption, cell}: {
    caption: string;
    cell: (weekday: number, hour: number) => { className: string; label: string };
}) {
    return (
        <div className="hw-scroll">
            <table className="hw-table">
                <caption className="hw-caption">{caption}</caption>
                <thead>
                <tr>
                    <th scope="col" className="hw-corner"><span className="sr-only">Weekday</span></th>
                    {HOURS.map((h) => (
                        <th key={h} scope="col" className="hw-hour">{h % 6 === 0 ? String(h).padStart(2, "0") : <span className="sr-only">{hourLabel(h)}</span>}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {WEEKDAYS.map((d, w) => (
                    <tr key={d}>
                        <th scope="row" className="hw-weekday">{d}</th>
                        {HOURS.map((h) => {
                            const c = cell(w, h);
                            return (
                                <td key={h} className={`hw-cell ${c.className}`} title={`${WEEKDAY_NAMES[w]} ${hourLabel(h)} · ${c.label}`}
                                    data-weekday={w + 1} data-hour={h}>
                                    <span className="sr-only">{c.label}</span>
                                </td>
                            );
                        })}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

// "When you usually study" (minutes) and "when you're most effective" (completion rate), weekday × start hour.
export function StudyTimes({patterns}: { patterns: PatternData }) {
    const best = patterns.mostEffective;
    return (
        <>
            <p className="pattern-callout" data-testid="most-effective">
                {best
                    ? <>Most effective: <strong>{WEEKDAY_NAMES[best.weekday - 1]} {hourLabel(best.hour)}</strong> · {pct(best.rate)} finished over {best.closed} sessions</>
                    : <>Most effective: not enough data yet. A time slot needs {MIN_EFFECTIVE_SAMPLE} finished or stopped sessions.</>}
            </p>
            <div className="hw-pair">
                <HourWeekdayTable caption="When you usually study (focus minutes)" cell={(w, h) => {
                    const m = Math.round(patterns.usual[w][h]);
                    return {className: `hw-usual heatmap-band-${band(m)}`, label: `${m} focus min`};
                }}/>
                <HourWeekdayTable caption="When you're most effective (sessions finished)" cell={(w, h) => {
                    const rate = patterns.effective[w][h];
                    const n = patterns.samples[w][h];
                    return rate === null
                        ? {className: "hw-eff eff-none", label: n === 0 ? "no sessions" : `not enough data (${n} of ${MIN_EFFECTIVE_SAMPLE})`}
                        : {className: `hw-eff eff-${effBand(rate)}`, label: `${pct(rate)} finished of ${n}`};
                }}/>
            </div>
            <p className="hw-legend">
                <span>Effectiveness:</span>
                {["<25%", "25–49%", "50–74%", "75–99%", "100%"].map((l, i) => (
                    <span key={l} className="hw-legend-item"><span className={`hw-swatch eff-${i}`} aria-hidden="true"/>{l}</span>
                ))}
                <span className="hw-legend-item"><span className="hw-swatch eff-none" aria-hidden="true"/>not enough data</span>
            </p>
        </>
    );
}

export function PatternStats({patterns}: { patterns: PatternData }) {
    const tiles: [string, string, string?][] = [
        ["Peak hour", patterns.peakHour === null ? "—" : hourLabel(patterns.peakHour), "most focus minutes"],
        ["Best weekday", patterns.bestWeekday === null ? "—" : WEEKDAY_NAMES[patterns.bestWeekday - 1]],
        ["Avg session", patterns.avgSessionMinutes === null ? "—" : `${Math.round(patterns.avgSessionMinutes)} min`, "finished + stopped"],
        // Shown as "1 : N" = N focus minutes per break minute; no breaks (common under a tag filter) reads as such.
        ["Break : focus", patterns.breakRatio === null ? "—" : patterns.breakRatio === 0 ? "no breaks" : `1 : ${(1 / patterns.breakRatio).toFixed(1)}`, "focus minutes per break minute"],
    ];
    return (
        <dl className="stat-grid stat-grid--four">
            {tiles.map(([label, value, hint]) => (
                <div key={label} className="stat">
                    <dt className="stat-label">{label}</dt>
                    <dd className="stat-value">{value}</dd>
                    {hint && <dd className="stat-hint">{hint}</dd>}
                </div>
            ))}
        </dl>
    );
}

export function TagBreakdown({tags, active, onPick}: { tags: TagTotal[]; active: TagFilter; onPick: (tag: TagFilter) => void }) {
    if (tags.length === 0) return <p className="dashboard-empty">No tagged focus in this period.</p>;
    const max = Math.max(...tags.map((t) => t.minutes), 1);
    return (
        <ul className="tag-list">
            {tags.map((t) => {
                const name = t.tag ?? "untagged";
                const selected = active !== undefined && active === t.tag;
                return (
                    <li key={name} className="tag-row">
                        <button type="button" className="tag-button" aria-pressed={selected}
                                onClick={() => onPick(selected ? undefined : t.tag)}
                                title={selected ? "Show all tags" : `Show only ${name}`}>
                            <span className={`tag-name ${t.tag === null ? "tag-name--untagged" : ""}`}>{name}</span>
                            <span className="tag-bar" aria-hidden="true"><span className="tag-bar-fill" style={{width: `${(t.minutes / max) * 100}%`}}/></span>
                            <span className="tag-minutes">{Math.round(t.minutes)} min</span>
                            <span className="tag-sessions">{t.sessions} session{t.sessions === 1 ? "" : "s"}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
