'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import PlayerProfileCard from '../components/PlayerProfileCard';
import Image from 'next/image'; // Add this import

export default function FreeAgencyPage() {
  const { data: session, status } = useSession();
  const [playerContracts, setPlayerContracts] = useState([]);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [leagueId, setLeagueId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  // Load contracts
  useEffect(() => {
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n').filter(Boolean);
      if (rows.length < 2) return setPlayerContracts([]);
      // CSV parsing that respects quoted commas
      const parseCSVLine = (line) => {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Escaped quote
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            out.push(cur.replace(/\r$/, ''));
            cur = '';
          } else {
            cur += ch;
          }
        }
        out.push(cur.replace(/\r$/, ''));
        return out;
      };

      const header = parseCSVLine(rows[0]).map(h => h.trim());
      const headerMap = {};
      header.forEach((col, idx) => { headerMap[col] = idx; });

      const norm = (s) => (s || '').toString().trim().toLowerCase();
      const findRfaIndex = () => {
        // Prefer exact case-insensitive matches
        const candidatesExact = ['RFA?', 'Will Be RFA?', 'RFA', 'Is RFA?', 'RFA Status', 'Free Agent Type', 'FA Type'];
        for (const c of candidatesExact) {
          const idx = header.findIndex(h => norm(h) === norm(c));
          if (idx !== -1) return idx;
        }
        // Fallback: any header containing 'rfa'
        const containsIdx = header.findIndex(h => norm(h).includes('rfa'));
        if (containsIdx !== -1) return containsIdx;
        // Fallback: any header containing 'free' and 'type'
        const faIdx = header.findIndex(h => {
          const nh = norm(h);
          return nh.includes('free') && nh.includes('type');
        });
        return faIdx !== -1 ? faIdx : null;
      };

      const toRfaBool = (raw) => {
        const s = norm(raw);
        if (s === '' || s === '0' || s === 'no' || s === 'n' || s === 'false' || s === 'ufa' || s === 'unrestricted') return false;
        if (s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'rfa' || s === 'restricted') return true;
        if (s.includes('ufa')) return false;
        if (s.includes('rfa')) return true;
        return false; // default to UFA when ambiguous
      };

      const rfaIdx = findRfaIndex();

      const contracts = [];
      rows.slice(1).forEach((row, idx) => {
        const values = parseCSVLine(row);
        if (values.length !== header.length) return;

        // Determine RFA flag robustly; normalize to boolean
        const rfaRaw = rfaIdx != null ? String(values[rfaIdx]).trim() : '';
        const rfaEligibleBool = toRfaBool(rfaRaw);

        contracts.push({
          playerId: values[headerMap["Player ID"]],
          playerName: values[headerMap["Player Name"]],
          position: values[headerMap["Position"]],
          contractType: values[headerMap["Contract Type"]],
          status: values[headerMap["Status"]],
          team: values[headerMap["TeamDisplayName"]],
          curYear: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 1 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 1 Dead"]]) || 0,
          year2: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 2 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 2 Dead"]]) || 0,
          year3: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 3 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 3 Dead"]]) || 0,
          year4: (values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future')
            ? parseFloat(values[headerMap["Relative Year 4 Salary"]]) || 0
            : parseFloat(values[headerMap["Relative Year 4 Dead"]]) || 0,
          isDeadCap: !(values[headerMap["Status"]] === 'Active' || values[headerMap["Status"]] === 'Future'),
          contractFinalYear: values[headerMap["Contract Final Year"]],
          age: values[headerMap["Age"]],
          ktcValue: values[headerMap["Current KTC Value"]] ? parseInt(values[headerMap["Current KTC Value"]], 10) : null,
          rfaEligible: rfaEligibleBool,
          franchiseTagEligible: values[headerMap["Franchise Tag Eligible?"]],
        });
      });
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  // League + avatars
  useEffect(() => {
    async function findBBBLeague() {
      if (!session?.user?.sleeperId) return;
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;
        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${session.user.sleeperId}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();
        const bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );
        const mostRecent = (bbbLeagues.length ? bbbLeagues : userLeagues).sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecent?.league_id || null);
      } catch {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, [session?.user?.sleeperId]);

  useEffect(() => {
    if (!leagueId) return;
    async function fetchAvatars() {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        const avatarMap = {};
        users.forEach(user => {
          avatarMap[user.display_name] = user.avatar;
        });
        setTeamAvatars(avatarMap);
      } catch {}
    }
    fetchAvatars();
  }, [leagueId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
  }, [status]);

  if (status === "loading") return null;
  if (status === 'unauthenticated' || !session) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    return null;
  }

  // Build my team and free agents by year
  const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
  const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team?.trim()).filter(Boolean)));
  // let myTeamName = '';
  // if (session?.user?.name) {
  //   const nameLower = session.user.name.trim().toLowerCase();
  //   myTeamName = allTeamNames.find(t => t.toLowerCase() === nameLower) || '';
  // }
  // if (!myTeamName) {
  //   const teamCounts = {};
  //   activeContracts.forEach(p => {
  //     const t = p.team.trim();
  //     teamCounts[t] = (teamCounts[t] || 0) + 1;
  //   });
  //   myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  // }

  // Determine team without defaulting to most common.
  const EMAIL_TO_TEAM = Object.freeze({
    // 'user@example.com': 'Your Team Name',
  });
  const normalize = s => (s || '').trim().toLowerCase();
  let myTeamName = '';
  const userTeamFromSession =
    session?.user?.teamName ||
    session?.user?.team ||
    session?.user?.team_name ||
    session?.user?.teamSlug ||
    session?.user?.team_slug;
  if (userTeamFromSession) {
    const val = normalize(userTeamFromSession);
    myTeamName =
      allTeamNames.find(t => normalize(t) === val) ||
      allTeamNames.find(t => normalize(t).includes(val)) ||
      '';
  }
  if (!myTeamName && session?.user?.email) {
    const mapped = EMAIL_TO_TEAM[normalize(session.user.email)];
    if (mapped) {
      const val = normalize(mapped);
      myTeamName =
        allTeamNames.find(t => normalize(t) === val) ||
        allTeamNames.find(t => normalize(t).includes(val)) ||
        '';
    }
  }
  if (!myTeamName && session?.user?.name) {
    const val = normalize(session.user.name);
    myTeamName =
      allTeamNames.find(t => normalize(t) === val) ||
      allTeamNames.find(t => normalize(t).includes(val)) ||
      '';
  }

  if (!myTeamName) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Upcoming Free Agents By Year</h2>
        <div className="bg-red-900/40 border border-red-600 text-red-200 px-4 py-3 rounded text-center">
          Unable to determine your team from your session. Please contact an admin.
        </div>
      </div>
    );
  }

  const seen = new Set();
  const myContracts = activeContracts
    .filter(p => p.team === myTeamName)
    .sort((a, b) => (b.curYear || 0) - (a.curYear || 0))
    .filter(player => {
      if (seen.has(player.playerId)) return false;
      seen.add(player.playerId);
      return true;
    });

  const playerIdToMaxFinalYear = {};
  playerContracts.forEach(p => {
    if ((p.status === 'Active' || p.status === 'Future') && p.playerId) {
      const year = parseInt(p.contractFinalYear);
      if (!isNaN(year)) {
        if (!playerIdToMaxFinalYear[p.playerId] || year > playerIdToMaxFinalYear[p.playerId]) {
          playerIdToMaxFinalYear[p.playerId] = year;
        }
      }
    }
  });

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
  const freeAgentsByYear = years.map(year => {
    const players = myContracts.filter(p => playerIdToMaxFinalYear[p.playerId] === year);
    const playersWithMaxYear = players.map(p => ({ ...p, contractFinalYear: playerIdToMaxFinalYear[p.playerId] }));
    const rfa = playersWithMaxYear.filter(p => !!p.rfaEligible);
    const ufa = playersWithMaxYear.filter(p => !p.rfaEligible);
    return { year, rfa, ufa };
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Upcoming Free Agents By Year</h2>

      {(typeof selectedPlayerId === 'string' || typeof selectedPlayerId === 'number') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedPlayerId(null)}>
          <div className="bg-transparent p-0 rounded-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamName={myTeamName}
              teamAvatars={teamAvatars}
              // Close handler for the in-card X
              onExpandClick={() => setSelectedPlayerId(null)}
            />
            {/* existing external close button */}
            <button className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black" onClick={() => setSelectedPlayerId(null)}>×</button>
          </div>
        </div>
      )}

  {/* Two year cards per row on wider screens (2x2 for four years) */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {freeAgentsByYear.map(({ year, rfa, ufa }) => (
          <div key={year} className="rounded-xl border border-white/10 p-5 bg-[#0b1c26]/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">{year + 1} Free Agents</h3>
              <span className="text-[11px] text-white/50">Total {rfa.length + ufa.length}</span>
            </div>

            {(rfa.length + ufa.length) > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center rounded-full bg-blue-500/20 text-blue-200 text-[11px] px-2.5 py-0.5">RFA</span>
                    <span className="text-[11px] text-white/50">{rfa.length}</span>
                  </div>
                  {rfa.length > 0 ? (
                    <ul className="divide-y divide-white/10">
                      {rfa.map(player => (
                        <li key={player.playerId} className="py-2 flex items-center gap-3 px-1">
                          <div className="w-6 h-6 flex-shrink-0">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-6 h-6 rounded overflow-hidden" />
                          </div>
                          <div className="min-w-0 flex items-center gap-2">
                            <button className="font-medium text-white/90 text-sm hover:text-white truncate" onClick={() => setSelectedPlayerId(player.playerId)}>
                              {player.playerName}
                            </button>
                            <span className="text-white/50 text-xs">{player.position}</span>
                          </div>
                          <span className="ml-auto inline-flex items-center rounded-full bg-white/10 text-white/80 text-[11px] px-2 py-0.5">${player.curYear?.toFixed(1) ?? '-'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-white/50 text-sm">None</div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center rounded-full bg-green-500/20 text-green-200 text-[11px] px-2.5 py-0.5">UFA</span>
                    <span className="text-[11px] text-white/50">{ufa.length}</span>
                  </div>
                  {ufa.length > 0 ? (
                    <ul className="divide-y divide-white/10">
                      {ufa.map(player => (
                        <li key={player.playerId} className="py-2 flex items-center gap-3 px-1">
                          <div className="w-6 h-6 flex-shrink-0">
                            <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-6 h-6 rounded overflow-hidden" />
                          </div>
                          <div className="min-w-0 flex items-center gap-2">
                            <button className="font-medium text-white/90 text-sm hover:text-white truncate" onClick={() => setSelectedPlayerId(player.playerId)}>
                              {player.playerName}
                            </button>
                            <span className="text-white/50 text-xs">{player.position}</span>
                          </div>
                          <span className="ml-auto inline-flex items-center rounded-full bg-white/10 text-white/80 text-[11px] px-2 py-0.5">${player.curYear?.toFixed(1) ?? '-'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-white/50 text-sm">None</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-white/60 italic">No free agents for {year + 1}.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}