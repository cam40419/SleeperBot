import { NextResponse } from "next/server";
import { analyzeLeague } from "@/lib/analyze";
import { isAuthenticated } from "@/lib/auth";
import { analyzeDraft } from "@/lib/draft";
import { answerWorkspaceQuestion } from "@/lib/question";
import { getLeagueView, getTrending } from "@/lib/sleeper";

type QuestionPayload = { leagueId?: string; userId?: string; workspace?: "team" | "draft"; question?: string };

export async function POST(request: Request) {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json() as QuestionPayload;
        const username = process.env.SLEEPER_USERNAME;
        if (!username || !body.leagueId || !body.workspace || !body.question?.trim()) {
            return NextResponse.json({ error: "Missing question context" }, { status: 400 });
        }

        const { viewedUser, state, players, league } = await getLeagueView(username, body.leagueId, body.userId);
        const analysis = body.workspace === "team"
            ? await analyzeLeague(league, viewedUser.user_id, players, state.display_week || state.week, await getTrending())
            : await analyzeDraft(league, viewedUser.user_id, players);

        return NextResponse.json(await answerWorkspaceQuestion({ kind: body.workspace, question: body.question.trim(), league, viewedUser, analysis }));
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Question failed" }, { status: 500 });
    }
}