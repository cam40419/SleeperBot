export type SleeperUser = { user_id: string; username: string; display_name: string; avatar: string | null };
export type LeagueMember = SleeperUser & { metadata?: { team_name?: string } };
export type League = {
  league_id: string; name: string; season: string; status: string; total_rosters: number;
  roster_positions: string[]; scoring_settings: Record<string, number>;
};
export type Roster = {
  roster_id: number; owner_id: string; players: string[] | null; starters: string[] | null;
  reserve?: string[] | null; taxi?: string[] | null; settings: Record<string, number>;
};
export type Player = {
  player_id: string; first_name?: string; last_name?: string; full_name?: string; team?: string | null;
  position?: string; fantasy_positions?: string[]; status?: string; injury_status?: string | null;
  injury_body_part?: string | null; injury_notes?: string | null; news_updated?: number | null;
  age?: number; years_exp?: number; search_rank?: number; depth_chart_order?: number | null;
};
export type Draft = {
  draft_id: string; league_id: string; season: string; status: "pre_draft" | "drafting" | "complete";
  type: string; start_time?: number; last_picked?: number; settings: Record<string, number | string | null>;
  metadata?: Record<string, string>; draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
};
export type DraftPick = {
  draft_id: string; player_id: string; picked_by: string; roster_id: string | number;
  round: number; draft_slot: number; pick_no: number; metadata?: Record<string, string | null>;
};
export type DraftCandidate = {
  player: Player; rank: number; tier: number; fitScore: number; valueScore: number;
  rationale: string; risk: string; sourceUrls: string[];
};
export type DraftAnalysis = {
  leagueId: string; leagueName: string; generatedAt: string; status: "not_created" | "pre_draft" | "drafting" | "complete";
  draft: Draft | null; picks: DraftPick[]; myPicks: DraftPick[]; userSlot: number | null;
  currentPick: number; nextUserPick: number | null; rosterNeeds: Array<{ position: string; target: number; drafted: number; need: number }>;
  candidates: DraftCandidate[]; strategy: string; isAiEnhanced: boolean;
};
export type NFLState = { week: number; leg: number; season: string; league_season?: string; season_type: string; display_week: number };
export type Recommendation = {
  priority: "urgent" | "high" | "medium" | "low";
  type: "lineup" | "injury" | "waiver" | "trade" | "draft" | "news";
  title: string; detail: string; action: string; confidence: number; sourceUrls?: string[];
};
export type LeagueAnalysis = {
  leagueId: string; leagueName: string; week: number; generatedAt: string;
  teamName: string; starters: Player[]; bench: Player[]; injured: Player[];
  recommendations: Recommendation[]; summary: string; isAiEnhanced: boolean;
};
export type DashboardContext = {
  user: SleeperUser; state: NFLState; players: Record<string, Player>; leagues: League[];
  leagueUsersByLeague: Record<string, LeagueMember[]>;
};
export type AgentAnswer = { answer: string; sourceUrls: string[]; generatedAt: string };
