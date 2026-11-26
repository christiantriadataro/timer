// RFC 4180 CSV: every field quoted when needed, quotes doubled, CRLF line ends.
// Text cells starting with = + - @ (or tab/CR) get a leading apostrophe so a spreadsheet
// never evaluates a tag as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return String(value);
    let s = String(value);
    if (FORMULA_START.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(rows: T[], columns: (keyof T & string)[]): string {
    const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))];
    return lines.join("\r\n") + "\r\n";
}

// Column order of the export: the sessions table (spec § 5.2) plus readable ISO times.
export const SESSION_CSV_COLUMNS = [
    "id", "kind", "status", "tag", "planned_seconds", "focused_ms", "pause_count", "paused_ms",
    "started_at", "ended_at", "started_iso", "ended_iso", "local_date", "local_hour", "local_weekday",
] as const;
