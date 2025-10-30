'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import EscapeKeyListener from '../player-contracts/EscapeKeyListener';
import SwipeDownListener from '../player-contracts/SwipeDownListener';

// Local helper: safe number parsing
function toNumber(n, d = 0) {
  const v = typeof n === 'number' ? n : parseFloat(n);
  return Number.isFinite(v) ? v : d;
}

const USER_ID = '456973480269705216'; // Sleeper user id (used elsewhere in repo)

export default function PlayerPerformancePage() {
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leagueId, setLeagueId] = useState(null);
  const [playerTotals, setPlayerTotals] = useState({}); // { playerId: totalPoints }
  const [playerWeeks, setPlayerWeeks] = useState({}); // { playerId: weeksCount considered }
  const [playersMeta, setPlayersMeta] = useState({}); // { playerId: { playerName, position } }
  const [teamAvatars, setTeamAvatars] = useState({}); // { display_name: avatarId }
  const [teamNameMap, setTeamNameMap] = useState({}); // { playerId: display_name }
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'points', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(100);

  // Responsive flag
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Resolve BBB league id (same approach used on other pages)
  useEffect(() => {
    async function findBBBLeague() {
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = Array.isArray(userLeagues)
          ? userLeagues.filter(league =>
              league?.name && (
                league.name.includes('Budget Blitz Bowl') ||
                league.name.includes('budget blitz bowl') ||
                league.name.includes('BBB') ||
                (String(league.name).toLowerCase().includes('budget') && String(league.name).toLowerCase().includes('blitz'))
              )
            )
          : [];

        if (bbbLeagues.length === 0) {
          const prevSeason = (parseInt(currentSeason) - 1).toString();
          const prevSeasonResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${prevSeason}`);
          if (prevSeasonResponse.ok) {
            const prevSeasonLeagues = await prevSeasonResponse.json();
            const prevBBBLeagues = Array.isArray(prevSeasonLeagues)
              ? prevSeasonLeagues.filter(league =>
                  league?.name && (
                    league.name.includes('Budget Blitz Bowl') ||
                    league.name.includes('budget blitz bowl') ||
                    league.name.includes('BBB') ||
                    (String(league.name).toLowerCase().includes('budget') && String(league.name).toLowerCase().includes('blitz'))
                  )
                )
              : [];
            if (prevBBBLeagues.length > 0) {
              bbbLeagues = prevBBBLeagues;
            } else if (Array.isArray(userLeagues) && userLeagues.length > 0) {
              bbbLeagues = [userLeagues[0]];
            } else if (Array.isArray(prevSeasonLeagues) && prevSeasonLeagues.length > 0) {
              bbbLeagues = [prevSeasonLeagues[0]];
            }
          } else if (Array.isArray(userLeagues) && userLeagues.length > 0) {
            bbbLeagues = [userLeagues[0]];
          }
        }

        const mostRecentLeague = bbbLeagues.sort((a, b) => (toNumber(b.season) - toNumber(a.season)))[0];
        setLeagueId(mostRecentLeague?.league_id || null);
      } catch (e) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, []);

  // Fetch players metadata once (name, position)
  useEffect(() => {
    async function fetchPlayersMeta() {
      try {
        const res = await fetch('/api/players/all');
        if (!res.ok) throw new Error('Failed meta');
        const arr = await res.json();
        const map = {};
        arr.forEach(p => {
          map[String(p.playerId)] = { playerName: p.playerName, position: p.position };
        });
        setPlayersMeta(map);
      } catch (e) {
        setPlayersMeta({});
      }
    }
    fetchPlayersMeta();
  }, []);

  // Fetch and aggregate points for the current season from Sleeper matchups
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    async function fetchPoints() {
      setLoading(true);
      try {
        const stateResp = await fetch('https://api.sleeper.app/v1/state/nfl');
        const state = await stateResp.json();
        const rawWeek = state?.week ?? state?.display_week;
        const isNum = Number.isFinite(toNumber(rawWeek));
        const currentWeek = isNum ? toNumber(rawWeek) : 18; // fallback

        const totals = {}; // {playerId: totalPoints}
        const weeks = {};  // {playerId: countedWeeks (exclude 0-pt games)}
        for (let week = 1; week <= currentWeek; week++) {
          const matchupsResp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
          if (!matchupsResp.ok) continue;
          const matchups = await matchupsResp.json();
          matchups.forEach(m => {
            const pts = m?.players_points || {};
            for (const [pid, val] of Object.entries(pts)) {
              const v = toNumber(val, 0);
              totals[pid] = (totals[pid] || 0) + v;
              if (v > 0) {
                weeks[pid] = (weeks[pid] || 0) + 1; // exclude zero-point weeks from PPG
              }
            }
          });
        }
        if (!cancelled) {
          setPlayerTotals(totals);
          setPlayerWeeks(weeks);
        }
      } catch (e) {
        if (!cancelled) {
          setPlayerTotals({});
          setPlayerWeeks({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPoints();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Fetch team avatars and map players to fantasy team display names
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    async function fetchTeams() {
      try {
        const [usersResp, rostersResp] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
        ]);
        if (!usersResp.ok || !rostersResp.ok) return;
        const users = await usersResp.json();
        const rosters = await rostersResp.json();

        const avatarMap = {};
        const userNameById = {};
        users.forEach(u => {
          const display = u?.display_name || '';
          avatarMap[display] = u?.avatar || null;
          userNameById[u?.user_id] = display;
        });

        const pToTeam = {};
        rosters.forEach(r => {
          const ownerName = userNameById[r?.owner_id] || '';
          const plist = Array.isArray(r?.players) ? r.players : [];
          plist.forEach(pid => {
            pToTeam[String(pid)] = ownerName;
          });
        });

        if (!cancelled) {
          setTeamAvatars(avatarMap);
          setTeamNameMap(pToTeam);
        }
      } catch (e) {
        if (!cancelled) {
          setTeamAvatars({});
          setTeamNameMap({});
        }
      }
    }
    fetchTeams();
    return () => { cancelled = true; };
  }, [leagueId]);

  // Build rows with ranks
  const rows = useMemo(() => {
    const entries = Object.entries(playerTotals)
      .filter(([, pts]) => toNumber(pts) > 0)
      .map(([playerId, points]) => {
        const meta = playersMeta[String(playerId)] || {};
        const games = toNumber(playerWeeks[String(playerId)], 0);
        const ppg = games > 0 ? toNumber(points, 0) / games : 0;
        return {
          playerId,
          playerName: meta.playerName || playerId,
          position: meta.position || '-',
          points: toNumber(points, 0),
          ppg,
          games,
        };
      });

    // Filter by search/position
    const filtered = entries.filter(r => {
      const term = searchTerm.trim().toLowerCase();
      const nameOk = !term || String(r.playerName).toLowerCase().includes(term);
      const posOk = positionFilter === 'ALL' || String(r.position).toUpperCase() === positionFilter;
      const teamName = teamNameMap[String(r.playerId)] || '-';
      const teamOk = teamFilter === 'ALL' || teamName === teamFilter;
      return nameOk && posOk && teamOk;
    });

    // Overall ranks (desc by points)
  const sortedOverall = [...entries].sort((a, b) => b.points - a.points);
    const overallRankMap = new Map(sortedOverall.map((r, i) => [r.playerId, i + 1]));

    // Position ranks
    const posRankMap = new Map();
    const byPos = new Map();
    entries.forEach(r => {
      const key = String(r.position).toUpperCase();
      if (!byPos.has(key)) byPos.set(key, []);
      byPos.get(key).push(r);
    });
    for (const [pos, list] of byPos.entries()) {
      list.sort((a, b) => b.points - a.points);
      list.forEach((r, i) => {
        posRankMap.set(`${pos}:${r.playerId}`, i + 1);
      });
    }

    const withRanks = filtered.map(r => ({
      ...r,
      team: teamNameMap[String(r.playerId)] || '-',
      overallRank: overallRankMap.get(r.playerId) || null,
      positionRank: posRankMap.get(`${String(r.position).toUpperCase()}:${r.playerId}`) || null,
    }));

    // Sorting
    const key = sortConfig.key;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const sorted = [...withRanks].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return sorted;
  }, [playerTotals, playerWeeks, playersMeta, sortConfig, searchTerm, positionFilter, teamFilter, teamNameMap]);

  function handleSort(key) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  const visibleRows = rows.slice(0, visibleCount);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Player Card Modal */}
      {selectedPlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedPlayerId(null)}
        >
          <div
            className="bg-transparent p-0 rounded-lg shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <PlayerProfileCard
              playerId={selectedPlayerId}
              expanded={true}
              className="w-56 h-80 sm:w-72 sm:h-[26rem] md:w-80 md:h-[30rem] max-w-full max-h-[90vh]"
              teamAvatars={teamAvatars}
              teamName={teamNameMap[String(selectedPlayerId)] || ''}
              onExpandClick={() => setSelectedPlayerId(null)}
            />
            <button
              className="absolute top-2 right-2 text-white bg-black/60 rounded-full px-3 py-1 hover:bg-black"
              onClick={() => setSelectedPlayerId(null)}
            >
              ×
            </button>
          </div>
          <EscapeKeyListener onEscape={() => setSelectedPlayerId(null)} />
          <SwipeDownListener onSwipeDown={() => setSelectedPlayerId(null)} />
        </div>
      )}

      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img src="/logo.png" alt="BBB League" className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`} />
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>Player Performance</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-transparent transition-all w-full md:w-64"
          />
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white w-full md:w-48"
          >
            <option value="ALL">All Positions</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="p-3 rounded bg-white/5 border border-white/10 text-white w-full md:w-64"
          >
            <option value="ALL">All Teams</option>
            {Array.from(new Set(Object.values(teamNameMap))).sort((a,b)=>String(a).localeCompare(String(b))).map(name => (
              <option key={name || '-'} value={name || '-'}>{name || '-'}</option>
            ))}
          </select>
        </div>

        <div className="text-[#FF4B1F] mb-1" style={{ fontSize: '0.9rem' }}>
          Points scored only include weeks the player was on a roster
        </div>
        <div className="text-[#FF4B1F] mb-3" style={{ fontSize: '0.9rem' }}>
          PPG excludes games with 0 points scored
        </div>

        {/* Mobile cards */}
        <div className="block md:hidden space-y-3">
          {visibleRows.map((r) => (
            <div key={`card-${r.playerId}`} className="bg-black/20 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div onClick={() => setSelectedPlayerId(r.playerId)} className="cursor-pointer">
                  <PlayerProfileCard playerId={r.playerId} expanded={false} className="w-10 h-10 rounded-full overflow-hidden" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button className="text-white font-semibold underline truncate" onClick={() => setSelectedPlayerId(r.playerId)}>{r.playerName}</button>
                    <span className="text-white/70 text-sm">[{r.position}]</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/80 mt-1">
                    {teamAvatars[r.team] ? (
                      <img src={`https://sleepercdn.com/avatars/${teamAvatars[r.team]}`} alt={r.team} className="w-4 h-4 rounded-full" />
                    ) : <span className="w-4 h-4 rounded-full bg-white/10 inline-block" />}
                    <span className="truncate">{r.team}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Points:</span> <span className="font-semibold">{r.points.toFixed(2)}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">PPG:</span> <span className="font-semibold">{r.ppg.toFixed(2)}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Overall Rank:</span> <span className="font-semibold">{r.overallRank ?? '-'}</span></div>
                <div className="bg-white/5 rounded px-2 py-1"><span className="text-white/70">Pos Rank:</span> <span className="font-semibold">{r.positionRank ?? '-'}</span></div>
              </div>
            </div>
          ))}
          {visibleCount < rows.length && (
            <div className="flex justify-center py-2">
              <button onClick={() => setVisibleCount(c => c + 100)} className="px-4 py-2 rounded bg-[#FF4B1F] text-white font-semibold hover:bg-[#e03e0f] transition">Show More</button>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-white/10">
                {[
                  { key: 'profile', label: '' },
                  { key: 'playerName', label: 'Player' },
                  { key: 'team', label: 'Team' },
                  { key: 'position', label: 'Pos' },
                  { key: 'points', label: 'Points' },
                  { key: 'ppg', label: 'PPG' },
                  { key: 'overallRank', label: 'Points (Overall Rank)' },
                  { key: 'positionRank', label: 'Points (Position Rank)' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={key === 'profile' ? undefined : (e) => { e.stopPropagation(); handleSort(key); }}
                    className={`p-2 md:p-3 text-left transition-colors ${key === 'profile' ? '' : 'cursor-pointer hover:bg-white/5'} ${['team','overallRank','positionRank'].includes(key) ? 'hidden md:table-cell' : ''}`}
                    style={key === 'profile' ? {} : { userSelect: 'none' }}
                  >
                    <div className="flex items-center gap-2">
                      {label}
                      {key !== 'profile' && sortConfig.key === key && (
                        <span className="text-[#FF4B1F]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.playerId} className={`hover:bg-white/5 transition-colors border-b border-white/5 last:border-0`}>
                  {/* PlayerProfileCard column */}
                  <td
                    className="p-2 md:p-3 align-middle"
                    style={{ width: '40px', minWidth: '40px', cursor: 'pointer' }}
                    onClick={() => setSelectedPlayerId(r.playerId)}
                    title="View Player Card"
                  >
                    <PlayerProfileCard
                      playerId={r.playerId}
                      expanded={false}
                      className="w-8 h-8 rounded-full overflow-hidden shadow object-cover m-0 p-0"
                    />
                  </td>
                  {/* Player Name */}
                  <td className="p-2 md:p-3 font-medium underline cursor-pointer" onClick={() => setSelectedPlayerId(r.playerId)}>
                    {r.playerName}
                  </td>
                  {/* Team */}
                  <td className="p-2 md:p-3 align-middle hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      {teamAvatars[r.team] ? (
                        <Image
                          src={`https://sleepercdn.com/avatars/${teamAvatars[r.team]}`}
                          alt={r.team}
                          width={20}
                          height={20}
                          className="rounded-full mr-2"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                      )}
                      {r.team}
                    </div>
                  </td>
                  <td className="p-2 md:p-3">{r.position}</td>
                  <td className="p-2 md:p-3">{r.points.toFixed(2)}</td>
                  <td className="p-2 md:p-3">{r.ppg.toFixed(2)}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{r.overallRank ?? '-'}</td>
                  <td className="p-2 md:p-3 hidden md:table-cell">{r.positionRank ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleCount < rows.length && (
            <div className="flex justify-center py-4">
              <button
                onClick={() => setVisibleCount(c => c + 100)}
                className="px-4 py-2 rounded bg-[#FF4B1F] text-white font-semibold hover:bg-[#e03e0f] transition"
              >
                Show More
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
