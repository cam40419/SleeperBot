"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { AgentAnswer, DashboardContext, DraftAnalysis, League, LeagueAnalysis, LeagueMember, Player } from "@/lib/types";

type Workspace = "team" | "draft";

function displayName(player: Player) {
  return player.full_name || `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || player.player_id;
}

function memberLabel(member: LeagueMember | null | undefined) {
  return member?.metadata?.team_name || member?.display_name || member?.username || "Manager";
}

function defaultViewedUserId(initial: DashboardContext, leagueId: string) {
  const members = initial.leagueUsersByLeague[leagueId] ?? [];
  return members.find(member => member.user_id === initial.user.user_id)?.user_id ?? members[0]?.user_id ?? "";
}

export function Dashboard({ initial }: { initial: DashboardContext }) {
  const [leagueId, setLeagueId] = useState(initial.leagues[0]?.league_id ?? "");
  const [viewedUserId, setViewedUserId] = useState(defaultViewedUserId(initial, initial.leagues[0]?.league_id ?? ""));
  const [workspace, setWorkspace] = useState<Workspace>("team");
  const [analysis, setAnalysis] = useState<LeagueAnalysis | null>(null);
  const [draft, setDraft] = useState<DraftAnalysis | null>(null);
  const [draftAutoRefresh, setDraftAutoRefresh] = useState(false);
  const [loading, setLoading] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const league = useMemo(() => initial.leagues.find(item => item.league_id === leagueId), [initial.leagues, leagueId]);
  const leagueUsers = useMemo(() => initial.leagueUsersByLeague[leagueId] ?? [], [initial.leagueUsersByLeague, leagueId]);
  const viewedUser = useMemo(() => leagueUsers.find(member => member.user_id === viewedUserId) ?? leagueUsers[0] ?? null, [leagueUsers, viewedUserId]);

  useEffect(() => {
    if (leagueUsers.some(member => member.user_id === viewedUserId)) return;
    setViewedUserId(defaultViewedUserId(initial, leagueId));
    setAnalysis(null);
    setDraft(null);
    setError("");
  }, [initial, leagueId, leagueUsers, viewedUserId]);

  const request = useCallback(async (kind: Workspace, quiet = false, draftMode: "full" | "live" = "full") => {
    if (!leagueId || !viewedUserId) return;
    if (!quiet) setLoading(kind);
    setError("");
    try {
      const endpoint = kind === "draft" ? "draft" : "analyze";
      const modeQuery = kind === "draft" ? `&mode=${draftMode}` : "";
      const response = await fetch(`/api/${endpoint}?leagueId=${encodeURIComponent(leagueId)}&userId=${encodeURIComponent(viewedUserId)}${modeQuery}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      if (kind === "draft") setDraft(data); else setAnalysis(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally { if (!quiet) setLoading(null); }
  }, [leagueId, viewedUserId]);

  useEffect(() => {
    if (workspace !== "draft" || draft?.status !== "drafting" || !draftAutoRefresh) return;
    const timer = window.setInterval(() => request("draft", true, "live"), 15000);
    return () => window.clearInterval(timer);
  }, [workspace, draft?.status, draftAutoRefresh, request]);

  function changeLeague(value: string) {
    setLeagueId(value); setViewedUserId(defaultViewedUserId(initial, value)); setAnalysis(null); setDraft(null); setDraftAutoRefresh(false); setError("");
  }

  function changeViewedUser(value: string) {
    setViewedUserId(value); setAnalysis(null); setDraft(null); setDraftAutoRefresh(false); setError("");
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="mark">S</span><span>Sleeper<br />Coach</span></div>
      <div className="nav-label">Workspace</div>
      <button className={`nav-item ${workspace === "team" ? "active" : ""}`} onClick={() => setWorkspace("team")}><span>⌁</span><span>Team command</span></button>
      <button className={`nav-item ${workspace === "draft" ? "active" : ""}`} onClick={() => setWorkspace("draft")}><span>◎</span><span>Draft room</span>{league?.status === "pre_draft" && <i>Ready</i>}</button>
      <div className="sidebar-spacer" />
      <div className="identity">
        {initial.user.avatar ? <Image src={`https://sleepercdn.com/avatars/thumbs/${initial.user.avatar}`} alt="" width={36} height={36} unoptimized /> : <span className="avatar">{initial.user.username.slice(0, 1).toUpperCase()}</span>}
        <div><strong>{initial.user.display_name}</strong><small>@{initial.user.username}</small></div>
      </div>
      <form action="/api/auth/logout" method="post"><button className="nav-item signout">Sign out</button></form>
    </aside>

    <section className="workspace">
      <header className="workspace-header">
        <div><div className="eyebrow">{initial.state.season} · {initial.state.season_type.replace("_", " ")}</div><h2>{workspace === "draft" ? "Draft intelligence" : "Team command center"}</h2></div>
        <div className="workspace-filters">
          <label className="stacked-control"><span>League</span><select className="select" value={leagueId} onChange={event => changeLeague(event.target.value)}>{initial.leagues.map(item => <option key={item.league_id} value={item.league_id}>{item.name}</option>)}</select></label>
          <label className="stacked-control"><span>Viewed manager</span><select className="select" value={viewedUser?.user_id ?? ""} onChange={event => changeViewedUser(event.target.value)} disabled={!leagueUsers.length}>{leagueUsers.map(member => <option key={member.user_id} value={member.user_id}>{memberLabel(member)}{member.user_id === initial.user.user_id ? " (you)" : ""}</option>)}</select></label>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {workspace === "team"
        ? <TeamWorkspace league={league} viewedUser={viewedUser} analysis={analysis} loading={loading === "team"} onAnalyze={() => request("team")} />
        : <DraftWorkspace league={league} viewedUser={viewedUser} draft={draft} loading={loading === "draft"} autoRefresh={draftAutoRefresh} onToggleAutoRefresh={() => setDraftAutoRefresh(value => !value)} onAnalyze={() => request("draft")} />}
    </section>
  </main>;
}

function TeamWorkspace({ league, viewedUser, analysis, loading, onAnalyze }: { league?: League; viewedUser: LeagueMember | null; analysis: LeagueAnalysis | null; loading: boolean; onAnalyze: () => void }) {
  return <>
    <section className="page-intro"><div><span className="status-dot" /> {league?.status?.replace("_", " ") || "No league"}<h1>Every decision,<br /><em>under review.</em></h1><p>Roster intelligence, injury monitoring, current news, and prioritized actions for {memberLabel(viewedUser)} in {league?.name ?? "your league"}.</p></div><div className="actions"><button className="button" disabled={!league || !viewedUser || loading} onClick={onAnalyze}>{loading ? "Researching…" : "Run team analysis"}</button><a className="button secondary" href="https://sleeper.com/leagues" target="_blank" rel="noreferrer">Open Sleeper ↗</a></div></section>
    <div className="notice">Sleeper&apos;s supported API is read-only. Confirm recommended roster changes in Sleeper.</div>
    <section className="metric-row"><Metric value={analysis?.starters.length ?? "—"} label="Starters reviewed" /><Metric value={analysis?.injured.length ?? "—"} label="Injury flags" /><Metric value={analysis?.recommendations.filter(r => r.priority === "urgent" || r.priority === "high").length ?? "—"} label="Priority actions" /><Metric value={analysis?.isAiEnhanced ? "Live" : analysis ? "Rules" : "—"} label="Research mode" /></section>
    {!analysis ? <Empty title="Your weekly briefing is ready to build" detail="Run an analysis to sync the current roster and research relevant news." /> : <section className="content-grid">
      <article className="panel main-panel"><div className="panel-heading"><div><span className="eyebrow">Decision queue</span><h3>{analysis.teamName}</h3></div><span className="updated">Updated {new Date(analysis.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div><p className="summary">{analysis.summary}</p>{analysis.recommendations.map((rec, index) => <div className="recommendation" key={`${rec.title}-${index}`}><div className="rank">{String(index + 1).padStart(2, "0")}</div><div><div className="recommendation-meta"><span className={`badge ${rec.priority}`}>{rec.priority}</span><span className="badge">{rec.type}</span><span>{Math.round(rec.confidence * 100)}% confidence</span></div><h3>{rec.title}</h3><p>{rec.detail}</p><strong className="action">→ {rec.action}</strong>{rec.sourceUrls?.length ? <div className="sources">{rec.sourceUrls.map((url, sourceIndex) => <a key={`${url}-${sourceIndex}`} href={url} target="_blank" rel="noreferrer">Source {sourceIndex + 1} ↗</a>)}</div> : null}</div></div>)}</article>
      <RosterPanel analysis={analysis} />
    </section>}
    <QuestionPanel kind="team" league={league} viewedUser={viewedUser} />
  </>;
}

function DraftWorkspace({ league, viewedUser, draft, loading, autoRefresh, onToggleAutoRefresh, onAnalyze }: { league?: League; viewedUser: LeagueMember | null; draft: DraftAnalysis | null; loading: boolean; autoRefresh: boolean; onToggleAutoRefresh: () => void; onAnalyze: () => void }) {
  const stateLabel = draft?.status === "not_created" ? "No Sleeper draft created" : draft?.status?.replace("_", " ") || (league?.status === "pre_draft" ? "Pre-draft" : "Draft research");
  return <>
    <section className="page-intro draft-intro"><div><span className="status-dot amber" /> {stateLabel}<h1>Build the board.<br /><em>Win the room.</em></h1><p>Research the player pool now, then refresh live recommendations as selections change for {memberLabel(viewedUser)}.</p></div><div className="actions"><button className="button" disabled={!league || !viewedUser || loading} onClick={onAnalyze}>{loading ? "Building board…" : draft ? "Refresh draft board" : "Start draft research"}</button></div></section>
    {draft?.status === "drafting" && <div className="live-strip"><span><b>LIVE</b> {autoRefresh ? "Auto-refreshing every 15 seconds" : "Auto-refresh is off"}</span><div className="live-controls"><span>Overall pick {draft.currentPick} · Next manager pick {draft.nextUserPick ?? "—"}</span><button type="button" className={`toggle ${autoRefresh ? "on" : "off"}`} aria-pressed={autoRefresh} onClick={onToggleAutoRefresh}>{autoRefresh ? "Turn auto-refresh off" : "Turn auto-refresh on"}</button></div></div>}
    <section className="metric-row"><Metric value={draft?.picks.length ?? 0} label="Picks complete" /><Metric value={draft?.myPicks.length ?? 0} label="Viewed selections" /><Metric value={draft?.userSlot ?? "—"} label="Draft slot" /><Metric value={draft?.nextUserPick ?? "—"} label="Next pick" /></section>
    {!draft ? <Empty title={league?.status === "pre_draft" ? "No draft has happened yet" : "Prepare your draft strategy"} detail="Start draft research to detect the Sleeper draft, evaluate league settings, and generate a ranked target board." /> : <section className="draft-layout">
      <article className="panel board-panel"><div className="panel-heading"><div><span className="eyebrow">Available targets</span><h3>Live recommendation board</h3></div><span className={`draft-state ${draft.status}`}>{draft.status.replace("_", " ")}</span></div><p className="summary">{draft.strategy}</p><div className="candidate-header"><span>Rank / player</span><span>Fit</span></div>{draft.candidates.map(candidate => <div className="candidate" key={candidate.player.player_id}><div className="candidate-rank">{candidate.rank}</div><div className="candidate-player"><strong>{displayName(candidate.player)}</strong><span>{candidate.player.position} · {candidate.player.team} · Tier {candidate.tier}</span><p>{candidate.rationale}</p><small>{candidate.risk}</small>{candidate.sourceUrls.length ? <div className="sources">{candidate.sourceUrls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">Research {index + 1} ↗</a>)}</div> : null}</div><div className="fit"><b>{candidate.fitScore}</b><span>fit</span></div></div>)}</article>
      <aside className="draft-side"><div className="panel"><span className="eyebrow">Roster architecture</span><h3>Position plan</h3>{draft.rosterNeeds.map(need => <div className="need" key={need.position}><div><b>{need.position}</b><span>{need.drafted} drafted / {need.target} target</span></div><div className="need-dots">{Array.from({ length: Math.max(1, need.target) }, (_, index) => <i className={index < need.drafted ? "filled" : ""} key={index} />)}</div></div>)}</div><div className="panel"><span className="eyebrow">Viewed picks</span><h3>{memberLabel(viewedUser)} build</h3>{draft.myPicks.length ? draft.myPicks.map(pick => <div className="pick" key={pick.pick_no}><span>{pick.pick_no}</span><div><b>{pick.metadata?.first_name} {pick.metadata?.last_name}</b><small>Round {pick.round} · {pick.metadata?.position}</small></div></div>) : <p className="muted">No selections yet. Targets will adapt after every pick.</p>}</div></aside>
    </section>}
    <QuestionPanel kind="draft" league={league} viewedUser={viewedUser} />
  </>;
}

function QuestionPanel({ kind, league, viewedUser }: { kind: Workspace; league?: League; viewedUser: LeagueMember | null }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuestion("");
    setAnswer(null);
    setError("");
    setLoading(false);
  }, [kind, league?.league_id, viewedUser?.user_id]);

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!league || !viewedUser || !question.trim()) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.league_id, userId: viewedUser.user_id, workspace: kind, question: question.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Question failed");
      setAnswer(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Question failed");
    } finally {
      setLoading(false);
    }
  }

  return <section className="panel question-panel">
    <div className="panel-heading compact"><div><span className="eyebrow">Ask the agent</span><h3>{kind === "draft" ? "Draft room Q&A" : "Team board Q&A"}</h3></div><span className="updated">Viewing {memberLabel(viewedUser)}</span></div>
    <p className="summary">{kind === "draft" ? "Ask about pick timing, positional runs, player comparisons, or contingency plans for this draft board." : "Ask about start-sit calls, injury risk, waiver priorities, or roster construction for this team."}</p>
    <form className="question-form" onSubmit={askQuestion}>
      <textarea className="question-input" rows={4} value={question} onChange={event => setQuestion(event.target.value)} placeholder={kind === "draft" ? "Example: If the next six picks are WR-heavy, which RB contingency should we prefer?" : "Example: Which bench player is the safest injury replacement this week?"} disabled={!league || !viewedUser || loading} />
      <div className="actions"><button className="button" disabled={!league || !viewedUser || loading || !question.trim()}>{loading ? "Thinking…" : "Ask agent"}</button></div>
    </form>
    {error ? <div className="error-banner inline-error">{error}</div> : null}
    {answer ? <div className="answer-card"><div className="panel-heading compact"><span className="eyebrow">Answer</span><span className="updated">Updated {new Date(answer.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div><p>{answer.answer}</p>{answer.sourceUrls.length ? <div className="sources">{answer.sourceUrls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">Source {index + 1} ↗</a>)}</div> : null}</div> : null}
  </section>;
}

function Metric({ value, label }: { value: string | number; label: string }) { return <div className="metric"><b>{value}</b><span>{label}</span></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <section className="panel empty"><div className="empty-icon">◎</div><h2>{title}</h2><p>{detail}</p></section>; }
function RosterPanel({ analysis }: { analysis: LeagueAnalysis }) { return <aside className="roster-column"><div className="panel"><span className="eyebrow">Active lineup</span><h3>Current starters</h3><div className="players">{analysis.starters.map((player, index) => <PlayerRow player={player} key={`starter-${player.player_id}-${index}`} />)}</div></div><div className="panel"><span className="eyebrow">Depth</span><h3>Bench</h3><div className="players">{analysis.bench.map((player, index) => <PlayerRow player={player} key={`bench-${player.player_id}-${index}`} />)}</div></div></aside>; }
function PlayerRow({ player }: { player: Player }) { return <div className="player"><div><strong>{displayName(player)}</strong><small>{player.team || "FA"}</small></div><span className={player.injury_status ? "injured" : "position"}>{player.position} {player.injury_status ? `· ${player.injury_status}` : ""}</span></div>; }
