/** Slack Incoming Webhook delivery. The webhook URL is resolved from `process.env[envVarKey]` at
 *  send time ONLY — never stored in the DB, never returned by any API route, never logged.
 *  Errors name the channel label + env var KEY NAME, never the resolved URL (safe to persist in
 *  sdr_slack_report_runs.error_message or show in the admin UI). */
export interface SlackDestinationRef {
  channelLabel: string;
  envVarKey: string;
}

export async function sendSlackMessage(destination: SlackDestinationRef, text: string): Promise<void> {
  const url = process.env[destination.envVarKey];
  if (!url) {
    throw new Error(`Slack webhook env var "${destination.envVarKey}" is not set — cannot send to ${destination.channelLabel}.`);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    throw new Error(`Slack delivery to ${destination.channelLabel} failed: ${e instanceof Error ? e.message : "network error"}.`);
  }
  if (!res.ok) {
    throw new Error(`Slack webhook for ${destination.channelLabel} returned HTTP ${res.status}.`);
  }
}
