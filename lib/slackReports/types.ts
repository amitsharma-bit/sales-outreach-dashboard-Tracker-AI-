/** Shared shapes for the Slack Reports module — mirrors the sdr_slack_* tables (supabase/sdr_schema.sql). */

export type SlackReportType = "call_blitz";

export interface ReportSchedule {
  daysOfWeek: number[]; // 0=Sun .. 6=Sat (JS Date.getDay convention, used consistently throughout)
  time1: string; // "HH:MM", 24h, wall-clock in the report's configured timezone
  time2: string | null; // optional second daily send
}

export interface SlackDestination {
  id: string;
  channelLabel: string; // e.g. "#team-vaibhav" — display only, never a webhook URL
  envVarKey: string; // e.g. "SLACK_VAIBHAV_WEBHOOK" — resolved server-side at send time
  active: boolean;
}

export interface SlackReportConfig {
  id: string;
  name: string;
  reportType: SlackReportType;
  managerKey: string; // → sdr_managers.manager_key (team scope)
  slackDestinationId: string;
  enabled: boolean;
  timezone: string; // IANA tz name — governs WHEN the scheduler fires, never the reporting day
  schedule: ReportSchedule;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export type SlackReportRunStatus = "running" | "success" | "failed" | "skipped";
export type SlackReportTrigger = "scheduler" | "test" | "manual";

export interface SlackReportRun {
  id: string;
  reportId: string;
  scheduledFor: string;
  startedAt: string;
  finishedAt: string | null;
  status: SlackReportRunStatus;
  errorMessage: string | null;
  team: string | null;
  channel: string | null;
  durationMs: number | null;
  triggeredBy: SlackReportTrigger;
}
