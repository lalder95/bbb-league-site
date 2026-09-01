import React from 'react';
import PlayerProfileCard from '../components/PlayerProfileCard';

export default function FranchiseTagCard({
  player,
  tagValue,
  choice,
  showFinalize,
  pendingTag,
  finalizeLoading,
  isFranchiseWindowOpen,
  hasFranchiseLimitReached,
  showLogicChecks,
  logicChecks,
  onChoiceChange,
  onFinalize,
  onAvatarClick,
}) {
  const currentSalary = Number.parseFloat(player?.curYear) || 0;
  const calculatedTagValue = Number.parseFloat(tagValue) || 0;
  const isPending = pendingTag?.player?.playerId === player?.playerId;
  const isSelected = Boolean(choice?.apply);

  return (
    <div
      className={`mb-3 overflow-hidden rounded-2xl border bg-[#091722] transition-all duration-200 ${
        isPending && isSelected
          ? 'border-[#1FDDFF]/40 shadow-[0_12px_35px_rgba(31,221,255,0.07)]'
          : 'border-white/10 hover:border-white/20 hover:bg-[#0A1925]'
      }`}
    >
      <div className="grid min-h-[112px] grid-cols-[minmax(210px,1.2fr)_minmax(150px,0.7fr)_minmax(235px,1.15fr)_minmax(175px,0.8fr)] items-stretch divide-x divide-white/10">
        {/* Player */}
        <div className="flex min-w-0 items-center gap-3.5 px-5 py-4">
          <button
            type="button"
            className="shrink-0 rounded-xl outline-none ring-offset-2 ring-offset-[#091722] transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[#1FDDFF]"
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
                <span className="rounded-md border border-[#1FDDFF]/20 bg-[#1FDDFF]/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#72EAFF]">
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
            <div className="mt-1 truncate text-[11px] text-white/35">{player.contractType || 'Contract'} · expires {player.contractFinalYear || '—'}</div>
          </div>
        </div>

        {/* Current salary */}
        <div className="flex flex-col justify-center px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Current Salary</div>
          <div className="mt-1 text-xl font-black tabular-nums text-white/75">${currentSalary.toFixed(1)}</div>
          <div className="mt-1 text-[11px] text-white/35">Expiring deal</div>
        </div>

        {/* Tag value */}
        <div className="flex flex-col justify-center px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Franchise Tag Value</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums text-[#72EAFF]">${calculatedTagValue.toFixed(1)}</span>
            <span className="rounded-full border border-[#1FDDFF]/15 bg-[#1FDDFF]/10 px-2 py-0.5 text-[10px] font-bold text-[#72EAFF]">1 YEAR</span>
          </div>
          <div className="mt-1.5 text-[11px] leading-4 text-white/35">Calculated from the league's franchise-tag rules.</div>
        </div>

        {/* Action */}
        <div className="flex flex-col justify-center gap-2.5 px-5 py-4">
          <label className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35" htmlFor={`franchise-${player.playerId}`}>
            Decision
          </label>
          <select
            id={`franchise-${player.playerId}`}
            className="w-full rounded-lg border border-white/15 bg-[#0D202E] px-3 py-2.5 text-sm font-semibold text-white outline-none transition [color-scheme:dark] hover:border-white/25 focus:border-[#1FDDFF]/70 focus:ring-2 focus:ring-[#1FDDFF]/15 disabled:cursor-not-allowed disabled:opacity-40"
            value={choice?.apply ? 'apply' : 'none'}
            onChange={e => onChoiceChange(e.target.value === 'apply')}
            disabled={hasFranchiseLimitReached}
          >
            <option value="none">No Tag</option>
            <option value="apply">Apply Tag</option>
          </select>

          {showFinalize && isPending && (
            <button
              type="button"
              className="w-full rounded-lg bg-[#1FDDFF] px-3 py-2.5 text-sm font-black text-[#07141D] shadow-[0_8px_20px_rgba(31,221,255,0.14)] transition hover:bg-[#5ce8ff] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={finalizeLoading || !isFranchiseWindowOpen || hasFranchiseLimitReached}
              onClick={onFinalize}
            >
              {finalizeLoading ? 'Saving…' : 'Finalize Tag'}
            </button>
          )}

          {hasFranchiseLimitReached && (
            <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-2.5 py-2 text-[11px] font-semibold leading-4 text-amber-200/80">
              Franchise Tag already used this year.
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
