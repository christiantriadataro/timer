import {band, type DayFocus, yearGrid} from "../db/stats.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const BAND_LABELS = ["0 min", "1–24 min", "25–49 min", "50–99 min", "100+ min"];

const formatDate = (date: string) =>
    new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))
        .toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric", year: "numeric"});

// GitHub-style year of focus minutes: 53 Monday-start columns, colour by fixed band (spec Q10).
function Heatmap({days, today}: { days: DayFocus[]; today: string }) {
    const minutes = new Map(days.map((d) => [d.date, d.minutes]));
    const weeks = yearGrid(today);
    const total = Math.round(days.reduce((sum, d) => sum + d.minutes, 0));
    const monthLabel = (w: number) => {
        const first = weeks[w].find((d) => d !== null);
        const prev = w > 0 ? weeks[w - 1][0] : null;
        return first && (!prev || prev.slice(5, 7) !== first.slice(5, 7)) && +first.slice(8, 10) <= 7
            ? MONTHS[+first.slice(5, 7) - 1] : "";
    };

    return (
        <figure className="heatmap" aria-label={`Focus heatmap: ${total} minutes in the last year`}>
            <div className="heatmap-scroll">
                <div className="heatmap-grid">
                    <div className="heatmap-weekdays" aria-hidden="true">
                        <span className="heatmap-month"/>
                        {WEEKDAYS.map((d, i) => <span key={i} className="heatmap-weekday">{d}</span>)}
                    </div>
                    {weeks.map((week, w) => (
                        <div key={w} className="heatmap-week">
                            <span className="heatmap-month" aria-hidden="true">{monthLabel(w)}</span>
                            {week.map((date, d) => {
                                if (date === null) return <span key={d} className="heatmap-cell heatmap-cell--empty"/>;
                                const m = Math.round(minutes.get(date) ?? 0);
                                return (
                                    <span
                                        key={d}
                                        className={`heatmap-cell heatmap-band-${band(m)}`}
                                        title={`${m} focus min · ${formatDate(date)}`}
                                        data-date={date}
                                        data-minutes={m}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            <figcaption className="heatmap-legend">
                <span>Less</span>
                {BAND_LABELS.map((label, b) => (
                    <span key={b} className={`heatmap-cell heatmap-band-${b}`} title={label} aria-label={label}/>
                ))}
                <span>More</span>
            </figcaption>
        </figure>
    );
}

export default Heatmap;
