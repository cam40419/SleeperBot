import { NextResponse } from "next/server";
import { analyzeAll } from "@/lib/analyze";
import { sendNotifications } from "@/lib/notifications";
import { getContext, getTrending } from "@/lib/sleeper";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const username = process.env.SLEEPER_USERNAME; if (!username) throw new Error("SLEEPER_USERNAME is missing");
    const { user, state, players, leagues } = await getContext(username);
    const trending = await getTrending();
    const analyses = await analyzeAll(leagues, user.user_id, players, state.display_week || state.week, trending);
    const notification = await sendNotifications(analyses, new URL(request.url).searchParams.get("urgent") === "1");
    return NextResponse.json({ ok: true, leagues: analyses.length, notification });
  } catch(error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Digest failed" }, { status: 500 }); }
}
