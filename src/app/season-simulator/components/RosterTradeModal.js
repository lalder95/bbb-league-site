'use client';

import { useEffect, useMemo, useState } from 'react';

function ModalShell({ title, subtitle, onClose, children, maxWidth = 'max-w-5xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#020817]/85 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`relative flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#071522] shadow-2xl shadow-black/50 sm:max-h-[92vh] sm:rounded-3xl ${maxWidth}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 bg-[#0A1D2B] px-4 py-4 sm:px-6 sm:py-5">
          <button
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xl text-white/60 transition hover:bg-white/10 hover:text-white sm:right-4 sm:top-4"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
          <h2 className="pr-12 text-xl font-black text-white sm:text-2xl">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-3xl pr-12 text-sm leading-5 text-white/50">{subtitle}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

function buildTeamName(roster, usersById) {
  const user = usersById.get(String(roster?.owner_id));
  return user?.display_name || user?.team_name || user?.username || roster?.display_name || `Team ${roster?.roster_id || ''}`;
}

function getPlayerLabel(player, playersById) {
  const playerMeta = playersById.get(String(player));
  return {
    playerId: String(player),
    playerName: playerMeta?.playerName || playerMeta?.full_name || playerMeta?.fullName || String(player),
    position: playerMeta?.position || 'UNK',
    nflTeam: playerMeta?.team || playerMeta?.nflTeam || '',
  };
}

export default function RosterTradeModal({
  isOpen,
  onClose,
  onSave,
  rosters = [],
  users = [],
  rosterTrades = [],
}) {
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [playersById, setPlayersById] = useState(new Map());
  const [queuedMoves, setQueuedMoves] = useState(Array.isArray(rosterTrades) ? rosterTrades : []);
  const [fromRosterId, setFromRosterId] = useState('');
  const [toRosterId, setToRosterId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  const usersById = useMemo(() => new Map((Array.isArray(users) ? users : []).map((user) => [String(user?.user_id), user])), [users]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    (async () => {
      try {
        setLoadingPlayers(true);
        setLoadError('');
        const response = await fetch('/api/players/all', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !Array.isArray(json)) {
          throw new Error(json?.error || 'Failed to load player pool');
        }

        if (cancelled) return;
        const nextMap = new Map();
        for (const player of json) {
          nextMap.set(String(player.playerId), player);
        }
        setPlayersById(nextMap);
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || 'Failed to load player pool');
      } finally {
        if (!cancelled) setLoadingPlayers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setQueuedMoves(Array.isArray(rosterTrades) ? rosterTrades : []);
    const firstRoster = Array.isArray(rosters) && rosters.length > 0 ? rosters[0] : null;
    const firstRosterId = firstRoster?.roster_id ? String(firstRoster.roster_id) : '';
    setFromRosterId(firstRosterId);
    setToRosterId(Array.isArray(rosters) && rosters.length > 1 ? String(rosters[1].roster_id) : firstRosterId);
    setSelectedPlayerId('');
    setSearchText('');
  }, [isOpen, rosterTrades, rosters]);

  const baseRosterOptions = useMemo(() => (Array.isArray(rosters) ? rosters : []).map((roster) => ({
    rosterId: Number(roster?.roster_id),
    label: buildTeamName(roster, usersById),
    players: Array.isArray(roster?.players) ? roster.players.map(String) : [],
  })), [rosters, usersById]);

  // Build the effective roster view after every queued move. This keeps the player
  // picker in sync with saved/restored edits instead of always showing raw Sleeper rosters.
  const rosterOptions = useMemo(() => {
    const options = baseRosterOptions.map((team) => ({
      ...team,
      players: [...team.players],
    }));
    const byRosterId = new Map(options.map((team) => [String(team.rosterId), team]));

    for (const move of Array.isArray(queuedMoves) ? queuedMoves : []) {
      const fromTeam = byRosterId.get(String(move?.fromRosterId));
      const toTeam = byRosterId.get(String(move?.toRosterId));
      const playerId = String(move?.asset?.playerId || move?.playerId || '').trim();
      if (!fromTeam || !toTeam || !playerId) continue;

      const sourceIndex = fromTeam.players.indexOf(playerId);
      if (sourceIndex === -1) continue;

      fromTeam.players.splice(sourceIndex, 1);
      if (!toTeam.players.includes(playerId)) {
        toTeam.players.push(playerId);
      }
    }

    return options;
  }, [baseRosterOptions, queuedMoves]);

  const fromRoster = rosterOptions.find((team) => String(team.rosterId) === String(fromRosterId));
  const toRoster = rosterOptions.find((team) => String(team.rosterId) === String(toRosterId));

  const filteredPlayers = useMemo(() => {
    if (!fromRoster) return [];
    const search = searchText.trim().toLowerCase();
    return fromRoster.players
      .map((playerId) => ({
        ...getPlayerLabel(playerId, playersById),
        ownedBy: fromRoster.label,
      }))
      .filter((player) => {
        if (!search) return true;
        return [player.playerName, player.position, player.nflTeam, player.playerId].join(' ').toLowerCase().includes(search);
      });
  }, [fromRoster, playersById, searchText]);

  useEffect(() => {
    if (!selectedPlayerId) return;
    if (!filteredPlayers.some((player) => player.playerId === String(selectedPlayerId))) {
      setSelectedPlayerId('');
    }
  }, [filteredPlayers, selectedPlayerId]);

  const selectedPlayer = filteredPlayers.find((player) => player.playerId === String(selectedPlayerId));
  const sameTeamSelected = fromRoster && toRoster && String(fromRoster.rosterId) === String(toRoster.rosterId);

  function queueMove() {
    if (!fromRoster || !toRoster || !selectedPlayerId || String(fromRoster.rosterId) === String(toRoster.rosterId)) return;
    const selectedPlayer = filteredPlayers.find((player) => player.playerId === String(selectedPlayerId));
    if (!selectedPlayer) return;

    setQueuedMoves((previous) => [
      ...previous,
      {
        fromRosterId: fromRoster.rosterId,
        fromTeamName: fromRoster.label,
        toRosterId: toRoster.rosterId,
        toTeamName: toRoster.label,
        asset: {
          assetType: 'player',
          playerId: selectedPlayer.playerId,
          playerName: selectedPlayer.playerName,
          position: selectedPlayer.position,
          nflTeam: selectedPlayer.nflTeam,
        },
      },
    ]);
    setSelectedPlayerId('');
  }

  function removeMove(index) {
    setQueuedMoves((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSave() {
    onSave?.(queuedMoves);
    onClose?.();
  }

  if (!isOpen) return null;

  return (
    <ModalShell
      title="Edit Roster Trades"
      subtitle="Move players between teams to test alternate roster builds. Applied edits are restored after a page refresh in this browser."
      onClose={onClose}
      maxWidth="max-w-6xl"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0A1D2B]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF4B1F] text-xs font-black text-white">1</span>
              <div>
                <h3 className="font-bold text-white">Choose the teams</h3>
                <p className="text-xs text-white/45">Select where the player starts and where they should move.</p>
              </div>
            </div>

            <div className="mt-4 grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">From</span>
                <select
                  className="min-h-12 rounded-xl border border-white/10 bg-[#061521] px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-[#FF4B1F]/50"
                  value={fromRosterId}
                  onChange={(event) => { setFromRosterId(event.target.value); setSelectedPlayerId(''); }}
                >
                  {rosterOptions.map((team) => <option key={team.rosterId} value={team.rosterId}>{team.label}</option>)}
                </select>
              </label>

              <button
                type="button"
                aria-label="Swap source and destination teams"
                onClick={() => { setFromRosterId(toRosterId); setToRosterId(fromRosterId); setSelectedPlayerId(''); }}
                className="flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg text-white/60 transition hover:bg-white/[0.08] hover:text-white sm:mb-1 sm:w-10"
              >
                ⇄
              </button>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">To</span>
                <select
                  className="min-h-12 rounded-xl border border-white/10 bg-[#061521] px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-[#FF4B1F]/50"
                  value={toRosterId}
                  onChange={(event) => setToRosterId(event.target.value)}
                >
                  {rosterOptions.map((team) => <option key={team.rosterId} value={team.rosterId}>{team.label}</option>)}
                </select>
              </label>
            </div>

            {sameTeamSelected ? (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100/80">Choose two different teams to queue a move.</div>
            ) : null}
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF4B1F] text-xs font-black text-white">2</span>
              <div>
                <h3 className="font-bold text-white">Pick a player</h3>
                <p className="text-xs text-white/45">Tap a player to select them. The list reflects all currently queued moves.</p>
              </div>
            </div>

            <div className="relative mt-4">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">⌕</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search name, position, or NFL team"
                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#061521] py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#FF4B1F]/50"
              />
            </div>

            <div className="mt-3 max-h-[300px] overflow-y-auto rounded-xl border border-white/10 bg-black/15 sm:max-h-[390px]">
              {loadingPlayers ? (
                <div className="flex min-h-32 items-center justify-center gap-2 px-4 py-8 text-sm text-white/45">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" /> Loading players…
                </div>
              ) : loadError ? (
                <div className="m-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">{loadError}</div>
              ) : filteredPlayers.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-white/45">No players match this roster and search.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {filteredPlayers.map((player) => (
                    <button
                      key={player.playerId}
                      type="button"
                      onClick={() => setSelectedPlayerId(player.playerId)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition sm:px-4 ${selectedPlayerId === player.playerId ? 'bg-[#FF4B1F]/12' : 'hover:bg-white/[0.04]'}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black ${selectedPlayerId === player.playerId ? 'bg-[#FF4B1F] text-white' : 'bg-white/[0.06] text-white/50'}`}>
                          {player.position || '—'}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">{player.playerName}</div>
                          <div className="text-xs text-white/40">{player.nflTeam || 'FA'} · ID {player.playerId}</div>
                        </div>
                      </div>
                      <span className={`h-4 w-4 shrink-0 rounded-full border ${selectedPlayerId === player.playerId ? 'border-[#FF4B1F] bg-[#FF4B1F] shadow-[inset_0_0_0_3px_#0A1D2B]' : 'border-white/20'}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={queueMove}
              disabled={!selectedPlayerId || !fromRoster || !toRoster || sameTeamSelected}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#FF4B1F] px-4 py-3 text-sm font-black text-white transition hover:bg-[#ff633e] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {selectedPlayer ? `Move ${selectedPlayer.playerName} →` : 'Select a player to continue'}
            </button>
          </div>
        </section>

        <section className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A1D2B]">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-black text-white/70">3</span>
                <h3 className="font-bold text-white">Simulation moves</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/40">These changes affect only the simulator, not Sleeper. Applied moves are saved locally until you clear them.</p>
            </div>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-white/60">{queuedMoves.length}</span>
          </div>

          <div className="min-h-0 flex-1 p-3 sm:p-4">
            {queuedMoves.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-5 text-center">
                <div className="text-2xl text-white/20">⇄</div>
                <div className="mt-2 text-sm font-semibold text-white/55">No roster moves yet</div>
                <div className="mt-1 text-xs leading-5 text-white/35">Choose two teams and a player to build an alternate scenario.</div>
              </div>
            ) : (
              <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {queuedMoves.map((move, index) => (
                  <div key={`${move.fromRosterId}-${move.toRosterId}-${move.asset?.playerId || index}`} className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF4B1F]/12 text-xs font-black text-[#FF9C83]">{move.asset?.position || '—'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">{move.asset?.playerName || move.asset?.playerId}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-white/40">
                          <span className="truncate">{move.fromTeamName}</span>
                          <span className="text-[#FF8A6D]">→</span>
                          <span className="truncate">{move.toTeamName}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeMove(index)} aria-label={`Remove ${move.asset?.playerName || 'move'}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {queuedMoves.length ? (
            <div className="border-t border-white/10 px-4 py-3">
              <button type="button" onClick={() => setQueuedMoves([])} className="text-xs font-semibold text-white/45 transition hover:text-white">Clear all moves</button>
            </div>
          ) : null}
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-white/10 bg-[#071522]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-2 sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/[0.08] hover:text-white sm:flex-none">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="min-h-11 flex-[1.4] rounded-xl bg-[#FF4B1F] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#ff633e] sm:flex-none">
            Apply {queuedMoves.length ? `${queuedMoves.length} move${queuedMoves.length === 1 ? '' : 's'}` : 'rosters'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}