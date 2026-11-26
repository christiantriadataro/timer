import type {Scale} from "../db/stats.ts";

const toDate = (date: string) => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

export const formatDate = (date: string, opts: Intl.DateTimeFormatOptions = {weekday: "short", month: "short", day: "numeric", year: "numeric"}) =>
    toDate(date).toLocaleDateString(undefined, opts);

export const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"});

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

// "Thu, Nov 26, 2026" · "Nov 23 – Nov 29, 2026" · "November 2026" · "last 12 months"
export function periodLabel(scale: Scale, from: string, to: string, today: string) {
    switch (scale) {
        case "day": return formatDate(from);
        case "week": return `${formatDate(from, {month: "short", day: "numeric"})} – ${formatDate(to, {month: "short", day: "numeric", year: "numeric"})}`;
        case "month": return formatDate(from, {month: "long", year: "numeric"});
        case "year": return from <= today && today <= to ? "the last 12 months"
            : `${formatDate(from, {month: "short", year: "numeric"})} – ${formatDate(to, {month: "short", year: "numeric"})}`;
    }
}
