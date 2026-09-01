/**
 * Slack Reports scheduler — checked every ~10 min by a self-redispatching GitHub Actions
 * heartbeat (.github/workflows/slack-reports-heartbeat.yml), the same pattern already proven by
 * spine-delta-heartbeat.yml (plain `schedule:` cron is confirmed throttled on this repo).
 *
 * Report identity/team/channel/schedule are a static list (config/slack-reports.ts). The one bit
 * of runtime state — is the automatic schedule currently on? — lives in lib/slackReports/state.ts
 * (reusing the existing sdr_sync_state table) so the "Stop Schedule"/"Start Schedule" button can
 * flip it without a redeploy. Idempotency of a single fire still comes from cadence, not a claimed
 * row — dueSlotFor's tolerance window (10 min) equals the heartbeat's loop interval, and
 * `concurrency: cancel-in-progress: true` guarantees only one loop instance runs at a time, so
 * under normal operation each configured time fires exactly once. Accepted tradeoff: a redispatch
 * race could in theory cause one duplicate Slack message — never data loss.
 */
import { SLACK_REPORTS, SlackReportConfig } from "../../config/slack-reports";
import { assembleCallBlitzReport } from "./build";
import { renderCallBlitzImage } from "./renderImage";
import { sendSlackImage } from "./deliver";
import { dueSlotFor, nextRunAt } from "./dueSlot";
import { isScheduleEnabled, recordRunResult, RunStage } from "./state";

export { dueSlotFor, nextRunAt };

export interface SchedulerRunResult { checked: number; fired: number; skipped: number; errors: number; }

/** Runs one report immediately (bypasses the due-time check) — used by the scheduler once a
 *  report is due, and directly by the "Send Test" / "Run Now" one-shot script. Renders an image
 *  matching the web Preview panel exactly (same CallBlitzReport data, same excludeOwnerNames) and
 *  posts it via the Slack Bot Token file-upload flow — Incoming Webhooks can't upload files.
 *  Test sends are NOT recorded as a "last run" (that status reflects real production sends only). */
export async function runOneReport(report: SlackReportConfig, opts: { test?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const startedAt = Date.now();
  let stage: RunStage = "image";
  try {
    const reportData = await assembleCallBlitzReport({ managerKey: report.managerKey, excludeOwnerNames: report.excludeOwnerNames });
    const png = await renderCallBlitzImage(reportData, { test: opts.test });
    stage = "slack";
    await sendSlackImage(report.channelId, png, {
      title: `Call Blitz Report — ${report.name}`,
      caption: `📊 CALL BLITZ REPORT\n${reportData.reportDateEt} · ${reportData.teamName}`,
      test: opts.test,
    });
    console.log(`[slack-reports] ${opts.test ? "TEST " : ""}sent "${report.name}" to channel ${report.channelId}`);
    if (!opts.test) await recordRunResult(report.key, { ok: true, durationMs: Date.now() - startedAt });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error(`[slack-reports] "${report.name}" failed:`, message);
    if (!opts.test) await recordRunResult(report.key, { ok: false, stage, error: message, durationMs: Date.now() - startedAt });
    return { ok: false, error: message };
  }
}

/** The recurring scheduler pass: checks every report whose automatic schedule is currently on
 *  (config default, overridden by the DB toggle) and fires the ones that are due. Never throws
 *  out of the loop — one report's failure doesn't block the rest. */
export async function runScheduler(nowMs = Date.now()): Promise<SchedulerRunResult> {
  let fired = 0, skipped = 0, errors = 0;
  for (const report of SLACK_REPORTS) {
    const active = await isScheduleEnabled(report.key, report.enabled);
    if (!active) { skipped++; continue; }
    const slot = dueSlotFor(report, nowMs);
    if (!slot) { skipped++; continue; }
    console.log(`[slack-reports] "${report.name}" due for slot ${slot}`);
    const result = await runOneReport(report);
    if (result.ok) fired++; else errors++;
  }
  return { checked: SLACK_REPORTS.length, fired, skipped, errors };
}
