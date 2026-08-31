/**
 * Slack Reports config — plain code, not a database table. For a small, fixed set of
 * teams/channels/schedules, a DB-backed admin UI is unnecessary overhead (extra tables, RLS,
 * PostgREST schema-cache sync). Same pattern as config/team-structure.ts: a developer edits this
 * file and redeploys to add/change a report — no migration, no schema to apply.
 *
 * Delivery is an image (rendered to match the web Preview panel exactly), posted via a Slack Bot
 * Token file upload — Incoming Webhooks can't upload files. `channelId` is the Slack channel's ID
 * (not a secret, just an identifier — e.g. "C0123ABC456", found via channel details in Slack), and
 * the ONE shared `SLACK_BOT_TOKEN` env var (lib/slackReports/deliver.ts) authenticates the upload.
 */
import { ReportSchedule } from "../lib/slackReports/types";

export interface SlackReportConfig {
  key: string; // stable id — used by the "Send Test"/"Run Now" actions, never shown to users
  name: string;
  reportType: "call_blitz";
  managerKey: string; // → sdr_managers.manager_key (existing team scope, unchanged)
  channelLabel: string; // e.g. "#team-vaibhav" — display only
  channelId: string; // Slack channel ID (e.g. "C0123ABC456") — where the image is posted
  enabled: boolean;
  timezone: string; // IANA tz — governs WHEN the scheduler fires, never the reporting day
  schedule: ReportSchedule;
  /** Roster display names (sdr_roster.name, case-insensitive) to leave out of BOTH the table rows
   *  and TEAM TOTAL entirely — e.g. a player-coach manager who doesn't want his own light call
   *  volume skewing or appearing in his team's report. */
  excludeOwnerNames?: string[];
}

export const SLACK_REPORTS: SlackReportConfig[] = [
  {
    key: "vaibhav-call-blitz",
    name: "Vaibhav Call Blitz",
    reportType: "call_blitz",
    managerKey: "vaibhav",
    channelLabel: "#team-vaibhav",
    channelId: "REPLACE_WITH_TEAM_VAIBHAV_CHANNEL_ID",
    enabled: true,
    timezone: "Asia/Kolkata",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time1: "21:30", time2: "02:55" },
  },
  {
    key: "rajveer-call-blitz",
    name: "Rajveer Call Blitz",
    reportType: "call_blitz",
    managerKey: "rajveer",
    channelLabel: "#team-rajveer",
    channelId: "REPLACE_WITH_TEAM_RAJVEER_CHANNEL_ID",
    enabled: true,
    timezone: "Asia/Kolkata",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time1: "21:30", time2: "02:55" },
    excludeOwnerNames: ["Rajveer Singh"],
  },
];

export function getSlackReport(key: string): SlackReportConfig | undefined {
  return SLACK_REPORTS.find((r) => r.key === key);
}
