"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { supabaseServer } from "../../lib/supabase/server";
import { requireAdmin } from "../../lib/access/requireAdmin";
import { resolveViewer } from "../../lib/access/resolve";
import { loadTeamStructure } from "../../lib/team/load";
import { assembleCallBlitzReport } from "../../lib/slackReports/build";
import { formatCallBlitzMessage } from "../../lib/slackReports/format";
import { sendSlackMessage } from "../../lib/slackReports/deliver";
import { ReportSchedule } from "../../lib/slackReports/types";

type ActionResult = { ok: boolean; message: string };

function str(fd: FormData, key: string): string { return String(fd.get(key) ?? "").trim(); }

function sb() {
  const c = supabaseAdmin();
  if (!c) throw new Error("supabase unavailable");
  return c;
}

function parseSchedule(fd: FormData): ReportSchedule {
  const daysOfWeek = fd.getAll("days_of_week").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const time1 = str(fd, "time1") || "10:00";
  const time2Raw = str(fd, "time2");
  return { daysOfWeek: daysOfWeek.length ? daysOfWeek : [1, 2, 3, 4, 5], time1, time2: time2Raw || null };
}

// ── Destinations ─────────────────────────────────────────────────────────────

export async function saveDestination(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const channelLabel = str(formData, "channel_label");
    const envVarKey = str(formData, "env_var_key");
    if (!channelLabel) return { ok: false, message: "Channel label is required (e.g. #team-vaibhav)." };
    if (!envVarKey || !/^[A-Z][A-Z0-9_]*$/.test(envVarKey)) {
      return { ok: false, message: "Env var key must be UPPER_SNAKE_CASE (e.g. SLACK_VAIBHAV_WEBHOOK)." };
    }
    const { error } = await sb().from("sdr_slack_destinations").upsert(
      { channel_label: channelLabel, env_var_key: envVarKey, active: true, updated_at: new Date().toISOString() },
      { onConflict: "env_var_key" },
    );
    if (error) return { ok: false, message: `Database write failed: ${error.message}` };
    revalidatePath("/slack-reports");
    return { ok: true, message: `✓ Destination ${channelLabel} saved — set ${envVarKey} in your deployment's env vars for delivery to work.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeDestination(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const { count } = await sb().from("sdr_slack_reports").select("id", { count: "exact", head: true }).eq("slack_destination_id", id);
  if (count && count > 0) {
    // Referenced by a report — soft-delete only, so existing reports don't dangle.
    const { error } = await sb().from("sdr_slack_destinations").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb().from("sdr_slack_destinations").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/slack-reports");
}

// ── Reports ──────────────────────────────────────────────────────────────────

export async function saveReport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const { data: { user } } = await supabaseServer().auth.getUser();
    const viewer = await resolveViewer(user?.email ?? "");
    if (!viewer.isAdmin) return { ok: false, message: "forbidden" };

    const id = str(formData, "id") || null;
    const name = str(formData, "name");
    const managerKey = str(formData, "manager_key");
    const slackDestinationId = str(formData, "slack_destination_id");
    const timezone = str(formData, "timezone") || "Asia/Kolkata";
    const enabled = str(formData, "enabled") !== "false";
    const schedule = parseSchedule(formData);

    if (!name) return { ok: false, message: "Report name is required." };
    if (!managerKey) return { ok: false, message: "Team is required." };
    if (!slackDestinationId) return { ok: false, message: "Slack channel is required." };
    if (!schedule.time1 && !schedule.time2) return { ok: false, message: "At least one schedule time is required." };
    if (schedule.daysOfWeek.length === 0) return { ok: false, message: "Select at least one day." };

    const ts = await loadTeamStructure();
    if (!ts.managers[managerKey]) return { ok: false, message: `Unknown team "${managerKey}".` };

    const c = sb();
    const { data: destination } = await c.from("sdr_slack_destinations").select("id,active").eq("id", slackDestinationId).maybeSingle();
    if (!destination || !destination.active) return { ok: false, message: "Selected Slack channel is not active." };

    const row = {
      name, report_type: "call_blitz", manager_key: managerKey, slack_destination_id: slackDestinationId,
      enabled, timezone, schedule, created_by: viewer.email, updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await c.from("sdr_slack_reports").update(row).eq("id", id)
      : await c.from("sdr_slack_reports").insert(row);
    if (error) return { ok: false, message: `Database write failed: ${error.message}` };

    revalidatePath("/slack-reports");
    return { ok: true, message: `✓ "${name}" saved.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function setReportEnabled(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const enabled = str(formData, "enabled") === "true";
  const { error } = await sb().from("sdr_slack_reports").update({ enabled, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/slack-reports");
}

export async function deleteReport(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const { error } = await sb().from("sdr_slack_reports").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/slack-reports");
}

export async function duplicateReport(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const { data: original, error: readError } = await sb().from("sdr_slack_reports").select("*").eq("id", id).single();
  if (readError || !original) throw new Error(readError?.message ?? "report not found");
  const { id: _oldId, created_at: _createdAt, updated_at: _updatedAt, last_run_at: _lastRunAt, next_run_at: _nextRunAt, ...rest } = original;
  const { error } = await sb().from("sdr_slack_reports").insert({ ...rest, name: `${original.name} (copy)`, enabled: false });
  if (error) throw new Error(error.message);
  revalidatePath("/slack-reports");
}

// ── Test / manual send ────────────────────────────────────────────────────────

export async function sendTestReport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = str(formData, "id");
    const c = sb();
    const { data: report, error: reportError } = await c.from("sdr_slack_reports").select("*").eq("id", id).single();
    if (reportError || !report) return { ok: false, message: "Report not found." };
    const { data: destination, error: destError } = await c.from("sdr_slack_destinations").select("*").eq("id", report.slack_destination_id).single();
    if (destError || !destination) return { ok: false, message: "Slack destination not found." };

    const startedAt = Date.now();
    const scheduledFor = `test-${new Date().toISOString()}`;
    const { data: runRow } = await c.from("sdr_slack_report_runs").insert({
      report_id: id, scheduled_for: scheduledFor, status: "running", team: report.name, channel: destination.channel_label, triggered_by: "test",
    }).select("id").single();

    try {
      const report_data = await assembleCallBlitzReport({ managerKey: report.manager_key });
      const { text } = formatCallBlitzMessage(report_data, { test: true });
      await sendSlackMessage({ channelLabel: destination.channel_label, envVarKey: destination.env_var_key }, text);
      if (runRow) await c.from("sdr_slack_report_runs").update({ status: "success", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt }).eq("id", runRow.id);
      return { ok: true, message: `✓ Test report sent to ${destination.channel_label}.` };
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      if (runRow) await c.from("sdr_slack_report_runs").update({ status: "failed", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, error_message: message }).eq("id", runRow.id);
      return { ok: false, message: `Test send failed: ${message}` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Fires the ad-hoc "Run Now" workflow (slack-reports-run-once.yml) rather than sending inline —
 *  keeps a slow DB/Slack round-trip out of the Vercel request path (same reasoning as
 *  triggerOwnerPull() in app/admin/actions.ts). */
export async function runReportNow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = str(formData, "id");
    const token = process.env.GH_DISPATCH_TOKEN;
    const repo = process.env.GH_REPO ?? "salesops-lab/sdr-outreach-dashboard";
    if (!token) return { ok: false, message: "GH_DISPATCH_TOKEN is not configured — cannot dispatch a manual run." };
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/slack-reports-run-once.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { report_id: id } }),
    });
    if (res.status === 204) return { ok: true, message: "✓ Run dispatched — check Report History in a minute." };
    return { ok: false, message: `Dispatch failed (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
