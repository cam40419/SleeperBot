import OpenAI from "openai";
import type { AgentAnswer, DraftAnalysis, League, LeagueAnalysis, LeagueMember } from "./types";

type Workspace = "team" | "draft";

const answerSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        answer: { type: "string" },
        sourceUrls: { type: "array", items: { type: "string" } }
    },
    required: ["answer", "sourceUrls"]
};

function memberLabel(member: LeagueMember) {
    return member.metadata?.team_name || member.display_name || member.username;
}

function fallbackAnswer(kind: Workspace, question: string, analysis: LeagueAnalysis | DraftAnalysis): AgentAnswer {
    if (kind === "team") {
        const teamAnalysis = analysis as LeagueAnalysis;
        const topRecommendations = teamAnalysis.recommendations.slice(0, 3).map(rec => `${rec.title}: ${rec.action}`).join(" ");
        return {
            answer: `AI question answering is unavailable right now. For "${question}", the current roster summary is: ${teamAnalysis.summary} Top actions: ${topRecommendations || "No immediate actions flagged."}`,
            sourceUrls: [],
            generatedAt: new Date().toISOString()
        };
    }

    const draftAnalysis = analysis as DraftAnalysis;
    const topCandidates = draftAnalysis.candidates.slice(0, 3).map(candidate => `${candidate.player.full_name || candidate.player.first_name || candidate.player.player_id} (${candidate.player.position})`).join(", ");
    return {
        answer: `AI question answering is unavailable right now. For "${question}", the current draft plan is: ${draftAnalysis.strategy} Best available targets: ${topCandidates || "No draft board candidates available yet."}`,
        sourceUrls: [],
        generatedAt: new Date().toISOString()
    };
}

export async function answerWorkspaceQuestion(params: {
    kind: Workspace;
    question: string;
    league: League;
    viewedUser: LeagueMember;
    analysis: LeagueAnalysis | DraftAnalysis;
}): Promise<AgentAnswer> {
    const { kind, question, league, viewedUser, analysis } = params;
    if (!process.env.OPENAI_API_KEY) return fallbackAnswer(kind, question, analysis);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const input = kind === "team"
        ? `You are a fantasy football team analyst answering a user question about a specific roster. Use the supplied roster analysis as the primary source of truth and supplement with current 2026 NFL news only when it sharpens the answer. Keep the answer concise, practical, and explicit about uncertainty. Never claim any action was executed.

Viewed manager: ${memberLabel(viewedUser)} (@${viewedUser.username})
League: ${JSON.stringify({ name: league.name, season: league.season, roster_positions: league.roster_positions, scoring: league.scoring_settings })}
Roster analysis: ${JSON.stringify(analysis)}
Question: ${question}`
        : `You are a fantasy football draft analyst answering a user question about a specific draft board. Use the supplied live draft analysis as the primary source of truth and supplement with current 2026 NFL news, ADP, camp reports, or injury updates only when it sharpens the answer. Keep the answer concise, practical, and explicit about uncertainty. Never claim any action was executed.

Viewed manager: ${memberLabel(viewedUser)} (@${viewedUser.username})
League: ${JSON.stringify({ name: league.name, season: league.season, roster_positions: league.roster_positions, scoring: league.scoring_settings, teams: league.total_rosters })}
Draft analysis: ${JSON.stringify(analysis)}
Question: ${question}`;

    const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
        tools: [{ type: "web_search" }],
        input,
        text: { format: { type: "json_schema", name: "workspace_answer", strict: true, schema: answerSchema } }
    });

    const parsed = JSON.parse(response.output_text) as { answer: string; sourceUrls: string[] };
    return { ...parsed, generatedAt: new Date().toISOString() };
}