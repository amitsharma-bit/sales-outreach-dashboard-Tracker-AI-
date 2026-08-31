"use client";

import { Fragment, useEffect, useState } from "react";
import { Chip, Surface } from "../ui";

interface RunRow {
  id: string;
  scheduled_for: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed" | "skipped";
  error_message: string | null;
  team: string | null;
  channel: string | null;
  duration_ms: number | null;
  triggered_by: "scheduler" | "test" | "manual";
}

const STATUS_TONE = { success: "good", failed: "danger", running: "warm", skipped: "neutral" } as const;

export default function RunHistory({ reportId }: { reportId: string }) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/slack-reports/runs?reportId=${reportId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRuns(d.runs ?? []); })
      .catch(() => { if (!cancelled) setRuns([]); });
    return () => { cancelled = true; };
  }, [reportId]);

  if (runs === null) return <p className="text-sm text-ink-muted">Loading history…</p>;
  if (runs.length === 0) return <p className="text-sm text-ink-muted">No runs yet.</p>;

  return (
    <Surface className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-subtle">
            <th className="px-4 py-2">Started</th>
            <th className="px-2 py-2">Trigger</th>
            <th className="px-2 py-2">Team</th>
            <th className="px-2 py-2">Channel</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Duration</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <Fragment key={r.id}>
              <tr
                className="cursor-pointer border-b border-line/60 hover:bg-surface-muted"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <td className="px-4 py-1.5 tabular-nums text-ink">{new Date(r.started_at).toLocaleString()}</td>
                <td className="px-2 py-1.5 text-ink-muted">{r.triggered_by}</td>
                <td className="px-2 py-1.5 text-ink-muted">{r.team ?? "—"}</td>
                <td className="px-2 py-1.5 text-ink-muted">{r.channel ?? "—"}</td>
                <td className="px-2 py-1.5"><Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip></td>
                <td className="px-2 py-1.5 tabular-nums text-ink-muted">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
              </tr>
              {expanded === r.id && r.error_message && (
                <tr className="border-b border-line/60 bg-danger-weak/40">
                  <td colSpan={6} className="px-4 py-2 text-xs text-danger">{r.error_message}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}
