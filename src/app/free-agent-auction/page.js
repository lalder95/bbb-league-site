'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';

const USER_ID = '456973480269705216';

// Always get "now" in Chicago time for comparisons
function getChicagoNow() {
  const now = new Date();
  const chicagoString = formatInTimeZone(now, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss');
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
  const start = new Date(draftStartDate);
  start.setHours(start.getHours() + Number(startDelay || 0));
  return start;
}

// End date is at least 24 hours after the most recent bid for this player
function getPlayerEndTime(draftStartDate, startDelay, nomDuration, contractPoints = 0, bidLog = [], playerId, draftBlind = false) {
  const start = getPlayerStartTime(draftStartDate, startDelay);

  // If draft is blind, do NOT reduce the timer and do NOT enforce 24-hour minimum after each bid
  let effectiveDuration;
  if (draftBlind) {
    effectiveDuration = Number(nomDuration || 0);
    const calculatedEnd = new Date(start);
    calculatedEnd.setMinutes(calculatedEnd.getMinutes() + effectiveDuration);
    return calculatedEnd;
  } else {
    const reductionPercent = Math.min(Number(contractPoints) * 0.0138, 0.95);
    effectiveDuration = Number(nomDuration || 0) * (1 - reductionPercent);
    const calculatedEnd = new Date(start);
    calculatedEnd.setMinutes(calculatedEnd.getMinutes() + effectiveDuration);

    // Find the most recent bid for this player
    const playerBids = (bidLog || []).filter(b => String(b.playerId) === String(playerId));
    let latestBidTime = null;
    if (playerBids.length > 0) {
      latestBidTime = new Date(
        playerBids.reduce((latest, b) =>
          !latest || new Date(b.timestamp) > new Date(latest) ? b.timestamp : latest
        , null)
      );
    }

    // 24 hours after the most recent bid
    let minEnd = null;
    if (latestBidTime) {
      minEnd = new Date(latestBidTime);
      minEnd.setHours(minEnd.getHours() + 24);
    }

    // The end time is the later of calculatedEnd and minEnd
    if (minEnd && minEnd > calculatedEnd) {
      return minEnd;
    }
    return calculatedEnd;
  }
}

// Helper to check if current user is in draft users
function isUserInDraft(session, draft) {
  if (!session?.user?.name || !Array.isArray(draft?.users)) return false;
  return draft.users.some(u => u.username === session.user.name);
}

function calculateContractScore(salary, years) {
  salary = Number(salary);
  years = Number(years);
  let total = 0;
  let yearSalary = salary;
  for (let y = 1; y <= years; y++) {
    if (y > 1) {
      yearSalary = Math.ceil(yearSalary * 1.1 * 10) / 10;
    }
    if (y === 1) total += yearSalary * 1.0;
    if (y === 2) total += yearSalary * 0.8;
    if (y === 3) total += yearSalary * 0.6;
    if (y === 4) total += yearSalary * 0.4;
  }
  return Math.round(total * 10) / 10;
}

export default function FreeAgentAuctionPage() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [bidSalary, setBidSalary] = useState('');
  const [bidYears, setBidYears] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState(null);
  const [playerCountdowns, setPlayerCountdowns] = useState({});
  const [capTeams, setCapTeams] = useState([]);
  const [teamAvatars, setTeamAvatars] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'countdown', direction: 'asc' });
  const [filterPosition, setFilterPosition] = useState('ALL');
  const [searchName, setSearchName] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showCapModal, setShowCapModal] = useState(false);
  const [bidLogSearch, setBidLogSearch] = useState('');
  const [bidLogBidder, setBidLogBidder] = useState('ALL');
  const [showBidLogModal, setShowBidLogModal] = useState(false);
  const [showResetButtons, setShowResetButtons] = useState(false);
  const [retractConfirmPlayerId, setRetractConfirmPlayerId] = useState(null);
  const initialLoadDone = useRef(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!draft || !draft.players) return;
    const interval = setInterval(() => {
      const now = getChicagoNow();
      const countdowns = {};
      draft.players.forEach(p => {
        const result = draft.results?.find(r => r.playerId === p.playerId);
        const contractPoints = result ? Number(result.contractPoints) : 0;
        const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
        const playerEndTime = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration, contractPoints, draft.bidLog, p.playerId, draft.blind);
        let group = 'Ended';
        if (now < playerStartTime) group = 'Upcoming';
        else if (now >= playerStartTime && now < playerEndTime) group = 'Active';

        let colorClass = '';
        if (group === 'Active') colorClass = 'text-green-400';
        else if (group === 'Upcoming') colorClass = 'text-blue-400';
        else colorClass = 'text-gray-400';

        let diff = 0;
        if (group === 'Upcoming') diff = playerStartTime - now;
        else if (group === 'Active') diff = playerEndTime - now;

        countdowns[p.playerId] =
          diff > 0
            ? <span className={colorClass}>{formatCountdown(diff)}</span>
            : '';
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
      if (!res.ok) {
        setError('Failed to load draft.');
        setDraft(null);
        return;
      }
      const text = await res.text();
      if (!text) {
        setDraft(null);
        return;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setError('Invalid draft data.');
        setDraft(null);
        return;
      }
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
      setDraft(null);
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
        setCountdown(formatCountdown(diff));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [draft?.startDate]);

  const handleBid = async () => {
    if (!isUserInDraft(session, draft)) {
      setError('You are not eligible to bid in this auction.');
      return;
    }

    const salary = Number(bidSalary);
    const years = Number(bidYears);

    if (
      !selectedPlayer ||
      !bidSalary ||
      !bidYears ||
      isNaN(salary) ||
      isNaN(years) ||
      salary < 1 ||
      salary > 200 ||
      years < 1 ||
      years > 4 ||
      !/^\d+(\.\d{1})?$/.test(bidSalary) ||
      (salary * 10) % 1 !== 0
    ) {
      setError('Salary must be $1.0-$200.0 in $0.1 increments. Years must be 1-4.');
      return;
    }

    const contractPoints = calculateContractScore(salary, years);

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
    const currentHighScore = currentResult ? Number(currentResult.contractPoints) : 0;

    if (contractPoints >= currentHighScore + 5 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setPlacingBid(true);
    setSuccess('');
    setError('');
    setShowConfirm(false);

    try {
      // Only enforce "must be higher than current high bid" if NOT blind
      if (!draft?.blind && contractPoints <= currentHighScore) {
        setError('Contract Score must be higher than the current high bid.');
        setPlacingBid(false);
        return;
      }

      if (draft?.blind) {
        // Prevent duplicate or lower contract score for user's own bid in blind draft
        const userBids = (draft.bidLog || []).filter(
          b => b.playerId === selectedPlayer.playerId && b.username === session?.user?.name
        );
        if (userBids.length > 0) {
          const userLastBid = userBids.reduce((latest, b) =>
            !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
            null
          );
          if (contractPoints <= Number(userLastBid.contractPoints)) {
            setError('Your new bid must have a higher contract score than your previous bid for this player. To lower your bid, you must cancel the current bid and place a new bid.');
            setPlacingBid(false);
            return;
          }
        }
      }

      const newResult = {
        username: session?.user?.name || 'Unknown',
        playerId: selectedPlayer.playerId,
        salary: salary,
        years: years,
        contractPoints: contractPoints,
        state: 'ACTIVE',
        expiration: '',
      };

      const newBid = {
        username: session?.user?.name || 'Unknown',
        playerId: selectedPlayer.playerId,
        salary: salary,
        years: years,
        contractPoints: contractPoints,
        comments: '', // For future use
        timestamp: new Date().toISOString()
      };

      const updatedResults = [
        ...latestDraft.results.filter(r => r.playerId !== selectedPlayer.playerId),
        newResult,
      ];

      const updatedBidLog = [...(latestDraft.bidLog || []), newBid];

      const patchRes = await fetch(`/api/admin/drafts/${latestDraft._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: updatedResults, bidLog: updatedBidLog }),
      });

      if (!patchRes.ok) throw new Error(await patchRes.text());

      setSuccess('Bid placed!');
      setSelectedPlayer(null);
      setBidSalary('');
      setBidYears('');
      await fetchDraft();
    } catch (err) {
      setError(err.message || 'Failed to place bid.');
    } finally {
      setPlacingBid(false);
    }
  };

  const currentHighSalary = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.salary ?? 0
      )
    : 0;
  const currentHighScore = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.contractPoints ?? 0
      )
    : 0;
  const currentHighYears = selectedPlayer
    ? Number(
        draft?.results?.find(r => r.playerId === selectedPlayer.playerId)?.years ?? 0
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

        if (draft && draft.results) {
          Object.values(teamCaps).forEach(team => {
            team.spend = draft.results
              .filter(r => r.username === team.team)
              .reduce((sum, r) => sum + (Number(r.contractPoints) || 0), 0);
          });
        }
        setCapTeams(Object.values(teamCaps));
      } catch (error) {
        // Optionally handle error
      }
    }
    fetchCapData();
  }, [draft]);

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
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.contractPoints ?? 0;
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.contractPoints ?? 0;
      }
      if (sortConfig.key === 'highBidder') {
        aValue = draft.results?.find(r => r.playerId === a.playerId)?.username ?? '';
        bValue = draft.results?.find(r => r.playerId === b.playerId)?.username ?? '';
      }
      if (sortConfig.key === 'startDate') {
        aValue = getPlayerStartTime(draft.startDate, a.startDelay);
        bValue = getPlayerStartTime(draft.startDate, b.startDelay);
      }
      if (sortConfig.key === 'endDate') {
        const aResult = draft.results?.find(r => r.playerId === a.playerId);
        const bResult = draft.results?.find(r => r.playerId === b.playerId);
        const aContractPoints = aResult ? Number(aResult.contractPoints) : 0;
        const bContractPoints = bResult ? Number(bResult.contractPoints) : 0;
        aValue = getPlayerEndTime(draft.startDate, a.startDelay, draft.nomDuration, aContractPoints, draft.bidLog, a.playerId, draft.blind);
        bValue = getPlayerEndTime(draft.startDate, b.startDelay, draft.nomDuration, bContractPoints, draft.bidLog, b.playerId, draft.blind);
      }
      if (sortConfig.key === 'countdown') {
        const now = getChicagoNow();
        const aResult = draft.results?.find(r => r.playerId === a.playerId);
        const bResult = draft.results?.find(r => r.playerId === b.playerId);
        const aContractPoints = aResult ? Number(aResult.contractPoints) : 0;
        const bContractPoints = bResult ? Number(bResult.contractPoints) : 0;
        const aEnd = getPlayerEndTime(draft.startDate, a.startDelay, draft.nomDuration, aContractPoints, draft.bidLog, a.playerId, draft.blind);
        const bEnd = getPlayerEndTime(draft.startDate, b.startDelay, draft.nomDuration, bContractPoints, draft.bidLog, b.playerId, draft.blind);
        aValue = aEnd - now;
        bValue = bEnd - now;
      }
      if (sortConfig.key === 'ktc') {
        aValue = Number(a.ktc) || 0;
        bValue = Number(b.ktc) || 0;
      }

      // For dates, compare as numbers
      if (aValue instanceof Date && bValue instanceof Date) {
        aValue = aValue.getTime();
        bValue = bValue.getTime();
      }

      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return playersCopy;
  }, [filteredPlayers, draft?.results, sortConfig, draft?.startDate, draft?.nomDuration, draft?.bidLog]);

  const groupedPlayers = React.useMemo(() => {
    if (!sortedPlayers) return { Active: [], Upcoming: [], Ended: [] };
    const now = getChicagoNow();
    const groups = { Active: [], Upcoming: [], Ended: [] };
    sortedPlayers.forEach(p => {
      const result = draft.results?.find(r => r.playerId === p.playerId);
      const contractPoints = result ? Number(result.contractPoints) : 0;
      const start = getPlayerStartTime(draft.startDate, p.startDelay);
      const end = getPlayerEndTime(draft.startDate, p.startDelay, draft.nomDuration, contractPoints, draft.bidLog, p.playerId, draft.blind);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        groups.Ended.push(p);
      } else if (now < start) {
        groups.Upcoming.push(p);
      } else if (now >= start && now < end) {
        groups.Active.push(p);
      } else {
        groups.Ended.push(p);
      }
    });
    return groups;
  }, [sortedPlayers, draft?.startDate, draft?.nomDuration, draft?.results, draft?.bidLog]);

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  function renderPlayerRow(p, group) {
    const result = draft.results?.find(r => r.playerId === p.playerId);
    const salary = result ? Number(result.salary) : 0;
    const contractScore = result ? Number(result.contractPoints) : 0;
    const years = result ? Number(result.years) : null;
    const playerStartTime = getPlayerStartTime(draft.startDate, p.startDelay);
    const playerEndTime = getPlayerEndTime(
      draft.startDate,
      p.startDelay,
      draft.nomDuration,
      contractScore,
      draft.bidLog,
      p.playerId,
      draft.blind
    );
    const now = getChicagoNow();
    const canBid =
      now > playerStartTime &&
      now < playerEndTime &&
      (countdown === 'Auction Started!' || countdown === '') &&
      isUserInDraft(session, draft);

    const isUserHighBidder =
      result && session?.user?.name &&
      result.username === session.user.name;

    // Only highlight if not blind
    const highlightRow = isUserHighBidder && !draft?.blind;

    // Find the user's last bid for this player (if draft is blind)
    let userLastBid = null;
    if (draft?.blind && session?.user?.name) {
      const userBids = (draft.bidLog || []).filter(
        b => b.playerId === p.playerId && b.username === session.user.name
      );
      if (userBids.length > 0) {
        userLastBid = userBids.reduce((latest, b) =>
          !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
          null
        );
      }
    }

    return (
      <tr
        key={p.playerId}
        className={`
          ${highlightRow
            ? 'bg-yellow-400/20'
            : group === 'Active'
            ? (p.__rowIndex % 2 === 0 ? 'bg-green-900/20' : 'bg-green-900/10')
            : group === 'Upcoming'
            ? (p.__rowIndex % 2 === 0 ? 'bg-blue-900/20' : 'bg-blue-900/10')
            : (p.__rowIndex % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10')
          }
          hover:opacity-90
        `}
      >
        <td className="py-2 px-3 text-center align-middle"></td>
        {!draft?.blind && (
          <td className="py-2 px-3 font-extrabold text-[#FFB800] text-center align-middle">
            {result
              ? <>
                  <span className="font-mono font-extrabold text-4xl text-[#FFB800]">
                    {contractScore}
                  </span>
                  <br />
                  <span className="text-xs text-blue-300 whitespace-nowrap">
                    ${salary} / {years}y
                  </span>
                </>
              : '-'}
          </td>
        )}
        <td className="py-2 px-3 text-center align-middle">{p.playerName}</td>
        <td className="py-2 px-3 text-center align-middle">{p.position}</td>
        <td className="py-2 px-3 text-center align-middle">{p.ktc ?? '-'}</td>
        {draft?.blind && (
          <td className="py-2 px-3 text-center align-middle">
            {group === 'Ended' ? (
              // Reveal high bid and bidder when player is Final
              result ? (
                <>
                  <span className="font-mono font-extrabold text-[#FFB800]">
                    {result.contractPoints}
                  </span>
                  <br />
                  <span className="text-xs text-blue-300 whitespace-nowrap">
                    ${result.salary} / {result.years}y
                  </span>
                  <br />
                  <span className="text-xs text-green-300">
                    Winner: {result.username}
                  </span>
                </>
              ) : (
                <span className="text-gray-500 italic">No bids</span>
              )
            ) : userLastBid ? (
              <>
                <span className="font-mono font-extrabold text-[#FFB800]">
                  {userLastBid.contractPoints}
                </span>
                <br />
                <span className="text-xs text-blue-300 whitespace-nowrap">
  ${userLastBid.salary} / {userLastBid.years}y
</span>
<br />
<span className="text-gray-400 text-xs">{formatTimeAgo(userLastBid.timestamp)}</span>
<br /> {/* Add this line break before the button */}
{/* Cancel Bid button for table view */}
{session?.user?.name && (
  <button
    className="mt-2 px-3 py-1 bg-red-700 rounded text-white hover:bg-red-800 text-xs"
    onClick={() => setRetractConfirmPlayerId(p.playerId)}
  >
    Cancel Bid
  </button>
)}
              </>
            ) : (
              <span className="text-gray-500 italic">No bids</span>
            )}
          </td>
        )}
        {!draft?.blind && (
          <td className="py-2 px-3 text-center align-middle">
            <div className="flex items-center justify-center gap-2">
              {result?.username && teamAvatars[result.username] ? (
                <img
                  src={`https://sleepercdn.com/avatars/${teamAvatars[result.username]}`}
                  alt={result.username}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/10 inline-block"></span>
              )}
              <span>{result ? result.username : '-'}</span>
            </div>
          </td>
        )}
        <td className="py-2 px-3 text-center align-middle">
          <span
            className="cursor-help"
            title={
              (playerStartTime instanceof Date && !isNaN(playerStartTime) && playerEndTime instanceof Date && !isNaN(playerEndTime))
                ? `Start: ${formatInTimeZone(playerStartTime, 'America/Chicago', 'MM/dd/yyyy h:mm a')}\n` +
                  `End: ${formatInTimeZone(playerEndTime, 'America/Chicago', 'MM/dd/yyyy h:mm a')}`
                : 'Invalid time'
            }
          >
            {playerCountdowns[p.playerId] ?? ''}
          </span>
        </td>
        <td
  className="py-0 px-3 align-middle"
  style={{ height: '64px', minWidth: '80px', verticalAlign: 'middle' }}
>
  <div className="flex items-center justify-center h-full w-full">
    {canBid && (
      <button
        className="px-2 py-1 bg-[#FF4B1F] border-2 border-[#001A2B] rounded-xl text-white hover:bg-[#ff6a3c] text-xs font flex justify-center items-center text-center"
        style={{
          fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
          letterSpacing: '2px'
        }}
        onClick={() => setSelectedPlayer(p)}
      >
        Bid
      </button>
    )}
    {session?.user?.role === 'admin' && showResetButtons && draft.results?.some(r => r.playerId === p.playerId) && (
      <>
        <button
          className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800 text-xs"
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
                    body: JSON.stringify({ results: updatedResults, bidLog: draft.bidLog }),
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
  </div>
</td>
        </tr>
      );
    }

    function PlayerCard({ player, group, draft, playerCountdowns, session, setSelectedPlayer, setResetConfirmId, resetConfirmId, fetchDraft, countdown }) {
      const result = draft.results?.find(r => r.playerId === player.playerId);
      const contractScore = result ? Number(result.contractPoints) : 0;
      const playerStartTime = getPlayerStartTime(draft.startDate, player.startDelay);
      const playerEndTime = getPlayerEndTime(
        draft.startDate,
        player.startDelay,
        draft.nomDuration,
        contractScore,
        draft.bidLog,
        player.playerId,
        draft.blind
      );
      const now = getChicagoNow();
      const canBid =
        now > playerStartTime &&
        now < playerEndTime &&
        (countdown === 'Auction Started!' || countdown === '') &&
        isUserInDraft(session, draft);

      const isUserHighBidder =
        result && session?.user?.name &&
        result.username === session.user.name;

      // Only highlight if not blind
      let cardBg = '';
      if (isUserHighBidder && !draft?.blind) {
        cardBg = 'bg-yellow-400/20';
      } else if (group === 'Active') {
        cardBg = 'bg-green-900/10';
      } else if (group === 'Upcoming') {
        cardBg = 'bg-blue-900/10';
      } else {
        cardBg = 'bg-gray-800/10';
      }

      const getPlayerNameFontSize = (name) => {
        if (!name) return 24;
        if (name.length <= 10) return 30;
        if (name.length <= 14) return 24;
        if (name.length <= 18) return 20;
        if (name.length <= 24) return 16;
        return 12;
      };
      const playerNameFontSize = getPlayerNameFontSize(player.playerName);

      const playerNameRef = useRef(null);
      const fontSizeSet = useRef(false);

      useEffect(() => {
        if (fontSizeSet.current) return;
        const container = playerNameRef.current?.parentElement;
        const span = playerNameRef.current;
        if (!container || !span) return;

        let fontSize = 36;
        span.style.fontSize = fontSize + 'px';

        while (span.scrollWidth > container.offsetWidth - 40 && fontSize > 14) {
          fontSize -= 1;
          span.style.fontSize = fontSize + 'px';
        }
        fontSizeSet.current = true;
      }, []);

      function isCountdownOver24Hours(countdownValue) {
        if (!countdownValue) return false;
        // If it's a string, check for 'Days'
        if (typeof countdownValue === 'string') {
          return countdownValue.includes('Days');
        }
        // If it's a React fragment/element, check its children for 'Days'
        if (typeof countdownValue === 'object' && countdownValue !== null && countdownValue.props && countdownValue.props.children) {
          // children can be an array or a single value
          const children = countdownValue.props.children;
          if (Array.isArray(children)) {
            return children.some(child => typeof child === 'string' && child.includes('Days'));
          }
          return typeof children === 'string' && children.includes('Days');
        }
        return false;
      }

      return (
        <div
          key={player.playerId}
          className={`relative rounded-lg shadow p-4 border-l-4 flex flex-col gap-2
            ${cardBg}
            bg-gradient-to-br from-[#001A2B] via-[#001A2B] via-55% to-[#FF4B1F] lg:bg-none
            ${
              group === 'Active'
                ? 'border-green-400'
                : group === 'Upcoming'
                ? 'border-blue-400'
                : 'border-gray-400'
            }`}
          style={{ minHeight: 200 }}
        >
          <div className="w-full flex justify-center mb-2 relative">
            <span
              className="font-bold text-center pr-10"
              style={{
                fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
                letterSpacing: '3px',
                fontSize: playerNameFontSize,
                display: 'inline-block',
                maxWidth: '100%',
                whiteSpace: 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                paddingLeft: '4px'
              }}
            >
              {player.playerName}
            </span>
            <span className="absolute right-0 top-0 flex flex-col items-end">
              <span className="text-xs px-2 py-1 rounded bg-[#222] text-[#FF4B1F]">
                {player.position}
              </span>
            </span>
          </div>
          {/* Countdown timer (in the card) */}
          <div className="w-full flex justify-center mb-4" style={{ minHeight: 32, maxHeight: 40 }}>
            <span
              className="cursor-help text-center flex justify-center items-center"
              style={{
                fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
                letterSpacing: '1px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: isCountdownOver24Hours(
                  typeof playerCountdowns[player.playerId] === 'string'
                    ? playerCountdowns[player.playerId]
                    : (playerCountdowns[player.playerId]?.props?.children ?? '')
                )
                  ? '1.5rem'
                  : '3rem'
              }}
              title={
                (playerStartTime instanceof Date && !isNaN(playerStartTime) && playerEndTime instanceof Date && !isNaN(playerEndTime))
                  ? `Start: ${formatInTimeZone(playerStartTime, 'America/Chicago', 'MM/dd/yyyy h:mm a')}\n` +
                    `End: ${formatInTimeZone(playerEndTime, 'America/Chicago', 'MM/dd/yyyy h:mm a')}`
                  : 'Invalid time'
              }
            >
              {playerCountdowns[player.playerId] ?? ''}
            </span>
          </div>
          <div className="mb-2 flex flex-col gap-2 pr-16 w-full" style={{ maxWidth: 160 }}>
            {canBid && (
              <button
                className="w-full px-4 py-3 bg-[#FF4B1F] border-2 border-[#001A2B] rounded-xl text-white hover:bg-[#ff6a3c] text-lg font flex justify-center items-center text-center"
                style={{ fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif', letterSpacing: '2px' }}
                onClick={() => setSelectedPlayer(player)}
              >
                PLACE BID
              </button>
            )}
            {session?.user?.role === 'admin' && showResetButtons && draft.results?.some(r => r.playerId === player.playerId) && (
              <>
                <button
                  className="w-full px-3 py-1 bg-red-700 rounded text-white hover:bg-red-800 text-xs mt-1"
                  title="Reset Bid"
                  onClick={() => setResetConfirmId(player.playerId)}
                  style={{ maxWidth: 160 }}
                >
                  Reset
                </button>
                {resetConfirmId === player.playerId && (
                  <div className="mt-2 bg-black border border-red-700 rounded p-2 text-xs text-red-200 shadow-lg">
                    <div>Reset this player's bid?</div>
                    <div className="flex gap-2 mt-1">
                      <button
                        className="px-2 py-1 bg-red-700 rounded text-white hover:bg-red-800"
                        onClick={async () => {
                          const updatedResults = draft.results.filter(r => r.playerId !== player.playerId);
                          await fetch(`/api/admin/drafts/${draft._id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ results: updatedResults, bidLog: draft.bidLog }),
                          });
                          setResetConfirmId(null);
                          await fetchDraft();
                        }}
                      >
                        Yes
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
          </div>
          {/* Bottom-right info (contract points, salary/years, bidder) */}
          {!draft?.blind && (
            <div className="absolute bottom-4 right-4 flex flex-col items-end">
              <span
                className="font-extrabold text-3xl text-[#FFB800]"
                style={{
                  fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
                  letterSpacing: '3px'
                }}
              >
                {result ? contractScore : '-'}
              </span>
              {result && (
                <span
                  className="font-bold mb-1"
                  style={{
                    color: '#60a5fa',
                    fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
                    fontSize: '1.15em'
                  }}
                >
                  ${result.salary} / {result.years}y
                </span>
              )}
              <div className="flex items-center gap-1 mt-1">
                {result?.username && teamAvatars[result.username] ? (
                  <img
                    src={`https://sleepercdn.com/avatars/${teamAvatars[result.username]}`}
                    alt={result.username}
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-white/10 inline-block"></span>
                )}
                <span
                  style={{
                    fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif'
                  }}
                >
                  {result?.username ?? '-'}
                </span>
              </div>
            </div>
          )}
          {/* Show user's own high bid if draft is blind */}
          {draft?.blind && session?.user?.name && (() => {
            if (group === 'Ended') {
              // Reveal high bid and bidder when player is Final
              if (result) {
                return (
                  <div className="mt-2 text-xs text-green-200 bg-black/30 rounded p-2">
                    <div className="font-bold text-white/80 mb-1">Final Result</div>
                    <div>
                      <span className="font-mono text-lg text-[#FFB800]">
                        ${result.salary} / {result.years}y
                      </span>
                      <span className="ml-2 text-blue-300">Score: {result.contractPoints}</span>
                    </div>
                    <div className="text-green-300 mt-1">
                      Winner: {result.username}
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="mt-2 text-xs text-gray-400 bg-black/30 rounded p-2">
                    No bids
                  </div>
                );
              }
            }
            // Otherwise, show user's last bid
            const userBids = (draft.bidLog || []).filter(
              b => b.playerId === player.playerId && b.username === session.user.name
            );
            if (userBids.length === 0) return null;
            const userLastBid = userBids.reduce((latest, b) =>
              !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
              null
            );
            return (
              <div className="mt-2 text-xs text-yellow-200 bg-black/30 rounded p-2">
                <div className="font-bold text-white/80 mb-1">Your Last Bid</div>
                <div className="flex flex-col items-start gap-1">
                  <span className="font-mono text-lg text-blue-300">
                    ${userLastBid.salary} / {userLastBid.years}y
                  </span>
                  <span
                    className="font-extrabold text-2xl text-[#FFB800]"
                    style={{
                      fontFamily: '"Black Ops One", "Saira Stencil One", Impact, fantasy, sans-serif',
                      letterSpacing: '2px',
                      marginTop: '-2px',
                    }}
                  >
                    Score: {userLastBid.contractPoints}
                  </span>
                </div>
                <div className="text-gray-400 mt-1">
                  {formatTimeAgo(userLastBid.timestamp)}
                </div>
                {/* Cancel Bid button */}
                <button
                  className="mt-2 px-3 py-1 bg-red-700 rounded text-white hover:bg-red-800 text-xs"
                  onClick={() => setRetractConfirmPlayerId(player.playerId)}
                >
                  Cancel Bid
                </button>
              </div>
            );
          })()}
          </div>
        )
      }

  // Prefill bidSalary and bidYears when a player is selected
  useEffect(() => {
    if (!selectedPlayer) return;
    // Only set defaults if both fields are empty (i.e., modal just opened)
    if (bidSalary !== '' || bidYears !== '') return;

    if (draft?.blind) {
      const userBids = (draft.bidLog || []).filter(
        b => b.playerId === selectedPlayer.playerId && b.username === session?.user?.name
      );
      if (userBids.length > 0) {
        const userLastBid = userBids.reduce((latest, b) =>
          !latest || new Date(b.timestamp) > new Date(latest.timestamp) ? b : latest,
          null
        );
        setBidSalary(String(userLastBid.salary ?? '1'));
        setBidYears(String(userLastBid.years ?? '1'));
      } else {
        setBidSalary('1');
        setBidYears('1');
      }
    } else {
      const result = draft.results.find(r => r.playerId === selectedPlayer.playerId);
      if (result) {
        setBidSalary(String(result.salary ?? ''));
        setBidYears(String(result.years ?? ''));
      } else {
        setBidSalary('');
        setBidYears('');
      }
    }
  }, [selectedPlayer, draft?.blind, session?.user?.name]);

  function formatCountdown(ms) {
    if (ms <= 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${hours.toString().padStart(2, '0')}:` +
      `${minutes.toString().padStart(2, '0')}:` +
      `${seconds.toString().padStart(2, '0')}`;
    return days > 0
      ? (
          <>
            {days} Days<br />{timeStr}
          </>
        )
      : timeStr;
  }

  function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`;
    if (diff < 3600) {
      const min = Math.floor(diff / 60);
      return `${min} minute${min !== 1 ? 's' : ''} ago`;
    }
    if (diff < 86400) {
      const hr = Math.floor(diff / 3600);
      return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(diff / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const filteredBidLog = React.useMemo(() => {
    if (!draft?.bidLog) return [];
    return draft.bidLog.filter(bid => {
      const player = draft.players?.find(p => String(p.playerId) === String(bid.playerId));
      const playerName = player ? player.playerName : '';
      const matchesName = !bidLogSearch || playerName.toLowerCase().includes(bidLogSearch.toLowerCase());
      const matchesBidder = bidLogBidder === 'ALL' || bid.username === bidLogBidder;
      return matchesName && matchesBidder;
    });
  }, [draft?.bidLog, draft?.players, bidLogSearch, bidLogBidder]);

  if (status === 'loading') return null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#001A2B] flex items-center justify-center flex-col">
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
          {/* Move Cap Space and Bid Log buttons here */}
          <div className="flex justify-end mt-4 w-full max-w-2xl mx-auto">
            {/* Admin-only Toggle Reset Buttons */}
            {session?.user?.role === 'admin' && (
              <button
                className={`px-4 py-2 rounded text-white transition-colors mr-2 ${showResetButtons ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-800'}`}
                onClick={() => setShowResetButtons(v => !v)}
              >
                {showResetButtons ? 'Hide Reset Buttons' : 'Show Reset Buttons'}
              </button>
            )}
            <button
              className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors mr-2"
              onClick={() => setShowCapModal(true)}
            >
              View Cap Space
            </button>
            <button
              className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors"
              onClick={() => setShowBidLogModal(true)}
            >
              View Bid Log
            </button>
          </div>
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
          {/* REMOVE the Cap Space and Bid Log buttons from here */}
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
            {/* Mobile Card List */}
            {isMobile ? (
              <div>
                {/* Card Sorting Controls */}
                <div className="flex gap-2 mb-4 items-center px-2">
                  <label htmlFor="cardSort" className="font-medium">Sort by:</label>
                  <select
                    id="cardSort"
                    value={sortConfig.key}
                    onChange={e => setSortConfig({ key: e.target.value, direction: 'asc' })}
                    className="bg-black/40 border border-white/20 rounded px-2 py-1 text-white"
                  >
                    <option value="countdown">Countdown</option>
                    <option value="ktc">KTC</option>
                    <option value="highBid">High Bid</option>
                  </select>
                  <button
                    className="px-2 py-1 rounded border border-white/20 text-white bg-black/30 hover:bg-black/50"
                    onClick={() =>
                      setSortConfig(prev => ({
                        ...prev,
                        direction: prev.direction === 'asc' ? 'desc' : 'asc'
                      }))
                    }
                    title={`Sort ${sortConfig.direction === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
                <div className="flex flex-col gap-4 p-2">
                  {['Active', 'Upcoming', 'Ended'].map(group => (
                    groupedPlayers[group].length > 0 && (
                      <React.Fragment key={group}>
                        <div
                          className={`font-bold px-2 py-1 mb-2 rounded border-l-8 ${
                            group === 'Active'
                              ? 'bg-green-900/80 text-green-200 border-green-400'
                              : group === 'Upcoming'
                              ? 'bg-blue-900/80 text-blue-200 border-blue-400'
                              : 'bg-gray-800/80 text-gray-200 border-gray-400'
                          }`}
                        >
                          {group === 'Ended' ? 'Final' : group}
                        </div>
                        {groupedPlayers[group].map(p => (
                          <PlayerCard
                            key={p.playerId}
                            player={p}
                            group={group}
                            draft={draft}
                            playerCountdowns={playerCountdowns}
                            session={session}
                            setSelectedPlayer={setSelectedPlayer}
                            setResetConfirmId={setResetConfirmId}
                            resetConfirmId={resetConfirmId}
                            fetchDraft={fetchDraft}
                            countdown={countdown}
                          />
                        ))}
                      </React.Fragment>
                    )
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] border border-white/10 rounded bg-white/5">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#FF4B1F]/20 text-white/90">
                      <th className="py-2 px-3 text-center align-middle"></th>
                      {!draft?.blind && (
                        <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('highBid')}>
                          High Bid {sortConfig.key === 'highBid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                      )}
                      <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('playerName')}>
                        Player {sortConfig.key === 'playerName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('position')}>
                        Position {sortConfig.key === 'position' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('ktc')}>
                        KTC {sortConfig.key === 'ktc' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      {draft?.blind && (
                        <th className="py-2 px-3 text-center align-middle">
                          Your Last Bid
                        </th>
                      )}
                      {!draft?.blind && (
                        <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('highBidder')}>
                          High Bidder {sortConfig.key === 'highBidder' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                      )}
                      <th className="py-2 px-3 text-center align-middle cursor-pointer" onClick={() => handleSort('countdown')}>
                        Countdown {sortConfig.key === 'countdown' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="py-2 px-3 text-center align-middle"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Active */}
                    {groupedPlayers.Active.length > 0 && (
                      <>
                        <tr>
                          <td colSpan="9" className="bg-green-900/80 text-green-200 font-bold px-3 py-2 border-l-8 border-green-400">
                            Active
                          </td>
                        </tr>
                        {groupedPlayers.Active.map((p, idx) => renderPlayerRow({ ...p, __rowIndex: idx }, 'Active'))}
                      </>
                    )}
                    {/* Upcoming */}
                    {groupedPlayers.Upcoming.length > 0 && (
                      <>
                        <tr>
                          <td colSpan="9" className="bg-blue-900/80 text-blue-200 font-bold px-3 py-2 border-l-8 border-blue-400">
                            Upcoming
                          </td>
                        </tr>
                        {groupedPlayers.Upcoming.map((p, idx) => renderPlayerRow({ ...p, __rowIndex: idx }, 'Upcoming'))}
                      </>
                    )}
                    {/* Ended */}
                    {groupedPlayers.Ended.length > 0 && (
                      <>
                        <tr>
                          <td colSpan="9" className="bg-gray-800/80 text-gray-200 font-bold px-3 py-2 border-l-8 border-gray-400">
                            Final
                          </td>
                        </tr>
                        {groupedPlayers.Ended.map((p, idx) => renderPlayerRow({ ...p, __rowIndex: idx }, 'Ended'))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {selectedPlayer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="bg-black/90 rounded-lg border border-white/10 p-6 max-w-md w-full shadow-2xl relative">
                <button
                  className="absolute top-2 right-2 text-white text-xl hover:text-[#FF4B1F] transition"
                  onClick={() => {
                    setSelectedPlayer(null);
                    setBidSalary('');
                    setBidYears('');
                  }}
                  disabled={placingBid}
                  aria-label="Close"
                >
                  &times;
                </button>
                <h3 className="text-lg font-bold mb-2 text-[#FF4B1F]">
                  Bid on {selectedPlayer.playerName}
                </h3>
                <div className="mb-2">
                  <label className="block mb-1">Salary ($):</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    step={0.1}
                    className="w-full p-2 rounded bg-white/10 border border-white/10 text-white mb-2"
                    placeholder="Enter salary"
                    value={bidSalary}
                    onChange={e => {
                      // Allow numbers with up to one decimal place
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      setBidSalary(val);
                    }}
                  />
                </div>
                <div className="mb-2">
                  <label className="block mb-1">Years (1-4):</label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    step={1}
                    className="w-full p-2 rounded bg-white/10 border border-white/10 text-white mb-2"
                    placeholder="Enter years"
                    value={bidYears}
                    onChange={e => {
                      // Only allow 1, 2, 3, or 4
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (['1', '2', '3', '4'].includes(val)) {
                        setBidYears(val);
                      } else if (val === '') {
                        setBidYears('');
                      }
                    }}
                  />
                </div>
                <div className="mb-2">
                  <strong>Contract Score:</strong>{' '}
                  {bidSalary && bidYears
                    ? calculateContractScore(bidSalary, bidYears)
                    : '-'}
                </div>
                <div className="mb-2 text-xs text-blue-200">
                  <div>
                    <strong>How it's calculated:</strong>
                  </div>
                  {bidSalary && bidYears ? (() => {
                    let y1 = Number(bidSalary);
                    let y2 = Math.ceil(y1 * 1.1 * 10) / 10;
                    let y3 = Math.ceil(y2 * 1.1 * 10) / 10;
                    let y4 = Math.ceil(y3 * 1.1 * 10) / 10;
                    let rows = [];
                    if (bidYears >= 1) rows.push({
                      year: 1,
                      salary: y1,
                      percent: '100%',
                      score: y1
                    });
                    if (bidYears >= 2) rows.push({
                      year: 2,
                      salary: y2,
                      percent: '80%',
                      score: y2 * 0.8
                    });
                    if (bidYears >= 3) rows.push({
                      year: 3,
                      salary: y3,
                      percent: '60%',
                      score: y3 * 0.6
                    });
                    if (bidYears >= 4) rows.push({
                      year: 4,
                      salary: y4,
                      percent: '40%',
                      score: y4 * 0.4
                    });
                    return (
                      <>
                        <div className="flex justify-center">
                          <table className="text-sm mt-2 mb-1 border-separate" style={{ minWidth: 320 }}>
                            <thead>
                              <tr>
                                <th className="pr-3 text-left">Year</th>
                                <th className="pr-3 text-left">Salary</th>
                                <th className="pr-3 text-left">Weight</th>
                                <th className="pr-3 text-left">Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map(r => (
                                <tr key={r.year}>
                                  <td className="pr-3">Year {r.year}</td>
                                  <td className="pr-3">${r.salary.toFixed(1)}</td>
                                  <td className="pr-3">{r.percent}</td>
                                  <td className="pr-3">{r.score.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <strong>Current High Bid:</strong> ${currentHighSalary} / {currentHighYears}y<br />
                          <strong>Current Contract Score:</strong> {currentHighScore}
                        </div>
                      </>
                    );
                  })()
                  :
                  null}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors"
                    onClick={handleBid}
                    disabled={placingBid || !bidSalary || !bidYears}
                  >
                    {placingBid ? 'Placing Bid...' : 'Place Bid'}
                  </button>
                  <button
                    className="px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                    onClick={() => {
                      setSelectedPlayer(null);
                      setBidSalary('');
                      setBidYears('');
                    }}
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
                    Your bid is {calculateContractScore(bidSalary, bidYears) - currentHighScore} above the current high contract score. Are you sure?
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
            </div>
          )}
          {/* Bid Log Table Button */}
          <div className="flex justify-end mt-4">
            <button
              className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors mr-2"
              onClick={() => setShowCapModal(true)}
            >
              View Cap Space
            </button>
            <button
              className="px-4 py-2 bg-[#FF4B1F] rounded text-white hover:bg-[#FF4B1F]/80 transition-colors"
              onClick={() => setShowBidLogModal(true)}
            >
              View Bid Log
            </button>
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-6"></div>
      </div>
      {/* Cap Space Modal */}
      {showCapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-black/90 rounded-lg border border-white/10 p-6 max-w-2xl w-full shadow-2xl relative">
            <button
              className="absolute top-2 right-2 text-white text-xl hover:text-[#FF4B1F] transition"
              onClick={() => setShowCapModal(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold mb-4 text-[#FF4B1F]">Cap Space</h2>
            <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10">
                    <th className="p-3 text-left">Team</th>
                    <th className="p-3 text-left">Cap Space</th>
                    {/* Only show Spend column if not blind, or if this is the active user */}
                    {(!draft?.blind || capTeams.some(team => session?.user?.name === team.team)) && (
                      <th className="p-3 text-left">Spend</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {capTeams
                    .sort((a, b) => a.team.localeCompare(b.team))
                    .map((team, idx) => {
                      const isActiveUser = session?.user?.name === team.team;
                      return (
                        <tr key={team.team || idx} className="hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                          <td className="p-3 font-medium flex items-center gap-2">
                            {teamAvatars[team.team] ? (
                              <img
                                src={`https://sleepercdn.com/avatars/${teamAvatars[team.team]}`}
                                alt={team.team}
                                className="w-6 h-6 rounded-full"
                              />
                            ) : null}
                            {team.team}
                          </td>
                          <td className="p-3 text-right">
                            <span className={getCapSpaceColor(team.curYear.remaining)}>
                              {formatCapSpace(team.curYear.remaining)}
                            </span>
                          </td>
                          {/* Only show Spend if not blind, or this is the active user */}
                          {(!draft?.blind || isActiveUser) && (
                            <td className="p-3 text-right">
                              {formatCapSpace(team.spend)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Bid Log Modal */}
      {showBidLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-black/90 rounded-lg border border-white/10 p-6 max-w-2xl w-full shadow-2xl relative">
            <button
              className="absolute top-2 right-2 text-white text-xl hover:text-[#FF4B1F] transition"
              onClick={() => setShowBidLogModal(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold text-[#FF4B1F] mb-4">Bid Log</h2>
            {draft.blind ? (
              <div className="text-center text-gray-400 italic py-8">
                All bids and bidders are hidden for this draft.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[40vh] border border-white/10 rounded bg-white/5">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#FF4B1F]/20 text-white/90">
                      <th className="py-2 px-3 text-left">Player Name</th>
                      <th className="py-2 px-3 text-left">Bidder</th>
                      <th className="py-2 px-3 text-left">Salary/Years</th>
                      <th className="py-2 px-3 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBidLog.length > 0 ? (
                      filteredBidLog.map((bid, idx) => {
                        const player = draft.players?.find(p => String(p.playerId) === String(bid.playerId));
                        return (
                          <tr key={idx} className="hover:bg-white/10">
                            <td className="py-2 px-3">{player ? player.playerName : 'Unknown'}</td>
                            <td className="py-2 px-3 flex items-center gap-2">
                              {teamAvatars[bid.username] ? (
                                <img
                                  src={`https://sleepercdn.com/avatars/${teamAvatars[bid.username]}`}
                                  alt={bid.username}
                                  className="w-5 h-5 rounded-full"
                                />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-white/10 inline-block"></span>
                              )}
                              {bid.username}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              ${bid.salary} / {bid.years}y<br />
                              <span className="text-blue-300">Score: {bid.contractPoints}</span>
                            </td>
                            <td className="py-2 px-3 text-gray-400">{formatTimeAgo(bid.timestamp)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-white/60">No bids yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Confirmation dialog for retracting bids */}
      {retractConfirmPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-black/90 rounded-lg border border-white/10 p-6 max-w-sm w-full shadow-2xl relative">
            <h3 className="text-lg font-bold mb-4 text-[#FF4B1F]">Retract Bid?</h3>
            <p className="mb-4 text-white/80">
              Are you sure you want to retract your bid for this player? This cannot be undone. You can still place a new bid after retracting your current bid.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                onClick={() => setRetractConfirmPlayerId(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-700 rounded text-white hover:bg-red-800 transition-colors"
                onClick={async () => {
                  await handleRetractBids(retractConfirmPlayerId);
                  setRetractConfirmPlayerId(null);
                }}
              >
                Retract Bid
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
  
  async function handleRetractBids(playerId) {
    if (!draft?.blind || !session?.user?.name) return;
    // Remove all this user's bids for this player from the bid log
    const updatedBidLog = (draft.bidLog || []).filter(
      b => !(b.playerId === playerId && b.username === session.user.name)
    );
    // Remove their result if they are the high bidder for this player
    const updatedResults = draft.results.filter(
      r => !(r.playerId === playerId && r.username === session.user.name)
    );
    await fetch(`/api/admin/drafts/${draft._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: updatedResults, bidLog: updatedBidLog }),
    });
    await fetchDraft();
  }
}