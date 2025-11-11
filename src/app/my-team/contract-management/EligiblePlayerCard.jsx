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
  onExtensionChange,
  onFinalize,
}) {
  return (
    <div className="flex items-center gap-6 bg-[#101c2a] border border-white/10 rounded-xl shadow-sm px-5 py-4 mb-4 hover:shadow-lg transition-shadow">
      {/* Left: Avatar, Name, Age */}
      <div className="flex items-center gap-3 min-w-[180px]">
        <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-12 h-12 rounded-lg overflow-hidden shadow" />
        <div>
          <div className="font-bold text-white text-lg leading-tight break-words whitespace-normal max-w-[120px]">{player.playerName}</div>
          <div className="text-xs text-white/60 mt-1">Age: {player.age ?? '-'}</div>
        </div>
      </div>
      {/* Middle: Salary & Simulated Years */}
      <div className="flex-1 flex flex-col gap-2 min-w-[180px]">
        <div className="text-white/80 text-xs">Current Salary</div>
        <div className="text-2xl font-semibold text-[#1FDDFF]">${parseFloat(player.curYear).toFixed(1)}</div>
        <div className="text-white/80 text-xs mt-2">Simulated Years</div>
        {ext.deny || !ext.years ? (
          <span className="text-white/50 italic text-xs">No extension</span>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {simYears.map((s, i) => (
              <span key={i} className="bg-[#1FDDFF]/10 text-[#1FDDFF] px-2 py-1 rounded-full text-xs font-medium">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Right: Extension select & Finalize */}
      <div className="flex flex-col items-end gap-2 min-w-[160px]">
        <select
          className="bg-white/10 text-white rounded-lg px-3 py-2 border border-white/20 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF4B1F] focus:border-[#FF4B1F] text-sm w-full"
          value={ext.years}
          onChange={onExtensionChange}
        >
          <option value={0}>No Extension</option>
          <option value={1}>1 Year</option>
          <option value={2}>2 Years</option>
          <option value={3}>3 Years</option>
        </select>
        {showFinalize && pendingExtension && pendingExtension.player?.playerId === player.playerId && (
          <button
            className="w-full px-3 py-2 bg-[#FF4B1F] text-white rounded-lg hover:bg-orange-600 font-semibold text-sm shadow transition-colors"
            disabled={finalizeLoading || !isExtensionWindowOpen}
            onClick={onFinalize}
          >
            {finalizeLoading ? 'Saving...' : 'Finalize'}
          </button>
        )}
      </div>
    </div>
  );
}
