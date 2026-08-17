import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { analyzeDraft } from "@/lib/draft";
import { getContext } from "@/lib/sleeper";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const leagueId = new URL(request.url).searchParams.get("leagueId"); const username = process.env.SLEEPER_USERNAME;
    if (!username || !leagueId) return NextResponse.json({ error: "Missing configuration or league" }, { status: 400 });
    const { user, players, leagues } = await getContext(username); const league = leagues.find(l => l.league_id === leagueId);
    if (!league) return NextResponse.json({ error: "League not found for configured Sleeper user" }, { status: 404 });
    return NextResponse.json(await analyzeDraft(league, user.user_id, players));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Draft analysis failed" }, { status: 500 }); }
}
