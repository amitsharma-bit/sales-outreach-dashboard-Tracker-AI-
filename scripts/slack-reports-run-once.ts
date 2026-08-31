/** Ad-hoc single-report fire for the "Run Now" button — dispatched via GitHub Actions
 *  (slack-reports-run-once.yml) rather than run inline in a Vercel server action, so a slow
 *  DB/Slack round-trip can't hit a serverless timeout. Reads REPORT_ID from the environment. */
import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase/admin";
import { runOneReport } from "../lib/slackReports/scheduler";

async function main() {
  const reportId = process.env.REPORT_ID;
  if (!reportId) throw new Error("REPORT_ID env var is required");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("supabase unavailable");

  const { data: report, error: reportError } = await sb.from("sdr_slack_reports").select("*").eq("id", reportId).single();
  if (reportError || !report) throw new Error(`report ${reportId} not found: ${reportError?.message ?? ""}`);

  const { data: destination, error: destError } = await sb.from("sdr_slack_destinations").select("*").eq("id", report.slack_destination_id).single();
  if (destError || !destination) throw new Error(`destination for report ${reportId} not found: ${destError?.message ?? ""}`);

  const scheduledFor = `manual-${new Date().toISOString()}`;
  const result = await runOneReport(report, destination, { scheduledFor, triggeredBy: "manual" });
  if (!result.ok) throw new Error(result.error ?? "run failed");
  console.log(`[slack-reports] manual run of "${report.name}" succeeded`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("[slack-reports] manual run failed:", e); process.exit(1); });
