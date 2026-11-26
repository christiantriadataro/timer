// Checks a file before it is allowed to replace the database. Reads only the 100-byte SQLite
// header (https://sqlite.org/fileformat.html#the_database_header), so a bad file is rejected
// before the current database is touched.
const MAGIC = "SQLite format 3\u0000";

export function validateBackup(bytes: Uint8Array, schemaVersion: number): string | null {
    if (bytes.length < 512) return "That file is too small to be a timer database.";
    if (new TextDecoder().decode(bytes.subarray(0, 16)) !== MAGIC) return "That file isn't a SQLite database.";
    const raw = (bytes[16] << 8) | bytes[17];
    const pageSize = raw === 1 ? 65536 : raw;
    if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0 || bytes.length % pageSize !== 0) {
        return "That database file looks damaged (bad page size).";
    }
    // The browser storage can't open WAL-mode files; exports from this app are never WAL.
    if (bytes[18] !== 1 || bytes[19] !== 1) return "That database uses WAL mode; open it in SQLite and run PRAGMA journal_mode=DELETE first.";
    const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(60);
    if (version === 0) return "That SQLite file isn't a timer backup (no schema version).";
    if (version > schemaVersion) return "That backup comes from a newer version of the timer. Reload the app and try again.";
    return null;
}
