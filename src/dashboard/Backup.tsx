import {useEffect, useRef, useState} from "react";
import {sessionTracker} from "../db/sessionTracker.ts";
import {localFields} from "../db/sessions.ts";

type Persist = "unknown" | "unsupported" | "persisted" | "not-persisted" | "denied";
const PERSIST_TEXT: Record<Persist, string> = {
    unknown: "Checking browser storage…",
    unsupported: "This browser can't promise to keep site data; export backups regularly.",
    persisted: "The browser has agreed to keep this data, even when space runs low.",
    "not-persisted": "The browser may clear this data when space runs low.",
    denied: "The browser declined to keep this data permanently; export backups regularly.",
};

// Export / restore of the whole .sqlite file (spec Q11, TIMER-0010) and persistent-storage status.
function Backup({onRestored}: { onRestored: () => void }) {
    const [persist, setPersist] = useState<Persist>("unknown");
    const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!navigator.storage?.persisted) { setPersist("unsupported"); return; }
        navigator.storage.persisted().then((p) => setPersist(p ? "persisted" : "not-persisted"), () => setPersist("unsupported"));
    }, []);

    const requestPersist = async () => {
        try {
            setPersist((await navigator.storage.persist()) ? "persisted" : "denied");
        } catch {
            setPersist("unsupported");
        }
    };

    const exportDb = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const bytes = await sessionTracker.exportDb();
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type: "application/vnd.sqlite3"}));
            const a = document.createElement("a");
            a.href = url;
            a.download = `timer-${localFields(Date.now()).local_date}.sqlite`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage({kind: "ok", text: `Backup downloaded (${Math.ceil(bytes.byteLength / 1024)} KB).`});
        } catch (e) {
            setMessage({kind: "error", text: `Export failed: ${e instanceof Error ? e.message : String(e)}`});
        } finally {
            setBusy(false);
        }
    };

    const restore = async (file: File) => {
        const ok = window.confirm(
            `Replace ALL your current stats with "${file.name}"?\n\nThis can't be undone. Export a backup first if you might want today's data back.`);
        if (!ok) return;
        setBusy(true);
        setMessage(null);
        try {
            const {sessions} = await sessionTracker.importDb(new Uint8Array(await file.arrayBuffer()));
            setMessage({kind: "ok", text: `Restored ${sessions} session${sessions === 1 ? "" : "s"} from ${file.name}.`});
            onRestored();
        } catch (e) {
            setMessage({kind: "error", text: e instanceof Error ? e.message : String(e)});
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="backup">
            <div className="backup-actions">
                <button type="button" className="backup-button" onClick={exportDb} disabled={busy}>Download backup (.sqlite)</button>
                <button type="button" className="backup-button backup-button--restore" onClick={() => fileInput.current?.click()} disabled={busy}>
                    Restore from backup…
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3"
                    className="sr-only"
                    aria-label="Choose a backup file to restore"
                    data-testid="restore-input"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = ""; // allow choosing the same file again
                        if (f) restore(f);
                    }}
                />
            </div>
            {message && (
                <p className={`backup-message backup-message--${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
                    {message.text}
                </p>
            )}
            <p className={`backup-persist backup-persist--${persist}`} data-persist={persist}>
                {PERSIST_TEXT[persist]}
                {(persist === "not-persisted") && (
                    <button type="button" className="backup-persist-button" onClick={requestPersist}>Ask the browser to keep it</button>
                )}
            </p>
        </div>
    );
}

export default Backup;
