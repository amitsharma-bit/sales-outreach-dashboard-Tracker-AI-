/** Pure scheduling-window checks — no I/O, so unit-testable and safe to import anywhere. Split out
 *  of scheduler.ts because that module imports the server-only Supabase admin client, which vitest
 *  cannot load (see CLAUDE.md: never import a server-only-guarded module from a test). */
import { ReportSchedule } from "./types";

const DEFAULT_TOLERANCE_MINUTES = 10; // matches the heartbeat's fire-check cadence
const DAY_MS = 86_400_000;

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** Civil (year,month,day,weekday 0=Sun..6=Sat,hour,minute) for `nowMs` in the given IANA tz. */
export function wallClockParts(nowMs: number, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(nowMs)) if (p.type !== "literal") parts[p.type] = Number(p.value);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay(); // 0=Sun..6=Sat
  return { year: parts.year, month: parts.month, day: parts.day, weekday, hour: parts.hour, minute: parts.minute };
}

/** Offset (ms) to ADD to a UTC instant to get this tz's wall-clock time — same correction-pass
 *  technique as lib/sync/buckets.ts's etMidnightUtcMs, generalized to an arbitrary IANA tz. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = wallClockParts(utcMs, tz);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, second: "2-digit", hourCycle: "h23" });
  const second = Number(fmt.format(utcMs));
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, second);
  return asIfUtc - utcMs;
}

/** UTC ms for a civil Y-M-D H:M wall-clock time in `tz`. One correction pass (as in
 *  etMidnightUtcMs) — fine for the whole-minute schedule times this module deals with. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = naive - tzOffsetMs(naive, tz);
  return naive - tzOffsetMs(guess, tz);
}

/** Is `report` due right now, and if so what's its idempotency slot key ("YYYY-MM-DDTHH:MM" in the
 *  report's configured tz)? Returns null if not due. Pure — no I/O. */
export function dueSlotFor(
  report: { timezone: string; schedule: ReportSchedule },
  nowMs: number,
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES,
): string | null {
  const p = wallClockParts(nowMs, report.timezone);
  if (!report.schedule.daysOfWeek.includes(p.weekday)) return null;
  const nowMinutes = p.hour * 60 + p.minute;
  const ymd = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  for (const t of [report.schedule.time1, report.schedule.time2]) {
    if (!t) continue;
    const [h, m] = t.split(":").map(Number);
    const schedMinutes = h * 60 + m;
    if (nowMinutes >= schedMinutes && nowMinutes < schedMinutes + toleranceMinutes) {
      return `${ymd}T${t}`;
    }
  }
  return null;
}

/** The next UTC ms instant (strictly after `nowMs`) at which `report` is scheduled to fire, or
 *  null if it has no times/days configured. Searches up to 8 days ahead (covers any single
 *  disallowed day-of-week plus normal DST slop) — pure, no I/O, used for the "Next Run" UI label. */
export function nextRunAt(report: { timezone: string; schedule: ReportSchedule }, nowMs: number): number | null {
  const times = [report.schedule.time1, report.schedule.time2].filter((t): t is string => !!t);
  if (times.length === 0 || report.schedule.daysOfWeek.length === 0) return null;

  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const probe = wallClockParts(nowMs + dayOffset * DAY_MS, report.timezone);
    if (!report.schedule.daysOfWeek.includes(probe.weekday)) continue;
    const candidates = times
      .map((t) => {
        const [h, m] = t.split(":").map(Number);
        return zonedTimeToUtc(probe.year, probe.month, probe.day, h, m, report.timezone);
      })
      .filter((ms) => ms > nowMs)
      .sort((a, b) => a - b);
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}
