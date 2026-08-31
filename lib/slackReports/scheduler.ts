/**
 * Slack Reports scheduler — checked every ~10 min by a self-redispatching GitHub Actions
 * heartbeat (.github/workflows/slack-reports-heartbeat.yml), the same pattern already proven by
 * spine-delta-heartbeat.yml (plain `schedule:` cron is confirmed throttled on this repo).
 *
 * Idempotency: before sending, the scheduler claims a (report_id, scheduled_for, 'scheduler') row
 * in sdr_slack_report_runs. The table's unique constraint rejects a duplicate claim, so an
 * overlapping heartbeat cycle or a redispatch race can never double-post the same slot.
 */
import { supabaseAdmin } from "../supabase/admin";
import { assembleCallBlitzReport } from "./build";
import { formatCallBlitzMessage } from "./format";
import { sendSlackMessage } from "./deliver";
import { ReportSchedule } from "./types";
import { dueSlotFor } from "./dueSlot";

export { dueSlotFor } from "./dueSlot";

interface ReportRow {
  id: string;
  name: string;
  report_type: string;
  manager_key: string;
  slack_destination_id: string;
  enabled: boolean;
  timezone: string;
  schedule: ReportSchedule;
}

interface DestinationRow {
  id: string;
  channel_label: string;
  env_var_key: string;
  active: boolean;
}

export interface SchedulerRunResult { checked: number; fired: number; skipped: number; errors: number; }

/** Runs one report immediately (bypasses the due-time check) — used by "Run Now" / "Send Test". */
export async function runOneReport(
  report: ReportRow, destination: DestinationRow, opts: { test?: boolean; scheduledFor: string; triggeredBy: "scheduler" | "test" | "manual" },
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "supabase unavailable" };
  const startedAt = Date.now();

  const { data: runRow, error: claimError } = await sb
    .from("sdr_slack_report_runs")
    .insert({
      report_id: report.id, scheduled_for: opts.scheduledFor, status: "running",
      team: report.name, channel: destination.channel_label, triggered_by: opts.triggeredBy,
    })
    .select("id")
    .single();
  if (claimError || !runRow) {
    // Unique-constraint conflict = already claimed this slot (or a genuine DB error) — either way, don't send.
    return { ok: false, error: claimError?.message ?? "could not claim run slot" };
  }

  try {
    const report_data = await assembleCallBlitzReport({ managerKey: report.manager_key });
    const { text } = formatCallBlitzMessage(report_data, { test: opts.test });
    await sendSlackMessage({ channelLabel: destination.channel_label, envVarKey: destination.env_var_key }, text);
    await sb.from("sdr_slack_report_runs").update({
      status: "success", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
    }).eq("id", runRow.id);
    if (opts.triggeredBy !== "test") {
      await sb.from("sdr_slack_reports").update({ last_run_at: new Date().toISOString() }).eq("id", report.id);
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    await sb.from("sdr_slack_report_runs").update({
      status: "failed", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, error_message: message,
    }).eq("id", runRow.id);
    return { ok: false, error: message };
  }
}

/** The recurring scheduler pass: checks every enabled report and fires the ones that are due.
 *  Never throws out of the loop — one report's failure doesn't block the rest (mirrors
 *  lib/agent/runner.ts's per-item try/catch shape). */
export async function runScheduler(nowMs = Date.now()): Promise<SchedulerRunResult> {
  const sb = supabaseAdmin();
  if (!sb) return { checked: 0, fired: 0, skipped: 0, errors: 0 };

  const { data: reports } = await sb.from("sdr_slack_reports").select("*").eq("enabled", true);
  const { data: destinations } = await sb.from("sdr_slack_destinations").select("*");
  const destById = new Map((destinations ?? []).map((d: DestinationRow) => [d.id, d]));

  let fired = 0, skipped = 0, errors = 0;
  for (const r of (reports ?? []) as ReportRow[]) {
    try {
      const slot = dueSlotFor(r, nowMs);
      if (!slot) { skipped++; continue; }
      const destination = destById.get(r.slack_destination_id);
      if (!destination || !destination.active) {
        console.error(`[slack-reports] report ${r.id} (${r.name}) has no active Slack destination — skipping`);
        errors++;
        continue;
      }
      const result = await runOneReport(r, destination, { scheduledFor: slot, triggeredBy: "scheduler" });
      if (result.ok) fired++;
      else { skipped++; } // most "not ok" cases here are "already claimed by another cycle" — not a real error
    } catch (e) {
      errors++;
      console.error(`[slack-reports] report ${r.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { checked: (reports ?? []).length, fired, skipped, errors };
}
