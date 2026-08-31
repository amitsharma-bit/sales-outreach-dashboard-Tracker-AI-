"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Radio } from "lucide-react";
import { setReportEnabled, deleteReport, duplicateReport, sendTestReport, runReportNow } from "../../app/slack-reports/actions";
import { Chip, Surface } from "../ui";
import ReportForm, { ManagerOption, ReportRow } from "./ReportForm";
import DestinationsManager, { DestinationRow } from "./DestinationsManager";
import RunHistory from "./RunHistory";

type ActionResult = { ok: boolean; message: string } | null;

const REPORT_TYPE_LABEL: Record<string, string> = { call_blitz: "Call Blitz Report" };

function fmtSchedule(r: ReportRow): string {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [...r.schedule.daysOfWeek].sort();
  const daysStr = days.length === 7 ? "Every day"
    : JSON.stringify(days) === JSON.stringify([1, 2, 3, 4, 5]) ? "Mon–Fri"
    : days.map((d) => dayLabels[d]).join(", ");
  const times = [r.schedule.time1, r.schedule.time2].filter(Boolean).join(" · ");
  return `${daysStr} · ${times}`;
}

function TestButton({ reportId }: { reportId: string }) {
  const [state, formAction] = useFormState<ActionResult, FormData>(sendTestReport, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={reportId} />
      <SmallSubmit label="Send Test" />
      {state && <span className={`text-xs ${state.ok ? "text-good" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

function RunNowButton({ reportId }: { reportId: string }) {
  const [state, formAction] = useFormState<ActionResult, FormData>(runReportNow, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={reportId} />
      <SmallSubmit label="Run Now" />
      {state && <span className={`text-xs ${state.ok ? "text-good" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

function SmallSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">
      {pending ? "…" : label}
    </button>
  );
}

type ReportListRow = ReportRow & { report_type?: string; created_at?: string; last_run_at: string | null; next_run_at: string | null };

function ReportCard({ report, onEdit, expanded, onToggleHistory }: {
  report: ReportListRow;
  onEdit: () => void;
  expanded: boolean;
  onToggleHistory: () => void;
}) {
  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" strokeWidth={2.4} />
            <h3 className="font-semibold text-ink">{report.name}</h3>
            <Chip tone={report.enabled ? "good" : "neutral"}>{report.enabled ? "● Active" : "○ Disabled"}</Chip>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-muted">
            <dt>Type</dt><dd>{REPORT_TYPE_LABEL[report.report_type ?? "call_blitz"] ?? "Call Blitz Report"}</dd>
            <dt>Schedule</dt><dd>{fmtSchedule(report)}</dd>
            <dt>Timezone</dt><dd>{report.timezone}</dd>
            <dt>Last sent</dt><dd>{report.last_run_at ? new Date(report.last_run_at).toLocaleString() : "—"}</dd>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onEdit} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted">Edit</button>
          <RunNowButton reportId={report.id} />
          <TestButton reportId={report.id} />
          <form action={setReportEnabled}>
            <input type="hidden" name="id" value={report.id} />
            <input type="hidden" name="enabled" value={String(!report.enabled)} />
            <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted">
              {report.enabled ? "Disable" : "Enable"}
            </button>
          </form>
          <form action={duplicateReport}>
            <input type="hidden" name="id" value={report.id} />
            <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted">Duplicate</button>
          </form>
          <form action={deleteReport} onSubmit={(e) => { if (!confirm(`Delete "${report.name}"? This permanently removes the report configuration and its schedule.`)) e.preventDefault(); }}>
            <input type="hidden" name="id" value={report.id} />
            <button className="rounded-lg border border-danger/30 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger-weak">Delete</button>
          </form>
          <button onClick={onToggleHistory} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted">
            {expanded ? "Hide history" : "History"}
          </button>
        </div>
      </div>
      {expanded && <div className="mt-4"><RunHistory reportId={report.id} /></div>}
    </Surface>
  );
}

export default function SlackReportsHub({
  reports, destinations, managers,
}: {
  reports: ReportListRow[];
  destinations: DestinationRow[];
  managers: ManagerOption[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ReportListRow | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const formOpen = creating || editing != null;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-subtle">Active Reports</h2>
        {!formOpen && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-strong"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} /> Create Report
          </button>
        )}
      </div>

      {formOpen && (
        <ReportForm
          managers={managers}
          destinations={destinations}
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {!formOpen && reports.length === 0 && (
        <Surface className="p-10 text-center">
          <p className="text-sm font-semibold text-ink">No automated reports configured yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Create a report to automatically send sales activity reports to your Slack channels.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-strong"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} /> Create Slack Report
          </button>
        </Surface>
      )}

      {!formOpen && reports.length > 0 && (
        <div className="grid gap-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onEdit={() => setEditing(r)}
              expanded={historyId === r.id}
              onToggleHistory={() => setHistoryId(historyId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}

      <DestinationsManager destinations={destinations} />
    </div>
  );
}
