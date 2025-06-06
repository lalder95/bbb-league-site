import React from "react";

/**
 * FinanceBadges
 * @param {object} props
 * @param {number} props.capSpace - Current year cap space
 * @param {number} props.deadCap - Total dead cap
 * @param {number} props.teamFines - Total team fines
 */
export default function FinanceBadges({
  capSpace = 0,
  deadCap = 0,
  teamFines = 0,
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <Badge icon="🟢" value={capSpace} label="Current Year Cap Space" />
      <Badge icon="🔴" value={deadCap} label="Total Dead Cap" />
      <Badge icon="⚠️" value={teamFines} label="Total Team Fines" />
    </div>
  );
}

function Badge({ icon, value, label }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded bg-black/30 text-white min-w-[120px] border border-white/10">
      <span className="text-lg">{icon}</span>
      <span className="font-bold text-base">{value}</span>
      <span className="text-xs mt-1 text-center">{label}</span>
    </div>
  );
}