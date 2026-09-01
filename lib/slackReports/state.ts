/**
 * Runtime state for the "Stop Schedule"/"Start Schedule" toggle and last-run status — the ONE
 * piece of Slack Reports that genuinely can't be a static code file, since a button click must
 * change scheduler behavior without a redeploy. Reuses the EXISTING `sdr_sync_state` table
 * (already used for every other sync job's watermark/health row, already in the RLS loop, already
 * rendered on /admin's "Sync health" table) under a `slack:<report key>` key — no new schema.
 *
 * This does NOT reopen the DB-config decision made earlier: report identity, team, channel, and
 * schedule TIMES still live in config/slack-reports.ts. Only the on/off bit and the most recent
 * run's outcome are runtime state, and both already had a natural home in this table's existing
 * columns (`enabled` is new; `last_run_at`/`last_duration_ms`/`last_counts`/`notes` already exist).
 */
import { supabaseAdmin } from "../supabase/admin";

const KEY_PREFIX = "slack:";

function stateKey(reportKey: string): string {
  return `${KEY_PREFIX}${reportKey}`;
}

/** Is the automatic schedule currently on for this report? Falls back to `fallback` (the config
 *  file's compile-time `enabled` default) if the DB is unreachable or no row exists yet. */
export async function isScheduleEnabled(reportKey: string, fallback: boolean): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return fallback;
  const { data } = await sb.from("sdr_sync_state").select("enabled").eq("key", stateKey(reportKey)).maybeSingle();
  return data?.enabled ?? fallback;
}

/** Flip the automatic schedule on/off. Never touches report config, history, or the ability to
 *  Preview/Run Now/Send Test — those are independent of this flag entirely. */
export async function setScheduleEnabled(reportKey: string, enabled: boolean): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("supabase unavailable");
  const { error } = await sb.from("sdr_sync_state").upsert({ key: stateKey(reportKey), enabled }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export type RunStage = "image" | "slack";

/** Records the outcome of a real (non-test) send — scheduled or "Run Now" — as this report's
 *  latest-run status. One row per report (not a growing log): the existing sync-health pattern is
 *  "current state of this job," not an audit trail, and that's the right amount of history here. */
export async function recordRunResult(
  reportKey: string,
  result: { ok: boolean; stage?: RunStage; error?: string; durationMs: number },
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const notes = result.ok
    ? null
    : result.stage === "image" ? `Image generation failed: ${result.error ?? "unknown error"}`
    : result.stage === "slack" ? `Slack delivery failed: ${result.error ?? "unknown error"}`
    : result.error ?? "failed";
  await sb.from("sdr_sync_state").update({
    last_run_at: new Date().toISOString(),
    last_duration_ms: result.durationMs,
    last_counts: { status: result.ok ? "sent" : "failed" },
    notes,
  }).eq("key", stateKey(reportKey));
}

export interface RunState {
  lastRunAt: string | null;
  lastDurationMs: number | null;
  status: "sent" | "failed" | null;
  notes: string | null;
}

export async function getRunState(reportKey: string): Promise<RunState | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("sdr_sync_state")
    .select("last_run_at,last_duration_ms,last_counts,notes")
    .eq("key", stateKey(reportKey)).maybeSingle();
  if (!data) return null;
  const status = (data.last_counts as { status?: "sent" | "failed" } | null)?.status ?? null;
  return { lastRunAt: data.last_run_at, lastDurationMs: data.last_duration_ms, status, notes: data.notes };
}
