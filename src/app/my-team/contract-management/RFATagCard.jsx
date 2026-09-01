import React from 'react';
import PlayerProfileCard from '../components/PlayerProfileCard';

export default function RFATagCard({
  player,
  choice,
  showFinalize,
  pendingTag,
  finalizeLoading,
  hasRfaLimitReached,
  isRfaWindowOpen,
  showLogicChecks,
  logicChecks,
  onChoiceChange,
  onFinalize,
  onAvatarClick,
}) {
  const currentSalary = Number.parseFloat(player?.curYear) || 0;
  const isPending = pendingTag?.player?.playerId === player?.playerId;
  const isSelected = Boolean(choice?.apply);

  return (
    <div
      className={`mb-3 overflow-hidden rounded-2xl border bg-[#091722] transition-all duration-200 ${
        isPending && isSelected
          ? 'border-[#9BFFB7]/35 shadow-[0_12px_35px_rgba(155,255,183,0.06)]'
          : 'border-white/10 hover:border-white/20 hover:bg-[#0A1925]'
      }`}
    >
      <div className="grid min-h-[112px] grid-cols-[minmax(210px,1.2fr)_minmax(150px,0.7fr)_minmax(235px,1.15fr)_minmax(175px,0.8fr)] items-stretch divide-x divide-white/10">
        {/* Player */}
        <div className="flex min-w-0 items-center gap-3.5 px-5 py-4">
          <button
            type="button"
            className="shrink-0 rounded-xl outline-none ring-offset-2 ring-offset-[#091722] transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[#9BFFB7]"
            onClick={() => onAvatarClick?.(player.playerId)}
            aria-label={`View ${player.playerName} profile`}
          >
            <PlayerProfileCard
              playerId={player.playerId}
              imageExtension="png"
              expanded={false}
              avatarOnly
              className="h-14 w-14 overflow-hidden rounded-xl shadow-lg"
            />
          </button>

          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {player.position && (
                <span className="rounded-md border border-[#9BFFB7]/20 bg-[#9BFFB7]/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#B8FFC9]">
                  {player.position}
                </span>
              )}
              <span className="text-[11px] font-medium text-white/40">Age {player.age ?? '—'}</span>
            </div>
            <button
              type="button"
              className="block max-w-full text-left outline-none hover:underline focus-visible:underline"
              onClick={() => onAvatarClick?.(player.playerId)}
            >
              <span className="block truncate text-[17px] font-black leading-5 text-white">{player.playerName}</span>
            </button>
            <div className="mt-1 truncate text-[11px] text-white/35">Expires {player.contractFinalYear || '—'}</div>
          </div>
        </div>

        {/* Current deal */}
        <div className="flex flex-col justify-center px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Current Salary</div>
          <div className="mt-1 text-xl font-black tabular-nums text-white/75">${currentSalary.toFixed(1)}</div>
          <div className="mt-1 text-[11px] text-white/35">Current league year</div>
        </div>

        {/* RFA conversion */}
        <div className="flex flex-col justify-center px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">RFA Conversion</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-xs font-bold text-white/65">
              {player.contractType || 'FA / Waiver'}
            </span>
            <span className="text-white/25">→</span>
            <span className="rounded-lg border border-[#9BFFB7]/20 bg-[#9BFFB7]/10 px-2.5 py-1.5 text-xs font-black text-[#B8FFC9]">
              RFA
            </span>
          </div>
          <div className="mt-2 text-[11px] leading-4 text-white/35">Marks the expiring contract as restricted free agent eligible.</div>
        </div>

        {/* Action */}
        <div className="flex flex-col justify-center gap-2.5 px-5 py-4">
          <label className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35" htmlFor={`rfa-${player.playerId}`}>
            Decision
          </label>
          <select
            id={`rfa-${player.playerId}`}
            className="w-full rounded-lg border border-white/15 bg-[#0D202E] px-3 py-2.5 text-sm font-semibold text-white outline-none transition [color-scheme:dark] hover:border-white/25 focus:border-[#9BFFB7]/60 focus:ring-2 focus:ring-[#9BFFB7]/15 disabled:cursor-not-allowed disabled:opacity-40"
            value={choice?.apply ? 'apply' : 'none'}
            onChange={e => onChoiceChange(e.target.value === 'apply')}
            disabled={hasRfaLimitReached}
          >
            <option value="none">No Tag</option>
            <option value="apply">Apply RFA Tag</option>
          </select>

          {showFinalize && isPending && (
            <button
              type="button"
              className="w-full rounded-lg bg-[#9BFFB7] px-3 py-2.5 text-sm font-black text-[#07140B] shadow-[0_8px_20px_rgba(155,255,183,0.12)] transition hover:bg-[#B6FFC9] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={finalizeLoading || hasRfaLimitReached || !isRfaWindowOpen}
              onClick={onFinalize}
            >
              {finalizeLoading ? 'Saving…' : 'Finalize RFA Tag'}
            </button>
          )}

          {hasRfaLimitReached && (
            <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-2.5 py-2 text-[11px] font-semibold leading-4 text-amber-200/80">
              RFA Tag already used this year.
            </div>
          )}
        </div>
      </div>

      {showLogicChecks && Array.isArray(logicChecks) && logicChecks.length > 0 && (
        <div className="border-t border-white/10 bg-black/15 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="mr-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Admin checks</span>
            {logicChecks.map(check => (
              <div key={check.label} className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full ${check.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-white/50">{check.label}</span>
                <span className={check.ok ? 'font-bold text-emerald-300/80' : 'font-bold text-red-300/90'}>
                  {check.ok ? 'PASS' : 'FAIL'}
                </span>
                {check.detail ? <span className="max-w-[110px] truncate text-white/25">({check.detail})</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
