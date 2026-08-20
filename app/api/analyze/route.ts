import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { analyzeLeague } from "@/lib/analyze";
import { getLeagueView, getTrending } from "@/lib/sleeper";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const leagueId = params.get("leagueId");
    const userId = params.get("userId") ?? undefined;
    const username = process.env.SLEEPER_USERNAME;
    if (!username || !leagueId) return NextResponse.json({ error: "Missing configuration or league" }, { status: 400 });
    const { viewedUser, state, players, league } = await getLeagueView(username, leagueId, userId);
    const trending = await getTrending();
    return NextResponse.json(await analyzeLeague(league, viewedUser.user_id, players, state.display_week || state.week, trending));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed" }, { status: 500 }); }
}
