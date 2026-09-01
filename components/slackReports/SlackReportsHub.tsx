"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Radio } from "lucide-react";
import { sendTestReport, runReportNow, setScheduleActive } from "../../app/slack-reports/actions";
import { Chip, Surface } from "../ui";
import { SlackReportConfig } from "../../config/slack-reports";
import { RunState } from "../../lib/slackReports/state";
import { CallBlitzReport } from "../../lib/slackReports/callBlitz";
import PreviewTable from "./PreviewTable";

export interface ReportWithStatus extends SlackReportConfig {
  active: boolean; // live schedule on/off (DB-backed, overrides the config's compile-time default)
  nextRunMs: number | null; // null when the schedule is stopped, or no times/days configured
  runState: RunState | null; // most recent real (non-test) send's outcome
}

type ActionResult = { ok: boolean; message: string } | null;

const REPORT_TYPE_LABEL: Record<string, string> = { call_blitz: "Call Blitz Report" };
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtSchedule(r: SlackReportConfig): string {
  const days = [...r.schedule.daysOfWeek].sort();
  const daysStr = days.length === 7 ? "Every day"
    : JSON.stringify(days) === JSON.stringify([1, 2, 3, 4, 5]) ? "Mon–Fri"
    : days.map((d) => DAY_LABELS[d]).join(", ");
  const times = [r.schedule.time1, r.schedule.time2].filter(Boolean).join(" · ");
  return `${daysStr} · ${times}`;
}

function fmtInTz(ms: number, timezone: string): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: timezone, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + ` ${timezone === "Asia/Kolkata" ? "IST" : timezone}`;
}

function SmallSubmit({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
        tone === "danger" ? "border-danger/30 text-danger hover:bg-danger-weak" : "border-line text-ink hover:bg-surface-muted"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}

function ActionButton({ action, reportKey, label }: { action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>; reportKey: string; label: string }) {
  const [state, formAction] = useFormState<ActionResult, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="key" value={reportKey} />
      <SmallSubmit label={label} />
      {state && <span className={`text-xs ${state.ok ? "text-good" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

function ScheduleToggle({ report }: { report: ReportWithStatus }) {
  const [state, formAction] = useFormState<ActionResult, FormData>(setScheduleActive, null);

  function confirmStop(e: React.FormEvent<HTMLFormElement>) {
    if (!report.active) return; // starting needs no confirmation
    const times = [report.schedule.time1, report.schedule.time2].filter(Boolean).join(" and ");
    const ok = window.confirm(
      `Stop Scheduled Reports?\n\nAutomatic Slack reports will no longer be sent at ${times} ${report.timezone === "Asia/Kolkata" ? "IST" : report.timezone}.\n\nYour report configuration will be preserved.`,
    );
    if (!ok) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={confirmStop} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="key" value={report.key} />
      <input type="hidden" name="active" value={String(!report.active)} />
      <SmallSubmit label={report.active ? "Stop Schedule" : "Start Schedule"} tone={report.active ? "danger" : "neutral"} />
      {state && <span className={`text-xs ${state.ok ? "text-good" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}

function runStateLine(runState: RunState | null): { text: string; tone: "good" | "danger" | "neutral" } {
  if (!runState || !runState.lastRunAt) return { text: "Last sent: never", tone: "neutral" };
  const when = new Date(runState.lastRunAt).toLocaleString();
  if (runState.status === "failed") return { text: `✕ Last run failed (${when}): ${runState.notes ?? "unknown error"}`, tone: "danger" };
  return { text: `✓ Last sent: ${when}`, tone: "good" };
}

function ReportCard({ report }: { report: ReportWithStatus }) {
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<CallBlitzReport | null>(null);
  const [loading, setLoading] = useState(false);
  const last = runStateLine(report.runState);

  async function togglePreview() {
    const next = !showPreview;
    setShowPreview(next);
    if (!next || preview || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/slack-reports/preview?key=${encodeURIComponent(report.key)}`);
      const data = await res.json();
      setPreview(data.error ? null : data);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" strokeWidth={2.4} />
            <h3 className="font-semibold text-ink">{report.name}</h3>
            <Chip tone={report.active ? "good" : "neutral"}>{report.active ? "● Schedule Active" : "○ Schedule Stopped"}</Chip>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-muted">
            <dt>Type</dt><dd>{REPORT_TYPE_LABEL[report.reportType] ?? report.reportType}</dd>
            <dt>Channel</dt><dd>{report.channelLabel}</dd>
            <dt>Schedule</dt><dd>{fmtSchedule(report)}</dd>
            <dt>Timezone</dt><dd>{report.timezone}</dd>
            <dt>Next run</dt>
            <dd>{report.active && report.nextRunMs ? fmtInTz(report.nextRunMs, report.timezone) : "No automatic reports are currently scheduled."}</dd>
          </dl>
          <p className={`mt-2 text-xs ${last.tone === "good" ? "text-good" : last.tone === "danger" ? "text-danger" : "text-ink-subtle"}`}>{last.text}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={togglePreview} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted">
            {showPreview ? "Hide preview" : "Preview"}
          </button>
          <ActionButton action={runReportNow} reportKey={report.key} label="Run Now" />
          <ActionButton action={sendTestReport} reportKey={report.key} label="Send Test" />
          <ScheduleToggle report={report} />
        </div>
      </div>
      {showPreview && (
        <div className="mt-4">
          {loading && <p className="text-sm text-ink-muted">Loading preview…</p>}
          {!loading && preview && <PreviewTable report={preview} />}
          {!loading && !preview && <p className="text-sm text-danger">Could not load preview.</p>}
        </div>
      )}
    </Surface>
  );
}

export default function SlackReportsHub({ reports }: { reports: ReportWithStatus[] }) {
  return (
    <div className="grid gap-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-subtle">Active Reports</h2>

      {reports.length === 0 ? (
        <Surface className="p-10 text-center">
          <p className="text-sm font-semibold text-ink">No Slack reports configured.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Add an entry to <code>config/slack-reports.ts</code> and redeploy to enable one.
          </p>
        </Surface>
      ) : (
        <div className="grid gap-3">
          {reports.map((r) => <ReportCard key={r.key} report={r} />)}
        </div>
      )}

      <Surface className="p-4">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Slack Connections</h3>
        <p className="text-xs text-ink-muted">
          Reports and their Slack channels are configured in <code>config/slack-reports.ts</code> (a
          channel label + channel ID per report). Delivery is an image posted via a single shared
          Slack bot token (<code>SLACK_BOT_TOKEN</code>) — the token itself never lives in code, a
          database, or the browser. Run Now / Send Test dispatch a GitHub Actions run, so results
          appear in Slack within about a minute rather than instantly. Stop/Start Schedule only
          toggles automatic sends — it never touches the report configuration, and Preview / Run Now
          / Send Test keep working regardless.
        </p>
      </Surface>
    </div>
  );
}
