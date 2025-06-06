import React from "react";

/**
 * ActivityBadges
 * @param {object} props
 * @param {number} props.trades - Total trades made
 * @param {number} props.playersAdded - Total players added (waivers/free agents)
 * @param {number} props.draftPicks - Total rookies drafted
 * @param {function} props.onTradesClick
 * @param {function} props.onPlayersAddedClick
 * @param {function} props.onDraftPicksClick
 * @param {string} [props.draftLabel]
 */
export default function ActivityBadges({
  trades = 0,
  playersAdded = 0,
  draftPicks = 0,
  onTradesClick,
  onPlayersAddedClick,
  onDraftPicksClick,
  draftLabel = "Rookies Drafted",
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <Badge
        icon="🔄"
        value={trades}
        label="Trades Made"
        onClick={onTradesClick}
      />
      <Badge
        icon="➕"
        value={playersAdded}
        label="Players Added"
        onClick={onPlayersAddedClick}
      />
      <Badge
        icon="🎲"
        value={draftPicks}
        label={draftLabel}
        onClick={onDraftPicksClick}
      />
    </div>
  );
}

// Simple badge subcomponent for reuse
function Badge({ icon, value, label, onClick }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center px-3 py-2 rounded bg-black/30 text-white min-w-[70px] border border-white/10 focus:outline-none hover:bg-black/50 transition"
      onClick={onClick}
      tabIndex={0}
    >
      <span className="text-lg">{icon}</span>
      <span className="font-bold text-base">{value}</span>
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}