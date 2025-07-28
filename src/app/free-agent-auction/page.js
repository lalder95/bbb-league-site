'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { formatInTimeZone } from 'date-fns-tz';

const USER_ID = '456973480269705216';

// Always get "now" in Chicago time for comparisons
function getChicagoNow() {
  // Get the current UTC time and format it as Chicago time
  // This returns a Date object with the same wall-clock time as Chicago
  const now = new Date();
  // Get Chicago offset in minutes
  const offsetMinutes = -now.getTimezoneOffset();
  // Get Chicago offset in hours (Central Time is UTC-6 or UTC-5 for DST)
  // We'll use formatInTimeZone to get the correct wall time
  const chicagoString = formatInTimeZone(now, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss');
  // Parse back to Date object in Chicago wall time
  const [datePart, timePart] = chicagoString.split(' ');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = timePart.split(':');
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function formatCapSpace(value) {
  return `$${value.toFixed(1)}`;
}

function getCapSpaceColor(value) {
  if (value >= 100) return 'text-green-400';
  if (value >= 75) return 'text-yellow-400';
  if (value >= 50) return 'text-[#FF4B1F]';
  return 'text-red-500';
}

function getPlayerStartTime(draftStartDate, startDelay) {
  // Always treat draftStartDate as Chicago time
  const start = new Date(draftStartDate);
  start.setHours(start.getHours() + Number(startDelay || 0));
  return start;
}

function getPlayerEndTime(draftStartDate, startDelay, nomDuration) {
  const start = getPlayerStartTime(draftStartDate, startDelay);
  start.setMinutes(start.getMinutes() + Number(nomDuration || 0));
  return start;
}

export default function FreeAgentAuctionPage() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState(null);
  const [playerCountdowns, setPlayerCountdowns] = useState({});
  const [capTeams, setCapTeams] = useState([]);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'highBid', direction: 'desc' });
  const [filterPosition, setFilterPosition] = useState('ALL');
  const [searchName, setSearchName] = useState('');
  const initialLoadDone = useRef(false);
  const { data: session } = useSession();

  useEffect(() => {
    if (!draft || !draft.players) return;
    const interval = setInterval(() => {
      const now = getChicagoNow();
      const countdowns = {};
      draft.players.forEach(p => {
        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
        const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration);
        if (now < playerStartTime) {
          const diff = playerStartTime - now;
          if (diff <= 0) {
            countdowns[p.playerId] = '';
          } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);
            countdowns[p.playerId] = (
              <span className="text-green-400 font-mono">{`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</span>
            );
          }
        } else if (now >= playerStartTime && now < playerEndTime) {
          const diff = playerEndTime - now;
          if (diff <= 0) {
            countdowns[p.playerId] = '';
          } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);
            countdowns[p.playerId] = (
              <span className="text-red-400 font-mono">{`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</span>
            );
          }
        } else {
          countdowns[p.playerId] = '';
        }
      });
      setPlayerCountdowns(countdowns);
    }, 1000);
    return () => clearInterval(interval);
  }, [draft]);

  const fetchDraft = async (showLoading = false) => {
    if (showLoading && !initialLoadDone.current) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/drafts');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const latestDraft = data
          .filter(d => d.state === 'ACTIVE')
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        setDraft(latestDraft || null);
      } else {
        setDraft(null);
      }
    } catch {
      setError('Failed to load draft.');
    } finally {
      if (showLoading && !initialLoadDone.current) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    }
  };

  useEffect(() => {
    fetchDraft(true);
    const interval = setInterval(() => {
      fetchDraft(false);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!draft?.startDate) return;
    const interval = setInterval(() => {
      const now = getChicagoNow();
      const start = new Date(draft.startDate);
      const diff = start - now;
      if (diff <= 0) {
        setCountdown('Auction Started!');
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setCountdown(
          `${hours.toString().padStart(2, '0')}:` +
          `${minutes.toString().padStart(2, '0')}:` +
          `${seconds.toString().padStart(2, '0')}`
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [draft?.startDate]);

  const handleBid = async () => {
    if (
      !selectedPlayer ||
      !bidAmount ||
      isNaN(Number(bidAmount)) ||
      !Number.isInteger(Number(bidAmount))
    ) {
      setError('Bid must be a whole number.');
      return;
    }

    const res = await fetch('/api/admin/drafts');
    const drafts = await res.json();
    const latestDraft = Array.isArray(drafts)
      ? drafts.filter(d => d.state === 'ACTIVE').sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]
      : null;
    if (!latestDraft) {
      setError('Draft not found.');
      return;
    }
    const currentResult = latestDraft.results.find(r => r.playerId === selectedPlayer.playerId);
    const currentHighBid = currentResult ? Number(currentResult.highBid) : 0;

    if (Number(bidAmount) >= currentHighBid + 5 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setPlacingBid(true);
    setSuccess('');
    setError('');
    setShowConfirm(false);

    try {
      if (Number(bidAmount) <= currentHighBid) {
        setError('Bid must be higher than the current high bid.');
        setPlacingBid(false);
        return;
      }

      const newResult = {
        username: session?.user?.name || 'Unknown',
        playerId: selectedPlayer.playerId,
        highBid: Number(bidAmount),
        state: 'ACTIVE',
        expiration: '',
      };

      const updatedResults = [
        ...latestDraft.results.filter(r => r.playerId !== selectedPlayer.playerId),
        newResult,
      ];

      const patchRes = await fetch(`/api/admin/drafts/${latestDraft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: updatedResults }),
      });

      if (!patchRes.ok) throw new Error(await patchRes.text());

      setSuccess('Bid placed!');
      setSelectedPlayer(null);
      setBidAmount('');
      await fetchDraft();
    } catch (err) {
      setError(err.message || 'Failed to place bid.');
    } finally {
      setPlacingBid(false);
    }
  };

  const currentHighBid = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.highBid ?? 0
      )
    : 0;

  useEffect(() => {
    async function fetchCapData() {
      try {
        const contractsResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const contractsText = await contractsResponse.text();

        const finesResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv');
        const finesText = await finesResponse.text();

        const contractRows = contractsText.split('\n');
        const contracts = contractRows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',');
            const status = values[14];
            const isActive = status === 'Active';

            return {
              team: values[33],
              isActive: isActive,
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              year2: isActive ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
              year3: isActive ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
              year4: isActive ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            };
          });

        const finesRows = finesText.split('\n');
        const fines = finesRows.slice(1)
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

        const teamCaps = {};

        contracts.forEach(contract => {
          if (!teamCaps[contract.team]) {
            teamCaps[contract.team] = {
              team: contract.team,
              curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
            };
          }

          const capData = teamCaps[contract.team];
          if (contract.isActive) {
            capData.curYear.active += contract.curYear;
            capData.year2.active += contract.year2;
            capData.year3.active += contract.year3;
            capData.year4.active += contract.year4;
          } else {
            capData.curYear.dead += contract.curYear;
            capData.year2.dead += contract.year2;
            capData.year3.dead += contract.year3;
            capData.year4.dead += contract.year4;
          }
        });

        Object.entries(teamCaps).forEach(([teamName, capData]) => {
          const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };

          capData.curYear.fines = teamFines.curYear;
          capData.year2.fines = teamFines.year2;
          capData.year3.fines = teamFines.year3;
          capData.year4.fines = teamFines.year4;

          ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
            capData[year].remaining = capData[year].total -
              capData[year].active -
              capData[year].dead -
              capData[year].fines;
          });
        });

        setCapTeams(Object.values(teamCaps));
      } catch (error) {
        // Optionally handle error
      }
    }
    fetchCapData();
  }, []);

  useEffect(() => {
    async function fetchAvatars() {
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        if (bbbLeagues.length === 0 && userLeagues.length > 0) {
          bbbLeagues = [userLeagues[0]];
        }

        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        const leagueId = mostRecentLeague.league_id;

        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        if (!users || !Array.isArray(users)) return;
        const avatarMap = {};
        users.forEach(user => {
          avatarMap[user.display_name] = user.avatar;
        });
        setTeamAvatars(avatarMap);
      } catch (e) {
        // Optionally handle error
      }
    }
    fetchAvatars();
  }, []);

  const filteredPlayers = React.useMemo(() => {
    if (!draft?.players) return [];
    return draft.players.filter(p => {
      let positionMatch = filterPosition === 'ALL' || p.position === filterPosition;
      let nameMatch = !searchName || p.playerName.toLowerCase().includes(searchName.toLowerCase());
      return positionMatch && nameMatch;
    });
  }, [draft?.players, draft?.startDate, draft?.nomDuration, filterPosition, searchName]);

  const sortedPlayers = React.useMemo(() => {
    const playersCopy = [...filteredPlayers];
    playersCopy.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'highBid') {
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.highBid ?? 0;
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.highBid ?? 0;
      }
      if (sortConfig.key === 'highBidder') {
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.username ?? '';
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.username ?? '';
      }

      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return playersCopy;
  }, [filteredPlayers, draft?.results, sortConfig]);

  // Chicago time grouping
  const groupedPlayers = React.useMemo(() => {
    if (!sortedPlayers) return { Active: [], Upcoming: [], Ended: [] };
    const now = getChicagoNow();
    const groups = { Active: [], Upcoming: [], Ended: [] };
    sortedPlayers.forEach(p => {
      const start = getPlayerStartTime(draft.startDate, p.startDelay);
      const end = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration);
      if (now < start) groups.Upcoming.push(p);
      else if (now >= start && now < end) groups.Active.push(p);
      else groups.Ended.push(p);
    });
    return groups;
  }, [sortedPlayers, draft?.startDate, draft?.nomDuration]);

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#001A2B] flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent mb-4"></div>
        <p className="text-white mb-8">Loading auction data...</p>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center flex-col p-6">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Free Agent Auction</h1>
        <p className="text-lg text-white/70">No active draft found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Header Banner */}
      <div className="p-6 bg-black/30 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center">
          <img
            src="/logo.png"
            alt="BBB League"
            className="h-16 w-16 transition-transform hover:scale-105 mb-2"
          />
          {draft?.startDate && countdown !== 'Auction Started!' && (
            <div className="mt-2 text-xl font-bold text-[#FF4B1F]">
              Auction Starts In: <span className="font-mono">{countdown}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent">
        <div className="max-w-7xl mx-auto p-6 flex flex-col md:flex-row items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Free Agent Auction</h2>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Auction Table */}
        <div className="lg:col-span-2 space-y-8">
          {/* Subtle error message at the top of the table */}
          {error && (
            <div className="mb-4 px-4 py-2 bg-red-900/80 text-red-300 rounded border border-red-700">
              {error}
            </div>
          )}
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#FF4B1F]">Available Players</h2>
            </div>
            {/* Filters and status area above the table */}
            <div className="flex items-center justify-end mb-4 gap-4">
              {/* Search by player name - placed to the left of filters */}
              <div>
                <label htmlFor="searchName" className="mr-2 font-medium">Search:</label>
                <input
                  id="searchName"
                  type="text"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  className="bg-black/40 border border-white/20 rounded px-2 py-1 text-white"
                  placeholder="Player name..."
                />
              </div>
              {/* Position Filter */}
              <div>
                <label htmlFor="filterPosition" className="mr-2 font-medium">Position:</label>
                <select
                  id="filterPosition"
                  value={filterPosition}
                  onChange={e => setFilterPosition(e.target.value)}
                  className="bg-black/40 border border-white/20 rounded px-2 py-1 text-white"
                >
                  <option value="ALL">ALL</option>
                  {Array.from(new Set(draft?.players?.map(p => p.position) ?? []))
                    .sort()
                    .map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96 border border-white/10 rounded bg-white/5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-[#FF4B1F]/20 text-white/90">
                    <th className="py-2 px-3 text-left cursor-pointer" onClick={() => handleSort('playerName')}>
                      Player {sortConfig.key === 'playerName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 px-3 text-left cursor-pointer" onClick={() => handleSort('position')}>
                      Position {sortConfig.key === 'position' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 px-3 text-left cursor-pointer" onClick={() => handleSort('ktc')}>
                      KTC {sortConfig.key === 'ktc' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 px-3 text-left cursor-pointer" onClick={() => handleSort('highBid')}>
                      High Bid {sortConfig.key === 'highBid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 px-3 text-left cursor-pointer" onClick={() => handleSort('highBidder')}>
                      High Bidder {sortConfig.key === 'highBidder' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 px-3 text-left">Start Date</th>
                    <th className="py-2 px-3 text-left">End Date</th>
                    <th className="py-2 px-3 text-left">Countdown</th>
                    <th className="py-2 px-3 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Active */}
                  {groupedPlayers.Active.length > 0 && (
                    <>
                      <tr>
                        <td colSpan="9" className="bg-green-900/40 text-green-300 font-bold px-3 py-2">Active</td>
                      </tr>
                      {groupedPlayers.Active.map(p => {
                        const result = draft.results?.find(r => r.playerId === p.playerId);
                        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
                        const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration);
                        const now = getChicagoNow();
                        const canBid =
                          now > playerStartTime &&
                          now < playerEndTime &&
                          (countdown === 'Auction Started!' || countdown === '');

                        const isUserHighBidder =
                          result && session?.user?.name &&
                          result.username === session.user.name;

                        return (
                          <tr
                            key={p.playerId}
                            className={`hover:bg-black/20 ${isUserHighBidder ? 'bg-[#FF4B1F]/40' : ''}`}
                          >
                            <td className="py-2 px-3">{p.playerName}</td>
                            <td className="py-2 px-3">{p.position}</td>
                            <td className="py-2 px-3">{p.ktc ?? '-'}</td>
                            <td className="py-2 px-3">
                              {result ? `$${result.highBid}` : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {result ? result.username : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerStartTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerStartTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerEndTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerEndTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">{playerCountdowns[p.playerId] ?? ''}</td>
                            <td className="py-2 px-3 flex gap-2">
                              {canBid && (
                                <button
                                  className="px-2 py-1 bg-blue-600 rounded text-white hover:bg-blue-700"
                                  onClick={() => setSelectedPlayer(p)}
                                >
                                  Bid
                                </button>
                              )}
                              {session?.user?.role === 'admin' && draft.results?.some(r => r.playerId === p.playerId) && (
                                <>
                                  <button
                                    className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                    title="Reset Bid"
                                    onClick={() => setResetConfirmId(p.playerId)}
                                  >
                                    Reset
                                  </button>
                                  {resetConfirmId === p.playerId && (
                                    <div className="absolute z-10 mt-2 bg-black border border-red-700 rounded p-3 text-sm text-red-200 shadow-lg">
                                      <div>Are you sure you want to reset this player's bid?</div>
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                          onClick={async () => {
                                            const updatedResults = draft.results.filter(r => r.playerId !== p.playerId);
                                            await fetch(`/api/admin/drafts/${draft._id}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ results: updatedResults }),
                                            });
                                            setResetConfirmId(null);
                                            await fetchDraft();
                                          }}
                                        >
                                          Yes, Reset
                                        </button>
                                        <button
                                          className="px-2 py-1 bg-gray-600 rounded text-white hover:bg-gray-700"
                                          onClick={() => setResetConfirmId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {/* Upcoming */}
                  {groupedPlayers.Upcoming.length > 0 && (
                    <>
                      <tr>
                        <td colSpan="9" className="bg-blue-900/40 text-blue-300 font-bold px-3 py-2">Upcoming</td>
                      </tr>
                      {groupedPlayers.Upcoming.map(p => {
                        const result = draft.results?.find(r => r.playerId === p.playerId);
                        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
                        const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration);
                        const now = getChicagoNow();
                        const canBid =
                          now > playerStartTime &&
                          now < playerEndTime &&
                          (countdown === 'Auction Started!' || countdown === '');

                        const isUserHighBidder =
                          result && session?.user?.name &&
                          result.username === session.user.name;

                        return (
                          <tr
                            key={p.playerId}
                            className={`hover:bg-black/20 ${isUserHighBidder ? 'bg-[#FF4B1F]/40' : ''}`}
                          >
                            <td className="py-2 px-3">{p.playerName}</td>
                            <td className="py-2 px-3">{p.position}</td>
                            <td className="py-2 px-3">{p.ktc ?? '-'}</td>
                            <td className="py-2 px-3">
                              {result ? `$${result.highBid}` : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {result ? result.username : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerStartTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerStartTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerEndTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerEndTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">{playerCountdowns[p.playerId] ?? ''}</td>
                            <td className="py-2 px-3 flex gap-2">
                              {canBid && (
                                <button
                                  className="px-2 py-1 bg-blue-600 rounded text-white hover:bg-blue-700"
                                  onClick={() => setSelectedPlayer(p)}
                                >
                                  Bid
                                </button>
                              )}
                              {session?.user?.role === 'admin' && draft.results?.some(r => r.playerId === p.playerId) && (
                                <>
                                  <button
                                    className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                    title="Reset Bid"
                                    onClick={() => setResetConfirmId(p.playerId)}
                                  >
                                    Reset
                                  </button>
                                  {resetConfirmId === p.playerId && (
                                    <div className="absolute z-10 mt-2 bg-black border border-red-700 rounded p-3 text-sm text-red-200 shadow-lg">
                                      <div>Are you sure you want to reset this player's bid?</div>
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                          onClick={async () => {
                                            const updatedResults = draft.results.filter(r => r.playerId !== p.playerId);
                                            await fetch(`/api/admin/drafts/${draft._id}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ results: updatedResults }),
                                            });
                                            setResetConfirmId(null);
                                            await fetchDraft();
                                          }}
                                        >
                                          Yes, Reset
                                        </button>
                                        <button
                                          className="px-2 py-1 bg-gray-600 rounded text-white hover:bg-gray-700"
                                          onClick={() => setResetConfirmId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {/* Ended */}
                  {groupedPlayers.Ended.length > 0 && (
                    <>
                      <tr>
                        <td colSpan="9" className="bg-gray-900/40 text-gray-300 font-bold px-3 py-2">Final</td>
                      </tr>
                      {groupedPlayers.Ended.map(p => {
                        const result = draft.results?.find(r => r.playerId === p.playerId);
                        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
                        const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration);
                        const now = getChicagoNow();
                        const canBid =
                          now > playerStartTime &&
                          now < playerEndTime &&
                          (countdown === 'Auction Started!' || countdown === '');

                        const isUserHighBidder =
                          result && session?.user?.name &&
                          result.username === session.user.name;

                        return (
                          <tr
                            key={p.playerId}
                            className={`hover:bg-black/20 ${isUserHighBidder ? 'bg-[#FF4B1F]/40' : ''}`}
                          >
                            <td className="py-2 px-3">{p.playerName}</td>
                            <td className="py-2 px-3">{p.position}</td>
                            <td className="py-2 px-3">{p.ktc ?? '-'}</td>
                            <td className="py-2 px-3">
                              {result ? `$${result.highBid}` : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {result ? result.username : '-'}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerStartTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerStartTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">
                              {isNaN(playerEndTime.getTime())
                                ? '-'
                                : formatInTimeZone(playerEndTime, 'America/Chicago', 'yyyy-MM-dd h:mm aaaa')}
                            </td>
                            <td className="py-2 px-3">{playerCountdowns[p.playerId] ?? ''}</td>
                            <td className="py-2 px-3 flex gap-2">
                              {canBid && (
                                <button
                                  className="px-2 py-1 bg-blue-600 rounded text-white hover:bg-blue-700"
                                  onClick={() => setSelectedPlayer(p)}
                                >
                                  Bid
                                </button>
                              )}
                              {session?.user?.role === 'admin' && draft.results?.some(r => r.playerId === p.playerId) && (
                                <>
                                  <button
                                    className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                    title="Reset Bid"
                                    onClick={() => setResetConfirmId(p.playerId)}
                                  >
                                    Reset
                                  </button>
                                  {resetConfirmId === p.playerId && (
                                    <div className="absolute z-10 mt-2 bg-black border border-red-700 rounded p-3 text-sm text-red-200 shadow-lg">
                                      <div>Are you sure you want to reset this player's bid?</div>
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                                          onClick={async () => {
                                            const updatedResults = draft.results.filter(r => r.playerId !== p.playerId);
                                            await fetch(`/api/admin/drafts/${draft._id}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ results: updatedResults }),
                                            });
                                            setResetConfirmId(null);
                                            await fetchDraft();
                                          }}
                                        >
                                          Yes, Reset
                                        </button>
                                        <button
                                          className="px-2 py-1 bg-gray-600 rounded text-white hover:bg-gray-700"
                                          onClick={() => setResetConfirmId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {selectedPlayer && (
            <div className="bg-black/30 rounded-lg border border-white/10 p-6 max-w-md mx-auto">
              <h3 className="text-lg font-bold mb-2 text-[#FF4B1F]">Bid on {selectedPlayer.playerName}</h3>
              <input
                type="number"
                min={1}
                step={1}
                className="w-full p-2 rounded bg-white/10 border border-white/10 text-white mb-2"
                placeholder="Enter bid amount"
                value={bidAmount}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setBidAmount(val);
                }}
              />
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors"
                  onClick={handleBid}
                  disabled={placingBid || !bidAmount}
                >
                  {placingBid ? 'Placing Bid...' : 'Place Bid'}
                </button>
                <button
                  className="px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                  onClick={() => setSelectedPlayer(null)}
                  disabled={placingBid}
                >
                  Cancel
                </button>
              </div>
              {success && <div className="text-green-400 mt-2">{success}</div>}
              {error && (
                <div className="mt-2 px-3 py-2 bg-red-900/80 text-red-300 rounded border border-red-700">
                  {error}
                </div>
              )}
              {showConfirm && (
                <div className="mt-2 px-3 py-2 bg-yellow-900/80 text-yellow-200 rounded border border-yellow-700">
                  Your bid is ${Number(bidAmount) - currentHighBid} above the current high bid. Are you sure?
                  <div className="flex gap-2 mt-2">
                    <button
                      className="px-3 py-1 bg-yellow-600 rounded text-white hover:bg-yellow-700"
                      onClick={() => handleBid()}
                      disabled={placingBid}
                    >
                      Yes, Place Bid
                    </button>
                    <button
                      className="px-3 py-1 bg-gray-600 rounded text-white hover:bg-gray-700"
                      onClick={() => setShowConfirm(false)}
                      disabled={placingBid}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-4 text-[#FF4B1F]">Cap Space</h2>
            <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10">
                    <th className="p-3 text-left">Team</th>
                    <th className="p-3 text-left">Cap Space</th>
                    <th className="p-3 text-left">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {capTeams
                    .sort((a, b) => a.team.localeCompare(b.team))
                    .map((team, idx) => {
                      const spend = draft?.results
                        ?.filter(r => r.username === team.team)
                        ?.reduce((sum, r) => sum + (Number(r.highBid) || 0), 0) || 0;
                      return (
                        <tr key={team.team || idx} className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                          <td className="p-3 font-medium flex items-center gap-2">
                            {teamAvatars[team.team] ? (
                              <img
                                src={`https://sleepercdn.com/avatars/${teamAvatars[team.team]}`}
                                alt={team.team}
                                className="w-5 h-5 rounded-full mr-2"
                              />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                            )}
                            {team.team}
                          </td>
                          <td className={`p-3 ${getCapSpaceColor(team.curYear.remaining)}`}>
                            {formatCapSpace(team.curYear.remaining)}
                          </td>
                          <td className="p-3 text-blue-300">
                            {formatCapSpace(spend)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Reusable Link Card for sidebar quick links
function LinkCard({ title, description, href }) {
  return (
    <Link 
      href={href}
      className="block bg-black/20 rounded-lg p-3 hover:bg-black/30 transition-colors"
    >
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-white/70">{description}</p>
    </Link>
  );
}