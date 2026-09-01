'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  BADGE_PRESTIGE_CATALOG,
  DEFAULT_BADGE_PRESTIGE_CONFIG,
  normalizeBadgePrestigeConfig,
} from '@/lib/badge-prestige-config';

const RANKING_METRICS = [
  { key: 'legacy', label: 'Legacy' },
  { key: 'championships', label: 'Championships' },
  { key: 'longestTitleStreak', label: 'Title Streak' },
  { key: 'runnerUps', label: 'Runner-Up Finishes' },
  { key: 'regularSeasonTitles', label: 'Regular Season #1s' },
  { key: 'divisionTitles', label: 'Division Titles' },
  { key: 'tenWinSeasons', label: '10-Win Seasons' },
  { key: 'scoringChampionships', label: 'Scoring Championships' },
  { key: 'bestDefenseSeasons', label: 'Best Defense Awards' },
  { key: 'pointsJuggernautSeasons', label: 'Points Juggernaut Seasons' },
  { key: 'divisionSweeps', label: 'Division Sweeps' },
  { key: 'cinderellaChampionships', label: 'Cinderella Championships' },
  { key: 'woodenSpoons', label: 'Wooden Spoons' },
  { key: 'allTimeWinPct', label: 'Win %' },
  { key: 'playoffWins', label: 'Playoff Wins' },
  { key: 'playoffWinPct', label: 'Playoff Win %' },
  { key: 'playoffAppearances', label: 'Playoff Trips' },
  { key: 'highestWeeklyScoreValue', label: 'Highest Weekly Score' },
  { key: 'largestWinMargin', label: 'Largest Win' },
  { key: 'closestWinMargin', label: 'Closest Win' },
  { key: 'highestScoreLossValue', label: 'Highest Score in Loss' },
  { key: 'longestWinStreakCount', label: 'Win Streak' },
  { key: 'mostImprovedWins', label: 'Most Improved' },
  { key: 'trades', label: 'Trades' },
  { key: 'threeTeamTrades', label: '3+ Team Trades' },
  { key: 'uniqueTradePartners', label: 'Trade Partners' },
  { key: 'playersAdded', label: 'Players Added' },
  { key: 'rookiesDrafted', label: 'Rookies Drafted' },
  { key: 'ownedOpponentWins', label: 'Most Wins vs One Rival' },
  { key: 'nemesisLosses', label: 'Most Losses vs One Rival' },
  { key: 'archrivalGames', label: 'Most H2H Games' },
  { key: 'sweepCount', label: 'Season Sweeps' },
  { key: 'currentOwnershipStreak', label: 'Current H2H Streak' },
  { key: 'careerAllPlayWinPct', label: 'All-Play Win %' },
  { key: 'careerLuck', label: 'Career Luck' },
  { key: 'luckiestSeasonLuck', label: 'Luckiest Season' },
  { key: 'mostCursedSeasonLuck', label: 'Most Cursed Season' },
];

const ASCENDING_METRICS = new Set(['closestWinMargin', 'mostCursedSeasonLuck']);
const NULLABLE_RECORD_METRICS = new Set([
  'highestWeeklyScoreValue',
  'largestWinMargin',
  'closestWinMargin',
  'highestScoreLossValue',
  'luckiestSeasonLuck',
  'mostCursedSeasonLuck',
]);

const BADGE_DEFINITIONS = [
  {
    key: 'championships',
    label: 'League Champion',
    shortLabel: 'Championships',
    tone: 'gold',
    icon: 'trophy',
    value: team => team?.championships ?? 0,
    detail: team => seasonList(team?.championshipSeasons, 'No titles yet'),
    rankKey: 'championships',
  },
  {
    key: 'divisionTitles',
    label: 'Division Champion',
    shortLabel: 'Division Titles',
    tone: 'orange',
    icon: 'banner',
    value: team => team?.divisionTitles ?? 0,
    detail: team => seasonList(team?.divisionTitleSeasons, 'No division titles yet'),
    rankKey: 'divisionTitles',
  },
  {
    key: 'playoffAppearances',
    label: 'Playoff Appearances',
    shortLabel: 'Playoff Trips',
    tone: 'cyan',
    icon: 'bracket',
    value: team => team?.playoffAppearances ?? 0,
    detail: team => `${team?.seasonsActive ?? 0} season${team?.seasonsActive === 1 ? '' : 's'} in league`,
    rankKey: 'playoffAppearances',
  },
  {
    key: 'allTimeRecord',
    label: 'All-Time Record',
    shortLabel: 'All-Time Record',
    tone: 'blue',
    icon: 'record',
    value: team => team?.allTimeRecord || '0-0',
    detail: team => `${formatPct(team?.allTimeWinPct)} winning percentage`,
    rankKey: 'allTimeWinPct',
  },
  {
    key: 'allTimeWinPct',
    label: 'All-Time Win %',
    shortLabel: 'Win %',
    tone: 'blue',
    icon: 'percent',
    value: team => formatPct(team?.allTimeWinPct),
    detail: team => `${team?.wins ?? 0} career regular-season wins`,
    rankKey: 'allTimeWinPct',
  },
  {
    key: 'playoffRecord',
    label: 'Playoff Record',
    shortLabel: 'Playoff Record',
    tone: 'purple',
    icon: 'record',
    value: team => team?.playoffRecord || '0-0',
    detail: team => `${formatPct(team?.playoffWinPct)} postseason win rate`,
    rankKey: 'playoffWins',
  },
  {
    key: 'playoffWinPct',
    label: 'Playoff Win %',
    shortLabel: 'Playoff Win %',
    tone: 'purple',
    icon: 'percent',
    value: team => formatPct(team?.playoffWinPct),
    detail: team => `${team?.playoffWins ?? 0} playoff win${team?.playoffWins === 1 ? '' : 's'}`,
    rankKey: 'playoffWinPct',
  },
  {
    key: 'trades',
    label: 'Trades Completed',
    shortLabel: 'Trades',
    tone: 'green',
    icon: 'trade',
    value: team => team?.trades ?? 0,
    detail: () => 'Completed trades involving this franchise',
    rankKey: 'trades',
  },
  {
    key: 'playersAdded',
    label: 'Players Added',
    shortLabel: 'Players Added',
    tone: 'green',
    icon: 'plus',
    value: team => team?.playersAdded ?? 0,
    detail: () => 'Waiver and free-agent additions',
    rankKey: 'playersAdded',
  },
  {
    key: 'rookiesDrafted',
    label: 'Rookies Drafted',
    shortLabel: 'Rookies Drafted',
    tone: 'green',
    icon: 'draft',
    value: team => team?.rookiesDrafted ?? 0,
    detail: () => 'Annual rookie selections since the startup season',
    rankKey: 'rookiesDrafted',
  },
];


function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

function matchupDetail(record) {
  if (!record) return 'No qualifying matchup yet';
  return `${record.season} Wk ${record.week}${record.stage ? ` • ${record.stage}` : ''} vs ${record.opponentTeamName} • ${formatScore(record.score)}–${formatScore(record.opponentScore)}`;
}

function titleRunDetail(team) {
  const runs = Array.isArray(team?.backToBackRuns) ? team.backToBackRuns : [];
  if (!runs.length) return 'Win championships in consecutive seasons';
  return runs.map(run => run.length > 2 ? `${run.start}–${run.end} (${run.length} straight)` : `${run.start}–${run.end}`).join(' • ');
}

function rivalryDetail(rivalry, emptyText = 'No qualifying rivalry yet') {
  if (!rivalry) return emptyText;
  return `${rivalry.opponentTeamName} • ${rivalry.record} all-time`;
}

function luckDetail(record, emptyText) {
  if (!record) return emptyText;
  const sign = record.luck > 0 ? '+' : '';
  return `${record.season} • actual ${record.actualWins.toFixed(1)} vs ${record.expectedWins.toFixed(1)} expected • ${sign}${record.luck.toFixed(2)} wins`;
}

function formatSignedWins(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)} wins`;
}

const MATCHUP_BADGE_RECORD_KEYS = {
  highestWeeklyScore: 'highestWeeklyScore',
  largestBlowout: 'largestWin',
  closestWin: 'closestWin',
  highestScoreLoss: 'highestScoreLoss',
};

function BadgeDetail({ badge, team, earned, compact = false }) {
  const baseTextClass = compact ? 'text-[10px]' : 'text-[11px]';

  if (!earned) {
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} ${baseTextClass} leading-relaxed text-white/32`}>
        {badge.detail(team)}
      </div>
    );
  }

  const matchupRecordKey = MATCHUP_BADGE_RECORD_KEYS[badge.key];
  const matchup = matchupRecordKey ? team?.[matchupRecordKey] : null;
  if (matchup) {
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1.5`}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[8px] font-black uppercase tracking-[0.11em] text-white/30">
          <span>{matchup.season}</span>
          <span className="text-white/15">•</span>
          <span>Wk {matchup.week}</span>
          {matchup.stage ? (
            <>
              <span className="text-white/15">•</span>
              <span>{matchup.stage}</span>
            </>
          ) : null}
        </div>
        <div className={`${baseTextClass} min-w-0 leading-snug`}>
          <span className="mr-1 text-white/25">vs</span>
          <span className="font-bold text-white/68">{matchup.opponentTeamName}</span>
        </div>
        <div className="inline-flex items-center rounded-md border border-white/[0.07] bg-black/15 px-2 py-1 text-[9px] font-black tabular-nums text-white/50">
          <span>{formatScore(matchup.score)}</span>
          <span className="mx-1.5 text-white/20">–</span>
          <span>{formatScore(matchup.opponentScore)}</span>
        </div>
      </div>
    );
  }

  if (badge.key === 'longestWinStreak' && team?.longestWinStreakCount) {
    const streak = team.longestWinStreak;
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1`}>
        <div className="text-[8px] font-black uppercase tracking-[0.11em] text-white/30">{streak.season}</div>
        <div className={`${baseTextClass} font-bold text-white/60`}>Weeks {streak.startWeek}–{streak.endWeek}</div>
      </div>
    );
  }

  if (badge.key === 'mostImproved' && team?.mostImproved) {
    const improved = team.mostImproved;
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1`}>
        <div className="text-[8px] font-black uppercase tracking-[0.11em] text-white/30">{improved.fromSeason} → {improved.toSeason}</div>
        <div className={`${baseTextClass} font-bold text-white/60`}>{improved.fromWins} wins → {improved.toWins} wins</div>
      </div>
    );
  }

  const rivalry = badge.key === 'ownedOpponent'
    ? team?.ownedOpponent
    : badge.key === 'nemesis'
      ? team?.nemesis
      : badge.key === 'archrival'
        ? team?.archrival
        : badge.key === 'currentOwnership'
          ? team?.currentOwnership
          : null;

  if (rivalry) {
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1`}>
        <div className={`${baseTextClass} min-w-0 leading-snug`}>
          <span className="mr-1 text-white/25">vs</span>
          <span className="font-bold text-white/68">{rivalry.opponentTeamName}</span>
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.08em] text-white/32">{rivalry.record} all-time</div>
      </div>
    );
  }

  if (badge.key === 'sweepArtist' && team?.sweepArtist) {
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1`}>
        <div className={`${baseTextClass} font-bold leading-snug text-white/68`}>{team.sweepArtist.opponentTeamName}</div>
        <div className="text-[9px] font-black uppercase tracking-[0.08em] text-white/32">{team.sweepArtist.sweepSeasons.join(' • ')}</div>
      </div>
    );
  }

  const luckRecord = badge.key === 'luckiestSeason'
    ? team?.luckiestSeason
    : badge.key === 'mostCursedSeason'
      ? team?.mostCursedSeason
      : null;

  if (luckRecord) {
    return (
      <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} space-y-1`}>
        <div className="text-[8px] font-black uppercase tracking-[0.11em] text-white/30">{luckRecord.season}</div>
        <div className={`${baseTextClass} font-bold text-white/60`}>
          {luckRecord.actualWins.toFixed(1)} actual <span className="mx-1 text-white/20">•</span> {luckRecord.expectedWins.toFixed(1)} expected
        </div>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'mt-1.5' : 'mt-2.5'} ${baseTextClass} min-h-[1rem] leading-relaxed text-white/42`}>
      {badge.detail(team)}
    </div>
  );
}

const ACHIEVEMENT_BADGES = [
  {
    key: 'backToBack',
    label: 'Back-to-Back',
    shortLabel: 'Title Streak',
    tone: 'gold',
    icon: 'trophy',
    value: team => (team?.longestTitleStreak ?? 0) >= 2 ? `${team.longestTitleStreak} straight` : 'Locked',
    detail: titleRunDetail,
    rankKey: 'longestTitleStreak',
    earned: team => (team?.longestTitleStreak ?? 0) >= 2,
  },
  {
    key: 'runnerUp',
    label: 'Runner-Up',
    shortLabel: 'Runner-Up',
    tone: 'purple',
    icon: 'medal',
    value: team => team?.runnerUps ?? 0,
    detail: team => seasonList(team?.runnerUpSeasons, 'Reach the championship game'),
    rankKey: 'runnerUps',
    earned: team => (team?.runnerUps ?? 0) > 0,
  },
  {
    key: 'regularSeasonKing',
    label: 'Regular Season King',
    shortLabel: 'Regular Season #1',
    tone: 'orange',
    icon: 'crown',
    value: team => team?.regularSeasonTitles ?? 0,
    detail: team => seasonList(team?.regularSeasonTitleSeasons, 'Finish #1 in the regular season'),
    rankKey: 'regularSeasonTitles',
    earned: team => (team?.regularSeasonTitles ?? 0) > 0,
  },
  {
    key: 'tenWinClub',
    label: 'Ten-Win Club',
    shortLabel: '10-Win Seasons',
    tone: 'cyan',
    icon: 'star',
    value: team => team?.tenWinSeasons ?? 0,
    detail: team => seasonList(team?.tenWinSeasonYears, 'Reach 10 regular-season wins'),
    rankKey: 'tenWinSeasons',
    earned: team => (team?.tenWinSeasons ?? 0) > 0,
  },
  {
    key: 'highestWeeklyScore',
    label: 'Weekly Nuclear',
    shortLabel: 'High Score',
    tone: 'orange',
    icon: 'bolt',
    value: team => formatScore(team?.highestWeeklyScoreValue),
    detail: team => matchupDetail(team?.highestWeeklyScore),
    rankKey: 'highestWeeklyScoreValue',
    earned: team => Number.isFinite(Number(team?.highestWeeklyScoreValue)),
  },
  {
    key: 'largestBlowout',
    label: 'Steamroller',
    shortLabel: 'Largest Win',
    tone: 'green',
    icon: 'bolt',
    value: team => Number.isFinite(Number(team?.largestWinMargin)) ? `+${formatScore(team.largestWinMargin)}` : 'Locked',
    detail: team => matchupDetail(team?.largestWin),
    rankKey: 'largestWinMargin',
    earned: team => Number.isFinite(Number(team?.largestWinMargin)),
  },
  {
    key: 'closestWin',
    label: 'Photo Finish',
    shortLabel: 'Closest Win',
    tone: 'cyan',
    icon: 'target',
    value: team => Number.isFinite(Number(team?.closestWinMargin)) ? `+${formatScore(team.closestWinMargin)}` : 'Locked',
    detail: team => matchupDetail(team?.closestWin),
    rankKey: 'closestWinMargin',
    earned: team => Number.isFinite(Number(team?.closestWinMargin)),
  },
  {
    key: 'highestScoreLoss',
    label: 'Heartbreaker',
    shortLabel: 'High Score in Loss',
    tone: 'purple',
    icon: 'heart',
    value: team => formatScore(team?.highestScoreLossValue),
    detail: team => matchupDetail(team?.highestScoreLoss),
    rankKey: 'highestScoreLossValue',
    earned: team => Number.isFinite(Number(team?.highestScoreLossValue)),
  },
  {
    key: 'longestWinStreak',
    label: 'Hot Streak',
    shortLabel: 'Win Streak',
    tone: 'orange',
    icon: 'flame',
    value: team => `${team?.longestWinStreakCount ?? 0} W`,
    detail: team => team?.longestWinStreakCount ? `${team.longestWinStreak.season} Wk ${team.longestWinStreak.startWeek}–${team.longestWinStreak.endWeek}` : 'Win consecutive regular-season matchups',
    rankKey: 'longestWinStreakCount',
    earned: team => (team?.longestWinStreakCount ?? 0) > 0,
  },
  {
    key: 'threeTeamTrader',
    label: 'Three-Team Trader',
    shortLabel: '3+ Team Trades',
    tone: 'green',
    icon: 'trade',
    value: team => team?.threeTeamTrades ?? 0,
    detail: () => 'Completed trades involving at least three franchises',
    rankKey: 'threeTeamTrades',
    earned: team => (team?.threeTeamTrades ?? 0) > 0,
  },
  {
    key: 'socialButterfly',
    label: 'Social Butterfly',
    shortLabel: 'Trade Partners',
    tone: 'cyan',
    icon: 'people',
    value: team => team?.uniqueTradePartners ?? 0,
    detail: team => `Traded with ${team?.uniqueTradePartners ?? 0} different franchise${team?.uniqueTradePartners === 1 ? '' : 's'}`,
    rankKey: 'uniqueTradePartners',
    earned: team => (team?.uniqueTradePartners ?? 0) > 0,
  },
  {
    key: 'mostImproved',
    label: 'Most Improved',
    shortLabel: 'Win Improvement',
    tone: 'blue',
    icon: 'trend',
    value: team => (team?.mostImprovedWins ?? 0) > 0 ? `+${team.mostImprovedWins} wins` : 'Locked',
    detail: team => (team?.mostImprovedWins ?? 0) > 0 ? `${team.mostImproved.fromSeason} → ${team.mostImproved.toSeason} (${team.mostImproved.fromWins} → ${team.mostImproved.toWins})` : 'Improve your win total year over year',
    rankKey: 'mostImprovedWins',
    earned: team => (team?.mostImprovedWins ?? 0) > 0,
  },
];

const RIVALRY_BADGES = [
  {
    key: 'ownedOpponent',
    label: 'Owned',
    shortLabel: 'Most Wins vs Rival',
    tone: 'green',
    icon: 'shield',
    value: team => team?.ownedOpponent ? `${team.ownedOpponent.wins} W` : 'Locked',
    detail: team => rivalryDetail(team?.ownedOpponent, 'Build a winning record against a rival'),
    rankKey: 'ownedOpponentWins',
    earned: team => (team?.ownedOpponentWins ?? 0) > 0,
  },
  {
    key: 'nemesis',
    label: 'Nemesis',
    shortLabel: 'Most Losses vs Rival',
    tone: 'purple',
    icon: 'skull',
    value: team => team?.nemesis ? `${team.nemesis.losses} L` : 'Locked',
    detail: team => rivalryDetail(team?.nemesis, 'No nemesis yet'),
    rankKey: 'nemesisLosses',
    earned: team => (team?.nemesisLosses ?? 0) > 0,
  },
  {
    key: 'archrival',
    label: 'Archrival',
    shortLabel: 'Most H2H Games',
    tone: 'orange',
    icon: 'swords',
    value: team => team?.archrival ? `${team.archrival.games} games` : 'Locked',
    detail: team => rivalryDetail(team?.archrival, 'No recurring rival yet'),
    rankKey: 'archrivalGames',
    earned: team => (team?.archrivalGames ?? 0) > 0,
  },
  {
    key: 'sweepArtist',
    label: 'Sweep Artist',
    shortLabel: 'Season Sweeps',
    tone: 'cyan',
    icon: 'broom',
    value: team => `${team?.sweepCount ?? 0} sweep${team?.sweepCount === 1 ? '' : 's'}`,
    detail: team => team?.sweepArtist
      ? `${team.sweepArtist.opponentTeamName} • ${team.sweepArtist.sweepSeasons.join(' • ')}`
      : 'Beat the same opponent at least twice without a loss in a season',
    rankKey: 'sweepCount',
    earned: team => (team?.sweepCount ?? 0) > 0,
  },
  {
    key: 'currentOwnership',
    label: 'Current Ownership',
    shortLabel: 'Active H2H Streak',
    tone: 'gold',
    icon: 'lock',
    value: team => team?.currentOwnership ? `${team.currentOwnership.currentWinStreak} straight` : 'Locked',
    detail: team => team?.currentOwnership
      ? `vs ${team.currentOwnership.opponentTeamName} • ${team.currentOwnership.record} all-time`
      : 'Win consecutive meetings against the same opponent',
    rankKey: 'currentOwnershipStreak',
    earned: team => (team?.currentOwnershipStreak ?? 0) > 0,
  },
];

const LUCK_BADGES = [
  {
    key: 'luckiestSeason',
    label: 'Luckiest Season',
    shortLabel: 'Best Schedule Luck',
    tone: 'green',
    icon: 'clover',
    value: team => team?.luckiestSeason ? formatSignedWins(team.luckiestSeason.luck) : 'Locked',
    detail: team => luckDetail(team?.luckiestSeason, 'Complete a season with positive schedule luck'),
    rankKey: 'luckiestSeasonLuck',
    earned: team => Number(team?.luckiestSeasonLuck) > 0,
  },
  {
    key: 'mostCursedSeason',
    label: 'Most Cursed Season',
    shortLabel: 'Worst Schedule Luck',
    tone: 'purple',
    icon: 'cloud',
    value: team => team?.mostCursedSeason ? formatSignedWins(team.mostCursedSeason.luck) : 'Locked',
    detail: team => luckDetail(team?.mostCursedSeason, 'Complete a season with negative schedule luck'),
    rankKey: 'mostCursedSeasonLuck',
    earned: team => Number(team?.mostCursedSeasonLuck) < 0,
  },
];

const SEASON_AWARD_BADGES = [
  {
    key: 'scoringChampion',
    label: 'Scoring Champion',
    shortLabel: 'Scoring Titles',
    tone: 'gold',
    icon: 'scoreboard',
    value: team => team?.scoringChampionships ?? 0,
    detail: team => seasonList(team?.scoringChampionSeasons, 'Lead the league in regular-season points'),
    rankKey: 'scoringChampionships',
    earned: team => (team?.scoringChampionships ?? 0) > 0,
    collectible: true,
  },
  {
    key: 'bestDefense',
    label: 'Best Defense',
    shortLabel: 'Best Defense',
    tone: 'blue',
    icon: 'wall',
    value: team => team?.bestDefenseSeasons ?? 0,
    detail: team => seasonList(team?.bestDefenseSeasonYears, 'Allow the fewest regular-season points'),
    rankKey: 'bestDefenseSeasons',
    earned: team => (team?.bestDefenseSeasons ?? 0) > 0,
    collectible: true,
  },
  {
    key: 'pointsJuggernaut',
    label: 'Points Juggernaut',
    shortLabel: 'Juggernaut Seasons',
    tone: 'orange',
    icon: 'rocket',
    value: team => team?.pointsJuggernautSeasons ?? 0,
    detail: team => seasonList(team?.pointsJuggernautSeasonYears, 'Score at least 10% above the league-average season total'),
    rankKey: 'pointsJuggernautSeasons',
    earned: team => (team?.pointsJuggernautSeasons ?? 0) > 0,
    collectible: true,
  },
  {
    key: 'divisionSweepAward',
    label: 'Division Sweep',
    shortLabel: 'Division Sweeps',
    tone: 'cyan',
    icon: 'broom',
    value: team => team?.divisionSweeps ?? 0,
    detail: team => seasonList(team?.divisionSweepSeasons, 'Go undefeated against every divisional opponent'),
    rankKey: 'divisionSweeps',
    earned: team => (team?.divisionSweeps ?? 0) > 0,
    collectible: true,
  },
  {
    key: 'cinderellaChampion',
    label: 'Cinderella Champion',
    shortLabel: 'Cinderella Titles',
    tone: 'purple',
    icon: 'sparkle',
    value: team => team?.cinderellaChampionships ?? 0,
    detail: team => seasonList(team?.cinderellaSeasons, 'Win the championship from 4th or lower in the regular-season standings'),
    rankKey: 'cinderellaChampionships',
    earned: team => (team?.cinderellaChampionships ?? 0) > 0,
    collectible: true,
  },
  {
    key: 'woodenSpoon',
    label: 'Wooden Spoon',
    shortLabel: 'Last-Place Finishes',
    tone: 'purple',
    icon: 'spoon',
    value: team => team?.woodenSpoons ?? 0,
    detail: team => seasonList(team?.woodenSpoonSeasons, 'Finish last in the regular-season standings'),
    rankKey: 'woodenSpoons',
    earned: team => (team?.woodenSpoons ?? 0) > 0,
    collectible: true,
  },
];

const TONES = {
  gold: {
    border: 'border-amber-300/25',
    glow: 'from-amber-300/18 via-amber-400/5 to-transparent',
    icon: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
    value: 'text-amber-200',
    chip: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
  },
  orange: {
    border: 'border-[#FF6B3D]/25',
    glow: 'from-[#FF6B3D]/16 via-[#FF4B1F]/4 to-transparent',
    icon: 'border-[#FF6B3D]/30 bg-[#FF6B3D]/10 text-[#FF9A7E]',
    value: 'text-[#FF9A7E]',
    chip: 'border-[#FF6B3D]/20 bg-[#FF6B3D]/10 text-[#FF9A7E]',
  },
  cyan: {
    border: 'border-[#1FDDFF]/25',
    glow: 'from-[#1FDDFF]/14 via-[#1FDDFF]/4 to-transparent',
    icon: 'border-[#1FDDFF]/30 bg-[#1FDDFF]/10 text-[#78ECFF]',
    value: 'text-[#78ECFF]',
    chip: 'border-[#1FDDFF]/20 bg-[#1FDDFF]/10 text-[#78ECFF]',
  },
  blue: {
    border: 'border-blue-400/20',
    glow: 'from-blue-400/12 via-blue-500/3 to-transparent',
    icon: 'border-blue-400/25 bg-blue-400/10 text-blue-200',
    value: 'text-blue-200',
    chip: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
  },
  purple: {
    border: 'border-violet-400/20',
    glow: 'from-violet-400/12 via-violet-500/3 to-transparent',
    icon: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
    value: 'text-violet-200',
    chip: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  },
  green: {
    border: 'border-emerald-400/20',
    glow: 'from-emerald-400/12 via-emerald-500/3 to-transparent',
    icon: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    value: 'text-emerald-200',
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  },
};

function formatPct(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? number.toFixed(1) : '0.0'}%`;
}

function seasonList(seasons, emptyText) {
  if (!Array.isArray(seasons) || seasons.length === 0) return emptyText;
  return seasons.join(' • ');
}

function initials(value) {
  return String(value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
}

const RARITY_CLASS_BY_KEY = {
  legendary: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  epic: 'border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-200',
  rare: 'border-violet-300/25 bg-violet-300/10 text-violet-200',
  uncommon: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
  common: 'border-white/10 bg-white/[0.04] text-white/45',
};

const TIER_VALUE_RULES = {
  playoffAppearances: team => Number(team?.playoffAppearances) || 0,
  divisionTitles: team => Number(team?.divisionTitles) || 0,
  tenWinClub: team => Number(team?.tenWinSeasons) || 0,
  threeTeamTrader: team => Number(team?.threeTeamTrades) || 0,
};

const TIER_LABELS = ['Bronze', 'Silver', 'Gold', 'Diamond'];
const TIER_CLASSES = [
  'border-orange-300/20 bg-orange-300/[0.08] text-orange-200',
  'border-slate-300/20 bg-slate-300/[0.08] text-slate-200',
  'border-amber-300/20 bg-amber-300/[0.08] text-amber-200',
  'border-cyan-200/25 bg-cyan-200/[0.09] text-cyan-100',
];

const SEASON_BADGE_CONFIG_KEYS = {
  champion: 'championships',
  runnerUp: 'runnerUp',
  divisionTitle: 'divisionTitles',
  playoffs: 'playoffAppearances',
  regularSeasonTitle: 'regularSeasonKing',
  tenWin: 'tenWinClub',
  threeTeamTrade: 'threeTeamTrader',
  scoringChampion: 'scoringChampion',
  bestDefense: 'bestDefense',
  pointsJuggernaut: 'pointsJuggernaut',
  divisionSweep: 'divisionSweepAward',
  cinderellaChampion: 'cinderellaChampion',
  woodenSpoon: 'woodenSpoon',
  sweepArtistSeason: 'sweepArtist',
};

let ACTIVE_BADGE_PRESTIGE_CONFIG = normalizeBadgePrestigeConfig(DEFAULT_BADGE_PRESTIGE_CONFIG);

function setActiveBadgePrestigeConfig(config) {
  ACTIVE_BADGE_PRESTIGE_CONFIG = normalizeBadgePrestigeConfig(config);
}

function getRarityLevels() {
  const thresholds = ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.thresholds || DEFAULT_BADGE_PRESTIGE_CONFIG.rarity.thresholds;
  return [
    { key: 'legendary', label: 'Legendary', maxPct: Number(thresholds.legendary), className: RARITY_CLASS_BY_KEY.legendary },
    { key: 'epic', label: 'Epic', maxPct: Number(thresholds.epic), className: RARITY_CLASS_BY_KEY.epic },
    { key: 'rare', label: 'Rare', maxPct: Number(thresholds.rare), className: RARITY_CLASS_BY_KEY.rare },
    { key: 'uncommon', label: 'Uncommon', maxPct: Number(thresholds.uncommon), className: RARITY_CLASS_BY_KEY.uncommon },
    { key: 'common', label: 'Common', maxPct: 100, className: RARITY_CLASS_BY_KEY.common },
  ];
}

function collectibleEarned(badge, team) {
  if (!badge || !team) return false;
  if (typeof badge.earned === 'function') return Boolean(badge.earned(team));
  const key = badge.key;
  if (key === 'championships') return Number(team?.championships) > 0;
  if (key === 'divisionTitles') return Number(team?.divisionTitles) > 0;
  if (key === 'playoffAppearances') return Number(team?.playoffAppearances) > 0;
  return false;
}

function badgeIsCollectible(badge) {
  if (!ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.enabled || !badge?.key) return false;
  const allowed = ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.badges || {};
  return allowed[badge.key] === true;
}

function getBadgeRarity(franchises, badge) {
  if (!badgeIsCollectible(badge) || !Array.isArray(franchises) || !franchises.length) return null;
  const earnedCount = franchises.filter(team => collectibleEarned(badge, team)).length;
  if (!earnedCount) return null;
  const pct = (earnedCount / franchises.length) * 100;
  const levels = getRarityLevels();
  const level = levels.find(item => pct <= item.maxPct) || levels[levels.length - 1];
  return { ...level, earnedCount, total: franchises.length, pct };
}

function getBadgeTier(team, badge) {
  if (!ACTIVE_BADGE_PRESTIGE_CONFIG?.tiers?.enabled || !badge?.key) return null;
  if (ACTIVE_BADGE_PRESTIGE_CONFIG?.tiers?.badges?.[badge.key] !== true) return null;
  const valueGetter = TIER_VALUE_RULES[badge.key];
  const thresholds = ACTIVE_BADGE_PRESTIGE_CONFIG?.tiers?.thresholds?.[badge.key];
  if (!valueGetter || !Array.isArray(thresholds) || thresholds.length < 4) return null;
  const value = valueGetter(team);
  let index = -1;
  thresholds.forEach((threshold, i) => { if (value >= threshold) index = i; });
  if (index < 0) return null;
  const nextThreshold = thresholds[index + 1] ?? null;
  return {
    label: TIER_LABELS[index],
    className: TIER_CLASSES[index],
    value,
    threshold: thresholds[index],
    nextThreshold,
    remaining: nextThreshold ? Math.max(0, nextThreshold - value) : 0,
  };
}

function seasonBadgeRarity(franchises, badgeType) {
  if (!ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.enabled || !Array.isArray(franchises) || !franchises.length || !badgeType) return null;
  const configKey = SEASON_BADGE_CONFIG_KEYS[badgeType.key] || badgeType.key;
  if (ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.badges?.[configKey] !== true) return null;
  const earnedCount = badgeType.key === 'sweepArtistSeason'
    ? franchises.filter(team => (team?.rivalries || []).some(rivalry => Array.isArray(rivalry?.sweepSeasons) && rivalry.sweepSeasons.length > 0)).length
    : franchises.filter(team => (team?.seasonHistory || []).some(season => typeof badgeType.earned === 'function' && badgeType.earned(season))).length;
  if (!earnedCount) return null;
  const pct = (earnedCount / franchises.length) * 100;
  const levels = getRarityLevels();
  const level = levels.find(item => pct <= item.maxPct) || levels[levels.length - 1];
  return { ...level, earnedCount, total: franchises.length, pct };
}

function badgeWallPrestigeClasses(rarity) {
  if (!rarity) return '';
  const prestige = ACTIVE_BADGE_PRESTIGE_CONFIG?.prestige || {};
  if (rarity.key === 'legendary' && prestige.legendaryGlow) return 'ring-1 ring-amber-300/30 shadow-[0_0_18px_rgba(252,211,77,0.08)]';
  if (rarity.key === 'epic' && prestige.epicGlow) return 'ring-1 ring-fuchsia-300/20';
  return '';
}

function badgeWallPrestigeMarker(rarity) {
  if (!rarity) return '';
  const prestige = ACTIVE_BADGE_PRESTIGE_CONFIG?.prestige || {};
  if (rarity.key === 'legendary' && prestige.legendaryWallMarker) return '◆';
  if (rarity.key === 'epic' && prestige.epicWallMarker) return '◇';
  return '';
}

function RarityLegend() {
  if (!ACTIVE_BADGE_PRESTIGE_CONFIG?.rarity?.enabled) return null;
  const levels = getRarityLevels();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.09em]">
      <span className="mr-1 text-white/25">Rarity</span>
      {levels.map(level => <span key={level.key} className={`rounded-full border px-2 py-0.5 ${level.className}`}>{level.label} ≤{level.maxPct}%</span>)}
      <span className="ml-1 text-white/22">Commissioner-configured historical rarity</span>
    </div>
  );
}

function legacyCompare(a, b) {
  return (
    (b?.championships ?? 0) - (a?.championships ?? 0) ||
    (b?.divisionTitles ?? 0) - (a?.divisionTitles ?? 0) ||
    (b?.playoffWins ?? 0) - (a?.playoffWins ?? 0) ||
    (b?.allTimeWinPct ?? 0) - (a?.allTimeWinPct ?? 0) ||
    (b?.wins ?? 0) - (a?.wins ?? 0) ||
    String(a?.teamName || '').localeCompare(String(b?.teamName || ''))
  );
}

function metricCompare(metric, a, b) {
  if (metric === 'legacy') return legacyCompare(a, b);

  const aRaw = a?.[metric];
  const bRaw = b?.[metric];
  const av = Number(aRaw);
  const bv = Number(bRaw);
  const aPresent = !NULLABLE_RECORD_METRICS.has(metric) || (aRaw !== null && aRaw !== undefined && aRaw !== '');
  const bPresent = !NULLABLE_RECORD_METRICS.has(metric) || (bRaw !== null && bRaw !== undefined && bRaw !== '');
  const aValid = aPresent && Number.isFinite(av) && (metric !== 'closestWinMargin' || av > 0);
  const bValid = bPresent && Number.isFinite(bv) && (metric !== 'closestWinMargin' || bv > 0);

  if (aValid !== bValid) return aValid ? -1 : 1;
  if (!aValid && !bValid) return legacyCompare(a, b);

  const difference = ASCENDING_METRICS.has(metric) ? av - bv : bv - av;
  return difference || legacyCompare(a, b);
}

function metricValue(team, metric) {
  if (metric === 'legacy') {
    if ((team?.championships ?? 0) > 0) return `${team.championships} title${team.championships === 1 ? '' : 's'}`;
    if ((team?.divisionTitles ?? 0) > 0) return `${team.divisionTitles} division title${team.divisionTitles === 1 ? '' : 's'}`;
    return formatPct(team?.allTimeWinPct);
  }
  if (metric === 'allTimeWinPct') return formatPct(team?.allTimeWinPct);
  if (metric === 'highestWeeklyScoreValue' || metric === 'highestScoreLossValue') return formatScore(team?.[metric]);
  if (metric === 'largestWinMargin' || metric === 'closestWinMargin') {
    const value = Number(team?.[metric]);
    return Number.isFinite(value) ? `+${formatScore(value)}` : '—';
  }
  if (metric === 'longestTitleStreak') {
    const value = Number(team?.longestTitleStreak) || 0;
    return value >= 2 ? `${value} straight` : '—';
  }
  if (metric === 'longestWinStreakCount') return `${Number(team?.longestWinStreakCount) || 0} W`;
  if (metric === 'mostImprovedWins') {
    const value = Number(team?.mostImprovedWins) || 0;
    return value > 0 ? `+${value} wins` : '—';
  }
  if (metric === 'careerAllPlayWinPct') return formatPct(team?.careerAllPlayWinPct);
  if (metric === 'careerLuck') return formatSignedWins(team?.careerLuck);
  if (metric === 'luckiestSeasonLuck' || metric === 'mostCursedSeasonLuck') return formatSignedWins(team?.[metric]);
  if (metric === 'ownedOpponentWins') return `${Number(team?.ownedOpponentWins) || 0} W`;
  if (metric === 'nemesisLosses') return `${Number(team?.nemesisLosses) || 0} L`;
  if (metric === 'archrivalGames') return `${Number(team?.archrivalGames) || 0} games`;
  if (metric === 'sweepCount') return `${Number(team?.sweepCount) || 0} sweeps`;
  if (metric === 'currentOwnershipStreak') return `${Number(team?.currentOwnershipStreak) || 0} straight`;
  return Number(team?.[metric]) || 0;
}

function BadgeIcon({ type, className = 'h-6 w-6' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, className, 'aria-hidden': true };

  if (type === 'trophy') {
    return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4"/><path d="M16 6h3v1a4 4 0 0 1-4 4"/><path d="M12 12v4"/><path d="M8.5 20h7"/><path d="M9.5 16h5l1 4h-7l1-4Z"/></svg>;
  }
  if (type === 'banner') {
    return <svg {...common}><path d="M6 3v18"/><path d="M7 4h10l-2 4 2 4H7"/></svg>;
  }
  if (type === 'bracket') {
    return <svg {...common}><path d="M5 4h5v5H5z"/><path d="M5 15h5v5H5z"/><path d="M14 9h5v6h-5z"/><path d="M10 6.5h2v5.5h2"/><path d="M10 17.5h2V12"/></svg>;
  }
  if (type === 'percent') {
    return <svg {...common}><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M18.5 5.5 5.5 18.5"/></svg>;
  }
  if (type === 'trade') {
    return <svg {...common}><path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/></svg>;
  }
  if (type === 'plus') {
    return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M18 8v6"/><path d="M15 11h6"/></svg>;
  }
  if (type === 'draft') {
    return <svg {...common}><path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h3"/></svg>;
  }
  if (type === 'medal') {
    return <svg {...common}><circle cx="12" cy="14" r="5"/><path d="M9 3h6l-1.5 6h-3L9 3Z"/><path d="m12 11 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 13.3l2-.3 1-2Z"/></svg>;
  }
  if (type === 'crown') {
    return <svg {...common}><path d="m4 8 4 3 4-6 4 6 4-3-2 10H6L4 8Z"/><path d="M7 21h10"/></svg>;
  }
  if (type === 'star') {
    return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>;
  }
  if (type === 'bolt') {
    return <svg {...common}><path d="M13 2 5 14h6l-1 8 9-13h-6V2Z"/></svg>;
  }
  if (type === 'target') {
    return <svg {...common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M22 12h-3"/></svg>;
  }
  if (type === 'heart') {
    return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>;
  }
  if (type === 'flame') {
    return <svg {...common}><path d="M13 2s1 4-2 7c-2 2-3 4-2 7 1 3 4 5 7 3 4-2 4-8 1-11 0 3-2 4-4 4 1-4 0-7 0-10Z"/></svg>;
  }
  if (type === 'people') {
    return <svg {...common}><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M13.5 19a4.5 4.5 0 0 1 8 0"/></svg>;
  }
  if (type === 'trend') {
    return <svg {...common}><path d="M4 17 10 11l4 4 6-8"/><path d="M15 7h5v5"/></svg>;
  }
  if (type === 'shield') {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>;
  }
  if (type === 'skull') {
    return <svg {...common}><path d="M7 18v-2a7 7 0 1 1 10 0v2"/><path d="M8 18h8v3H8z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/><path d="M12 13v2"/></svg>;
  }
  if (type === 'swords') {
    return <svg {...common}><path d="m5 4 15 15"/><path d="m19 4-6 6"/><path d="m11 12-6 6"/><path d="m3 16 5 5"/><path d="m16 3 5 5"/></svg>;
  }
  if (type === 'broom') {
    return <svg {...common}><path d="m15 3-5 10"/><path d="m9 12 5 2 4-8-3-2-6 8Z"/><path d="M8 13c-3 2-4 5-4 8 3 0 6-1 8-4"/></svg>;
  }
  if (type === 'lock') {
    return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>;
  }
  if (type === 'clover') {
    return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="15" cy="8" r="3"/><circle cx="9" cy="14" r="3"/><circle cx="15" cy="14" r="3"/><path d="M12 16v5"/></svg>;
  }
  if (type === 'cloud') {
    return <svg {...common}><path d="M6 17h11a4 4 0 0 0 .4-8A6 6 0 0 0 6 10.5 3.5 3.5 0 0 0 6 17Z"/><path d="m9 19-1 2"/><path d="m14 19-1 2"/></svg>;
  }
  if (type === 'scoreboard') {
    return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h2v4H8z"/><path d="M14 9h2v4h-2z"/><path d="M7 16h10"/></svg>;
  }
  if (type === 'wall') {
    return <svg {...common}><path d="M4 5h16v14H4z"/><path d="M4 10h16"/><path d="M4 15h16"/><path d="M9 5v5"/><path d="M15 10v5"/><path d="M9 15v4"/></svg>;
  }
  if (type === 'rocket') {
    return <svg {...common}><path d="M14 4c3-2 5-1 6-1 0 1 1 3-1 6l-5 5-6-5 5-5Z"/><path d="m9 9-4 1-2 3 5 1"/><path d="m15 15-1 4-3 2-1-5"/><circle cx="15" cy="8" r="1.5"/><path d="M7 17c-2 0-3 1-3 3 2 0 3-1 3-3Z"/></svg>;
  }
  if (type === 'spoon') {
    return <svg {...common}><ellipse cx="9" cy="7" rx="4" ry="5"/><path d="m11 11 7 9"/></svg>;
  }
  if (type === 'sparkle') {
    return <svg {...common}><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>;
  }
  return <svg {...common}><path d="M5 5h14v14H5z"/><path d="M8 15 11 9l2 4 3-5"/></svg>;
}

function TeamAvatar({ team, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';

  if (team?.avatar && !failed) {
    return (
      <img
        src={team.avatar}
        alt=""
        className={`${dimensions} shrink-0 rounded-xl border border-white/10 object-cover shadow-lg`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${dimensions} flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] font-black text-white/75 shadow-lg`}>
      {initials(team?.teamName)}
    </div>
  );
}

function BadgeCard({ badge, team, rank, compact = false, onRankClick, franchises = [], onBadgeClick }) {
  const tone = TONES[badge.tone] || TONES.blue;
  const value = badge.value(team);
  const earned = typeof badge.earned === 'function' ? badge.earned(team) : true;
  const collectibleIsEarned = badgeIsCollectible(badge) ? collectibleEarned(badge, team) : earned;
  const rarity = collectibleIsEarned ? getBadgeRarity(franchises, badge) : null;
  const tier = collectibleIsEarned ? getBadgeTier(team, badge) : null;
  const interactive = typeof onBadgeClick === 'function';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border ${earned ? tone.border : 'border-white/[0.07]'} ${earned ? 'bg-[#081722]' : 'bg-[#08141D] opacity-70'} ${compact ? 'p-4' : 'p-5'} shadow-[0_14px_35px_rgba(0,0,0,0.18)] ${interactive ? 'cursor-pointer transition hover:-translate-y-0.5 hover:border-white/20' : ''}`}
      onClick={interactive ? () => onBadgeClick(team, badge) : undefined}
      onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onBadgeClick(team, badge); } } : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {earned ? <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow}`} /> : null}
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full border border-white/[0.04]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} items-center justify-center rounded-xl border ${earned ? tone.icon : 'border-white/10 bg-white/[0.025] text-white/30'}`}>
            <BadgeIcon type={badge.icon} className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
          </div>
          {earned && rank ? (
            onRankClick && badge.rankKey ? (
              <button
                type="button"
                onClick={event => { event.stopPropagation(); onRankClick(badge.rankKey); }}
                title={`View league rankings for ${badge.shortLabel || badge.label}`}
                aria-label={`View league rankings for ${badge.shortLabel || badge.label}`}
                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.11em] transition hover:-translate-y-0.5 hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-white/20 ${tone.chip}`}
              >
                League #{rank}
              </button>
            ) : (
              <div className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${tone.chip}`}>
                League #{rank}
              </div>
            )
          ) : !earned ? (
            <div className="rounded-full border border-white/10 bg-white/[0.025] px-2 py-1 text-[9px] font-black uppercase tracking-[0.11em] text-white/30">Locked</div>
          ) : null}
        </div>

        <div className={`${compact ? 'mt-3' : 'mt-5'} text-[10px] font-black uppercase tracking-[0.16em] text-white/40`}>
          {badge.label}
        </div>
        <div className={`${compact ? 'mt-1 text-2xl' : 'mt-1.5 text-3xl'} font-black tracking-tight ${earned ? tone.value : 'text-white/35'}`}>
          {value}
        </div>
        {earned && (tier || rarity) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tier ? <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${tier.className}`}>{tier.label} Tier</span> : null}
            {rarity ? <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${rarity.className}`}>{rarity.label} • {rarity.earnedCount}/{rarity.total}</span> : null}
          </div>
        ) : null}
        <BadgeDetail badge={badge} team={team} earned={earned} compact={compact} />
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF8060]">{eyebrow}</div>
      <div className="mt-1 text-xl font-black tracking-tight text-white">{title}</div>
      {description ? <div className="mt-1 max-w-2xl text-sm leading-relaxed text-white/45">{description}</div> : null}
    </div>
  );
}

function SeasonHistory({ team }) {
  const history = Array.isArray(team?.seasonHistory) ? [...team.seasonHistory].reverse() : [];

  if (!history.length) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07141E]">
      <div className="grid gap-px bg-white/[0.06] md:grid-cols-3">
        {history.map(season => (
          <div key={season.season} className="bg-[#07141E] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-white">{season.season}</div>
                <div className="mt-0.5 max-w-[180px] truncate text-xs text-white/40">{season.teamName || team.teamName}</div>
              </div>
              <div className="flex gap-1.5">
                {season.champion ? <span title="League Champion" className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200"><BadgeIcon type="trophy" className="h-4 w-4" /></span> : null}
                {season.runnerUp ? <span title="League Runner-Up" className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-violet-200"><BadgeIcon type="medal" className="h-4 w-4" /></span> : null}
                {season.divisionTitle ? <span title="Division Champion" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#FF6B3D]/25 bg-[#FF6B3D]/10 text-[#FF9A7E]"><BadgeIcon type="banner" className="h-4 w-4" /></span> : null}
                {season.playoffAppearance ? <span title="Playoff Appearance" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1FDDFF]/20 bg-[#1FDDFF]/10 text-[#78ECFF]"><BadgeIcon type="bracket" className="h-4 w-4" /></span> : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {season.regularSeasonTitle ? <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-200">Regular Season #1</span> : null}
              {season.tenWinSeason ? <span className="rounded-full border border-[#1FDDFF]/15 bg-[#1FDDFF]/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#78ECFF]">10-Win Club</span> : null}
              {season.threeTeamTrades > 0 ? <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200">{season.threeTeamTrades} 3+ Team Trade{season.threeTeamTrades === 1 ? '' : 's'}</span> : null}
              {season.scoringChampion ? <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-200">Scoring Champion</span> : null}
              {season.bestDefense ? <span className="rounded-full border border-blue-300/15 bg-blue-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-blue-200">Best Defense</span> : null}
              {season.pointsJuggernaut ? <span className="rounded-full border border-orange-300/15 bg-orange-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-orange-200">Points Juggernaut</span> : null}
              {season.divisionSweep ? <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-cyan-200">Division Sweep</span> : null}
              {season.cinderellaChampion ? <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-200">Cinderella Champion</span> : null}
              {season.woodenSpoon ? <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-200/80">Wooden Spoon</span> : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MiniStat label="Record" value={`${season.wins}-${season.losses}${season.ties ? `-${season.ties}` : ''}`} />
              <MiniStat label="All-Play" value={season.allPlayGames ? season.allPlayRecord : '—'} />
              <MiniStat label="Luck" value={season.allPlayGames ? formatSignedWins(season.luck) : '—'} />
              <MiniStat label="Playoffs" value={season.playoffAppearance ? `${season.playoffWins}-${season.playoffLosses}` : '—'} />
              <MiniStat label="PF" value={Number(season.pointsFor || 0).toFixed(1)} />
              <MiniStat label="PA" value={Number(season.pointsAgainst || 0).toFixed(1)} />
              <MiniStat label="Trades" value={season.trades} />
              <MiniStat label="High" value={season.highestWeeklyScore ? formatScore(season.highestWeeklyScore.score) : '—'} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
      <div className="text-[8px] font-black uppercase tracking-[0.12em] text-white/30">{label}</div>
      <div className="mt-0.5 text-sm font-black text-white/80">{value}</div>
    </div>
  );
}

const SEASON_BADGE_TYPES = [
  { key: 'champion', label: 'Champion', icon: 'trophy', tone: 'gold', earned: season => Boolean(season?.champion) },
  { key: 'runnerUp', label: 'Runner-Up', icon: 'medal', tone: 'purple', earned: season => Boolean(season?.runnerUp) },
  { key: 'divisionTitle', label: 'Division Champion', icon: 'banner', tone: 'orange', earned: season => Boolean(season?.divisionTitle) },
  { key: 'playoffs', label: 'Playoffs', icon: 'bracket', tone: 'cyan', earned: season => Boolean(season?.playoffAppearance) },
  { key: 'regularSeasonTitle', label: 'Regular Season #1', icon: 'crown', tone: 'orange', earned: season => Boolean(season?.regularSeasonTitle) },
  { key: 'tenWin', label: '10-Win Club', icon: 'star', tone: 'cyan', earned: season => Boolean(season?.tenWinSeason) },
  { key: 'threeTeamTrade', label: '3+ Team Trader', icon: 'trade', tone: 'green', earned: season => Number(season?.threeTeamTrades) > 0 },
  { key: 'scoringChampion', label: 'Scoring Champion', icon: 'scoreboard', tone: 'gold', earned: season => Boolean(season?.scoringChampion) },
  { key: 'bestDefense', label: 'Best Defense', icon: 'wall', tone: 'blue', earned: season => Boolean(season?.bestDefense) },
  { key: 'pointsJuggernaut', label: 'Points Juggernaut', icon: 'rocket', tone: 'orange', earned: season => Boolean(season?.pointsJuggernaut) },
  { key: 'divisionSweep', label: 'Division Sweep', icon: 'broom', tone: 'cyan', earned: season => Boolean(season?.divisionSweep) },
  { key: 'cinderellaChampion', label: 'Cinderella Champion', icon: 'sparkle', tone: 'purple', earned: season => Boolean(season?.cinderellaChampion) },
  { key: 'woodenSpoon', label: 'Wooden Spoon', icon: 'spoon', tone: 'purple', earned: season => Boolean(season?.woodenSpoon) },
];

// The League Badge Wall is intentionally stricter than the individual Trophy Case.
// Only genuine earned accolades belong here. Personal bests, rivalry descriptors,
// luck labels, and other metrics that every active franchise will eventually carry
// remain available elsewhere on the page but are excluded from the wall.
const WALL_SPECIAL_BADGE_DEFINITIONS = [
  ACHIEVEMENT_BADGES[0], // Back-to-Back: requires consecutive championships.
].filter(Boolean);

function sweepOpponentsForSeason(team, season) {
  const targetSeason = String(season ?? '');
  const opponents = (team?.rivalries || [])
    .filter(rivalry => (rivalry?.sweepSeasons || []).some(value => String(value) === targetSeason))
    .map(rivalry => rivalry?.opponentTeamName)
    .filter(Boolean);
  return [...new Set(opponents)].sort((a, b) => String(a).localeCompare(String(b)));
}

function seasonBadgeInstances(team) {
  const history = Array.isArray(team?.seasonHistory) ? team.seasonHistory : [];
  return history.flatMap(season => {
    const badges = SEASON_BADGE_TYPES
      .filter(badge => badge.earned(season))
      .map(badge => ({
        ...badge,
        instanceKey: `${season.season}-${badge.key}`,
        season: String(season.season),
      }));

    const sweepOpponents = sweepOpponentsForSeason(team, season.season);
    if (sweepOpponents.length) {
      badges.push({
        key: 'sweepArtistSeason',
        label: 'Sweep Artist',
        icon: 'broom',
        tone: 'cyan',
        instanceKey: `${season.season}-sweepArtist`,
        season: String(season.season),
        sweepOpponents,
      });
    }

    return badges;
  });
}

function specialBadgeInstances(team) {
  return WALL_SPECIAL_BADGE_DEFINITIONS
    .filter(badge => typeof badge.earned === 'function' && badge.earned(team))
    .map(badge => ({
      ...badge,
      instanceKey: `career-${badge.key}`,
      season: '',
    }));
}

function LeagueBadgeWall({ franchises, onTeamClick, onBadgeClick }) {
  const ordered = [...franchises].sort(legacyCompare);

  return (
    <section>
      <SectionHeading
        eyebrow="All Seasons Combined"
        title="League Badge Wall"
        description="A league-wide display of earned hardware and milestone achievements. Personal-best and always-present metric badges are intentionally excluded here."
      />
      <div className="mb-4"><RarityLegend /></div>

      <div className="space-y-3">
        {ordered.map(team => {
          const seasonBadges = seasonBadgeInstances(team);
          const specialBadges = specialBadgeInstances(team);
          const total = seasonBadges.length + specialBadges.length;

          return (
            <div key={team.ownerId} className="rounded-2xl border border-white/[0.08] bg-[#07141E] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <button type="button" onClick={() => onTeamClick(team)} className="flex min-w-[220px] items-center gap-3 text-left">
                  <TeamAvatar team={team} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-white hover:underline">{team.teamName}</div>
                    <div className="mt-0.5 text-[10px] text-white/35">{total} earned accolade{total === 1 ? '' : 's'}</div>
                  </div>
                </button>

                <div className="flex flex-1 flex-wrap gap-1.5">
                  {seasonBadges.map(badge => {
                    const tone = TONES[badge.tone] || TONES.blue;
                    const rarity = seasonBadgeRarity(franchises, badge);
                    const prestige = badgeWallPrestigeClasses(rarity);
                    const prestigeMarker = badgeWallPrestigeMarker(rarity);
                    return (
                      <button key={badge.instanceKey} type="button" onClick={() => onBadgeClick?.(team, badge, badge.season)} title={`${badge.season} ${badge.label}${rarity ? ` • ${rarity.label} (${rarity.earnedCount}/${rarity.total} franchises)` : ''}`} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-black transition hover:-translate-y-0.5 hover:brightness-125 ${tone.chip} ${prestige}`}>
                        <BadgeIcon type={badge.icon} className="h-3.5 w-3.5" />
                        {prestigeMarker ? <span aria-hidden>{prestigeMarker}</span> : null}
                        <span>{badge.season}</span>
                        <span>{badge.label}</span>
                      </button>
                    );
                  })}

                  {specialBadges.map(badge => {
                    const tone = TONES[badge.tone] || TONES.blue;
                    const rarity = getBadgeRarity(franchises, badge);
                    return (
                      <button key={badge.instanceKey} type="button" onClick={() => onBadgeClick?.(team, badge)} title={`${badge.detail(team)}${rarity ? ` • ${rarity.label} (${rarity.earnedCount}/${rarity.total} franchises)` : ''}`} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-black transition hover:-translate-y-0.5 hover:brightness-125 ${tone.chip} ${badgeWallPrestigeClasses(rarity)}`}>
                        <BadgeIcon type={badge.icon} className="h-3.5 w-3.5" />
                        {badgeWallPrestigeMarker(rarity) ? <span aria-hidden>{badgeWallPrestigeMarker(rarity)}</span> : null}
                        <span>{badge.label}</span>
                      </button>
                    );
                  })}

                  {!total ? <span className="text-xs italic text-white/30">No earned accolades yet.</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function findSeasonLine(team, season) {
  return (team?.seasonHistory || []).find(line => String(line.season) === String(season)) || null;
}

function seasonAchievementSummary(key, line) {
  if (!line) return 'Season details unavailable';
  const record = `${line.wins}-${line.losses}${line.ties ? `-${line.ties}` : ''}`;
  if (key === 'champion') return `League Champion • ${record}`;
  if (key === 'runnerUp') return `League Runner-Up • ${record}`;
  if (key === 'divisionTitle') return `Division Champion • ${record}`;
  if (key === 'playoffs') return `${line.playoffWins}-${line.playoffLosses} playoff record • ${record} regular season`;
  if (key === 'regularSeasonTitle') return `Regular Season #1 • ${record}`;
  if (key === 'tenWin') return `10-Win Club • ${record}`;
  if (key === 'threeTeamTrade') return `${line.threeTeamTrades} completed 3+ team trade${line.threeTeamTrades === 1 ? '' : 's'}`;
  if (key === 'scoringChampion') return `${Number(line.pointsFor || 0).toFixed(1)} PF • league scoring champion`;
  if (key === 'bestDefense') return `${Number(line.pointsAgainst || 0).toFixed(1)} PA • fewest in league`;
  if (key === 'pointsJuggernaut') return `${Number(line.pointsFor || 0).toFixed(1)} PF • threshold ${Number(line.pointsJuggernautThreshold || 0).toFixed(1)}`;
  if (key === 'divisionSweep') return `${line.divisionSweepRecord || 'Undefeated'} against the division`;
  if (key === 'cinderellaChampion') return `Champion from regular-season #${line.regularSeasonRank || '?'} • ${record}`;
  if (key === 'woodenSpoon') return `Regular-season #${line.regularSeasonRank || '?'} • ${record}`;
  return record;
}

function badgeHistoryEntries(team, badge, focusedSeason = '') {
  const history = Array.isArray(team?.seasonHistory) ? [...team.seasonHistory].sort((a, b) => Number(b.season) - Number(a.season)) : [];
  if (focusedSeason) {
    if (badge?.key === 'sweepArtistSeason') {
      const opponents = sweepOpponentsForSeason(team, focusedSeason);
      return opponents.length
        ? [{
            season: String(focusedSeason),
            detail: opponents.length === 1
              ? `Swept ${opponents[0]}`
              : `Swept ${opponents.join(', ')}`,
          }]
        : [];
    }
    const line = findSeasonLine(team, focusedSeason);
    return line ? [{ season: String(focusedSeason), detail: seasonAchievementSummary(badge.key, line) }] : [];
  }

  const seasonPredicateByKey = {
    championships: line => line.champion,
    divisionTitles: line => line.divisionTitle,
    playoffAppearances: line => line.playoffAppearance,
    runnerUp: line => line.runnerUp,
    regularSeasonKing: line => line.regularSeasonTitle,
    tenWinClub: line => line.tenWinSeason,
    threeTeamTrader: line => Number(line.threeTeamTrades) > 0,
    scoringChampion: line => line.scoringChampion,
    bestDefense: line => line.bestDefense,
    pointsJuggernaut: line => line.pointsJuggernaut,
    divisionSweepAward: line => line.divisionSweep,
    cinderellaChampion: line => line.cinderellaChampion,
    woodenSpoon: line => line.woodenSpoon,
  };
  const seasonKeyByBadge = {
    championships: 'champion',
    divisionTitles: 'divisionTitle',
    playoffAppearances: 'playoffs',
    runnerUp: 'runnerUp',
    regularSeasonKing: 'regularSeasonTitle',
    tenWinClub: 'tenWin',
    threeTeamTrader: 'threeTeamTrade',
    scoringChampion: 'scoringChampion',
    bestDefense: 'bestDefense',
    pointsJuggernaut: 'pointsJuggernaut',
    divisionSweepAward: 'divisionSweep',
    cinderellaChampion: 'cinderellaChampion',
    woodenSpoon: 'woodenSpoon',
  };

  if (seasonPredicateByKey[badge?.key]) {
    return history
      .filter(seasonPredicateByKey[badge.key])
      .map(line => ({ season: String(line.season), detail: seasonAchievementSummary(seasonKeyByBadge[badge.key], line) }));
  }

  if (badge?.key === 'backToBack') {
    return (team?.backToBackRuns || []).slice().reverse().map(run => ({
      season: `${run.start}–${run.end}`,
      detail: `${run.length} consecutive championships`,
    }));
  }

  if (badge?.key === 'sweepArtist') {
    return (team?.rivalries || []).flatMap(rivalry => (rivalry.sweepSeasons || []).map(season => ({
      season: String(season),
      detail: `Swept ${rivalry.opponentTeamName}`,
    }))).sort((a, b) => Number(b.season) - Number(a.season));
  }

  const matchupKey = MATCHUP_BADGE_RECORD_KEYS[badge?.key];
  if (matchupKey && team?.[matchupKey]) {
    const record = team[matchupKey];
    return [{ season: String(record.season), detail: `Week ${record.week} vs ${record.opponentTeamName} • ${formatScore(record.score)}–${formatScore(record.opponentScore)}` }];
  }

  if (badge?.key === 'longestWinStreak' && team?.longestWinStreakCount) {
    const row = team.longestWinStreak;
    return [{ season: String(row.season), detail: `${row.count} straight wins • Weeks ${row.startWeek}–${row.endWeek}` }];
  }
  if (badge?.key === 'mostImproved' && Number(team?.mostImprovedWins) > 0) {
    const row = team.mostImproved;
    return [{ season: `${row.fromSeason}→${row.toSeason}`, detail: `${row.fromWins} wins → ${row.toWins} wins` }];
  }
  if (badge?.key === 'luckiestSeason' && team?.luckiestSeason) {
    const row = team.luckiestSeason;
    return [{ season: String(row.season), detail: `${row.actualWins.toFixed(1)} actual vs ${row.expectedWins.toFixed(1)} expected • ${formatSignedWins(row.luck)}` }];
  }
  if (badge?.key === 'mostCursedSeason' && team?.mostCursedSeason) {
    const row = team.mostCursedSeason;
    return [{ season: String(row.season), detail: `${row.actualWins.toFixed(1)} actual vs ${row.expectedWins.toFixed(1)} expected • ${formatSignedWins(row.luck)}` }];
  }

  if (badge?.key === 'trades') return history.filter(line => Number(line.trades) > 0).map(line => ({ season: line.season, detail: `${line.trades} trade${line.trades === 1 ? '' : 's'}` }));
  if (badge?.key === 'playersAdded') return history.filter(line => Number(line.playersAdded) > 0).map(line => ({ season: line.season, detail: `${line.playersAdded} player addition${line.playersAdded === 1 ? '' : 's'}` }));
  if (badge?.key === 'rookiesDrafted') return history.filter(line => Number(line.rookiesDrafted) > 0).map(line => ({ season: line.season, detail: `${line.rookiesDrafted} rookie${line.rookiesDrafted === 1 ? '' : 's'} drafted` }));
  if (badge?.key === 'allTimeRecord' || badge?.key === 'allTimeWinPct') return history.map(line => ({ season: line.season, detail: `${line.wins}-${line.losses}${line.ties ? `-${line.ties}` : ''} • ${Number(line.pointsFor || 0).toFixed(1)} PF` }));
  if (badge?.key === 'playoffRecord' || badge?.key === 'playoffWinPct') return history.filter(line => line.playoffAppearance).map(line => ({ season: line.season, detail: `${line.playoffWins}-${line.playoffLosses} playoffs` }));

  return [];
}

function BadgeDetailModal({ selection, franchises, onClose }) {
  useEffect(() => {
    if (!selection) return undefined;
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, onClose]);

  if (!selection?.team || !selection?.badge) return null;
  const { team, badge, season = '' } = selection;
  const tone = TONES[badge.tone] || TONES.blue;
  const rarity = season
    ? seasonBadgeRarity(franchises, badge)
    : (collectibleEarned(badge, team) ? getBadgeRarity(franchises, badge) : null);
  const tier = season ? null : getBadgeTier(team, badge);
  const entries = badgeHistoryEntries(team, badge, season);
  const value = season ? badge.label : (typeof badge.value === 'function' ? badge.value(team) : badge.label);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className={`relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border ${tone.border} bg-[#06111B] shadow-2xl`} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow}`} />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}><BadgeIcon type={badge.icon} className="h-6 w-6" /></div>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{season ? `${season} Achievement` : 'Badge Detail'}</div>
                <div className="truncate text-xl font-black text-white">{badge.label}</div>
                <div className="mt-0.5 truncate text-xs text-white/45">{team.teamName}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.13em] text-white/30">Current Mark</div>
                <div className={`mt-1 text-3xl font-black ${tone.value}`}>{value}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {tier ? <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${tier.className}`}>{tier.label} Tier</span> : null}
                {rarity ? <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${rarity.className}`}>{rarity.label} • {rarity.earnedCount} of {rarity.total}</span> : null}
              </div>
            </div>
            {tier?.nextThreshold ? (
              <div className="mt-3 text-xs text-white/45">Next tier: <span className="font-bold text-white/70">{TIER_LABELS[TIER_LABELS.indexOf(tier.label) + 1]}</span> at {tier.nextThreshold} • {tier.remaining} remaining</div>
            ) : tier ? <div className="mt-3 text-xs font-bold text-cyan-100/60">Maximum tier achieved.</div> : null}
            {rarity ? <div className="mt-2 text-[10px] text-white/30">Rarity is based on the share of historical franchises that have ever earned this accolade.</div> : null}
          </div>

          <div className="mt-5">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/30">Achievement History</div>
            <div className="mt-2 space-y-2">
              {entries.length ? entries.map((entry, index) => (
                <div key={`${entry.season}-${index}`} className="flex flex-col gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className={`text-sm font-black ${tone.value}`}>{entry.season}</div>
                  <div className="text-xs leading-relaxed text-white/55 sm:text-right">{entry.detail}</div>
                </div>
              )) : (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm text-white/40">{typeof badge.detail === 'function' ? badge.detail(team) : 'No additional history available yet.'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeasonAwardLine({ label, icon, tone = 'blue', teams = [], detail, onTeamClick }) {
  if (!teams.length) return null;
  const style = TONES[tone] || TONES.blue;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${style.icon}`}><BadgeIcon type={icon} className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/30">{label}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {teams.map(({ team, line }) => (
              <button key={team.ownerId} type="button" onClick={() => onTeamClick(team)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/15 px-2 py-1 text-[10px] font-black text-white/70 hover:border-white/20 hover:text-white">
                <TeamAvatar team={team} size="sm" />
                <span className="max-w-[150px] truncate">{team.teamName}</span>
                {detail ? <span className="font-bold text-white/35">{detail(line)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeagueHistoryTimeline({ seasons, franchises, onTeamClick }) {
  const orderedSeasons = [...(seasons || [])].sort((a, b) => Number(b) - Number(a));
  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="League Museum" title="League History" description="A season-by-season timeline of champions, finalists, regular-season leaders, and award winners." />
      {orderedSeasons.map(season => {
        const rows = franchises
          .map(team => ({ team, line: findSeasonLine(team, season) }))
          .filter(row => row.line);
        const select = predicate => rows.filter(({ line }) => predicate(line));
        const champion = select(line => line.champion);
        const runnerUp = select(line => line.runnerUp);
        const regularKing = select(line => line.regularSeasonTitle);
        const scoring = select(line => line.scoringChampion);
        const defense = select(line => line.bestDefense);
        const juggernaut = select(line => line.pointsJuggernaut);
        const divisionChamps = select(line => line.divisionTitle);
        const playoffField = select(line => line.playoffAppearance);
        const tenWinClub = select(line => line.tenWinSeason);
        const sweeps = select(line => line.divisionSweep);
        const cinderella = select(line => line.cinderellaChampion);
        const spoon = select(line => line.woodenSpoon);
        const highScoreRows = rows.filter(({ line }) => line.highestWeeklyScore);
        const highScoreValue = highScoreRows.length ? Math.max(...highScoreRows.map(({ line }) => Number(line.highestWeeklyScore?.score) || 0)) : null;
        const highScore = highScoreValue === null ? [] : highScoreRows.filter(({ line }) => Math.abs(Number(line.highestWeeklyScore?.score) - highScoreValue) < 0.001);

        return (
          <section key={season} className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-[#07141E] p-5 sm:p-6">
            <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[#FF4B1F] via-amber-300 to-[#1FDDFF]" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF8060]">Season Archive</div>
                <div className="mt-1 text-3xl font-black text-white">{season}</div>
              </div>
              <div className="text-xs text-white/35">{rows.length} franchise{rows.length === 1 ? '' : 's'} recorded</div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <SeasonAwardLine label="League Champion" icon="trophy" tone="gold" teams={champion} detail={line => `${line.wins}-${line.losses}`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Runner-Up" icon="medal" tone="purple" teams={runnerUp} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Best Record / Regular Season #1" icon="crown" tone="orange" teams={regularKing} detail={line => `${line.wins}-${line.losses}`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Scoring Champion" icon="scoreboard" tone="gold" teams={scoring} detail={line => `${Number(line.pointsFor || 0).toFixed(1)} PF`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Best Defense" icon="wall" tone="blue" teams={defense} detail={line => `${Number(line.pointsAgainst || 0).toFixed(1)} PA`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Weekly High Score" icon="bolt" tone="orange" teams={highScore} detail={line => formatScore(line.highestWeeklyScore?.score)} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Division Champions" icon="banner" tone="orange" teams={divisionChamps} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Playoff Field" icon="bracket" tone="cyan" teams={playoffField} detail={line => `${line.playoffWins}-${line.playoffLosses}`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="10-Win Club" icon="star" tone="cyan" teams={tenWinClub} detail={line => `${line.wins}-${line.losses}`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Points Juggernauts" icon="rocket" tone="orange" teams={juggernaut} detail={line => `${Number(line.pointsFor || 0).toFixed(1)} PF`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Division Sweeps" icon="broom" tone="cyan" teams={sweeps} detail={line => line.divisionSweepRecord || ''} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Cinderella Champion" icon="sparkle" tone="purple" teams={cinderella} detail={line => `#${line.regularSeasonRank}`} onTeamClick={onTeamClick} />
              <SeasonAwardLine label="Wooden Spoon" icon="spoon" tone="purple" teams={spoon} detail={line => `${line.wins}-${line.losses}`} onTeamClick={onTeamClick} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RivalryTable({ team }) {
  const rows = Array.isArray(team?.rivalries) ? team.rivalries : [];
  if (!rows.length) return <div className="rounded-2xl border border-white/[0.08] bg-[#07141E] p-5 text-sm text-white/40">No head-to-head history yet.</div>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#07141E]">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[minmax(190px,1.5fr)_100px_90px_90px_120px] gap-3 border-b border-white/[0.07] px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-white/30">
          <div>Opponent</div><div>Record</div><div>Win %</div><div>Sweeps</div><div>Active Streak</div>
        </div>
        {rows.map(row => (
          <div key={row.opponentOwnerId} className="grid grid-cols-[minmax(190px,1.5fr)_100px_90px_90px_120px] gap-3 border-b border-white/[0.05] px-4 py-3 text-sm last:border-b-0">
            <div className="font-bold text-white/80">{row.opponentTeamName}</div>
            <div className="font-black text-white/75">{row.record}</div>
            <div className="text-white/55">{formatPct(row.winPct)}</div>
            <div className="text-white/55">{row.sweeps}</div>
            <div className={row.currentWinStreak > 0 ? 'font-black text-amber-200' : 'text-white/35'}>
              {row.currentWinStreak > 0 ? `${row.currentWinStreak} W` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllPlaySummary({ team }) {
  const actual = Number(team?.wins || 0) + Number(team?.ties || 0) * 0.5;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#07141E] p-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <MiniStat label="Actual Wins" value={actual.toFixed(1)} />
        <MiniStat label="Expected Wins" value={Number(team?.careerExpectedWins || 0).toFixed(1)} />
        <MiniStat label="All-Play Win %" value={formatPct(team?.careerAllPlayWinPct)} />
        <MiniStat label="Career Luck" value={formatSignedWins(team?.careerLuck)} />
      </div>
      <div className="mt-3 text-[10px] leading-relaxed text-white/32">
        Expected wins compare each weekly regular-season score against every other franchise that week. Luck is actual win-equivalents minus those all-play expected wins.
      </div>
    </div>
  );
}

function rankFor(franchises, team, metric) {
  if (!team) return null;
  const sorted = [...franchises].sort((a, b) => metricCompare(metric, a, b));
  const index = sorted.findIndex(item => item.ownerId === team.ownerId);
  return index >= 0 ? index + 1 : null;
}


const RECORD_BOOK_GROUPS = [
  {
    key: 'game',
    eyebrow: 'On the Field',
    title: 'Game Records',
    description: 'The most extreme single-game performances in league history.',
    records: [
      { key: 'highestWeeklyScoreValue', label: 'Highest Weekly Score', icon: 'bolt', tone: 'orange', value: team => formatScore(team?.highestWeeklyScoreValue), detail: team => matchupDetail(team?.highestWeeklyScore) },
      { key: 'largestWinMargin', label: 'Largest Victory', icon: 'bolt', tone: 'green', value: team => `+${formatScore(team?.largestWinMargin)}`, detail: team => matchupDetail(team?.largestWin) },
      { key: 'closestWinMargin', label: 'Closest Victory', icon: 'target', tone: 'cyan', value: team => `+${formatScore(team?.closestWinMargin)}`, detail: team => matchupDetail(team?.closestWin) },
      { key: 'highestScoreLossValue', label: 'Most Points in a Loss', icon: 'heart', tone: 'purple', value: team => formatScore(team?.highestScoreLossValue), detail: team => matchupDetail(team?.highestScoreLoss) },
      { key: 'longestWinStreakCount', label: 'Longest Win Streak', min: 1, icon: 'flame', tone: 'orange', value: team => `${team?.longestWinStreakCount ?? 0} wins`, detail: team => team?.longestWinStreakCount ? `${team.longestWinStreak.season} Wk ${team.longestWinStreak.startWeek}–${team.longestWinStreak.endWeek}` : 'No qualifying streak' },
    ],
  },
  {
    key: 'season',
    eyebrow: 'Across the Years',
    title: 'Season & Legacy Records',
    description: 'The franchises that have pushed the league résumé furthest.',
    records: [
      { key: 'mostImprovedWins', label: 'Most Improved Season', min: 1, icon: 'trend', tone: 'blue', value: team => `+${team?.mostImprovedWins ?? 0} wins`, detail: team => team?.mostImprovedWins ? `${team.mostImproved.fromSeason} → ${team.mostImproved.toSeason} (${team.mostImproved.fromWins} → ${team.mostImproved.toWins})` : 'No completed year-over-year improvement' },
      { key: 'longestTitleStreak', label: 'Longest Title Streak', icon: 'trophy', tone: 'gold', min: 2, value: team => `${team?.longestTitleStreak ?? 0} straight`, detail: titleRunDetail },
      { key: 'regularSeasonTitles', label: 'Most Regular Season #1s', min: 1, icon: 'crown', tone: 'orange', value: team => team?.regularSeasonTitles ?? 0, detail: team => seasonList(team?.regularSeasonTitleSeasons, 'No #1 finishes') },
      { key: 'tenWinSeasons', label: 'Most 10-Win Seasons', min: 1, icon: 'star', tone: 'cyan', value: team => team?.tenWinSeasons ?? 0, detail: team => seasonList(team?.tenWinSeasonYears, 'No 10-win seasons') },
      { key: 'runnerUps', label: 'Most Runner-Up Finishes', min: 1, icon: 'medal', tone: 'purple', value: team => team?.runnerUps ?? 0, detail: team => seasonList(team?.runnerUpSeasons, 'No runner-up finishes') },
    ],
  },
  {
    key: 'season-awards',
    eyebrow: 'Season Hardware',
    title: 'Award Records',
    description: 'Who has accumulated the most season-long awards across league history.',
    records: [
      { key: 'scoringChampionships', label: 'Most Scoring Championships', min: 1, icon: 'scoreboard', tone: 'gold', value: team => team?.scoringChampionships ?? 0, detail: team => seasonList(team?.scoringChampionSeasons, 'No scoring titles') },
      { key: 'bestDefenseSeasons', label: 'Most Best Defense Awards', min: 1, icon: 'wall', tone: 'blue', value: team => team?.bestDefenseSeasons ?? 0, detail: team => seasonList(team?.bestDefenseSeasonYears, 'No defensive awards') },
      { key: 'pointsJuggernautSeasons', label: 'Most Juggernaut Seasons', min: 1, icon: 'rocket', tone: 'orange', value: team => team?.pointsJuggernautSeasons ?? 0, detail: team => seasonList(team?.pointsJuggernautSeasonYears, 'No juggernaut seasons') },
      { key: 'divisionSweeps', label: 'Most Division Sweeps', min: 1, icon: 'broom', tone: 'cyan', value: team => team?.divisionSweeps ?? 0, detail: team => seasonList(team?.divisionSweepSeasons, 'No division sweeps') },
      { key: 'cinderellaChampionships', label: 'Most Cinderella Titles', min: 1, icon: 'sparkle', tone: 'purple', value: team => team?.cinderellaChampionships ?? 0, detail: team => seasonList(team?.cinderellaSeasons, 'No Cinderella titles') },
      { key: 'woodenSpoons', label: 'Most Wooden Spoons', min: 1, icon: 'spoon', tone: 'purple', value: team => team?.woodenSpoons ?? 0, detail: team => seasonList(team?.woodenSpoonSeasons, 'No last-place finishes') },
    ],
  },
  {
    key: 'rivalry',
    eyebrow: 'Head to Head',
    title: 'Rivalry Records',
    description: 'The franchises with the deepest and most one-sided head-to-head histories.',
    records: [
      { key: 'ownedOpponentWins', label: 'Most Wins vs One Rival', min: 1, icon: 'shield', tone: 'green', value: team => `${team?.ownedOpponentWins ?? 0} wins`, detail: team => rivalryDetail(team?.ownedOpponent) },
      { key: 'archrivalGames', label: 'Most H2H Meetings', min: 1, icon: 'swords', tone: 'orange', value: team => `${team?.archrivalGames ?? 0} games`, detail: team => rivalryDetail(team?.archrival) },
      { key: 'sweepCount', label: 'Most Season Sweeps', min: 1, icon: 'broom', tone: 'cyan', value: team => `${team?.sweepCount ?? 0} sweeps`, detail: team => team?.sweepArtist ? `${team.sweepArtist.opponentTeamName} • ${team.sweepArtist.sweepSeasons.join(' • ')}` : 'No qualifying sweeps' },
      { key: 'currentOwnershipStreak', label: 'Longest Active Ownership Streak', min: 1, icon: 'lock', tone: 'gold', value: team => `${team?.currentOwnershipStreak ?? 0} straight`, detail: team => team?.currentOwnership ? `vs ${team.currentOwnership.opponentTeamName} • ${team.currentOwnership.record} all-time` : 'No active streak' },
    ],
  },
  {
    key: 'luck',
    eyebrow: 'Schedule Fortune',
    title: 'Luck & All-Play Records',
    description: 'Actual results compared with what each weekly score would have earned against the entire league.',
    records: [
      { key: 'luckiestSeasonLuck', label: 'Luckiest Season', min: 0.0001, icon: 'clover', tone: 'green', value: team => formatSignedWins(team?.luckiestSeasonLuck), detail: team => luckDetail(team?.luckiestSeason, 'No positive-luck completed season') },
      { key: 'mostCursedSeasonLuck', label: 'Most Cursed Season', max: -0.0001, icon: 'cloud', tone: 'purple', value: team => formatSignedWins(team?.mostCursedSeasonLuck), detail: team => luckDetail(team?.mostCursedSeason, 'No negative-luck completed season') },
      { key: 'careerAllPlayWinPct', label: 'Best Career All-Play %', min: 0.0001, icon: 'target', tone: 'blue', value: team => formatPct(team?.careerAllPlayWinPct), detail: team => `${Number(team?.careerExpectedWins || 0).toFixed(1)} expected wins across ${team?.careerAllPlayGames ?? 0} regular-season weeks` },
    ],
  },
  {
    key: 'front-office',
    eyebrow: 'Front Office',
    title: 'Transaction Records',
    description: 'League records for the managers most willing to work the phones.',
    records: [
      { key: 'threeTeamTrades', label: 'Most 3+ Team Trades', min: 1, icon: 'trade', tone: 'green', value: team => team?.threeTeamTrades ?? 0, detail: () => 'Completed trades involving at least three franchises' },
      { key: 'uniqueTradePartners', label: 'Most Unique Trade Partners', min: 1, icon: 'people', tone: 'cyan', value: team => team?.uniqueTradePartners ?? 0, detail: team => `Traded with ${team?.uniqueTradePartners ?? 0} different franchises` },
    ],
  },
];

function recordHolders(franchises, record) {
  const valid = franchises.filter(team => {
    const rawValue = team?.[record.key];
    if (rawValue === null || rawValue === undefined || rawValue === '') return false;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return false;
    if (record.key === 'closestWinMargin' && value <= 0) return false;
    if (record.min !== undefined && value < record.min) return false;
    if (record.max !== undefined && value > record.max) return false;
    return true;
  });
  if (!valid.length) return [];
  const sorted = [...valid].sort((a, b) => metricCompare(record.key, a, b));
  const best = Number(sorted[0]?.[record.key]);
  return sorted.filter(team => Math.abs(Number(team?.[record.key]) - best) < 0.000001);
}

function RecordBookCard({ record, franchises, onTeamClick }) {
  const holders = recordHolders(franchises, record);
  const primary = holders[0] || null;
  const tone = TONES[record.tone] || TONES.blue;
  const isTie = holders.length > 1;
  const holderDetails = holders.map(team => record.detail(team));
  const uniqueHolderDetails = [...new Set(holderDetails.filter(Boolean))];
  const holderDetailsDiffer = isTie && uniqueHolderDetails.length > 1;
  const summaryDetail = !primary
    ? 'No qualifying result yet'
    : !isTie
      ? record.detail(primary)
      : holderDetailsDiffer
        ? `${holders.length} franchises share this record. Each record-setting result is shown below.`
        : `${holders.length} franchises share this record.${uniqueHolderDetails[0] ? ` ${uniqueHolderDetails[0]}` : ''}`;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${primary ? tone.border : 'border-white/[0.07]'} bg-[#081722] p-5`}>
      {primary ? <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow}`} /> : null}
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${primary ? tone.icon : 'border-white/10 bg-white/[0.025] text-white/30'}`}>
            <BadgeIcon type={record.icon} className="h-5 w-5" />
          </div>
          {isTie ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/45">{holders.length}-way tie</span> : null}
        </div>

        <div className="mt-4 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{record.label}</div>
        <div className={`mt-1 text-3xl font-black tracking-tight ${primary ? tone.value : 'text-white/30'}`}>{primary ? record.value(primary) : '—'}</div>
        <div className="mt-2 min-h-[2rem] text-xs leading-relaxed text-white/42">{summaryDetail}</div>

        {holders.length ? (
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className="mb-2 text-[8px] font-black uppercase tracking-[0.13em] text-white/25">Record Holder{holders.length === 1 ? '' : 's'}</div>
            <div className={isTie ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
              {holders.map((team, index) => (
                <button
                  key={team.ownerId}
                  type="button"
                  onClick={() => onTeamClick(team)}
                  className={`group min-w-0 rounded-xl border border-white/[0.07] bg-black/15 text-left transition hover:border-white/15 hover:bg-white/[0.035] ${isTie ? 'flex w-full items-start gap-3 px-3 py-2.5' : 'flex items-center gap-2 px-2.5 py-2'}`}
                >
                  <TeamAvatar team={team} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className={`${isTie ? 'max-w-none' : 'max-w-[150px]'} truncate text-[11px] font-black text-white/75 group-hover:text-white`}>{team.teamName}</span>
                      {isTie ? <span className={`shrink-0 text-[10px] font-black ${tone.value}`}>{record.value(team)}</span> : null}
                    </div>
                    {holderDetailsDiffer ? (
                      <div className="mt-1 text-[9px] leading-relaxed text-white/38">{holderDetails[index]}</div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecordBook({ franchises, onTeamClick }) {
  return (
    <div className="space-y-8">
      {RECORD_BOOK_GROUPS.map(group => (
        <section key={group.key}>
          <SectionHeading eyebrow={group.eyebrow} title={group.title} description={group.description} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.records.map(record => <RecordBookCard key={record.key} record={record} franchises={franchises} onTeamClick={onTeamClick} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Podium({ teams, metric, onTeamClick }) {
  if (!teams.length) return null;
  const top = teams.slice(0, 3);
  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {order.map(team => {
        const actualRank = teams.findIndex(item => item.ownerId === team.ownerId) + 1;
        const isFirst = actualRank === 1;
        return (
          <button
            type="button"
            key={team.ownerId}
            onClick={() => onTeamClick(team)}
            className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${isFirst ? 'border-amber-300/25 bg-amber-300/[0.05] md:-translate-y-2' : 'border-white/10 bg-[#081722] hover:border-white/20'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${actualRank === 1 ? 'bg-amber-300 text-[#4A3000]' : actualRank === 2 ? 'bg-slate-300 text-slate-800' : 'bg-orange-300 text-orange-950'}`}>
                {actualRank}
              </div>
              <TeamAvatar team={team} />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-white group-hover:text-[#1FDDFF]">{team.teamName}</div>
                <div className="mt-0.5 text-[10px] text-white/35">{team.seasonsActive} season{team.seasonsActive === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="text-[9px] font-black uppercase tracking-[0.13em] text-white/30">{RANKING_METRICS.find(item => item.key === metric)?.label}</div>
              <div className={`mt-1 text-2xl font-black ${isFirst ? 'text-amber-200' : 'text-white'}`}>{metricValue(team, metric)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RankingTable({ teams, metric, myOwnerId, onTeamClick }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-[#07141E] md:block">
        <div className="grid grid-cols-[64px_minmax(210px,1.5fr)_90px_95px_115px_120px_110px_82px] items-center gap-2 border-b border-white/10 bg-white/[0.025] px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-white/35">
          <div>Rank</div><div>Franchise</div><div>Titles</div><div>Divisions</div><div>All-Time</div><div>Playoffs</div><div>Activity</div><div className="text-right">Selected</div>
        </div>
        {teams.map((team, index) => {
          const mine = team.ownerId === myOwnerId;
          return (
            <button
              type="button"
              key={team.ownerId}
              onClick={() => onTeamClick(team)}
              className={`grid w-full grid-cols-[64px_minmax(210px,1.5fr)_90px_95px_115px_120px_110px_82px] items-center gap-2 border-b border-white/[0.055] px-4 py-3 text-left transition last:border-b-0 ${mine ? 'bg-[#1FDDFF]/[0.045]' : 'hover:bg-white/[0.025]'}`}
            >
              <div className="text-lg font-black text-white/75">#{index + 1}</div>
              <div className="flex min-w-0 items-center gap-3">
                <TeamAvatar team={team} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-black text-white">{team.teamName}</div>
                    {mine ? <span className="rounded-full border border-[#1FDDFF]/20 bg-[#1FDDFF]/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#78ECFF]">You</span> : null}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-white/32">{team.displayName || team.username || `${team.seasonsActive} seasons`}</div>
                </div>
              </div>
              <div className="font-black text-amber-200">{team.championships}</div>
              <div className="font-black text-[#FF9A7E]">{team.divisionTitles}</div>
              <div>
                <div className="text-xs font-black text-white/80">{team.allTimeRecord}</div>
                <div className="text-[9px] text-white/35">{formatPct(team.allTimeWinPct)}</div>
              </div>
              <div>
                <div className="text-xs font-black text-white/80">{team.playoffRecord}</div>
                <div className="text-[9px] text-white/35">{team.playoffAppearances} trips</div>
              </div>
              <div className="text-[10px] leading-4 text-white/50">
                <span className="font-bold text-white/70">{team.trades}</span> trades<br/><span className="font-bold text-white/70">{team.playersAdded}</span> adds
              </div>
              <div className="text-right text-sm font-black text-[#1FDDFF]">{metricValue(team, metric)}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 md:hidden">
        {teams.map((team, index) => {
          const mine = team.ownerId === myOwnerId;
          return (
            <button key={team.ownerId} type="button" onClick={() => onTeamClick(team)} className={`w-full rounded-2xl border p-4 text-left ${mine ? 'border-[#1FDDFF]/20 bg-[#1FDDFF]/[0.045]' : 'border-white/10 bg-[#07141E]'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 text-lg font-black text-white/60">#{index + 1}</div>
                <TeamAvatar team={team} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-white">{team.teamName}</div>
                  <div className="mt-0.5 text-[10px] text-white/35">{team.allTimeRecord} • {formatPct(team.allTimeWinPct)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-black uppercase tracking-wide text-white/30">Selected</div>
                  <div className="text-base font-black text-[#1FDDFF]">{metricValue(team, metric)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-3">
                <MiniStat label="Titles" value={team.championships} />
                <MiniStat label="Div." value={team.divisionTitles} />
                <MiniStat label="Playoffs" value={team.playoffAppearances} />
                <MiniStat label="Trades" value={team.trades} />
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function TeamTrophyModal({ team, franchises, onClose, onRankClick, onBadgeClick }) {
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!team) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#06111B] shadow-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#06111B]/95 px-5 py-4 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <TeamAvatar team={team} size="lg" />
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FF8060]">Franchise Trophy Case</div>
              <div className="truncate text-xl font-black text-white">{team.teamName}</div>
              <div className="mt-0.5 text-xs text-white/40">{team.seasonsActive} season{team.seasonsActive === 1 ? '' : 's'} • Legacy rank #{rankFor(franchises, team, 'legacy')}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
        </div>

        <div className="p-5">
          <SectionHeading eyebrow="Signature Achievements" title="Milestones & League Records" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACHIEVEMENT_BADGES.map(badge => (
              <BadgeCard key={badge.key} badge={badge} team={team} rank={rankFor(franchises, team, badge.rankKey)} compact onRankClick={onRankClick} franchises={franchises} onBadgeClick={onBadgeClick} />
            ))}
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Season Awards" title="Yearly Honors" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SEASON_AWARD_BADGES.map(badge => (
                <BadgeCard key={badge.key} badge={badge} team={team} rank={rankFor(franchises, team, badge.rankKey)} compact onRankClick={onRankClick} franchises={franchises} onBadgeClick={onBadgeClick} />
              ))}
            </div>
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Rivalry Room" title="Head-to-Head Identity" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {RIVALRY_BADGES.map(badge => (
                <BadgeCard key={badge.key} badge={badge} team={team} rank={rankFor(franchises, team, badge.rankKey)} compact onRankClick={onRankClick} franchises={franchises} onBadgeClick={onBadgeClick} />
              ))}
            </div>
            <div className="mt-3">
              <RivalryTable team={team} />
            </div>
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Luck & All-Play" title="Schedule Fortune" />
            <div className="grid gap-3 sm:grid-cols-2">
              {LUCK_BADGES.map(badge => (
                <BadgeCard key={badge.key} badge={badge} team={team} rank={rankFor(franchises, team, badge.rankKey)} compact onRankClick={onRankClick} franchises={franchises} onBadgeClick={onBadgeClick} />
              ))}
            </div>
            <div className="mt-3">
              <AllPlaySummary team={team} />
            </div>
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Career Totals" title="Trophy Case & Franchise Resume" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BADGE_DEFINITIONS.map(badge => (
                <BadgeCard key={badge.key} badge={badge} team={team} rank={rankFor(franchises, team, badge.rankKey)} compact onRankClick={onRankClick} franchises={franchises} onBadgeClick={onBadgeClick} />
              ))}
            </div>
          </div>

          <div className="mt-7">
            <SectionHeading eyebrow="Year by Year" title="Franchise History" />
            <SeasonHistory team={team} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgeConfigurationModal({ config, onChange, onSave, onReset, onClose, saving, error, success }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const normalized = normalizeBadgePrestigeConfig(config);

  function patch(section, patchValue) {
    onChange(normalizeBadgePrestigeConfig({
      ...normalized,
      [section]: { ...normalized[section], ...patchValue },
    }));
  }

  function patchRarityThreshold(key, value) {
    patch('rarity', {
      thresholds: { ...normalized.rarity.thresholds, [key]: value },
    });
  }

  function patchRarityBadge(key, value) {
    patch('rarity', {
      badges: { ...normalized.rarity.badges, [key]: value },
    });
  }

  function patchTierBadge(key, value) {
    patch('tiers', {
      badges: { ...normalized.tiers.badges, [key]: value },
    });
  }

  function patchTierThreshold(key, index, value) {
    const current = [...(normalized.tiers.thresholds[key] || [1, 3, 5, 10])];
    current[index] = value;
    patch('tiers', {
      thresholds: { ...normalized.tiers.thresholds, [key]: current },
    });
  }

  const tierCatalog = BADGE_PRESTIGE_CATALOG.filter(item => item.tier);
  const rarityCatalog = BADGE_PRESTIGE_CATALOG.filter(item => item.rarity);
  const rarityRows = [
    ['legendary', 'Legendary', 'Rarest accomplishments'],
    ['epic', 'Epic', 'Very uncommon accomplishments'],
    ['rare', 'Rare', 'Uncommon accomplishments'],
    ['uncommon', 'Uncommon', 'Earned by a majority threshold'],
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-amber-300/20 bg-[#06111B] shadow-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Badge Configuration">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#06111B]/95 px-5 py-4 backdrop-blur-md sm:px-6">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/70">Admin Tools</div>
            <div className="mt-1 text-xl font-black text-white">Badge Prestige & Rarity</div>
            <div className="mt-1 max-w-2xl text-xs leading-relaxed text-white/40">Commissioner settings apply league-wide and are stored in MongoDB. Changes affect display classifications only; they do not alter historical results or earned badges.</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
        </div>

        <div className="space-y-7 p-5 sm:p-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#081722] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-black text-white">Rarity System</div>
                <div className="mt-1 text-xs leading-relaxed text-white/40">Classify an accomplishment by the percentage of historical franchises that have ever earned it.</div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-white/65">
                <input type="checkbox" checked={normalized.rarity.enabled} onChange={event => patch('rarity', { enabled: event.target.checked })} className="h-4 w-4 accent-[#1FDDFF]" />
                Enabled
              </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {rarityRows.map(([key, label, help]) => (
                <label key={key} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">{label}</span>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={normalized.rarity.thresholds[key]}
                      onChange={event => patchRarityThreshold(key, event.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#06111B] px-2.5 py-2 text-sm font-black text-white outline-none focus:border-[#1FDDFF]/40"
                    />
                    <span className="text-xs font-black text-white/35">%</span>
                  </div>
                  <span className="mt-1.5 block text-[9px] leading-relaxed text-white/25">{help}. Up to this share of franchises.</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-white/28">Common automatically covers everything above the Uncommon threshold through 100%. Thresholds are normalized so they cannot overlap out of order.</div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#081722] p-4 sm:p-5">
            <div className="text-sm font-black text-white">Rarity Participation</div>
            <div className="mt-1 text-xs text-white/40">Choose which earned-accolade families receive a rarity label. Turning one off removes only the rarity treatment, not the badge itself.</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rarityCatalog.map(item => (
                <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2.5">
                  <span className="text-xs font-bold text-white/65">{item.label}</span>
                  <input type="checkbox" checked={normalized.rarity.badges[item.key] === true} onChange={event => patchRarityBadge(item.key, event.target.checked)} className="h-4 w-4 accent-[#1FDDFF]" />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#081722] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-black text-white">Prestige Tiers</div>
                <div className="mt-1 text-xs leading-relaxed text-white/40">Set the Bronze, Silver, Gold, and Diamond milestones for repeatable accomplishments.</div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-white/65">
                <input type="checkbox" checked={normalized.tiers.enabled} onChange={event => patch('tiers', { enabled: event.target.checked })} className="h-4 w-4 accent-amber-300" />
                Enabled
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {tierCatalog.map(item => (
                <div key={item.key} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-black text-white/75">{item.label}</div>
                    <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold text-white/45">
                      <input type="checkbox" checked={normalized.tiers.badges[item.key] === true} onChange={event => patchTierBadge(item.key, event.target.checked)} className="h-4 w-4 accent-amber-300" />
                      Tier this badge
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TIER_LABELS.map((label, index) => (
                      <label key={label}>
                        <span className="text-[8px] font-black uppercase tracking-[0.11em] text-white/30">{label}</span>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          step="1"
                          value={normalized.tiers.thresholds[item.key]?.[index] ?? ''}
                          onChange={event => patchTierThreshold(item.key, index, event.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-[#06111B] px-2.5 py-2 text-sm font-black text-white outline-none focus:border-amber-300/40"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#081722] p-4 sm:p-5">
            <div className="text-sm font-black text-white">Prestige Presentation</div>
            <div className="mt-1 text-xs text-white/40">Control the extra visual treatment used for the two highest rarity classes on the League Badge Wall.</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['legendaryWallMarker', 'Legendary ◆ marker'],
                ['epicWallMarker', 'Epic ◇ marker'],
                ['legendaryGlow', 'Legendary glow / ring'],
                ['epicGlow', 'Epic glow / ring'],
              ].map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2.5">
                  <span className="text-xs font-bold text-white/65">{label}</span>
                  <input type="checkbox" checked={Boolean(normalized.prestige[key])} onChange={event => patch('prestige', { [key]: event.target.checked })} className="h-4 w-4 accent-amber-300" />
                </label>
              ))}
            </div>
          </section>

          {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-xs font-bold text-red-200">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs font-bold text-emerald-200">{success}</div> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={onReset} disabled={saving} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-40">Reset Draft to Defaults</button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-40">Cancel</button>
              <button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-amber-300 px-5 py-2.5 text-xs font-black text-[#3B2900] shadow-lg shadow-amber-300/10 hover:bg-amber-200 disabled:opacity-50">{saving ? 'Saving…' : 'Save League Settings'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#07141E] p-6">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1FDDFF]/20 border-t-[#1FDDFF]" />
        <div>
          <div className="text-sm font-black text-white">Building league history…</div>
          <div className="mt-0.5 text-xs text-white/40">Loading rosters, weekly matchups, transactions, drafts, and playoff results across every BBB season.</div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0,1,2,3].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />)}
      </div>
    </div>
  );
}

export default function BadgesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const loadedFor = useRef('');

  const [view, setView] = useState('trophy');
  const [rankingMetric, setRankingMetric] = useState('legacy');
  const [franchises, setFranchises] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [leagueName, setLeagueName] = useState('Budget Blitz Bowl');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [badgePrestigeConfig, setBadgePrestigeConfig] = useState(() => normalizeBadgePrestigeConfig(DEFAULT_BADGE_PRESTIGE_CONFIG));
  const [badgeConfigDraft, setBadgeConfigDraft] = useState(() => normalizeBadgePrestigeConfig(DEFAULT_BADGE_PRESTIGE_CONFIG));
  const [badgeConfigOpen, setBadgeConfigOpen] = useState(false);
  const [badgeConfigSaving, setBadgeConfigSaving] = useState(false);
  const [badgeConfigError, setBadgeConfigError] = useState('');
  const [badgeConfigSuccess, setBadgeConfigSuccess] = useState('');
  const rankingsSectionRef = useRef(null);
  const pendingRankingScroll = useRef(false);

  const isAdmin = Boolean(
    session?.user?.isAdmin ||
    session?.user?.role === 'admin' ||
    (process.env.NEXT_PUBLIC_ADMIN_EMAIL && session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  );

  // Rarity/tier helpers are module-level because badge definitions are shared across
  // several components. Keep their active configuration synchronized with page state.
  setActiveBadgePrestigeConfig(badgePrestigeConfig);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    const sleeperId = String(session?.user?.sleeperId || '').trim();
    if (status !== 'authenticated') return;

    if (!sleeperId) {
      setLoading(false);
      setError('Your Budget Bowl account is not linked to a Sleeper account.');
      return;
    }

    if (loadedFor.current === sleeperId) return;
    loadedFor.current = sleeperId;

    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError('');
      try {
        const [response, settingsResponse] = await Promise.all([
          fetch(`/api/badges?sleeperId=${encodeURIComponent(sleeperId)}`, { cache: 'no-store' }),
          fetch('/api/badges/settings', { cache: 'no-store' }).catch(() => null),
        ]);
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load league history.');

        let prestigeSettings = DEFAULT_BADGE_PRESTIGE_CONFIG;
        if (settingsResponse?.ok) {
          try {
            const settingsData = await settingsResponse.json();
            prestigeSettings = normalizeBadgePrestigeConfig(settingsData?.settings || DEFAULT_BADGE_PRESTIGE_CONFIG);
          } catch {
            prestigeSettings = normalizeBadgePrestigeConfig(DEFAULT_BADGE_PRESTIGE_CONFIG);
          }
        }
        if (cancelled) return;

        setLeagueName(data?.leagueName || 'Budget Blitz Bowl');
        setSeasons(Array.isArray(data?.seasons) ? data.seasons : []);
        setFranchises(Array.isArray(data?.franchises) ? data.franchises : []);
        setBadgePrestigeConfig(prestigeSettings);
        setBadgeConfigDraft(prestigeSettings);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load league history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [session?.user?.sleeperId, status]);

  useEffect(() => {
    if (view !== 'rankings' || !pendingRankingScroll.current) return;
    pendingRankingScroll.current = false;
    requestAnimationFrame(() => {
      rankingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [view, rankingMetric]);

  function openLeagueRanking(metric) {
    if (!metric) return;
    setRankingMetric(metric);
    setSelectedTeam(null);
    pendingRankingScroll.current = true;
    setView('rankings');
  }

  function openBadgeDetail(team, badge, season = '') {
    if (!team || !badge) return;
    setSelectedBadge({ team, badge, season: String(season || '') });
  }

  function openBadgeConfiguration() {
    setBadgeConfigDraft(normalizeBadgePrestigeConfig(badgePrestigeConfig));
    setBadgeConfigError('');
    setBadgeConfigSuccess('');
    setBadgeConfigOpen(true);
  }

  async function saveBadgeConfiguration() {
    if (!isAdmin) return;
    setBadgeConfigSaving(true);
    setBadgeConfigError('');
    setBadgeConfigSuccess('');
    try {
      const normalized = normalizeBadgePrestigeConfig(badgeConfigDraft);
      const response = await fetch('/api/badges/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: normalized }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to save badge settings.');
      const saved = normalizeBadgePrestigeConfig(data?.settings || normalized);
      setBadgePrestigeConfig(saved);
      setBadgeConfigDraft(saved);
      setBadgeConfigSuccess('Badge prestige and rarity settings saved for the league.');
    } catch (err) {
      setBadgeConfigError(err?.message || 'Failed to save badge settings.');
    } finally {
      setBadgeConfigSaving(false);
    }
  }

  const sleeperId = String(session?.user?.sleeperId || '');
  const myTeam = useMemo(() => franchises.find(team => String(team.ownerId) === sleeperId) || null, [franchises, sleeperId]);

  const rankedTeams = useMemo(
    () => [...franchises].sort((a, b) => metricCompare(rankingMetric, a, b)),
    [franchises, rankingMetric]
  );

  const myLegacyRank = rankFor(franchises, myTeam, 'legacy');

  if (status === 'loading' || status === 'unauthenticated') return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-12 sm:px-5">
      {selectedTeam ? <TeamTrophyModal team={selectedTeam} franchises={franchises} onClose={() => setSelectedTeam(null)} onRankClick={openLeagueRanking} onBadgeClick={openBadgeDetail} /> : null}
      {selectedBadge ? <BadgeDetailModal selection={selectedBadge} franchises={franchises} onClose={() => setSelectedBadge(null)} /> : null}
      {isAdmin && badgeConfigOpen ? (
        <BadgeConfigurationModal
          config={badgeConfigDraft}
          onChange={setBadgeConfigDraft}
          onSave={saveBadgeConfiguration}
          onReset={() => {
            setBadgeConfigDraft(normalizeBadgePrestigeConfig(DEFAULT_BADGE_PRESTIGE_CONFIG));
            setBadgeConfigError('');
            setBadgeConfigSuccess('Defaults loaded into the form. Save to apply them league-wide.');
          }}
          onClose={() => setBadgeConfigOpen(false)}
          saving={badgeConfigSaving}
          error={badgeConfigError}
          success={badgeConfigSuccess}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#06131E] shadow-[0_28px_80px_rgba(0,0,0,0.28)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(255,75,31,0.16),transparent_28%),radial-gradient(circle_at_87%_3%,rgba(31,221,255,0.12),transparent_25%)]" />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FF8060]">{leagueName}</div>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">League Trophy Case</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
                A permanent record of championships, playoff success, winning history, and front-office activity across every season in the league.
              </p>
            </div>

            {!loading && myTeam ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3.5">
                <TeamAvatar team={myTeam} size="lg" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/30">Your Franchise</div>
                  <div className="mt-0.5 max-w-[230px] truncate text-lg font-black text-white">{myTeam.teamName}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-2 py-0.5 text-[9px] font-bold text-amber-200">Legacy #{myLegacyRank}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold text-white/50">{myTeam.seasonsActive} seasons</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
            <button type="button" onClick={() => setView('trophy')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${view === 'trophy' ? 'bg-[#FF4B1F] text-white shadow-lg shadow-[#FF4B1F]/15' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>My Trophy Case</button>
            <button type="button" onClick={() => setView('rankings')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${view === 'rankings' ? 'bg-[#1FDDFF] text-[#04111A] shadow-lg shadow-[#1FDDFF]/10' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>League Rankings</button>
            <button type="button" onClick={() => setView('records')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${view === 'records' ? 'bg-amber-300 text-[#3B2900] shadow-lg shadow-amber-300/10' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>Record Book</button>
            <button type="button" onClick={() => setView('history')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${view === 'history' ? 'bg-violet-300 text-[#211034] shadow-lg shadow-violet-300/10' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>League History</button>
            {isAdmin ? (
              <button type="button" onClick={openBadgeConfiguration} className="rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-2.5 text-xs font-black text-amber-200 transition hover:bg-amber-300/[0.13]">Badge Config</button>
            ) : null}
            <div className="ml-auto hidden items-center gap-2 text-[10px] text-white/30 sm:flex">
              {seasons.length ? `${seasons[0]}–${seasons[seasons.length - 1]}` : 'No seasons found'}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5">
        {loading ? <LoadingState /> : error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-5">
            <div className="text-sm font-black text-red-200">Unable to load trophy case</div>
            <div className="mt-1 text-sm text-red-100/60">{error}</div>
          </div>
        ) : !franchises.length ? (
          <div className="rounded-2xl border border-white/10 bg-[#07141E] p-6 text-sm text-white/50">No Budget Blitz Bowl league history was found for this Sleeper account.</div>
        ) : view === 'trophy' ? (
          myTeam ? (
            <div className="space-y-8">
              <section>
                <SectionHeading eyebrow="The Hardware" title="Championship & Playoff Pedigree" description="The achievements that define a franchise's place in league history." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {BADGE_DEFINITIONS.slice(0, 3).map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
                <div className="mt-3"><RarityLegend /></div>
              </section>

              <section>
                <SectionHeading eyebrow="Signature Achievements" title="Milestones & Momentum" description="Badges earned through sustained success, title runs, and major year-over-year improvement." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[...ACHIEVEMENT_BADGES.slice(0, 4), ACHIEVEMENT_BADGES[11]].map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Season Awards" title="Yearly Honors" description="Awards earned for leading the league in scoring, defense, divisional dominance, and other season-long accomplishments." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {SEASON_AWARD_BADGES.map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
                <div className="mt-2 text-[10px] leading-relaxed text-white/28">Best Record is represented by the existing Regular Season #1 badge. Points Juggernaut requires scoring at least 10% above that season's league-average points.</div>
              </section>

              <section>
                <SectionHeading eyebrow="Game Records" title="Historic Sundays" description="The best, closest, biggest, and most painful individual matchup performances in franchise history." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {ACHIEVEMENT_BADGES.slice(4, 9).map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Front Office Accolades" title="Working the Phones" description="Special recognition for managers who make the trade market part of their franchise identity." />
                <div className="grid gap-3 sm:grid-cols-2">
                  {ACHIEVEMENT_BADGES.slice(9, 11).map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Rivalry Room" title="Head-to-Head Identity" description="Who you own, who owns you, and which franchises have defined your league history." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {RIVALRY_BADGES.map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
                <div className="mt-3">
                  <RivalryTable team={myTeam} />
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Luck & All-Play" title="Schedule Fortune" description="Compare actual results with how the same weekly scores would have performed against the entire league." />
                <div className="grid gap-3 sm:grid-cols-2">
                  {LUCK_BADGES.map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
                <div className="mt-3">
                  <AllPlaySummary team={myTeam} />
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Career Record" title="Winning History" description="Career regular-season and postseason performance across all seasons." />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BADGE_DEFINITIONS.slice(3, 7).map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Front Office" title="Team Activity" description="How aggressively the franchise has shaped its roster through trades, waivers, free agency, and the rookie draft." />
                <div className="grid gap-3 sm:grid-cols-3">
                  {BADGE_DEFINITIONS.slice(7).map(badge => <BadgeCard key={badge.key} badge={badge} team={myTeam} rank={rankFor(franchises, myTeam, badge.rankKey)} onRankClick={openLeagueRanking} franchises={franchises} onBadgeClick={openBadgeDetail} />)}
                </div>
              </section>

              <section>
                <SectionHeading eyebrow="Year by Year" title="Franchise History" description="A season-by-season shelf showing when the hardware was earned and how each year finished." />
                <SeasonHistory team={myTeam} />
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#07141E] p-6 text-sm text-white/50">Your Sleeper ID is not attached to a roster in the discovered league history.</div>
          )
        ) : view === 'records' ? (
          <RecordBook franchises={franchises} onTeamClick={setSelectedTeam} />
        ) : view === 'history' ? (
          <LeagueHistoryTimeline seasons={seasons} franchises={franchises} onTeamClick={setSelectedTeam} />
        ) : (
          <div ref={rankingsSectionRef} className="space-y-6 scroll-mt-6">
            <section>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading eyebrow="League-Wide" title="Franchise Rankings" description="Rank every franchise by legacy, accomplishments, matchup records, or front-office activity. Select a team to open its full trophy case." />
                <div className="w-full sm:w-[240px]">
                  <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.13em] text-white/35">Rank by</label>
                  <select value={rankingMetric} onChange={event => setRankingMetric(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#081722] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-[#1FDDFF]/40">
                    {RANKING_METRICS.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <Podium teams={rankedTeams} metric={rankingMetric} onTeamClick={setSelectedTeam} />

            <section>
              <RankingTable teams={rankedTeams} metric={rankingMetric} myOwnerId={sleeperId} onTeamClick={setSelectedTeam} />
              {rankingMetric === 'legacy' ? (
                <div className="mt-2 text-[10px] leading-relaxed text-white/28">Legacy ranking sorts by championships, then division titles, playoff wins, all-time win percentage, and regular-season wins.</div>
              ) : null}
              {rankingMetric === 'closestWinMargin' ? (
                <div className="mt-2 text-[10px] leading-relaxed text-white/28">For Closest Win, the smallest positive margin ranks first.</div>
              ) : null}
              {rankingMetric === 'mostCursedSeasonLuck' ? (
                <div className="mt-2 text-[10px] leading-relaxed text-white/28">For Most Cursed Season, the most negative luck value ranks first.</div>
              ) : null}
            </section>

            <LeagueBadgeWall franchises={franchises} onTeamClick={setSelectedTeam} onBadgeClick={openBadgeDetail} />
          </div>
        )}
      </div>
    </div>
  );
}
