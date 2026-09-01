import { NextResponse } from 'next/server';

const LEAGUE_NAME = 'Budget Blitz Bowl';
const START_SEASON = 2024;
const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const MAX_FANTASY_WEEK = 18;

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function rosterPoints(roster) {
  const whole = asNumber(roster?.settings?.fpts);
  const decimal = asNumber(roster?.settings?.fpts_decimal);
  return whole + decimal / 100;
}

function rosterPointsAgainst(roster) {
  const whole = asNumber(roster?.settings?.fpts_against);
  const decimal = asNumber(roster?.settings?.fpts_against_decimal);
  return whole + decimal / 100;
}

function normalizeTeamName(user, ownerId) {
  const metadataName = String(user?.metadata?.team_name || '').trim();
  if (metadataName) return metadataName;

  const displayName = String(user?.display_name || '').trim();
  if (displayName) return displayName;

  const username = String(user?.username || '').trim();
  if (username) return username;

  return `Sleeper ${String(ownerId || '').slice(-6)}`;
}

function avatarUrl(avatar) {
  const raw = String(avatar || '').trim();
  return raw ? `https://sleepercdn.com/avatars/thumbs/${raw}` : '';
}

async function sleeperJson(path, revalidate = 300) {
  const url = path.startsWith('http') ? path : `${SLEEPER_BASE}${path}`;
  const response = await fetch(url, {
    next: { revalidate },
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Sleeper request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function safeSleeperJson(path, fallback, revalidate = 300) {
  try {
    return await sleeperJson(path, revalidate);
  } catch {
    return fallback;
  }
}

function blankSeason(season, teamName = '') {
  return {
    season: String(season),
    teamName,
    seasonComplete: false,
    wins: 0,
    losses: 0,
    ties: 0,
    divisionTitle: false,
    regularSeasonTitle: false,
    regularSeasonRank: null,
    tenWinSeason: false,
    scoringChampion: false,
    bestDefense: false,
    pointsJuggernaut: false,
    pointsJuggernautThreshold: null,
    woodenSpoon: false,
    divisionSweep: false,
    divisionSweepRecord: '',
    cinderellaChampion: false,
    pointsFor: 0,
    pointsAgainst: 0,
    leagueAveragePointsFor: 0,
    playoffAppearance: false,
    playoffWins: 0,
    playoffLosses: 0,
    champion: false,
    runnerUp: false,
    trades: 0,
    threeTeamTrades: 0,
    playersAdded: 0,
    rookiesDrafted: 0,
    longestWinStreak: 0,
    highestWeeklyScore: null,
    expectedWins: 0,
    allPlayGames: 0,
    allPlayWinPct: 0,
    luck: 0,
    weeklyResults: [],
  };
}

function blankFranchise(ownerId) {
  return {
    ownerId: String(ownerId),
    teamName: '',
    displayName: '',
    username: '',
    avatar: '',
    seasons: new Set(),
    seasonData: {},
    championships: 0,
    championshipSeasons: [],
    runnerUps: 0,
    runnerUpSeasons: [],
    regularSeasonTitles: 0,
    regularSeasonTitleSeasons: [],
    divisionTitles: 0,
    divisionTitleSeasons: [],
    scoringChampionships: 0,
    scoringChampionSeasons: [],
    bestDefenseSeasons: 0,
    bestDefenseSeasonYears: [],
    pointsJuggernautSeasons: 0,
    pointsJuggernautSeasonYears: [],
    woodenSpoons: 0,
    woodenSpoonSeasons: [],
    divisionSweeps: 0,
    divisionSweepSeasons: [],
    cinderellaChampionships: 0,
    cinderellaSeasons: [],
    wins: 0,
    losses: 0,
    ties: 0,
    playoffAppearances: 0,
    playoffWins: 0,
    playoffLosses: 0,
    trades: 0,
    threeTeamTrades: 0,
    playersAdded: 0,
    rookiesDrafted: 0,
    tradePartnerIds: new Set(),
    headToHead: new Map(),
    highestWeeklyScore: null,
    largestWin: null,
    closestWin: null,
    highestScoreLoss: null,
  };
}

function ensureFranchise(franchises, ownerId, user, season) {
  if (!ownerId) return null;
  const key = String(ownerId);

  if (!franchises.has(key)) franchises.set(key, blankFranchise(key));
  const franchise = franchises.get(key);

  if (user) {
    franchise.teamName = normalizeTeamName(user, ownerId);
    franchise.displayName = String(user.display_name || franchise.displayName || '');
    franchise.username = String(user.username || franchise.username || '');
    franchise.avatar = avatarUrl(user.avatar) || franchise.avatar;
  } else if (!franchise.teamName) {
    franchise.teamName = normalizeTeamName(null, ownerId);
  }

  const seasonKey = String(season);
  franchise.seasons.add(seasonKey);
  if (!franchise.seasonData[seasonKey]) {
    franchise.seasonData[seasonKey] = blankSeason(seasonKey, franchise.teamName);
  }
  if (franchise.teamName) franchise.seasonData[seasonKey].teamName = franchise.teamName;

  return franchise;
}

function ownerForRoster(rosterById, rosterId) {
  if (rosterId === undefined || rosterId === null) return null;
  return rosterById.get(String(rosterId))?.owner_id || null;
}

function ensureSeasonLine(franchise, season) {
  if (!franchise) return null;
  const seasonKey = String(season);
  if (!franchise.seasonData[seasonKey]) {
    franchise.seasons.add(seasonKey);
    franchise.seasonData[seasonKey] = blankSeason(seasonKey, franchise.teamName);
  }
  return franchise.seasonData[seasonKey];
}

function addTrade(franchise, season) {
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine) return;
  franchise.trades += 1;
  seasonLine.trades += 1;
}

function addThreeTeamTrade(franchise, season) {
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine) return;
  franchise.threeTeamTrades += 1;
  seasonLine.threeTeamTrades += 1;
}

function addPlayers(franchise, season, count) {
  if (!count) return;
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine) return;
  franchise.playersAdded += count;
  seasonLine.playersAdded += count;
}

function addRookie(franchise, season) {
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine) return;
  franchise.rookiesDrafted += 1;
  seasonLine.rookiesDrafted += 1;
}

function ensureRivalry(franchise, opponentOwnerId) {
  if (!franchise || !opponentOwnerId) return null;
  const key = String(opponentOwnerId);
  if (!franchise.headToHead.has(key)) {
    franchise.headToHead.set(key, {
      opponentOwnerId: key,
      wins: 0,
      losses: 0,
      ties: 0,
      games: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      seasonResults: {},
      lastMeeting: null,
    });
  }
  return franchise.headToHead.get(key);
}

function addRivalryResult(franchise, opponentOwnerId, season, week, result) {
  const rivalry = ensureRivalry(franchise, opponentOwnerId);
  if (!rivalry) return;

  rivalry.games += 1;
  if (result === 'W') {
    rivalry.wins += 1;
    rivalry.currentWinStreak += 1;
    rivalry.bestWinStreak = Math.max(rivalry.bestWinStreak, rivalry.currentWinStreak);
  } else {
    if (result === 'L') rivalry.losses += 1;
    else rivalry.ties += 1;
    rivalry.currentWinStreak = 0;
  }

  const seasonKey = String(season);
  if (!rivalry.seasonResults[seasonKey]) {
    rivalry.seasonResults[seasonKey] = { wins: 0, losses: 0, ties: 0, games: 0 };
  }
  const seasonResult = rivalry.seasonResults[seasonKey];
  seasonResult.games += 1;
  if (result === 'W') seasonResult.wins += 1;
  else if (result === 'L') seasonResult.losses += 1;
  else seasonResult.ties += 1;

  rivalry.lastMeeting = {
    season: seasonKey,
    week: Number(week),
    result,
  };
}

function addExpectedWin(franchise, season, expectedWin) {
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine || !Number.isFinite(Number(expectedWin))) return;
  seasonLine.expectedWins += Number(expectedWin);
  seasonLine.allPlayGames += 1;
}

function rankRosters(rosters) {
  return [...rosters].sort((a, b) => {
    const aw = asNumber(a?.settings?.wins);
    const bw = asNumber(b?.settings?.wins);
    if (bw !== aw) return bw - aw;

    const at = asNumber(a?.settings?.ties);
    const bt = asNumber(b?.settings?.ties);
    if (bt !== at) return bt - at;

    const al = asNumber(a?.settings?.losses);
    const bl = asNumber(b?.settings?.losses);
    if (al !== bl) return al - bl;

    return rosterPoints(b) - rosterPoints(a);
  });
}

function recordEvent({ season, week, stage, ownerId, opponentOwnerId, opponentTeamName, score, opponentScore }) {
  return {
    season: String(season),
    week: Number(week),
    stage,
    ownerId: String(ownerId),
    opponentOwnerId: opponentOwnerId ? String(opponentOwnerId) : '',
    opponentTeamName: opponentTeamName || 'Unknown Opponent',
    score: Number(score),
    opponentScore: Number(opponentScore),
    margin: Math.abs(Number(score) - Number(opponentScore)),
  };
}

function updateWeeklyRecords(franchise, season, event, result, isRegularSeason) {
  if (!franchise) return;
  const seasonLine = ensureSeasonLine(franchise, season);
  if (!seasonLine) return;

  if (!franchise.highestWeeklyScore || event.score > franchise.highestWeeklyScore.score) {
    franchise.highestWeeklyScore = event;
  }
  if (!seasonLine.highestWeeklyScore || event.score > seasonLine.highestWeeklyScore.score) {
    seasonLine.highestWeeklyScore = event;
  }

  if (result === 'W') {
    if (!franchise.largestWin || event.margin > franchise.largestWin.margin) {
      franchise.largestWin = event;
    }
    if (!franchise.closestWin || event.margin < franchise.closestWin.margin) {
      franchise.closestWin = event;
    }
  } else if (result === 'L') {
    if (!franchise.highestScoreLoss || event.score > franchise.highestScoreLoss.score) {
      franchise.highestScoreLoss = event;
    }
  }

  if (isRegularSeason) {
    seasonLine.weeklyResults.push({ week: event.week, result });
  }
}

function teamNameForOwner(franchises, ownerId, season) {
  if (!ownerId) return 'Unknown Opponent';
  const franchise = franchises.get(String(ownerId));
  return franchise?.seasonData?.[String(season)]?.teamName || franchise?.teamName || `Sleeper ${String(ownerId).slice(-6)}`;
}

function championshipRuns(seasons) {
  const years = [...new Set((Array.isArray(seasons) ? seasons : []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!years.length) return [];

  const runs = [];
  let start = years[0];
  let prev = years[0];

  for (let i = 1; i < years.length; i += 1) {
    const year = years[i];
    if (year === prev + 1) {
      prev = year;
      continue;
    }
    if (prev > start) runs.push({ start, end: prev, length: prev - start + 1 });
    start = year;
    prev = year;
  }
  if (prev > start) runs.push({ start, end: prev, length: prev - start + 1 });
  return runs;
}

function calculateSeasonStreak(seasonLine) {
  const results = [...(seasonLine?.weeklyResults || [])].sort((a, b) => a.week - b.week);
  let current = 0;
  let currentStart = null;
  let best = { count: 0, startWeek: null, endWeek: null };

  for (const item of results) {
    if (item.result === 'W') {
      if (current === 0) currentStart = item.week;
      current += 1;
      if (current > best.count) {
        best = { count: current, startWeek: currentStart, endWeek: item.week };
      }
    } else {
      current = 0;
      currentStart = null;
    }
  }

  return best;
}

function publicSeasonLine(line) {
  const { weeklyResults, ...rest } = line;
  return rest;
}

function finalizeFranchise(franchise, franchises) {
  const games = franchise.wins + franchise.losses + franchise.ties;
  const winPct = games
    ? ((franchise.wins + franchise.ties * 0.5) / games) * 100
    : 0;

  const playoffGames = franchise.playoffWins + franchise.playoffLosses;
  const playoffWinPct = playoffGames ? (franchise.playoffWins / playoffGames) * 100 : 0;

  const seasons = Array.from(franchise.seasons).sort((a, b) => Number(a) - Number(b));

  let longestWinStreak = { count: 0, season: '', startWeek: null, endWeek: null };
  let tenWinSeasons = 0;
  const tenWinSeasonYears = [];
  let careerExpectedWins = 0;
  let careerAllPlayGames = 0;
  let luckiestSeason = null;
  let mostCursedSeason = null;

  for (const season of seasons) {
    const line = franchise.seasonData[season];
    const streak = calculateSeasonStreak(line);
    line.longestWinStreak = streak.count;
    if (streak.count > longestWinStreak.count) {
      longestWinStreak = { ...streak, season: String(season) };
    }

    if (asNumber(line?.wins) >= 10) {
      line.tenWinSeason = true;
      tenWinSeasons += 1;
      tenWinSeasonYears.push(String(season));
    }

    const expectedWins = Number(asNumber(line?.expectedWins).toFixed(2));
    const allPlayGames = asNumber(line?.allPlayGames);
    const actualWinEquivalents = asNumber(line?.wins) + asNumber(line?.ties) * 0.5;
    const luck = allPlayGames > 0 ? actualWinEquivalents - expectedWins : 0;

    line.expectedWins = expectedWins;
    line.expectedLosses = Number(Math.max(0, allPlayGames - expectedWins).toFixed(2));
    line.allPlayWinPct = allPlayGames > 0 ? Number(((expectedWins / allPlayGames) * 100).toFixed(1)) : 0;
    line.luck = Number(luck.toFixed(2));
    line.allPlayRecord = allPlayGames > 0
      ? `${expectedWins.toFixed(1)}-${Math.max(0, allPlayGames - expectedWins).toFixed(1)}`
      : '0.0-0.0';

    careerExpectedWins += expectedWins;
    careerAllPlayGames += allPlayGames;

    if (line.seasonComplete && allPlayGames > 0) {
      const luckRecord = {
        season: String(season),
        luck: Number(luck.toFixed(2)),
        actualWins: Number(actualWinEquivalents.toFixed(1)),
        expectedWins,
        record: `${line.wins}-${line.losses}${line.ties ? `-${line.ties}` : ''}`,
        allPlayRecord: line.allPlayRecord,
      };
      if (!luckiestSeason || luckRecord.luck > luckiestSeason.luck) luckiestSeason = luckRecord;
      if (!mostCursedSeason || luckRecord.luck < mostCursedSeason.luck) mostCursedSeason = luckRecord;
    }
  }

  let mostImproved = { winsDelta: 0, fromSeason: '', toSeason: '', fromWins: 0, toWins: 0 };
  for (let i = 1; i < seasons.length; i += 1) {
    const fromSeason = seasons[i - 1];
    const toSeason = seasons[i];
    if (Number(toSeason) !== Number(fromSeason) + 1) continue;

    const from = franchise.seasonData[fromSeason];
    const to = franchise.seasonData[toSeason];
    if (!from?.seasonComplete || !to?.seasonComplete) continue;

    const delta = asNumber(to.wins) - asNumber(from.wins);
    if (delta > mostImproved.winsDelta) {
      mostImproved = {
        winsDelta: delta,
        fromSeason: String(fromSeason),
        toSeason: String(toSeason),
        fromWins: asNumber(from.wins),
        toWins: asNumber(to.wins),
      };
    }
  }

  const rivalryRows = Array.from(franchise.headToHead.values()).map(rivalry => {
    const sweepSeasons = Object.entries(rivalry.seasonResults || {})
      .filter(([, row]) => asNumber(row?.games) >= 2 && asNumber(row?.wins) === asNumber(row?.games) && asNumber(row?.losses) === 0 && asNumber(row?.ties) === 0)
      .map(([season]) => String(season))
      .sort((a, b) => Number(a) - Number(b));

    const opponentTeamName = teamNameForOwner(franchises, rivalry.opponentOwnerId, seasons[seasons.length - 1]);
    const rivalryGames = rivalry.wins + rivalry.losses + rivalry.ties;
    return {
      opponentOwnerId: rivalry.opponentOwnerId,
      opponentTeamName,
      wins: rivalry.wins,
      losses: rivalry.losses,
      ties: rivalry.ties,
      games: rivalryGames,
      record: rivalry.ties ? `${rivalry.wins}-${rivalry.losses}-${rivalry.ties}` : `${rivalry.wins}-${rivalry.losses}`,
      winPct: rivalryGames ? Number((((rivalry.wins + rivalry.ties * 0.5) / rivalryGames) * 100).toFixed(1)) : 0,
      sweepSeasons,
      sweeps: sweepSeasons.length,
      currentWinStreak: rivalry.currentWinStreak,
      bestWinStreak: rivalry.bestWinStreak,
      lastMeeting: rivalry.lastMeeting,
    };
  }).sort((a, b) => b.games - a.games || b.wins - a.wins || a.opponentTeamName.localeCompare(b.opponentTeamName));

  const pickBest = (filterFn, compareFn) => rivalryRows.filter(filterFn).sort(compareFn)[0] || null;
  const ownedOpponent = pickBest(
    row => row.wins > 0,
    (a, b) => b.wins - a.wins || b.winPct - a.winPct || b.games - a.games
  );
  const nemesis = pickBest(
    row => row.losses > 0,
    (a, b) => b.losses - a.losses || a.winPct - b.winPct || b.games - a.games
  );
  const archrival = pickBest(
    row => row.games > 0,
    (a, b) => b.games - a.games || Math.abs(a.winPct - 50) - Math.abs(b.winPct - 50)
  );
  const sweepArtist = pickBest(
    row => row.sweeps > 0,
    (a, b) => b.sweeps - a.sweeps || b.wins - a.wins || b.games - a.games
  );
  const currentOwnership = pickBest(
    row => row.currentWinStreak > 0,
    (a, b) => b.currentWinStreak - a.currentWinStreak || b.bestWinStreak - a.bestWinStreak || b.wins - a.wins
  );

  const totalSweeps = rivalryRows.reduce((sum, row) => sum + row.sweeps, 0);
  const careerActualWinEquivalents = franchise.wins + franchise.ties * 0.5;
  const careerLuck = careerAllPlayGames > 0 ? careerActualWinEquivalents - careerExpectedWins : 0;
  const careerAllPlayWinPct = careerAllPlayGames > 0 ? (careerExpectedWins / careerAllPlayGames) * 100 : 0;

  const titleRuns = championshipRuns(franchise.championshipSeasons);
  const longestTitleStreak = titleRuns.reduce((best, run) => Math.max(best, run.length), 0);
  const seasonHistory = seasons.map(season => publicSeasonLine(franchise.seasonData[season]));

  const regularRecord = franchise.ties
    ? `${franchise.wins}-${franchise.losses}-${franchise.ties}`
    : `${franchise.wins}-${franchise.losses}`;

  return {
    ownerId: franchise.ownerId,
    teamName: franchise.teamName,
    displayName: franchise.displayName,
    username: franchise.username,
    avatar: franchise.avatar,
    seasons,
    seasonsActive: seasons.length,
    seasonHistory,
    championships: franchise.championships,
    championshipSeasons: [...franchise.championshipSeasons].sort(),
    longestTitleStreak,
    backToBackRuns: titleRuns,
    runnerUps: franchise.runnerUps,
    runnerUpSeasons: [...franchise.runnerUpSeasons].sort(),
    regularSeasonTitles: franchise.regularSeasonTitles,
    regularSeasonTitleSeasons: [...franchise.regularSeasonTitleSeasons].sort(),
    divisionTitles: franchise.divisionTitles,
    divisionTitleSeasons: [...franchise.divisionTitleSeasons].sort(),
    scoringChampionships: franchise.scoringChampionships,
    scoringChampionSeasons: [...franchise.scoringChampionSeasons].sort(),
    bestDefenseSeasons: franchise.bestDefenseSeasons,
    bestDefenseSeasonYears: [...franchise.bestDefenseSeasonYears].sort(),
    pointsJuggernautSeasons: franchise.pointsJuggernautSeasons,
    pointsJuggernautSeasonYears: [...franchise.pointsJuggernautSeasonYears].sort(),
    woodenSpoons: franchise.woodenSpoons,
    woodenSpoonSeasons: [...franchise.woodenSpoonSeasons].sort(),
    divisionSweeps: franchise.divisionSweeps,
    divisionSweepSeasons: [...franchise.divisionSweepSeasons].sort(),
    cinderellaChampionships: franchise.cinderellaChampionships,
    cinderellaSeasons: [...franchise.cinderellaSeasons].sort(),
    tenWinSeasons,
    tenWinSeasonYears,
    wins: franchise.wins,
    losses: franchise.losses,
    ties: franchise.ties,
    allTimeRecord: regularRecord,
    allTimeWinPct: Number(winPct.toFixed(1)),
    playoffAppearances: franchise.playoffAppearances,
    playoffWins: franchise.playoffWins,
    playoffLosses: franchise.playoffLosses,
    playoffRecord: `${franchise.playoffWins}-${franchise.playoffLosses}`,
    playoffWinPct: Number(playoffWinPct.toFixed(1)),
    trades: franchise.trades,
    threeTeamTrades: franchise.threeTeamTrades,
    uniqueTradePartners: franchise.tradePartnerIds.size,
    playersAdded: franchise.playersAdded,
    rookiesDrafted: franchise.rookiesDrafted,
    highestWeeklyScore: franchise.highestWeeklyScore,
    highestWeeklyScoreValue: franchise.highestWeeklyScore?.score ?? null,
    largestWin: franchise.largestWin,
    largestWinMargin: franchise.largestWin?.margin ?? null,
    closestWin: franchise.closestWin,
    closestWinMargin: franchise.closestWin?.margin ?? null,
    highestScoreLoss: franchise.highestScoreLoss,
    highestScoreLossValue: franchise.highestScoreLoss?.score ?? null,
    longestWinStreak,
    longestWinStreakCount: longestWinStreak.count,
    mostImproved,
    mostImprovedWins: mostImproved.winsDelta,
    rivalries: rivalryRows,
    ownedOpponent,
    ownedOpponentWins: ownedOpponent?.wins ?? 0,
    nemesis,
    nemesisLosses: nemesis?.losses ?? 0,
    archrival,
    archrivalGames: archrival?.games ?? 0,
    sweepArtist,
    sweepCount: totalSweeps,
    currentOwnership,
    currentOwnershipStreak: currentOwnership?.currentWinStreak ?? 0,
    careerExpectedWins: Number(careerExpectedWins.toFixed(2)),
    careerAllPlayGames,
    careerAllPlayWinPct: Number(careerAllPlayWinPct.toFixed(1)),
    careerLuck: Number(careerLuck.toFixed(2)),
    luckiestSeason,
    luckiestSeasonLuck: luckiestSeason?.luck ?? null,
    mostCursedSeason,
    mostCursedSeasonLuck: mostCursedSeason?.luck ?? null,
  };
}

async function discoverLeagueSeasons(sleeperId) {
  const currentYear = new Date().getFullYear();
  const seasons = [];
  for (let year = START_SEASON; year <= currentYear; year += 1) seasons.push(year);

  const seasonLeagueLists = await Promise.all(
    seasons.map(year =>
      safeSleeperJson(`/user/${encodeURIComponent(sleeperId)}/leagues/nfl/${year}`, [], year < currentYear ? 86400 : 300)
        .then(leagues => ({ year, leagues }))
    )
  );

  const found = [];
  for (const { year, leagues } of seasonLeagueLists) {
    const league = (Array.isArray(leagues) ? leagues : []).find(
      item => String(item?.name || '').trim().toLowerCase() === LEAGUE_NAME.toLowerCase()
    );
    if (league?.league_id) found.push({ ...league, season: String(league.season || year) });
  }

  return found.sort((a, b) => Number(a.season) - Number(b.season));
}

async function getSeasonBundle(discoveredLeague) {
  const discoveredSeason = String(discoveredLeague.season);
  const historical = Number(discoveredSeason) < new Date().getFullYear();
  const ttl = historical ? 86400 : 300;
  const leagueId = discoveredLeague.league_id;

  const leagueDetails = await safeSleeperJson(`/league/${leagueId}`, discoveredLeague, ttl);
  const league = { ...discoveredLeague, ...(leagueDetails || {}), season: String(leagueDetails?.season || discoveredSeason) };
  const season = String(league.season);

  const transactionRounds = Array.from({ length: 19 }, (_, i) => i);
  const playoffWeekStart = Math.max(2, asNumber(league?.settings?.playoff_week_start, 15));
  const lastScoredLeg = Math.max(0, asNumber(league?.settings?.last_scored_leg, 0));
  const seasonIsFinal = Number(season) < new Date().getFullYear() || String(league.status || '').toLowerCase() === 'complete';
  const inferredFinalWeek = Math.min(MAX_FANTASY_WEEK, playoffWeekStart + 2);
  const maxMatchupWeek = Math.min(
    MAX_FANTASY_WEEK,
    seasonIsFinal ? Math.max(lastScoredLeg, inferredFinalWeek) : lastScoredLeg
  );
  const matchupWeeks = Array.from({ length: maxMatchupWeek }, (_, i) => i + 1);

  const [users, rosters, winnersBracket, drafts, transactionResults, matchupResults] = await Promise.all([
    safeSleeperJson(`/league/${leagueId}/users`, [], ttl),
    safeSleeperJson(`/league/${leagueId}/rosters`, [], ttl),
    safeSleeperJson(`/league/${leagueId}/winners_bracket`, [], ttl),
    safeSleeperJson(`/league/${leagueId}/drafts`, [], ttl),
    Promise.all(
      transactionRounds.map(round =>
        safeSleeperJson(`/league/${leagueId}/transactions/${round}`, [], ttl)
      )
    ),
    Promise.all(
      matchupWeeks.map(week =>
        safeSleeperJson(`/league/${leagueId}/matchups/${week}`, [], ttl)
          .then(matchups => ({ week, matchups }))
      )
    ),
  ]);

  const draftPicks = [];
  for (const draft of Array.isArray(drafts) ? drafts : []) {
    if (!draft?.draft_id) continue;
    const picks = await safeSleeperJson(`/draft/${draft.draft_id}/picks`, [], ttl);
    draftPicks.push(...(Array.isArray(picks) ? picks : []));
  }

  const transactions = transactionResults.flatMap(list => (Array.isArray(list) ? list : []));
  const uniqueTransactions = Array.from(
    new Map(
      transactions
        .filter(tx => tx?.transaction_id)
        .map(tx => [String(tx.transaction_id), tx])
    ).values()
  );

  return {
    league,
    users: Array.isArray(users) ? users : [],
    rosters: Array.isArray(rosters) ? rosters : [],
    winnersBracket: Array.isArray(winnersBracket) ? winnersBracket : [],
    draftPicks,
    transactions: uniqueTransactions,
    matchupsByWeek: matchupResults.map(item => ({
      week: item.week,
      matchups: Array.isArray(item.matchups) ? item.matchups : [],
    })),
    playoffWeekStart,
    lastScoredLeg,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sleeperId = String(searchParams.get('sleeperId') || '').trim();

  if (!sleeperId) {
    return NextResponse.json({ error: 'Missing sleeperId' }, { status: 400 });
  }

  try {
    const leagues = await discoverLeagueSeasons(sleeperId);

    if (!leagues.length) {
      return NextResponse.json({
        leagueName: LEAGUE_NAME,
        seasons: [],
        franchises: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const bundles = [];
    for (const league of leagues) {
      bundles.push(await getSeasonBundle(league));
    }

    const franchises = new Map();
    const currentYear = new Date().getFullYear();

    for (const bundle of bundles) {
      const { league, users, rosters, winnersBracket, draftPicks, transactions, matchupsByWeek, playoffWeekStart, lastScoredLeg } = bundle;
      const season = String(league.season);
      const userById = new Map(users.map(user => [String(user.user_id), user]));
      const rosterById = new Map(rosters.map(roster => [String(roster.roster_id), roster]));
      const seasonIsFinal = Number(season) < currentYear || String(league.status || '').toLowerCase() === 'complete';
      const regularSeasonComplete = seasonIsFinal || lastScoredLeg >= playoffWeekStart - 1;

      // Create franchise/season records and accumulate regular-season standings.
      for (const roster of rosters) {
        if (!roster?.owner_id) continue;
        const ownerId = String(roster.owner_id);
        const franchise = ensureFranchise(franchises, ownerId, userById.get(ownerId), season);
        const seasonLine = franchise.seasonData[season];

        const wins = asNumber(roster?.settings?.wins);
        const losses = asNumber(roster?.settings?.losses);
        const ties = asNumber(roster?.settings?.ties);

        franchise.wins += wins;
        franchise.losses += losses;
        franchise.ties += ties;
        seasonLine.wins += wins;
        seasonLine.losses += losses;
        seasonLine.ties += ties;
        seasonLine.pointsFor = rosterPoints(roster);
        seasonLine.pointsAgainst = rosterPointsAgainst(roster);
        seasonLine.seasonComplete = seasonIsFinal;
      }

      // Regular-season standings and season awards.
      const rankedRosters = rankRosters(rosters);
      rankedRosters.forEach((roster, index) => {
        const ownerId = roster?.owner_id ? String(roster.owner_id) : null;
        const franchise = ownerId ? franchises.get(ownerId) : null;
        if (franchise) franchise.seasonData[season].regularSeasonRank = index + 1;
      });

      if (regularSeasonComplete && rosters.length) {
        const topRoster = rankedRosters[0];
        const ownerId = topRoster?.owner_id ? String(topRoster.owner_id) : null;
        const franchise = ownerId ? franchises.get(ownerId) : null;
        if (franchise) {
          franchise.regularSeasonTitles += 1;
          franchise.regularSeasonTitleSeasons.push(season);
          franchise.seasonData[season].regularSeasonTitle = true;
        }

        const bottomRoster = rankedRosters[rankedRosters.length - 1];
        const bottomOwnerId = bottomRoster?.owner_id ? String(bottomRoster.owner_id) : null;
        const bottomFranchise = bottomOwnerId ? franchises.get(bottomOwnerId) : null;
        if (bottomFranchise) {
          bottomFranchise.woodenSpoons += 1;
          bottomFranchise.woodenSpoonSeasons.push(season);
          bottomFranchise.seasonData[season].woodenSpoon = true;
        }

        const pointsRows = rosters
          .map(roster => ({
            roster,
            pointsFor: rosterPoints(roster),
            pointsAgainst: rosterPointsAgainst(roster),
          }))
          .filter(row => Number.isFinite(row.pointsFor) && Number.isFinite(row.pointsAgainst));

        if (pointsRows.length) {
          const maxPointsFor = Math.max(...pointsRows.map(row => row.pointsFor));
          const minPointsAgainst = Math.min(...pointsRows.map(row => row.pointsAgainst));
          const maxPointsAgainst = Math.max(...pointsRows.map(row => row.pointsAgainst));
          const leagueAveragePointsFor = pointsRows.reduce((sum, row) => sum + row.pointsFor, 0) / pointsRows.length;
          // Dynamic threshold keeps this award meaningful if league scoring settings change.
          const pointsJuggernautThreshold = leagueAveragePointsFor * 1.10;

          for (const row of pointsRows) {
            const owner = row.roster?.owner_id ? String(row.roster.owner_id) : null;
            const team = owner ? franchises.get(owner) : null;
            if (!team) continue;
            const line = team.seasonData[season];
            line.leagueAveragePointsFor = Number(leagueAveragePointsFor.toFixed(2));
            line.pointsJuggernautThreshold = Number(pointsJuggernautThreshold.toFixed(2));

            if (maxPointsFor > 0 && Math.abs(row.pointsFor - maxPointsFor) < 0.001) {
              team.scoringChampionships += 1;
              team.scoringChampionSeasons.push(season);
              line.scoringChampion = true;
            }

            if (maxPointsAgainst > 0 && Math.abs(row.pointsAgainst - minPointsAgainst) < 0.001) {
              team.bestDefenseSeasons += 1;
              team.bestDefenseSeasonYears.push(season);
              line.bestDefense = true;
            }

            if (pointsJuggernautThreshold > 0 && row.pointsFor + 0.001 >= pointsJuggernautThreshold) {
              team.pointsJuggernautSeasons += 1;
              team.pointsJuggernautSeasonYears.push(season);
              line.pointsJuggernaut = true;
            }
          }
        }
      }

      // Division titles are finalized only for completed/past seasons.
      if (seasonIsFinal) {
        const divisions = new Map();
        for (const roster of rosters) {
          const division = roster?.settings?.division;
          if (division === undefined || division === null || String(division).trim() === '') continue;
          const key = String(division);
          if (!divisions.has(key)) divisions.set(key, []);
          divisions.get(key).push(roster);
        }

        for (const divisionRosters of divisions.values()) {
          if (divisionRosters.length < 2) continue;
          const winner = rankRosters(divisionRosters)[0];
          const ownerId = winner?.owner_id ? String(winner.owner_id) : null;
          const franchise = ownerId ? franchises.get(ownerId) : null;
          if (!franchise) continue;
          franchise.divisionTitles += 1;
          franchise.divisionTitleSeasons.push(season);
          franchise.seasonData[season].divisionTitle = true;
        }
      }

      // Playoff participation, record, champion and runner-up.
      // Sleeper may pre-populate winners_bracket with provisional/seeding roster IDs
      // well before the postseason. Do not treat those placeholders as earned playoff
      // appearances until the regular season is actually complete.
      const playoffFieldFinalized = regularSeasonComplete;
      const playoffsStarted = seasonIsFinal || lastScoredLeg >= playoffWeekStart;

      if (playoffFieldFinalized) {
        const playoffRosterIds = new Set();
        for (const matchup of winnersBracket) {
          if (matchup?.t1 !== undefined && matchup?.t1 !== null) playoffRosterIds.add(String(matchup.t1));
          if (matchup?.t2 !== undefined && matchup?.t2 !== null) playoffRosterIds.add(String(matchup.t2));
        }

        for (const rosterId of playoffRosterIds) {
          const ownerId = ownerForRoster(rosterById, rosterId);
          const franchise = ownerId ? franchises.get(String(ownerId)) : null;
          if (!franchise) continue;
          franchise.playoffAppearances += 1;
          franchise.seasonData[season].playoffAppearance = true;
        }
      }

      if (playoffsStarted) {
        for (const matchup of winnersBracket) {
          const hasTwoTeams = matchup?.t1 !== undefined && matchup?.t1 !== null && matchup?.t2 !== undefined && matchup?.t2 !== null;
          if (!hasTwoTeams || matchup?.w === undefined || matchup?.w === null || matchup?.l === undefined || matchup?.l === null) continue;

          const winnerOwner = ownerForRoster(rosterById, matchup.w);
          const loserOwner = ownerForRoster(rosterById, matchup.l);
          const winnerFranchise = winnerOwner ? franchises.get(String(winnerOwner)) : null;
          const loserFranchise = loserOwner ? franchises.get(String(loserOwner)) : null;

          if (winnerFranchise) {
            winnerFranchise.playoffWins += 1;
            winnerFranchise.seasonData[season].playoffWins += 1;
          }
          if (loserFranchise) {
            loserFranchise.playoffLosses += 1;
            loserFranchise.seasonData[season].playoffLosses += 1;
          }
        }

        let titleMatch = winnersBracket.find(matchup => Number(matchup?.p) === 1 && matchup?.w !== undefined && matchup?.w !== null);
        if (!titleMatch && seasonIsFinal) {
          titleMatch = [...winnersBracket]
            .filter(matchup => matchup?.w !== undefined && matchup?.w !== null && matchup?.t1 != null && matchup?.t2 != null)
            .sort((a, b) => asNumber(b?.r) - asNumber(a?.r))[0];
        }

        if (titleMatch?.w !== undefined && titleMatch?.w !== null) {
          const championOwner = ownerForRoster(rosterById, titleMatch.w);
          const champion = championOwner ? franchises.get(String(championOwner)) : null;
          if (champion) {
            champion.championships += 1;
            champion.championshipSeasons.push(season);
            champion.seasonData[season].champion = true;
            const championSeed = asNumber(champion.seasonData[season].regularSeasonRank, 0);
            if (championSeed >= 4) {
              champion.cinderellaChampionships += 1;
              champion.cinderellaSeasons.push(season);
              champion.seasonData[season].cinderellaChampion = true;
            }
          }

          const loserRosterId = titleMatch?.l ?? (
            String(titleMatch?.t1) === String(titleMatch?.w) ? titleMatch?.t2 : titleMatch?.t1
          );
          const runnerUpOwner = ownerForRoster(rosterById, loserRosterId);
          const runnerUp = runnerUpOwner ? franchises.get(String(runnerUpOwner)) : null;
          if (runnerUp) {
            runnerUp.runnerUps += 1;
            runnerUp.runnerUpSeasons.push(season);
            runnerUp.seasonData[season].runnerUp = true;
          }
        }
      }

      const divisionByRosterId = new Map();
      for (const roster of rosters) {
        const division = roster?.settings?.division;
        if (division !== undefined && division !== null && String(division).trim() !== '') {
          divisionByRosterId.set(String(roster.roster_id), String(division));
        }
      }
      const divisionPerformance = new Map();
      const ensureDivisionPerformance = ownerId => {
        const key = String(ownerId || '');
        if (!key) return null;
        if (!divisionPerformance.has(key)) {
          divisionPerformance.set(key, { wins: 0, losses: 0, ties: 0, games: 0, opponents: new Set() });
        }
        return divisionPerformance.get(key);
      };

      // Weekly matchup records. Score records include postseason/consolation H2H matchups;
      // the win-streak badge intentionally uses regular-season weeks only.
      for (const { week, matchups } of matchupsByWeek) {
        const isRegularSeason = Number(week) < playoffWeekStart;

        // All-play expected wins: compare each regular-season score with every other
        // franchise's score that week, then normalize the result to one expected win.
        if (isRegularSeason) {
          const scoredRows = (Array.isArray(matchups) ? matchups : [])
            .map(row => ({
              row,
              ownerId: ownerForRoster(rosterById, row?.roster_id),
              score: Number(row?.points),
            }))
            .filter(item => item.ownerId && Number.isFinite(item.score));

          if (scoredRows.length > 1) {
            for (const item of scoredRows) {
              let comparisonWins = 0;
              for (const opponent of scoredRows) {
                if (opponent.ownerId === item.ownerId) continue;
                if (item.score > opponent.score) comparisonWins += 1;
                else if (item.score === opponent.score) comparisonWins += 0.5;
              }

              const expectedWin = comparisonWins / (scoredRows.length - 1);
              addExpectedWin(franchises.get(String(item.ownerId)), season, expectedWin);
            }
          }
        }

        const grouped = new Map();
        for (const row of matchups) {
          if (row?.matchup_id === undefined || row?.matchup_id === null) continue;
          const key = String(row.matchup_id);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(row);
        }

        for (const pair of grouped.values()) {
          if (pair.length !== 2) continue;
          const [a, b] = pair;
          const aOwner = ownerForRoster(rosterById, a?.roster_id);
          const bOwner = ownerForRoster(rosterById, b?.roster_id);
          const aFranchise = aOwner ? franchises.get(String(aOwner)) : null;
          const bFranchise = bOwner ? franchises.get(String(bOwner)) : null;
          if (!aFranchise || !bFranchise) continue;

          const aScore = asNumber(a?.points);
          const bScore = asNumber(b?.points);
          const stage = isRegularSeason ? 'Regular Season' : 'Postseason';

          let aResult = 'T';
          let bResult = 'T';
          if (aScore > bScore) { aResult = 'W'; bResult = 'L'; }
          else if (bScore > aScore) { aResult = 'L'; bResult = 'W'; }

          const aEvent = recordEvent({
            season,
            week,
            stage,
            ownerId: aOwner,
            opponentOwnerId: bOwner,
            opponentTeamName: teamNameForOwner(franchises, bOwner, season),
            score: aScore,
            opponentScore: bScore,
          });
          const bEvent = recordEvent({
            season,
            week,
            stage,
            ownerId: bOwner,
            opponentOwnerId: aOwner,
            opponentTeamName: teamNameForOwner(franchises, aOwner, season),
            score: bScore,
            opponentScore: aScore,
          });

          updateWeeklyRecords(aFranchise, season, aEvent, aResult, isRegularSeason);
          updateWeeklyRecords(bFranchise, season, bEvent, bResult, isRegularSeason);

          if (isRegularSeason) {
            addRivalryResult(aFranchise, bOwner, season, week, aResult);
            addRivalryResult(bFranchise, aOwner, season, week, bResult);

            const aDivision = divisionByRosterId.get(String(a?.roster_id));
            const bDivision = divisionByRosterId.get(String(b?.roster_id));
            if (aDivision && bDivision && aDivision === bDivision) {
              const aPerf = ensureDivisionPerformance(aOwner);
              const bPerf = ensureDivisionPerformance(bOwner);
              if (aPerf && bPerf) {
                aPerf.games += 1;
                bPerf.games += 1;
                aPerf.opponents.add(String(b?.roster_id));
                bPerf.opponents.add(String(a?.roster_id));
                if (aResult === 'W') { aPerf.wins += 1; bPerf.losses += 1; }
                else if (aResult === 'L') { aPerf.losses += 1; bPerf.wins += 1; }
                else { aPerf.ties += 1; bPerf.ties += 1; }
              }
            }
          }
        }
      }

      // Division Sweep: completed regular season, faced every divisional opponent,
      // and went undefeated in all divisional meetings.
      if (regularSeasonComplete) {
        for (const roster of rosters) {
          const division = divisionByRosterId.get(String(roster?.roster_id));
          if (!division || !roster?.owner_id) continue;

          const expectedOpponents = rosters
            .filter(other => String(other?.roster_id) !== String(roster.roster_id) && divisionByRosterId.get(String(other?.roster_id)) === division)
            .map(other => String(other.roster_id));
          if (!expectedOpponents.length) continue;

          const perf = divisionPerformance.get(String(roster.owner_id));
          const facedAll = expectedOpponents.every(rosterId => perf?.opponents?.has(rosterId));
          if (!perf || !facedAll || perf.games < expectedOpponents.length || perf.losses > 0 || perf.ties > 0) continue;

          const franchise = franchises.get(String(roster.owner_id));
          if (!franchise) continue;
          franchise.divisionSweeps += 1;
          franchise.divisionSweepSeasons.push(season);
          franchise.seasonData[season].divisionSweep = true;
          franchise.seasonData[season].divisionSweepRecord = `${perf.wins}-${perf.losses}${perf.ties ? `-${perf.ties}` : ''}`;
        }
      }

      // Attribute transactions to the participating roster owners.
      for (const tx of transactions) {
        const type = String(tx?.type || '').toLowerCase();
        const status = String(tx?.status || '').toLowerCase();

        if (type === 'trade' && (!status || status === 'complete')) {
          const rosterIds = new Set((Array.isArray(tx.roster_ids) ? tx.roster_ids : []).map(String));
          const ownerIds = Array.from(
            new Set(
              Array.from(rosterIds)
                .map(rosterId => ownerForRoster(rosterById, rosterId))
                .filter(Boolean)
                .map(String)
            )
          );

          for (const ownerId of ownerIds) {
            const franchise = franchises.get(ownerId);
            addTrade(franchise, season);
            if (ownerIds.length >= 3) addThreeTeamTrade(franchise, season);
            for (const partnerId of ownerIds) {
              if (partnerId !== ownerId) franchise?.tradePartnerIds.add(partnerId);
            }
          }
        }

        if ((type === 'waiver' || type === 'free_agent') && status === 'complete') {
          const adds = tx?.adds && typeof tx.adds === 'object' ? tx.adds : {};
          const countsByRoster = new Map();
          for (const rosterId of Object.values(adds)) {
            const key = String(rosterId);
            countsByRoster.set(key, (countsByRoster.get(key) || 0) + 1);
          }

          if (!countsByRoster.size) {
            for (const rosterId of Array.isArray(tx.roster_ids) ? tx.roster_ids : []) {
              countsByRoster.set(String(rosterId), 1);
            }
          }

          for (const [rosterId, count] of countsByRoster) {
            const ownerId = ownerForRoster(rosterById, rosterId);
            addPlayers(ownerId ? franchises.get(String(ownerId)) : null, season, count);
          }
        }
      }

      // 2024 was the startup draft in the existing badge logic, so rookie counting starts in 2025.
      if (Number(season) !== START_SEASON) {
        const seasonOwnerIds = new Set(
          rosters
            .map(roster => roster?.owner_id)
            .filter(Boolean)
            .map(String)
        );

        for (const pick of draftPicks) {
          const pickedBy = pick?.picked_by ? String(pick.picked_by) : null;
          let ownerId = pickedBy && seasonOwnerIds.has(pickedBy) ? pickedBy : null;

          if (!ownerId) {
            const rosterOwner = ownerForRoster(rosterById, pick?.roster_id);
            ownerId = rosterOwner ? String(rosterOwner) : null;
          }

          if (!ownerId) continue;
          const franchise = ensureFranchise(franchises, ownerId, userById.get(ownerId), season);
          addRookie(franchise, season);
        }
      }
    }

    const output = Array.from(franchises.values())
      .map(franchise => finalizeFranchise(franchise, franchises))
      .sort((a, b) =>
        b.championships - a.championships ||
        b.divisionTitles - a.divisionTitles ||
        b.playoffWins - a.playoffWins ||
        b.allTimeWinPct - a.allTimeWinPct ||
        b.wins - a.wins ||
        a.teamName.localeCompare(b.teamName)
      );

    return NextResponse.json(
      {
        leagueName: LEAGUE_NAME,
        seasons: leagues.map(league => String(league.season)),
        franchises: output,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    console.error('Badges history aggregation failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to build badge history.' },
      { status: 500 }
    );
  }
}
