import OpenAI from "openai";
import { getDraftPicks, getDrafts, getRosters } from "./sleeper";
import type { DraftAnalysis, DraftCandidate, DraftPick, League, Player } from "./types";

const FLEX = new Set(["QB", "RB", "WR", "TE"]);
const POSITION_VALUE: Record<string, number> = { RB: 8, WR: 8, QB: 5, TE: 5, K: -20, DEF: -12 };
const POSITION_LABEL: Record<string, string> = { QB: "quarterback", RB: "running back", WR: "wide receiver", TE: "tight end" };

function playerName(p: Player) { return p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id; }

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function positionTargets(positions: string[]) {
  const counts: Record<string, number> = {};
  for (const pos of positions) {
    if (["BN", "IR", "TAXI"].includes(pos)) continue;
    if (pos.includes("FLEX")) { counts.RB = (counts.RB ?? 0) + .7; counts.WR = (counts.WR ?? 0) + .9; counts.TE = (counts.TE ?? 0) + .25; if (pos.includes("SUPER")) counts.QB = (counts.QB ?? 0) + .7; }
    else counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const bench = positions.filter(p => p === "BN").length;
  counts.RB = Math.ceil((counts.RB ?? 0) + bench * .32);
  counts.WR = Math.ceil((counts.WR ?? 0) + bench * .4);
  counts.QB = Math.ceil((counts.QB ?? 0) + bench * .1);
  counts.TE = Math.ceil((counts.TE ?? 0) + bench * .1);
  return counts;
}

function nextPick(slot: number | null, teams: number, completed: number, rounds: number) {
  if (!slot || !teams) return null;
  for (let round = 1; round <= rounds; round++) {
    const inRound = round % 2 ? slot : teams - slot + 1;
    const overall = (round - 1) * teams + inRound;
    if (overall > completed) return overall;
  }
  return null;
}

function scoringProfile(league: League) {
  const ppr = Number(league.scoring_settings.rec ?? 0);
  const teReception = Number(league.scoring_settings.bonus_rec_te ?? league.scoring_settings.rec_te ?? ppr);
  const qbPassingTd = Number(league.scoring_settings.pass_td ?? 4);
  const qbSlots = league.roster_positions.filter(position => position === "QB" || position.includes("SUPER_FLEX")).length;
  const wrSlots = league.roster_positions.filter(position => position === "WR").length;
  const rbSlots = league.roster_positions.filter(position => position === "RB").length;
  return {
    ppr,
    teReception,
    qbPassingTd,
    qbSlots,
    wrSlots,
    rbSlots,
    isSuperflex: league.roster_positions.some(position => position.includes("SUPER_FLEX")),
    hasFlex: league.roster_positions.some(position => position.includes("FLEX")),
    tePremium: teReception > ppr,
    rounds: league.roster_positions.filter(position => !["IR", "TAXI"].includes(position)).length
  };
}

function currentRound(currentPick: number, teams: number) {
  return Math.max(1, Math.ceil(currentPick / Math.max(teams, 1)));
}

function phaseLabel(round: number, rounds: number) {
  if (round <= 4) return "early";
  if (round >= Math.max(rounds - 3, 8)) return "late";
  return "middle";
}

function strategyBonuses(position: string, round: number, drafted: Record<string, number>, needs: Record<string, number>, profile: ReturnType<typeof scoringProfile>) {
  const need = needs[position] ?? 0;
  const alreadyDrafted = drafted[position] ?? 0;
  let bonus = need * 6;

  if (position === "QB") {
    if (profile.isSuperflex) bonus += round <= 5 ? 16 : 10;
    else bonus += round <= 5 ? -12 : alreadyDrafted === 0 ? 8 : -4;
  }

  if (position === "WR") {
    bonus += profile.ppr * 6;
    bonus += profile.wrSlots >= 3 ? 5 : 2;
    bonus += round <= 6 ? 5 : 2;
  }

  if (position === "RB") {
    bonus += profile.ppr >= 1 ? 1 : 5;
    bonus += round <= 6 ? 4 : alreadyDrafted === 0 ? 7 : 2;
  }

  if (position === "TE") {
    bonus += profile.tePremium ? 10 : 0;
    bonus += round >= 5 && alreadyDrafted === 0 ? 6 : round <= 3 && !profile.tePremium ? -4 : 0;
  }

  return bonus;
}

function buildCandidateRationale(player: Player, round: number, need: number, profile: ReturnType<typeof scoringProfile>, scarcity: number) {
  const parts = [`Sleeper rank ${player.search_rank ?? "—"}`];
  if (need > 0) parts.push(`fills ${need} open ${player.position} target${need === 1 ? "" : "s"}`);
  if (player.position === "WR" && profile.ppr > 0) parts.push(`fits a ${profile.ppr >= 1 ? "full" : "half"}-PPR build`);
  if (player.position === "QB" && profile.isSuperflex) parts.push("matches superflex quarterback scarcity");
  if (player.position === "TE" && profile.tePremium) parts.push("benefits from TE-premium scoring");
  if (scarcity <= 4) parts.push(`${player.position} is thinning in the live pool`);
  if (round >= 9 && (player.position === "RB" || player.position === "WR")) parts.push("adds late-round upside depth");
  return `${POSITION_LABEL[player.position ?? ""] ?? player.position ?? "Player"} value: ${parts.join("; ")}.`;
}

function buildStrategy(league: League, currentPick: number, nextUserPick: number | null, drafted: Record<string, number>, needs: Record<string, number>, targets: Record<string, number>) {
  const profile = scoringProfile(league);
  const teams = Math.max(Number(league.total_rosters), 1);
  const round = currentRound(currentPick, teams);
  const phase = phaseLabel(round, profile.rounds);
  const gap = nextUserPick ? Math.max(0, nextUserPick - currentPick) : null;
  const primaryNeed = Object.entries(needs)
    .filter(([, need]) => need > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "WR";
  const secondaryNeed = Object.entries(needs)
    .filter(([position, need]) => need > 0 && position !== primaryNeed)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const core = [] as string[];

  if (phase === "early") {
    core.push(profile.isSuperflex ? "Prioritize quarterbacks and anchor skill players before the room strips out difference-makers." : "Build around WR/RB anchors and avoid forcing a one-QB pick before the board makes it necessary.");
  } else if (phase === "middle") {
    core.push("Convert roster needs into starting lineup coverage, then break ties with positional scarcity instead of raw ADP.");
  } else {
    core.push("Chase weekly ceiling and fragile-position depth, not safe bench fillers.");
  }

  core.push(`Your build still needs ${POSITION_LABEL[primaryNeed] ?? primaryNeed}${secondaryNeed ? `, with ${POSITION_LABEL[secondaryNeed] ?? secondaryNeed} next in line` : ""}.`);

  if (profile.tePremium && (drafted.TE ?? 0) === 0 && round <= 7) core.push("Tight end scoring is boosted here, so an efficient TE value should stay in the live plan.");
  if (!profile.isSuperflex && (drafted.QB ?? 0) === 0 && round <= 6) core.push("At one-QB, you can still let the room reach first unless a clear top tier falls.");
  if (gap !== null) core.push(gap > teams ? `You are ${gap} picks away, so secure positions that can run dry before the board comes back.` : `You pick again in ${gap} selections, so take the best value now and plan the next turn as a two-pick pocket.`);

  const targetSummary = Object.entries(targets)
    .filter(([, target]) => target > 0)
    .sort((a, b) => (needs[b[0]] ?? 0) - (needs[a[0]] ?? 0))
    .slice(0, 3)
    .map(([position, target]) => `${position} ${drafted[position] ?? 0}/${target}`)
    .join(" · ");

  return `${core.join(" ")} Current roster pacing: ${targetSummary}.`;
}

function baselineCandidates(players: Record<string, Player>, picked: Set<string>, needs: Record<string, number>, league: League, drafted: Record<string, number>, currentPick: number) {
  const profile = scoringProfile(league);
  const teams = Math.max(Number(league.total_rosters), 1);
  const round = currentRound(currentPick, teams);
  const available = Object.values(players)
    .filter(p => !picked.has(p.player_id) && p.team && p.position && FLEX.has(p.position) && p.status !== "Inactive" && (p.search_rank ?? 99999) > 0)
    .sort((a, b) => (a.search_rank ?? 99999) - (b.search_rank ?? 99999))
    .slice(0, 90);
  const scarcityWindow = available.slice(0, 30).reduce<Record<string, number>>((counts, player) => {
    counts[player.position!] = (counts[player.position!] ?? 0) + 1;
    return counts;
  }, {});

  return available
    .map((p, index): DraftCandidate => {
      const needBoost = Math.min(18, (needs[p.position!] ?? 0) * 4);
      const baseValue = Math.max(1, 100 - (p.search_rank ?? index + 1) * .72 + (POSITION_VALUE[p.position!] ?? 0));
      const scarcity = scarcityWindow[p.position!] ?? 10;
      const scarcityBoost = clamp(10 - scarcity, 0, 8);
      const strategicBoost = strategyBonuses(p.position!, round, drafted, needs, profile);
      const fitScore = clamp(Math.round(baseValue + needBoost + scarcityBoost + strategicBoost), 1, 99);
      return {
        player: p,
        rank: index + 1,
        tier: Math.floor(index / 8) + 1,
        fitScore,
        valueScore: Math.round(baseValue + strategicBoost),
        rationale: buildCandidateRationale(p, round, needs[p.position!] ?? 0, profile, scarcity),
        risk: p.injury_status ? `Current designation: ${p.injury_status}` : round <= 6 ? "Do not bypass a cleaner tier break without confirming this player is the best board value." : "Confirm role security and contingent upside before drafting.",
        sourceUrls: []
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || (a.player.search_rank ?? 99999) - (b.player.search_rank ?? 99999))
    .slice(0, 60)
    .map((candidate, index) => ({ ...candidate, rank: index + 1, tier: Math.floor(index / 8) + 1 }));
}

const draftSchema = {
  type: "object", additionalProperties: false,
  properties: {
    strategy: { type: "string" },
    candidates: {
      type: "array", minItems: 5, maxItems: 12, items: {
        type: "object", additionalProperties: false,
        properties: { player_id: { type: "string" }, rationale: { type: "string" }, risk: { type: "string" }, fitScore: { type: "number", minimum: 0, maximum: 100 }, sourceUrls: { type: "array", items: { type: "string" } } },
        required: ["player_id", "rationale", "risk", "fitScore", "sourceUrls"]
      }
    }
  }, required: ["strategy", "candidates"]
};

async function enhanceDraft(league: League, baseline: DraftCandidate[], myPicks: DraftPick[], needs: Record<string, number>, currentPick: number, nextUserPick: number | null) {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-sol", tools: [{ type: "web_search" }],
    input: `Act as an evidence-driven fantasy football draft room analyst. Research current 2026 rankings, camp news, injuries, roles, and ADP for the supplied available players only. Respect this league's exact scoring and lineup. Recommend the best team-building choices now, balancing value, scarcity, floor, upside, and roster construction. Never say a pick was submitted. Return only candidates from the supplied player IDs and cite current source URLs.\nLeague: ${JSON.stringify({ positions: league.roster_positions, scoring: league.scoring_settings, teams: league.total_rosters })}\nCurrent overall pick: ${currentPick}; next manager pick: ${nextUserPick ?? "unknown"}\nNeeds: ${JSON.stringify(needs)}\nManager picks: ${JSON.stringify(myPicks)}\nAvailable candidate pool: ${JSON.stringify(baseline.slice(0, 35).map(c => ({ id: c.player.player_id, name: playerName(c.player), position: c.player.position, team: c.player.team, age: c.player.age, years_exp: c.player.years_exp, sleeper_rank: c.player.search_rank, baseline_value: c.valueScore })))}`,
    text: { format: { type: "json_schema", name: "draft_room", strict: true, schema: draftSchema } }
  });
  return JSON.parse(response.output_text) as { strategy: string; candidates: Array<{ player_id: string; rationale: string; risk: string; fitScore: number; sourceUrls: string[] }> };
}

function mergeCandidates(
  baseline: DraftCandidate[],
  ai: Awaited<ReturnType<typeof enhanceDraft>>
) {
  if (!ai) return baseline.slice(0, 12);

  const byId = new Map(baseline.map(candidate => [candidate.player.player_id, candidate]));
  const seen = new Set<string>();
  const merged: DraftCandidate[] = [];

  for (const item of ai.candidates) {
    if (seen.has(item.player_id)) continue;
    const base = byId.get(item.player_id);
    if (!base) continue;
    seen.add(item.player_id);
    merged.push({
      ...base,
      rank: merged.length + 1,
      fitScore: Math.round(item.fitScore),
      rationale: item.rationale,
      risk: item.risk,
      sourceUrls: item.sourceUrls
    });
  }

  for (const candidate of baseline) {
    if (merged.length >= 12) break;
    if (seen.has(candidate.player.player_id)) continue;
    seen.add(candidate.player.player_id);
    merged.push({ ...candidate, rank: merged.length + 1 });
  }

  return merged;
}

export async function analyzeDraft(
  league: League,
  userId: string,
  players: Record<string, Player>,
  options?: { useAiEnhancement?: boolean }
): Promise<DraftAnalysis> {
  const [drafts, rosters] = await Promise.all([getDrafts(league.league_id), getRosters(league.league_id)]);
  const draft = drafts.find(d => d.status === "drafting") ?? drafts.find(d => d.status === "pre_draft") ?? drafts[0] ?? null;
  const picks = draft ? await getDraftPicks(draft.draft_id) : [];
  const roster = rosters.find(r => r.owner_id === userId);
  const userSlot = draft?.draft_order?.[userId] ?? null;
  const myPicks = picks.filter(p => p.picked_by === userId || (roster && Number(p.roster_id) === roster.roster_id));
  const targets = positionTargets(league.roster_positions);
  const drafted: Record<string, number> = {};
  for (const pick of myPicks) { const pos = players[pick.player_id]?.position; if (pos) drafted[pos] = (drafted[pos] ?? 0) + 1; }
  const needs = Object.fromEntries(Object.entries(targets).map(([pos, target]) => [pos, Math.max(0, target - (drafted[pos] ?? 0))]));
  const rosterNeeds = Object.entries(targets).map(([position, target]) => ({ position, target, drafted: drafted[position] ?? 0, need: needs[position] ?? 0 })).sort((a, b) => b.need - a.need);
  const picked = new Set(picks.map(p => p.player_id));
  const teams = Number(draft?.settings.teams ?? league.total_rosters);
  const rounds = Number(draft?.settings.rounds ?? league.roster_positions.length);
  const currentPick = picks.length + 1;
  const nextUserPick = nextPick(userSlot, teams, picks.length, rounds);
  const strategy = buildStrategy(league, currentPick, nextUserPick, drafted, needs, targets);
  const baseline = baselineCandidates(players, picked, needs, league, drafted, currentPick);
  let ai = null;
  const allowAiEnhancement = options?.useAiEnhancement ?? true;
  if (allowAiEnhancement) {
    try { ai = await enhanceDraft(league, baseline, myPicks, needs, currentPick, nextUserPick); } catch (error) { console.error("Draft AI enhancement failed", error); }
  }
  const candidates = mergeCandidates(baseline, ai);
  return {
    leagueId: league.league_id,
    leagueName: league.name,
    generatedAt: new Date().toISOString(),
    status: draft?.status ?? "not_created",
    draft,
    picks,
    myPicks,
    userSlot,
    currentPick,
    nextUserPick,
    rosterNeeds,
    candidates,
    strategy: ai?.strategy ?? (allowAiEnhancement ? strategy : `${strategy} Live draft mode keeps this board tied to the latest Sleeper picks instead of waiting on slower external research.`),
    isAiEnhanced: Boolean(ai)
  };
}
