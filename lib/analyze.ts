import OpenAI from "openai";
import { getLeagueUsers, getRosters } from "./sleeper";
import type { League, LeagueAnalysis, Player, Recommendation, Roster } from "./types";

function name(p: Player) { return p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id; }
function availability(p: Player) {
  if (["Out", "IR", "PUP", "Suspended"].includes(p.injury_status ?? "")) return 0;
  if (p.injury_status === "Doubtful") return 0.2;
  if (p.injury_status === "Questionable") return 0.65;
  return 1;
}
function player(id: string, players: Record<string, Player>): Player {
  return players[id] ?? { player_id: id, full_name: id, position: id.length <= 3 ? "DEF" : "?" };
}

function deterministicRecommendations(starters: Player[], bench: Player[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const starter of starters.filter(p => availability(p) < 1)) {
    const replacement = bench.find(p => availability(p) === 1 && (p.position === starter.position || p.fantasy_positions?.includes(starter.position ?? "")));
    recs.push({
      priority: availability(starter) === 0 ? "urgent" : "high", type: starter.injury_status ? "injury" : "lineup",
      title: `${name(starter)} is ${starter.injury_status ?? starter.status}`,
      detail: replacement ? `${name(replacement)} is the healthiest same-position option currently on your bench.` : "No healthy same-position bench replacement was found.",
      action: replacement ? `Review swapping ${name(replacement)} in for ${name(starter)} in Sleeper.` : "Review waivers and the latest practice report.",
      confidence: replacement ? 0.86 : 0.72,
    });
  }
  if (!recs.length) recs.push({ priority: "low", type: "lineup", title: "No immediate availability conflicts", detail: "Every listed starter is currently marked active by Sleeper.", action: "Recheck before the first kickoff.", confidence: 0.9 });
  return recs;
}

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    recommendations: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        priority: { type: "string", enum: ["urgent", "high", "medium", "low"] },
        type: { type: "string", enum: ["lineup", "injury", "waiver", "trade", "draft", "news"] },
        title: { type: "string" }, detail: { type: "string" }, action: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 }, sourceUrls: { type: "array", items: { type: "string" } }
      }, required: ["priority", "type", "title", "detail", "action", "confidence", "sourceUrls"]
    }}
  }, required: ["summary", "recommendations"]
};

async function aiAnalysis(league: League, starters: Player[], bench: Player[], base: Recommendation[], freeAgents: Array<Player & { trendAdds?: number }> = []) {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const compact = (p: Player) => ({ id: p.player_id, name: name(p), team: p.team, position: p.position, injury: p.injury_status, notes: p.injury_notes, age: p.age });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
    tools: [{ type: "web_search" }],
    input: `You are a careful fantasy football decision analyst. Research current, dated NFL news for only the relevant players. League scoring and roster construction are authoritative. Never claim an action was executed. Give concise, risk-aware recommendations and include source URLs. Consider injury/practice status, role, matchup, weather, waiver opportunity, and dynasty implications when applicable. Trending candidates are unrostered in this league; trendAdds is Sleeper adds in the last 24 hours.\n\nLeague: ${JSON.stringify({ name: league.name, season: league.season, roster_positions: league.roster_positions, scoring: league.scoring_settings })}\nStarters: ${JSON.stringify(starters.map(compact))}\nBench: ${JSON.stringify(bench.map(compact))}\nTrending free agents: ${JSON.stringify(freeAgents.map(p => ({ ...compact(p), trendAdds: p.trendAdds })))}\nBaseline flags: ${JSON.stringify(base)}`,
    text: { format: { type: "json_schema", name: "fantasy_recommendations", strict: true, schema } },
  });
  return JSON.parse(response.output_text) as { summary: string; recommendations: Recommendation[] };
}

export async function analyzeLeague(league: League, userId: string, players: Record<string, Player>, week: number, trending: Array<{ player_id: string; count: number }> = []): Promise<LeagueAnalysis> {
  const [rosters, users] = await Promise.all([getRosters(league.league_id), getLeagueUsers(league.league_id)]);
  const roster = rosters.find(r => r.owner_id === userId) as Roster | undefined;
  if (!roster) throw new Error(`No roster owned by this Sleeper user in ${league.name}`);
  // Sleeper uses the repeated sentinel "0" for unfilled lineup slots.
  const starterIds = (roster.starters ?? []).filter(id => id && id !== "0");
  const starters = starterIds.map(id => player(id, players));
  const bench = (roster.players ?? []).filter(id => !starterIds.includes(id)).map(id => player(id, players));
  const injured = [...starters, ...bench].filter(p => p.injury_status && p.injury_status !== "NA");
  const base = deterministicRecommendations(starters, bench);
  const rostered = new Set(rosters.flatMap(r => r.players ?? []));
  const freeAgentTrends = trending.filter(t => !rostered.has(t.player_id)).slice(0, 12).map(t => ({ ...player(t.player_id, players), trendAdds: t.count }));
  let ai = null;
  try { ai = await aiAnalysis(league, starters, bench, base, freeAgentTrends); } catch (error) { console.error("AI analysis failed; using deterministic analysis", error); }
  const owner = users.find(u => u.user_id === userId);
  return {
    leagueId: league.league_id, leagueName: league.name, week, generatedAt: new Date().toISOString(),
    teamName: owner?.metadata?.team_name || owner?.display_name || "My Team", starters, bench, injured,
    recommendations: [...base, ...(ai?.recommendations ?? [])],
    summary: ai?.summary ?? `Roster synced. ${injured.length} player${injured.length === 1 ? " has" : "s have"} a current injury designation.`,
    isAiEnhanced: Boolean(ai),
  };
}

export async function analyzeAll(leagues: League[], userId: string, players: Record<string, Player>, week: number, trending: Array<{ player_id: string; count: number }> = []) {
  return Promise.all(leagues.map(l => analyzeLeague(l, userId, players, week, trending)));
}
