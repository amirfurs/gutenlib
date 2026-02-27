"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadJson, exportBackup, importBackup, readJsonFile } from "@/lib/library/backup";
import type { LibraryScope } from "@/lib/library/db";

export function BackupButtons({ scope }: { scope: LibraryScope }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          try {
            setBusy(true);
            const data = await exportBackup(scope);
            const name = `gutenlib-backup-${scope}-${new Date().toISOString().slice(0, 10)}.json`;
            downloadJson(name, data);
          } finally {
            setBusy(false);
          }
        }}
        title="Export"
        aria-label="Export"
      >
        <Download className="h-4 w-4" />
        Export
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            setBusy(true);
            const j = await readJsonFile(f);
            await importBackup(j, scope);
            alert("Imported. Reload the page.");
          } catch (err: any) {
            alert(err?.message ?? "Import failed");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />

      <button
        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        title="Import"
        aria-label="Import"
      >
        <Upload className="h-4 w-4" />
        Import
      </button>
    </div>
  );
}
