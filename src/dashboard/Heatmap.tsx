import {useEffect, useRef} from "react";
import {yearGrid} from "../db/stats.ts";
import {type Bucket, DayCell} from "./Cells.tsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

// GitHub-style year of focus minutes: 53 Monday-start columns ending at `end`, colour by fixed band (spec Q10).
function Heatmap({end, today, minutes, selected, onSelect}: {
    end: string;
    today: string;
    minutes: Map<string, number>;
    selected: Bucket | null;
    onSelect: (bucket: Bucket) => void;
}) {
    const weeks = yearGrid(end, today);
    const monthLabel = (w: number) => {
        const first = weeks[w].find((d) => d !== null);
        const prev = w > 0 ? weeks[w - 1][0] : null;
        return first && (!prev || prev.slice(5, 7) !== first.slice(5, 7)) && +first.slice(8, 10) <= 7
            ? MONTHS[+first.slice(5, 7) - 1] : "";
    };

    // Narrow screens scroll the graph inside its box; start at the most recent weeks.
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
    }, [end]);

    return (
        <div className="heatmap-scroll" ref={scroller}>
            <div className="heatmap-grid" role="group" aria-label="Year">
                <div className="heatmap-weekdays" aria-hidden="true">
                    {WEEKDAYS.map((d, i) => <span key={i} className="heatmap-weekday">{d}</span>)}
                </div>
                {weeks.map((week, w) => (
                    <div key={w} className="heatmap-week">
                        <span className="heatmap-month" aria-hidden="true">{monthLabel(w)}</span>
                        {week.map((date, d) => date === null
                            ? <span key={d} className="heatmap-cell heatmap-cell--empty"/>
                            : <DayCell key={d} date={date} minutes={minutes.get(date) ?? 0} today={today}
                                       selected={selected !== null && selected.hour === null && selected.from === date} onSelect={onSelect}/>)}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Heatmap;
