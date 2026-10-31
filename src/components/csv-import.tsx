"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Rejection = { row: number; error: string };

export function CsvImport() {
  const [message, setMessage] = useState(""); const [rejected, setRejected] = useState<Rejection[]>([]); const [busy, setBusy] = useState(false); const router = useRouter();
  async function upload(file: File) {
    if (file.size > 128_000) { setMessage("File exceeds the 128 KB limit."); return; }
    setBusy(true); setRejected([]);
    try {
      const csv = await file.text();
      const response = await fetch("/api/payments/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv }) });
      const result = await response.json();
      setMessage(response.ok ? `${result.accepted} accepted; ${result.rejected.length} rejected.` : result.error);
      if (response.ok) { setRejected(result.rejected); router.refresh(); }
    } catch { setMessage("The CSV could not be uploaded."); } finally { setBusy(false); }
  }
  return <div><div className="field"><label htmlFor="csv-file">UTF-8 CSV (max 128 KB)</label><input id="csv-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></div>{message && <div className="form-status" role="status" aria-live="polite">{message}</div>}{rejected.length > 0 && <ul aria-label="Rejected CSV rows">{rejected.map((item) => <li key={`${item.row}-${item.error}`}>Row {item.row}: {item.error}</li>)}</ul>}</div>;
}
