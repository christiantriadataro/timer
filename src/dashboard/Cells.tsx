import {band, monthGrid, weekDates} from "../db/stats.ts";
import {formatDate, hourLabel} from "./format.ts";

export interface Bucket {
    from: string;
    to: string;
    hour: number | null;
}

interface CellProps {
    date: string;
    minutes: number;
    today: string;
    selected: boolean;
    onSelect: (bucket: Bucket) => void;
    children?: React.ReactNode;
    className?: string;
}

// One clickable day square. Future days are shown but can't be opened.
export function DayCell({date, minutes, today, selected, onSelect, children, className = ""}: CellProps) {
    const m = Math.round(minutes);
    const future = date > today;
    const label = `${m} focus min · ${formatDate(date)}`;
    return (
        <button
            type="button"
            className={`heatmap-cell heatmap-band-${future ? 0 : band(m)} ${future ? "heatmap-cell--future" : ""} ${className}`}
            title={label}
            aria-label={label}
            aria-pressed={selected}
            disabled={future}
            data-date={date}
            data-minutes={m}
            onClick={() => onSelect({from: date, to: date, hour: null})}
        >
            {children}
        </button>
    );
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface GridProps {
    anchor: string;
    today: string;
    minutes: Map<string, number>;
    selected: Bucket | null;
    onSelect: (bucket: Bucket) => void;
}

const isSel = (s: Bucket | null, date: string) => s !== null && s.hour === null && s.from === date;

export function MonthGrid({anchor, today, minutes, selected, onSelect}: GridProps) {
    return (
        <div className="month-grid" role="group" aria-label={formatDate(anchor, {month: "long", year: "numeric"})}>
            {WEEKDAY_NAMES.map((d) => <span key={d} className="month-weekday" aria-hidden="true">{d}</span>)}
            {monthGrid(anchor).flat().map((date, i) => date === null
                ? <span key={i} className="month-cell month-cell--outside"/>
                : (
                    <DayCell key={date} date={date} minutes={minutes.get(date) ?? 0} today={today}
                             selected={isSel(selected, date)} onSelect={onSelect} className="month-cell">
                        <span className="month-day">{+date.slice(8, 10)}</span>
                    </DayCell>
                ))}
        </div>
    );
}

export function WeekGrid({anchor, today, minutes, selected, onSelect}: GridProps) {
    const dates = weekDates(anchor);
    const max = Math.max(100, ...dates.map((d) => minutes.get(d) ?? 0));
    return (
        <div className="week-grid" role="group" aria-label="Week">
            {dates.map((date, i) => {
                const m = minutes.get(date) ?? 0;
                return (
                    <div key={date} className="week-day">
                        <span className="week-bar" aria-hidden="true">
                            <span className="week-bar-fill" style={{height: `${(m / max) * 100}%`}}/>
                        </span>
                        <DayCell date={date} minutes={m} today={today} selected={isSel(selected, date)}
                                 onSelect={onSelect} className="week-cell">
                            <span className="week-minutes">{Math.round(m)}</span>
                        </DayCell>
                        <span className="week-label" aria-hidden="true">{WEEKDAY_NAMES[i]} {+date.slice(8, 10)}</span>
                    </div>
                );
            })}
        </div>
    );
}

export function DayGrid({anchor, today, hours, selected, onSelect}: Omit<GridProps, "minutes"> & { hours: number[] }) {
    const future = anchor > today;
    return (
        <div className="day-grid" role="group" aria-label={formatDate(anchor)}>
            {hours.map((minutes, h) => {
                const m = Math.round(minutes);
                const label = `${m} focus min · ${hourLabel(h)}`;
                return (
                    <button
                        key={h}
                        type="button"
                        className={`heatmap-cell day-cell heatmap-band-${band(m)}`}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected?.hour === h}
                        disabled={future}
                        data-hour={h}
                        data-minutes={m}
                        onClick={() => onSelect({from: anchor, to: anchor, hour: h})}
                    >
                        <span className="day-hour">{String(h).padStart(2, "0")}</span>
                    </button>
                );
            })}
        </div>
    );
}
