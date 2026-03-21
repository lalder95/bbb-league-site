'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import AssistantGMChat from '../components/AssistantGMChat';
import DraftPicksFetcher from '../../../components/draft/DraftPicksFetcher';
import { getSleeperLeagueWeekAndYear } from '../../../utils/sleeperUtils';
import { useDraftOrder } from '../../../hooks/useDraftOrder';
import { createDraftPickAsset, DEFAULT_FUTURE_PICK_BUCKET } from '../../../utils/draftPickTradeUtils';
import { getLeagueRosters } from '../myTeamApi';

export default function AssistantGMPage() {
  // All hooks must be called unconditionally and before any early returns
  const { data: session, status } = useSession();

  const [teamState, setTeamState] = useState("Compete");
  const [assetPriority, setAssetPriority] = useState(["QB", "RB", "WR", "TE", "Picks"]);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [strategyNotes, setStrategyNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  // League + rosters + week/year
  const [leagueId, setLeagueId] = useState(null);
  const [leagueRosters, setLeagueRosters] = useState({});
  const [leagueWeek, setLeagueWeek] = useState(null);
  const [leagueYear, setLeagueYear] = useState(null);

  // Contracts for chat context
  const [playerContracts, setPlayerContracts] = useState([]);
  const [teamFines, setTeamFines] = useState({});

  const { data: draftOrderData } = useDraftOrder({
    leagueId,
    enabled: Boolean(leagueId),
  });

  const assistantGMChatRef = useRef(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
  }, [status]);

  useEffect(() => {
    async function fetchPlayerData() {
      try {
        const [contractsResponse, finesResponse] = await Promise.all([
          fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv'),
          fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv'),
        ]);
        const text = await contractsResponse.text();
        const finesText = await finesResponse.text();
        const rows = text.split('\n').filter(Boolean);
        if (rows.length < 2) return setPlayerContracts([]);
        const header = rows[0].split(',').map(h => h.trim());
        const headerMap = {};
        header.forEach((col, idx) => { headerMap[col] = idx; });
        console.log('[AssistantGM Debug] headerMap:', headerMap);

        const contracts = [];
        rows.slice(1).forEach((row, idx) => {
          const values = row.split(',');
          if (values.length !== header.length) {
            console.warn(`[AssistantGM Debug] Skipped row ${idx + 1} (length ${values.length}):`, values);
            return;
          }
          contracts.push({
            playerId: values[headerMap["Player ID"]],
            playerName: values[headerMap["Player Name"]],
            position: values[headerMap["Position"]],
            contractType: values[headerMap["Contract Type"]],
            status: values[headerMap["Status"]],
            team: values[headerMap["TeamDisplayName"]],
            curYear: parseFloat(values[headerMap["Relative Year 1 Salary"]]) || 0,
            year2: parseFloat(values[headerMap["Relative Year 2 Salary"]]) || 0,
            year3: parseFloat(values[headerMap["Relative Year 3 Salary"]]) || 0,
            year4: parseFloat(values[headerMap["Relative Year 4 Salary"]]) || 0,
            deadCurYear: parseFloat(values[headerMap["Relative Year 1 Dead"]]) || 0,
            deadYear2: parseFloat(values[headerMap["Relative Year 2 Dead"]]) || 0,
            deadYear3: parseFloat(values[headerMap["Relative Year 3 Dead"]]) || 0,
            deadYear4: parseFloat(values[headerMap["Relative Year 4 Dead"]]) || 0,
            isDeadCap: !(values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future'),
            contractFinalYear: values[headerMap["Contract Final Year"]],
            age: values[headerMap["Age"]],
            ktcValue: values[headerMap["Current KTC Value"]] ? parseInt(values[headerMap["Current KTC Value"]], 10) : null,
            rfaEligible: values[headerMap["Will Be RFA?"]],
            franchiseTagEligible: values[headerMap["Franchise Tag Eligible?"]],
          });
        });

        const fines = finesText.split('\n').slice(1)
          .filter(row => row.trim())
          .reduce((acc, row) => {
            const [team, year1, year2, year3, year4] = row.split(',');
            acc[team] = {
              curYear: parseFloat(year1) || 0,
              year2: parseFloat(year2) || 0,
              year3: parseFloat(year3) || 0,
              year4: parseFloat(year4) || 0,
            };
            return acc;
          }, {});

        console.log('[AssistantGM Debug] Loaded contracts:', contracts.slice(0, 5), `Total: ${contracts.length}`);
        setPlayerContracts(contracts);
        setTeamFines(fines);
      } catch (err) {
        console.error('[AssistantGM Debug] Error fetching or parsing contracts:', err);
      }
    }
    fetchPlayerData();
  }, []);

  useEffect(() => {
    async function findBBBLeague() {
      if (!session?.user?.sleeperId) return;
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );
        if (bbbLeagues.length === 0 && userLeagues.length > 0) bbbLeagues = [userLeagues[0]];
        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, [session?.user?.sleeperId]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        const rosters = await getLeagueRosters(leagueId);
        setLeagueRosters(prev => ({ ...prev, [leagueId]: rosters || [] }));
      } catch {
        setLeagueRosters(prev => ({ ...prev, [leagueId]: [] }));
      }
      try {
        const { week, year } = await getSleeperLeagueWeekAndYear(leagueId);
        setLeagueWeek(week);
        setLeagueYear(year);
      } catch {}
    })();
  }, [leagueId]);

  // Drag handlers
  function handleDragStart(idx) { setDraggingIdx(idx); }
  function handleDrop(idx) {
    if (draggingIdx === null || draggingIdx === idx) return;
    const newOrder = [...assetPriority];
    const [removed] = newOrder.splice(draggingIdx, 1);
    newOrder.splice(idx, 0, removed);
    setAssetPriority(newOrder);
    setDraggingIdx(null);
  }

  async function handleSaveAssistantGM() {
    setSaving(true);
    setSaveMsg("");
    setSaveError("");
    try {
      const res = await fetch("/api/user/update-assistant-gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamState, assetPriority, strategyNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaveMsg("Settings saved!");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Helper to get my team name and contracts for chat
  function getMyTeamName() {
    const activeContracts = playerContracts.filter(p => (p.status === 'Active' || p.status === 'Future') && p.team);
    const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team?.trim()).filter(Boolean)));
    const EMAIL_TO_TEAM = Object.freeze({
      'lalder95@gmail.com': 'lalder',
    });
    const normalize = s => (s || '').trim().toLowerCase();
    let myTeamName = '';
    const userTeamFromSession =
      session?.user?.teamName ||
      session?.user?.team ||
      session?.user?.team_name ||
      session?.user?.teamSlug ||
      session?.user?.team_slug;
    console.log('[AssistantGM Debug] session.user:', session?.user);
    console.log('[AssistantGM Debug] allTeamNames:', allTeamNames);
    console.log('[AssistantGM Debug] userTeamFromSession:', userTeamFromSession);
    if (userTeamFromSession) {
      const val = normalize(userTeamFromSession);
      myTeamName =
        allTeamNames.find(t => normalize(t) === val) ||
        allTeamNames.find(t => normalize(t).includes(val)) ||
        '';
      console.log('[AssistantGM Debug] myTeamName after userTeamFromSession:', myTeamName);
    }
    if (!myTeamName && session?.user?.email) {
      const mapped = EMAIL_TO_TEAM[normalize(session.user.email)];
      if (mapped) {
        const val = normalize(mapped);
        myTeamName =
          allTeamNames.find(t => normalize(t) === val) ||
          allTeamNames.find(t => normalize(t).includes(val)) ||
          '';
        console.log('[AssistantGM Debug] myTeamName after EMAIL_TO_TEAM:', myTeamName);
      }
    }
    if (!myTeamName && session?.user?.name) {
      const val = normalize(session.user.name);
      myTeamName =
        allTeamNames.find(t => normalize(t) === val) ||
        allTeamNames.find(t => normalize(t).includes(val)) ||
        '';
      console.log('[AssistantGM Debug] myTeamName after session.user.name:', myTeamName);
    }
    return myTeamName || '';
  }

  function getMyContractsForAssistantGM() {
    const myTeamName = getMyTeamName();
    console.log('[AssistantGM Debug] getMyContractsForAssistantGM myTeamName:', myTeamName);
    let myContracts = playerContracts.filter(
      p => (p.status === 'Active' || p.status === 'Future') && p.team && p.team.trim().toLowerCase() === myTeamName.trim().toLowerCase()
    );
    console.log('[AssistantGM Debug] getMyContractsForAssistantGM myContracts:', myContracts);
    const seen = new Set();
    myContracts = myContracts
      .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
      .filter(player => {
        if (seen.has(player.playerId)) return false;
        seen.add(player.playerId);
        return true;
      });
    return myContracts;
  }

  // Debug: log initial Assistant GM Settings state on mount
  useEffect(() => {
    console.log("[AssistantGMPage] Initial Assistant GM Settings", {
      teamState,
      assetPriority,
      strategyNotes,
      playerContracts,
      session,
      leagueId,
      leagueRosters,
      leagueWeek,
      leagueYear,
    });
  }, []);

  // Debug: log whenever Assistant GM Settings change
  useEffect(() => {
    console.log("[AssistantGMPage] Updated Assistant GM Settings", {
      teamState,
      assetPriority,
      strategyNotes,
      playerContracts,
      session,
      leagueId,
      leagueRosters,
      leagueWeek,
      leagueYear,
    });
  }, [teamState, assetPriority, strategyNotes, playerContracts, session, leagueId, leagueRosters, leagueWeek, leagueYear]);

  useEffect(() => {
    if (status !== "authenticated") return;
    async function fetchSettings() {
      try {
        const res = await fetch("/api/user/get-assistant-gm");
        if (!res.ok) throw new Error("Failed to fetch Assistant GM settings");
        const data = await res.json();
        if (data.teamState) setTeamState(data.teamState);
        if (data.assetPriority) setAssetPriority(data.assetPriority);
        if (typeof data.strategyNotes === "string") setStrategyNotes(data.strategyNotes);
        console.log("[AssistantGMPage] Loaded Assistant GM Settings from API", data);
      } catch (err) {
        console.error("[AssistantGMPage] Error loading Assistant GM Settings", err);
      }
    }
    fetchSettings();
  }, [status]);

  // Early return for loading state, after all hooks
  if (status === "loading") return null;

  const myTeamName = getMyTeamName();
  if (!myTeamName) {
    return (
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Assistant GM</h2>
        <div className="bg-red-900/40 border border-red-600 text-red-200 px-4 py-3 rounded text-center">
          Unable to determine your team from your session. Please contact an admin.
        </div>
      </div>
    );
  }
  return (
    <DraftPicksFetcher
      leagueId={leagueId}
      rosters={leagueRosters[leagueId] || []}
      render={(picksByOwner, loading, error, rosterIdToDisplayName) => {
        let myRosterId = null;
        if (session?.user?.sleeperId && Array.isArray(leagueRosters[leagueId])) {
          const myRoster = (leagueRosters[leagueId] || []).find(r => r.owner_id === session.user.sleeperId);
          if (myRoster) myRosterId = myRoster.roster_id;
        }

        const projectedSlotsByOriginalRosterId = Object.fromEntries(
          (draftOrderData?.draft_order || []).map((entry) => [
            Number(entry.original_roster_id ?? entry.roster_id),
            Number(entry.slot),
          ])
        );
        const targetDraftSeason = String(
          draftOrderData?.targetSeason || (leagueYear ? Number(leagueYear) + 1 : new Date().getFullYear() + 1)
        );
        const allPicks = Object.values(picksByOwner).flat();
        const myRawDraftPicks = myRosterId ? allPicks.filter(pick => pick.owner_id === myRosterId) : [];
        const myDraftPicksList = myRawDraftPicks
          .map((pick) => {
            const season = String(pick.season || pick.year || pick.draftYear || targetDraftSeason);
            const round = Number(pick.round) || 1;
            const originalRosterId = Number(pick.original_owner_id ?? pick.roster_id ?? myRosterId);
            const currentOwnerRosterId = Number(pick.owner_id ?? myRosterId);
            const projectedSlot = season === targetDraftSeason
              ? projectedSlotsByOriginalRosterId[originalRosterId]
              : null;

            return createDraftPickAsset({
              season,
              round,
              pickPosition: projectedSlot || 6,
              originalOwner: rosterIdToDisplayName[originalRosterId] || String(originalRosterId),
              currentOwner: rosterIdToDisplayName[currentOwnerRosterId] || getMyTeamName() || String(currentOwnerRosterId),
              slotDetermined: Boolean(projectedSlot),
              mappedSlotDebug: projectedSlot != null ? String(projectedSlot) : 'assistant gm default',
              bucketOverride: projectedSlot ? undefined : DEFAULT_FUTURE_PICK_BUCKET,
            });
          })
          .sort((a, b) => {
            const seasonDiff = Number(a.season) - Number(b.season);
            if (seasonDiff !== 0) return seasonDiff;
            const roundDiff = Number(a.round) - Number(b.round);
            if (roundDiff !== 0) return roundDiff;
            return Number(a.pickPosition) - Number(b.pickPosition);
          });

        return (
          <div className="flex flex-col md:flex-row gap-8 max-w-4xl mx-auto">
            {/* Settings */}
            <div className="bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg w-full md:w-1/2">
              <h2 className="text-2xl font-bold mb-6 text-white text-center">Assistant GM Settings</h2>
              <div className="mb-6 text-white/80 text-base text-center">
                Configure the aggressiveness, direction, and overall team building strategy.
              </div>
              <div className="mb-6">
                <label className="block text-white/80 mb-2 font-semibold">Team State</label>
                <select className="w-full p-3 rounded bg-white/5 border border-white/10 text-white" value={teamState} onChange={e => setTeamState(e.target.value)}>
                  <option value="Compete">Compete</option>
                  <option value="Rebuild">Rebuild</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-white/80 mb-2 font-semibold">Asset Priority (drag to reorder)</label>
                <div className="text-white/60 text-sm mb-2">
                  <span><strong>Top</strong> = Most Important, <strong>Bottom</strong> = Least Important</span>
                  {assetPriority.map((asset, idx) => {
                    const colorMap = { QB: '#ef4444', RB: '#3b82f6', WR: '#22c55e', TE: '#a855f7', Picks: '#fbbf24' };
                    return (
                      <div
                        key={asset}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(idx)}
                        className="font-bold px-4 py-2 rounded shadow cursor-move select-none border border-white/20"
                        style={{ opacity: draggingIdx === idx ? 0.5 : 1, background: colorMap[asset] || '#1FDDFF', color: asset === 'Picks' ? '#222' : '#fff' }}
                      >
                        {asset}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-white/80 mb-2 font-semibold">Strategy Notes</label>
                <textarea className="w-full p-3 rounded bg-white/5 border border-white/10 text-white resize-none h-24" value={strategyNotes} onChange={e => setStrategyNotes(e.target.value)} placeholder="Enter your strategy notes here..." />
              </div>
              <div className="flex flex-col items-center">
                <button
                  className="px-4 py-2 bg-[#FF4B1F] text-white rounded hover:bg-orange-600 font-semibold"
                  onClick={async () => {
                    await handleSaveAssistantGM();
                    const chatFrame = document.getElementById('assistant-gm-chat-frame');
                    if (chatFrame && chatFrame.resetChat) chatFrame.resetChat();
                  }}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Assistant GM Settings"}
                </button>
                {saveMsg && <div className="mt-4 text-center text-green-400">{saveMsg}</div>}
                {saveError && <div className="mt-4 text-center text-red-400">{saveError}</div>}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg w-full md:w-1/2 flex flex-col">
              <h2 className="text-xl font-bold mb-4 text-white text-center">Assistant GM Chat</h2>
              {(() => {
                // Debug: log the props that will be used to build the system prompt
                const debugProps = {
                  teamState,
                  assetPriority,
                  strategyNotes,
                  myContracts: getMyContractsForAssistantGM(),
                  playerContracts,
                  session,
                  leagueWeek,
                  leagueYear,
                };
                console.log("[AssistantGMChat system prompt debug]", debugProps);
                return null;
              })()}
              <AssistantGMChat
                ref={assistantGMChatRef}
                id="assistant-gm-chat-frame"
                teamState={teamState}
                assetPriority={assetPriority}
                strategyNotes={strategyNotes}
                myContracts={getMyContractsForAssistantGM()}
                playerContracts={playerContracts}
                teamFines={teamFines}
                session={session}
                tradedPicks={[]} // you can wire traded picks if desired
                rosters={leagueRosters[leagueId] || []}
                users={[]}
                myDraftPicksList={myDraftPicksList}
                leagueWeek={leagueWeek}
                leagueYear={leagueYear}
                activeTab="Assistant GM"
              />
            </div>
          </div>
        );
      }}
    />
  );
}