"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveDestination, removeDestination } from "../../app/slack-reports/actions";
import { Chip, Surface } from "../ui";

export interface DestinationRow {
  id: string;
  channel_label: string;
  env_var_key: string;
  active: boolean;
}

type Result = { ok: boolean; message: string } | null;

const inputCls = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-subtle";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-strong disabled:opacity-50">
      {pending ? "Saving…" : "Add destination"}
    </button>
  );
}

/** Admin-editable Slack destinations: a friendly channel label + which env var holds the webhook.
 *  The webhook URL itself is never entered here — only the name of the server-side env var. */
export default function DestinationsManager({ destinations }: { destinations: DestinationRow[] }) {
  const [state, formAction] = useFormState<Result, FormData>(saveDestination, null);

  return (
    <Surface className="p-4">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Slack Connections</h3>
      <p className="mb-3 text-xs text-ink-muted">
        Only a friendly channel name is stored here. The webhook URL lives server-side in the named env
        var and is never returned to the browser.
      </p>
      <ul className="mb-4 space-y-1.5 text-sm">
        {destinations.filter((d) => d.active).map((d) => (
          <li key={d.id} className="flex items-center justify-between">
            <span>
              <span className="font-semibold text-ink">{d.channel_label}</span>{" "}
              <Chip tone="neutral">{d.env_var_key}</Chip>
            </span>
            <form action={removeDestination}>
              <input type="hidden" name="id" value={d.id} />
              <button className="text-xs text-danger hover:underline">remove</button>
            </form>
          </li>
        ))}
        {destinations.filter((d) => d.active).length === 0 && (
          <li className="text-ink-muted">No Slack destinations configured yet.</li>
        )}
      </ul>
      {state && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${state.ok ? "border-good/30 bg-good-weak text-good" : "border-danger/30 bg-danger-weak text-danger"}`}>
          {state.message}
        </div>
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input name="channel_label" required placeholder="#team-vaibhav" className={inputCls} />
        <input name="env_var_key" required placeholder="SLACK_VAIBHAV_WEBHOOK" className={inputCls} />
        <SubmitButton />
      </form>
    </Surface>
  );
}
