import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { analyzeDraft } from "@/lib/draft";
import { getLeagueView } from "@/lib/sleeper";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const leagueId = params.get("leagueId");
    const userId = params.get("userId") ?? undefined;
    const mode = params.get("mode");
    const username = process.env.SLEEPER_USERNAME;
    if (!username || !leagueId) return NextResponse.json({ error: "Missing configuration or league" }, { status: 400 });
    const { viewedUser, players, league } = await getLeagueView(username, leagueId, userId);
    return NextResponse.json(await analyzeDraft(league, viewedUser.user_id, players, { useAiEnhancement: mode !== "live" }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Draft analysis failed" }, { status: 500 }); }
}
