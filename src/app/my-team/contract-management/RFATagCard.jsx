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
  onChoiceChange,
  onFinalize,
}) {
  return (
    <div className="flex items-center gap-6 bg-[#101c2a] border border-white/10 rounded-xl shadow-sm px-5 py-4 mb-4 hover:shadow-lg transition-shadow">
      {/* Left: Avatar, Name, Age */}
      <div className="flex items-center gap-3 min-w-[180px]">
        <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-12 h-12 rounded-lg overflow-hidden shadow" />
        <div>
          <div className="font-bold text-white text-lg leading-tight break-words whitespace-normal max-w-[140px]">{player.playerName}</div>
          <div className="text-xs text-white/60 mt-1">Age: {player.age ?? '-'}</div>
        </div>
      </div>
      {/* Middle: Informational */}
      <div className="flex-1 flex flex-col gap-2 min-w-[180px]">
        <div className="text-white/80 text-xs">RFA Tag</div>
        <div className="text-2xl font-semibold text-[#9bffb7]">Set RFA? = TRUE</div>
        <div className="text-white/50 text-xs">Eligible: Active Waiver/FA contracts only</div>
      </div>
      {/* Right: Choice & Finalize */}
      <div className="flex flex-col items-end gap-2 min-w-[160px]">
        <select
          className="bg-white/10 text-white rounded-lg px-3 py-2 border border-white/20 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-[#FF4B1F] text-sm w-full"
          value={choice?.apply ? 'apply' : 'none'}
          onChange={e => onChoiceChange(e.target.value === 'apply')}
          disabled={hasRfaLimitReached}
        >
          <option value="none">No Tag</option>
          <option value="apply">Apply RFA Tag</option>
        </select>
        {showFinalize && pendingTag && pendingTag.player?.playerId === player.playerId && (
          <button
            className="w-full px-3 py-2 bg-[#FF4B1F] text-white rounded-lg hover:bg-orange-600 font-semibold text-sm shadow transition-colors disabled:opacity-50"
            disabled={finalizeLoading || hasRfaLimitReached || !isRfaWindowOpen}
            onClick={onFinalize}
          >
            {finalizeLoading ? 'Saving...' : 'Finalize'}
          </button>
        )}
      </div>
    </div>
  );
}
