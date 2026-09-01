import React from 'react';
import PlayerProfileCard from '../components/PlayerProfileCard';

export default function EligiblePlayerCard({
  player,
  ext,
  simYears,
  showFinalize,
  pendingExtension,
  finalizeLoading,
  isExtensionWindowOpen,
  showLogicChecks,
  logicChecks,
  onExtensionChange,
  onFinalize,
  onAvatarClick,
}) {
  const salary = Number.parseFloat(player?.curYear) || 0;
  const isPending = pendingExtension?.player?.playerId === player?.playerId;
  const hasProposal = !ext?.deny && Number(ext?.years) > 0;

  return (
    <div
      className={`mb-3 overflow-hidden rounded-2xl border bg-[#091722] transition-all duration-200 ${
        isPending && hasProposal
          ? 'border-[#FF4B1F]/45 shadow-[0_12px_35px_rgba(255,75,31,0.08)]'
          : 'border-white/10 hover:border-white/20 hover:bg-[#0A1925]'
      }`}
    >
      <div className="grid min-h-[112px] grid-cols-[minmax(210px,1.2fr)_minmax(135px,0.65fr)_minmax(260px,1.35fr)_minmax(170px,0.8fr)] items-stretch divide-x divide-white/10">
        {/* Player */}
        <div className="flex min-w-0 items-center gap-3.5 px-5 py-4">
          <button
            type="button"
            className="shrink-0 rounded-xl outline-none ring-offset-2 ring-offset-[#091722] transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[#FF4B1F]"
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
                <span className="rounded-md border border-[#FF4B1F]/20 bg-[#FF4B1F]/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#FF8B70]">
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
            <div className="mt-1 truncate text-[11px] text-white/35">
              {player.contractType || 'Base'} contract
            </div>
          </div>
        </div>

        {/* Current deal */}
        <div className="flex flex-col justify-center px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Current Salary</div>
          <div className="mt-1 text-2xl font-black tabular-nums text-white">${salary.toFixed(1)}</div>
          <div className="mt-1 text-[11px] text-white/35">Current league year</div>
        </div>

        {/* Proposal */}
        <div className="flex min-w-0 flex-col justify-center px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Projected Extension</div>
            {hasProposal && (
              <span className="rounded-full border border-[#FF4B1F]/20 bg-[#FF4B1F]/10 px-2 py-0.5 text-[10px] font-bold text-[#FF9A82]">
                {ext.years} yr{Number(ext.years) === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {!hasProposal ? (
            <div className="flex min-h-[34px] items-center text-sm text-white/35">Choose a term to preview salary impact.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {simYears.map((year, index) => (
                <span
                  key={`${player.playerId}-${index}`}
                  className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-xs font-semibold tabular-nums text-white/75"
                >
                  {year}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action */}
        <div className="flex flex-col justify-center gap-2.5 px-5 py-4">
          <label className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35" htmlFor={`extension-${player.playerId}`}>
            Extension Term
          </label>
          <select
            id={`extension-${player.playerId}`}
            className="w-full rounded-lg border border-white/15 bg-[#0D202E] px-3 py-2.5 text-sm font-semibold text-white outline-none transition [color-scheme:dark] hover:border-white/25 focus:border-[#FF4B1F]/70 focus:ring-2 focus:ring-[#FF4B1F]/20"
            value={ext.years}
            onChange={onExtensionChange}
          >
            <option value={0}>No Extension</option>
            <option value={1}>1 Year</option>
            <option value={2}>2 Years</option>
            <option value={3}>3 Years</option>
          </select>

          {showFinalize && isPending && (
            <button
              type="button"
              className="w-full rounded-lg bg-[#FF4B1F] px-3 py-2.5 text-sm font-black text-white shadow-[0_8px_20px_rgba(255,75,31,0.18)] transition hover:bg-[#ff613c] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={finalizeLoading || !isExtensionWindowOpen}
              onClick={onFinalize}
            >
              {finalizeLoading ? 'Saving…' : 'Finalize Extension'}
            </button>
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
