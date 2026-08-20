import type { DashboardContext, Draft, DraftPick, League, LeagueMember, NFLState, Player, Roster, SleeperUser } from "./types";

const API = "https://api.sleeper.app/v1";

type SleeperOptions = { revalidate?: number; useNextCache?: boolean };

async function sleeper<T>(path: string, options: number | SleeperOptions = 60): Promise<T> {
  const { revalidate, useNextCache } = typeof options === "number"
    ? { revalidate: options, useNextCache: true }
    : { revalidate: options.revalidate ?? 60, useNextCache: options.useNextCache ?? true };
  let response: Response;
  try {
    response = await fetch(
      `${API}${path}`,
      useNextCache ? { next: { revalidate } } : { cache: "no-store" }
    );
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error.cause as { code?: string } | undefined) : undefined;
    if (cause?.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      throw new Error("Sleeper TLS certificate is not trusted by Node. On a TLS-inspected network, start locally with `npm run dev:system-ca`.");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Sleeper API failed (${response.status}) for ${path}`);
  return response.json() as Promise<T>;
}

export const getUser = (username: string) => sleeper<SleeperUser>(`/user/${encodeURIComponent(username)}`, 3600);
export const getState = () => sleeper<NFLState>("/state/nfl", 300);
export const getLeagues = (userId: string, season: string) =>
  sleeper<League[]>(`/user/${userId}/leagues/nfl/${season}`, 300);
export const getRosters = (leagueId: string) => sleeper<Roster[]>(`/league/${leagueId}/rosters`, 60);
export const getLeagueUsers = (leagueId: string) => sleeper<LeagueMember[]>(`/league/${leagueId}/users`, 300);
export const getMatchups = (leagueId: string, week: number) =>
  sleeper<Array<{ roster_id: number; starters: string[]; players: string[]; points: number; matchup_id: number }>>(`/league/${leagueId}/matchups/${week}`, 60);
export const getTransactions = (leagueId: string, week: number) =>
  sleeper<unknown[]>(`/league/${leagueId}/transactions/${week}`, 60);
export const getTrending = () => sleeper<Array<{ player_id: string; count: number }>>("/players/nfl/trending/add?lookback_hours=24&limit=25", 300);
export const getDrafts = (leagueId: string) => sleeper<Draft[]>(`/league/${leagueId}/drafts`, 15);
export const getDraftPicks = (draftId: string) => sleeper<DraftPick[]>(`/draft/${draftId}/picks`, 5);

let playerCache: Record<string, Player> | undefined;
export async function getPlayers(): Promise<Record<string, Player>> {
  if (playerCache) return playerCache;
  playerCache = await sleeper<Record<string, Player>>("/players/nfl", { useNextCache: false });
  return playerCache;
}

export async function getContext(username: string) {
  const [user, state, players] = await Promise.all([getUser(username), getState(), getPlayers()]);
  const leagues = await getLeagues(user.user_id, state.league_season ?? state.season);
  return { user, state, players, leagues };
}

function sortLeagueMembers(members: LeagueMember[]) {
  return [...members].sort((left, right) => {
    const leftLabel = left.metadata?.team_name || left.display_name || left.username;
    const rightLabel = right.metadata?.team_name || right.display_name || right.username;
    return leftLabel.localeCompare(rightLabel);
  });
}

export async function getDashboardContext(username: string): Promise<DashboardContext> {
  const context = await getContext(username);
  const leagueUsersByLeague = Object.fromEntries(await Promise.all(
    context.leagues.map(async league => [league.league_id, sortLeagueMembers(await getLeagueUsers(league.league_id))] as const)
  ));
  return { ...context, leagueUsersByLeague };
}

export async function getLeagueView(username: string, leagueId: string, viewedUserId?: string) {
  const context = await getContext(username);
  const league = context.leagues.find(item => item.league_id === leagueId);
  if (!league) throw new Error("League not found for configured Sleeper user");
  const members = sortLeagueMembers(await getLeagueUsers(leagueId));
  const viewedUser = members.find(member => member.user_id === viewedUserId)
    ?? members.find(member => member.user_id === context.user.user_id)
    ?? members[0];
  if (!viewedUser) throw new Error("No league members found");
  return { ...context, league, members, viewedUser };
}
