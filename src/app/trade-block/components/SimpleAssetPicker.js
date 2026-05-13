'use client';
import { useState, useMemo } from 'react';
import { useBudgetRatios } from '@/app/providers';
import { getAssetBudgetValue } from '@/utils/draftPickTradeUtils';
import ktcMatrix from '@/data/draft-pick-ktc-matrix.json';

function cn(...classes) { return classes.filter(Boolean).join(' '); }

function pickKtc(round) {
  const row = ktcMatrix[String(round)];
  return row ? row.mid : 0;
}

function positionColor(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') return 'bg-red-500/20 text-red-300';
  if (p === 'RB') return 'bg-emerald-500/20 text-emerald-300';
  if (p === 'WR') return 'bg-sky-500/20 text-sky-300';
  if (p === 'TE') return 'bg-amber-500/20 text-amber-300';
  return 'bg-white/10 text-white/50';
}

function resolveOriginalTeamName(originalRosterId, rosters, users) {
  const numericRosterId = Number(originalRosterId);
  if (!Number.isFinite(numericRosterId)) return '';
  const roster = rosters.find((entry) => Number(entry.roster_id) === numericRosterId);
  if (!roster) return `Team ${numericRosterId}`;
  const user = users.find((entry) => String(entry.user_id) === String(roster.owner_id));
  return user?.metadata?.team_name || user?.display_name || user?.username || `Team ${numericRosterId}`;
}

export default function SimpleAssetPicker({
  myUsername,
  mySleeperId,
  myRosterIdOverride,
  playerContracts,
  draftPickAssets = [],
  tradedPicks = [],
  rosters = [],
  users = [],
  currentSeason,
  listingCriteria,
  onSelect,
  onClose,
}) {
  const [tab, setTab] = useState('players');
  const [search, setSearch] = useState('');
  const { ktcPerDollar, positionRatios, usePositionRatios } = useBudgetRatios();

  function getPlayerFilterStatus(player) {
    const criteria = listingCriteria;
    if (!criteria || Object.keys(criteria).length === 0) {
      return { meets: null, reason: '' };
    }

    if (criteria.acceptPlayers === false) {
      return { meets: false, reason: 'Players not accepted' };
    }
    if (criteria.positions?.length && !criteria.positions.includes(player.position)) {
      return { meets: false, reason: `Position ${player.position || 'N/A'} not wanted` };
    }
    if (criteria.minKtc != null && Number(player.ktcValue || 0) < Number(criteria.minKtc)) {
      return { meets: false, reason: 'KTC below minimum' };
    }
    if (criteria.maxKtc != null && Number(player.ktcValue || 0) > Number(criteria.maxKtc)) {
      return { meets: false, reason: 'KTC above maximum' };
    }

    const playerBv = getAssetBudgetValue(player, { ktcPerDollar, usePositionRatios, positionRatios });
    if (criteria.minBv != null && Number(playerBv || 0) < Number(criteria.minBv)) {
      return { meets: false, reason: 'BV below minimum' };
    }
    if (criteria.minAge != null && Number(player.age || 0) < Number(criteria.minAge)) {
      return { meets: false, reason: 'Age below minimum' };
    }
    if (criteria.maxAge != null && Number(player.age || 0) > Number(criteria.maxAge)) {
      return { meets: false, reason: 'Age above maximum' };
    }
    if (criteria.maxSalary != null && Number(player.curYear || 0) > Number(criteria.maxSalary)) {
      return { meets: false, reason: 'Salary above maximum' };
    }
    if (criteria.contractTypes?.length && !criteria.contractTypes.includes(player.contractType)) {
      return { meets: false, reason: 'Contract type not wanted' };
    }

    return { meets: true, reason: 'Matches player-level filters' };
  }

  // Filter active players for this user
  const myPlayers = useMemo(
    () =>
      (playerContracts || [])
        .filter(
          (c) =>
            (c.isActive || String(c.status || '').toLowerCase() === 'active') &&
            String(c.team || '').toLowerCase() === String(myUsername || '').toLowerCase()
        )
        .sort((a, b) => String(a.playerName || '').localeCompare(String(b.playerName || ''))),
    [playerContracts, myUsername]
  );

  // Find user's roster_id.
  // Priority: pre-computed override from page.js > sleeperId from session > display_name fallback
  const myRosterId = useMemo(() => {
    // 1. Direct pre-computed value from page.js (most reliable)
    if (myRosterIdOverride != null) return myRosterIdOverride;

    // 2. Session sleeperId
    let ownerId = null;
    if (mySleeperId) {
      ownerId = String(mySleeperId);
    } else {
      const sleeperUser = users.find(
        (u) =>
          String(u.display_name || '').toLowerCase() === String(myUsername || '').toLowerCase() ||
          String(u.username || '').toLowerCase() === String(myUsername || '').toLowerCase()
      );
      ownerId = sleeperUser?.user_id ?? null;
    }
    if (!ownerId) return null;
    const roster = rosters.find((r) => String(r.owner_id) === ownerId);
    return roster?.roster_id ?? null;
  }, [myRosterIdOverride, mySleeperId, users, rosters, myUsername]);

  const myPicks = useMemo(() => {
    if (draftPickAssets.length > 0) {
      return draftPickAssets;
    }

    if (!myRosterId || !currentSeason) return [];
    const base = Number(currentSeason);
    const seasons = [String(base), String(base + 1), String(base + 2)];
    const rounds = [1, 2, 3, 4, 5];

    // Index traded picks by (season, round, original-roster-id) → current owner roster_id
    // Sleeper returns one entry per original pick; owner_id is the current owner's roster_id.
    const tradedIndex = new Map();
    for (const p of tradedPicks) {
      if (Number(p.season) >= base) {
        tradedIndex.set(`${p.season}-${p.round}-${p.roster_id}`, Number(p.owner_id));
      }
    }

    const result = [];

    // Own original picks
    for (const season of seasons) {
      for (const round of rounds) {
        const key = `${season}-${round}-${myRosterId}`;
        const currentOwner = tradedIndex.get(key);
        if (currentOwner === undefined) {
          // Never traded — still mine
          result.push({
            assetType: 'pick',
            season,
            round,
            bucket: 'mid',
            pickKtcValue: pickKtc(round),
            originalRosterId: myRosterId,
            originalTeam: resolveOriginalTeamName(myRosterId, rosters, users),
            ownPick: true,
          });
        } else if (currentOwner === myRosterId) {
          // Traded away and then back to me
          result.push({
            assetType: 'pick',
            season,
            round,
            bucket: 'mid',
            pickKtcValue: pickKtc(round),
            originalRosterId: myRosterId,
            originalTeam: resolveOriginalTeamName(myRosterId, rosters, users),
            ownPick: true,
          });
        }
        // else: traded away and I no longer own it — skip
      }
    }

    // Picks from other teams that I now own
    for (const p of tradedPicks) {
      if (Number(p.season) >= base && Number(p.owner_id) === myRosterId && Number(p.roster_id) !== myRosterId) {
        result.push({
          assetType: 'pick',
          season: String(p.season),
          round: Number(p.round),
          bucket: 'mid',
          pickKtcValue: pickKtc(p.round),
          originalRosterId: Number(p.roster_id),
          originalTeam: resolveOriginalTeamName(p.roster_id, rosters, users),
          ownPick: false,
        });
      }
    }

    return result.sort((a, b) => Number(a.season) - Number(b.season) || a.round - b.round);
  }, [draftPickAssets, tradedPicks, myRosterId, currentSeason]);

  const filteredPlayers = useMemo(() => {
    if (!search) return myPlayers;
    const q = search.toLowerCase();
    return myPlayers.filter((p) => String(p.playerName || '').toLowerCase().includes(q));
  }, [myPlayers, search]);

  function selectPlayer(c) {
    const bvValue = getAssetBudgetValue(c, { ktcPerDollar, usePositionRatios, positionRatios });
    onSelect({
      assetType: 'player',
      playerName: c.playerName,
      playerId: c.playerId,
      position: c.position,
      nflTeam: c.nflTeam,
      contractType: c.contractType,
      ktcValue: Number(c.ktcValue) || 0,
      bvValue: Number(bvValue) || 0,
      salary: Number(c.curYear) || 0,
      curYear: Number(c.curYear) || 0,
      age: c.age,
      team: myUsername,
    });
  }

  function selectPick(p) {
    const originalTeam = p.originalTeam || resolveOriginalTeamName(p.originalRosterId, rosters, users);
    const bvValue = getAssetBudgetValue(p, { ktcPerDollar, usePositionRatios, positionRatios });
    onSelect({
      assetType: 'pick',
      id: p.id,
      uniqueKey: p.uniqueKey,
      season: p.season,
      round: p.round,
      bucket: p.pickBucket || p.bucket || 'mid',
      pickKtcValue: Number(p.ktcValue ?? p.pickKtcValue) || 0,
      bvValue: Number(bvValue) || 0,
      pickPosition: p.pickPosition,
      pickNumber: p.pickNumber,
      pickBucketLabel: p.pickBucketLabel,
      originalRosterId: p.originalRosterId,
      originalTeam,
      playerName: p.playerName || `${p.season} Round ${p.round}`,
      team: p.team || myUsername,
      curYear: Number(p.curYear) || 0,
      year2: Number(p.year2) || 0,
      year3: Number(p.year3) || 0,
      year4: Number(p.year4) || 0,
      pickSalary: Number(p.pickSalary) || 0,
      contractType: p.contractType,
      contractFinalYear: p.contractFinalYear,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-3xl border border-white/10 bg-[#020817] shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-white text-lg">Select an Asset</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white transition"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 py-3 border-b border-white/10">
          {['players', 'picks'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full border px-4 py-1 text-sm font-semibold capitalize transition',
                tab === t
                  ? 'border-[#FF4B1F]/50 bg-[#FF4B1F]/20 text-[#FF4B1F]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
              )}
            >
              {t} {t === 'players' ? `(${myPlayers.length})` : `(${myPicks.length})`}
            </button>
          ))}
        </div>

        {/* Search (players only) */}
        {tab === 'players' && (
          <div className="px-5 py-3 border-b border-white/10">
            <input
              type="text"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF4B1F]/50"
              autoFocus
            />
          </div>
        )}

        {/* Asset list */}
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {tab === 'players' && (
            filteredPlayers.length === 0 ? (
              <div className="py-10 text-center text-white/30 text-sm">
                {search ? 'No players match your search.' : 'No active players found on your roster.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead className="bg-white/5 text-left text-[11px] uppercase tracking-[0.12em] text-white/60">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Player</th>
                        <th className="px-3 py-3 font-semibold">Pos</th>
                        <th className="px-3 py-3 font-semibold">KTC</th>
                        <th className="px-3 py-3 font-semibold">BV</th>
                        <th className="px-3 py-3 font-semibold">Salary</th>
                        <th className="px-3 py-3 font-semibold">Filters</th>
                        <th className="px-3 py-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((c) => {
                        const bvValue = getAssetBudgetValue(c, { ktcPerDollar, usePositionRatios, positionRatios });
                        const filterStatus = getPlayerFilterStatus(c);

                        return (
                          <tr key={c.playerId || c.playerName} className="border-t border-white/10 transition-colors hover:bg-white/5">
                            <td className="px-3 py-3 font-semibold text-white">{c.playerName}</td>
                            <td className="px-3 py-3">
                              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', positionColor(c.position))}>
                                {c.position || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-white/75">{Number(c.ktcValue || 0).toLocaleString()}</td>
                            <td className="px-3 py-3 text-white/75">{Number(bvValue || 0).toLocaleString()}</td>
                            <td className="px-3 py-3 text-white/75">${Number(c.curYear || 0).toFixed(1)}</td>
                            <td className="px-3 py-3">
                              {filterStatus.meets == null ? (
                                <span className="text-xs text-white/40">—</span>
                              ) : (
                                <span
                                  title={filterStatus.reason}
                                  className={cn(
                                    'inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold',
                                    filterStatus.meets
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                  )}
                                >
                                  {filterStatus.meets ? 'Meets' : 'No'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => selectPlayer(c)}
                                  className="rounded-full border border-[#FF4B1F]/30 bg-[#FF4B1F]/15 px-3 py-1 text-xs font-semibold text-[#FFD0C2] hover:bg-[#FF4B1F]/25"
                                >
                                  Add
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {tab === 'picks' && (
            myPicks.length === 0 ? (
              <div className="py-10 text-center text-white/30 text-sm">
                No upcoming draft picks found for your roster.
              </div>
            ) : (
              myPicks.map((p, i) => {
                const origTeamName = p.originalTeam || resolveOriginalTeamName(p.originalRosterId, rosters, users);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectPick(p)}
                    className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/[0.06] transition text-left"
                  >
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 shrink-0">
                      PICK
                    </span>
                    <span className="font-semibold text-white text-sm flex-1">
                      {p.playerName || `${p.season} Round ${p.round}`}
                      {origTeamName && (
                        <span className="ml-1 text-white/40 font-normal text-xs">({origTeamName}&apos;s)</span>
                      )}
                    </span>
                    <span className="text-xs text-white/40 shrink-0">
                      KTC ~{Number(p.ktcValue ?? p.pickKtcValue ?? 0).toLocaleString()}
                    </span>
                  </button>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
}
