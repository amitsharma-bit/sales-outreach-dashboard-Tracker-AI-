/** Run history for one Slack report — GET /api/slack-reports/runs?reportId= */
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { resolveViewer } from "../../../../lib/access/resolve";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { data: { user } } = await supabaseServer().auth.getUser();
  const viewer = await resolveViewer(user?.email ?? "");
  if (!viewer.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ runs: [] });

  const { data, error } = await sb
    .from("sdr_slack_report_runs")
    .select("id,scheduled_for,started_at,finished_at,status,error_message,team,channel,duration_ms,triggered_by")
    .eq("report_id", reportId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
