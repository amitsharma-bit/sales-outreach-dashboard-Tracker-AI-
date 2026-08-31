"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveReport } from "../../app/slack-reports/actions";
import { CallBlitzReport } from "../../lib/slackReports/callBlitz";
import PreviewTable from "./PreviewTable";
import { DestinationRow } from "./DestinationsManager";

export interface ManagerOption { key: string; name: string; ownerId: string | null; parent?: string }

export interface ReportRow {
  id: string;
  name: string;
  manager_key: string;
  slack_destination_id: string;
  enabled: boolean;
  timezone: string;
  schedule: { daysOfWeek: number[]; time1: string; time2: string | null };
}

type Result = { ok: boolean; message: string } | null;

const inputCls = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-subtle";
const DAYS = [
  { v: 0, label: "Sun" }, { v: 1, label: "Mon" }, { v: 2, label: "Tue" }, { v: 3, label: "Wed" },
  { v: 4, label: "Thu" }, { v: 5, label: "Fri" }, { v: 6, label: "Sat" },
];
const TIMEZONES = ["Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "UTC"];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-strong disabled:opacity-50">
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function ReportForm({
  managers, destinations, existing, onClose,
}: {
  managers: ManagerOption[];
  destinations: DestinationRow[];
  existing: ReportRow | null;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<Result, FormData>(saveReport, null);
  const [managerKey, setManagerKey] = useState(existing?.manager_key ?? managers[0]?.key ?? "");
  const [days, setDays] = useState<number[]>(existing?.schedule.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [secondTime, setSecondTime] = useState(!!existing?.schedule.time2);
  const [preview, setPreview] = useState<CallBlitzReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!managerKey) return;
    setPreviewLoading(true);
    fetch(`/api/slack-reports/preview?managerKey=${encodeURIComponent(managerKey)}`)
      .then((r) => r.json())
      .then((d) => setPreview(d.error ? null : d))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [managerKey]);

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const activeDestinations = useMemo(() => destinations.filter((d) => d.active), [destinations]);

  function toggleDay(v: number) {
    setDays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v].sort()));
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-pop">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">{existing ? "Edit report" : "Create Slack report"}</h2>
        <button onClick={onClose} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
      </div>

      {state && !state.ok && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-weak px-3 py-2 text-sm text-danger">{state.message}</div>
      )}

      <form action={formAction} className="grid gap-5">
        {existing && <input type="hidden" name="id" value={existing.id} />}

        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Report Type</label>
          <select className={`${inputCls} w-full sm:w-72`} disabled defaultValue="call_blitz">
            <option value="call_blitz">Call Blitz Report</option>
          </select>
          <p className="mt-1 text-xs text-ink-subtle">More report types coming later.</p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Team</label>
            <select
              name="manager_key" required className={`${inputCls} w-full`}
              value={managerKey} onChange={(e) => setManagerKey(e.target.value)}
            >
              {managers.map((m) => <option key={m.key} value={m.key}>{m.name}{m.parent ? " (sub-team)" : ""}</option>)}
            </select>
          </section>

          <section>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Slack Channel</label>
            <select name="slack_destination_id" required className={`${inputCls} w-full`} defaultValue={existing?.slack_destination_id ?? ""}>
              <option value="" disabled>Choose a channel…</option>
              {activeDestinations.map((d) => <option key={d.id} value={d.id}>{d.channel_label}</option>)}
            </select>
            {activeDestinations.length === 0 && (
              <p className="mt-1 text-xs text-warn">No Slack channels configured — add one below first.</p>
            )}
          </section>
        </div>

        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Report name</label>
          <input name="name" required defaultValue={existing?.name ?? ""} placeholder="e.g. Vaibhav Call Blitz" className={`${inputCls} w-full sm:w-96`} />
        </section>

        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Schedule</label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-ink">Time 1</label>
            <input type="time" name="time1" required defaultValue={existing?.schedule.time1 ?? "10:00"} className={inputCls} />
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input type="checkbox" checked={secondTime} onChange={(e) => setSecondTime(e.target.checked)} />
              Send a second report
            </label>
            {secondTime && (
              <>
                <label className="text-sm text-ink">Time 2</label>
                <input type="time" name="time2" defaultValue={existing?.schedule.time2 ?? "16:00"} className={inputCls} />
              </>
            )}
          </div>
        </section>

        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Days</label>
          <div className="flex flex-wrap items-center gap-3">
            {DAYS.map((d) => (
              <label key={d.v} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" name="days_of_week" value={d.v} checked={days.includes(d.v)} onChange={() => toggleDay(d.v)} />
                {d.label}
              </label>
            ))}
            <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])} className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">Weekdays</button>
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">Every day</button>
          </div>
        </section>

        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Timezone</label>
          <select name="timezone" className={`${inputCls} w-full sm:w-72`} defaultValue={existing?.timezone ?? "Asia/Kolkata"}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-subtle">Controls when the scheduler fires — the reported day is always the dashboard&apos;s US/Eastern &quot;today&quot;.</p>
        </section>

        <input type="hidden" name="enabled" value={String(existing?.enabled ?? true)} />

        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-subtle">Report Preview</label>
          {previewLoading && <p className="text-sm text-ink-muted">Loading preview…</p>}
          {!previewLoading && preview && <PreviewTable report={preview} />}
        </section>

        <div className="flex items-center gap-3">
          <SubmitButton label={existing ? "Save changes" : "Save & Activate"} />
        </div>
      </form>
    </div>
  );
}
