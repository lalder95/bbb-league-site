import React from "react";

/**
 * TeamPedigreeBadges
 * @param {object} props
 * @param {number} props.championships - Championships won
 * @param {number} props.divisionTitles - Division titles
 * @param {string} props.allTimeRecord - All-time record (e.g. "45-20")
 * @param {string} props.allTimeWinPct - All-time win % (e.g. "69.2%")
 * @param {number} props.playoffAppearances - Playoff appearances
 * @param {string} props.playoffRecord - Playoff record (e.g. "8-4")
 * @param {string} props.playoffWinPct - Playoff win % (e.g. "66.7%")
 */
export default function TeamPedigreeBadges({
  championships = 0,
  divisionTitles = 0,
  allTimeRecord = "0-0",
  allTimeWinPct = "0.0%",
  playoffAppearances = 0,
  playoffRecord = "0-0",
  playoffWinPct = "0.0%",
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-6 items-center">
      <Badge
        icon="🏆"
        value={championships}
        label="Championships Won"
        prominent
      />
      <Badge
        icon="🥇"
        value={divisionTitles}
        label="Division Titles"
      />
      <Badge
        icon="📈"
        value={`${allTimeRecord} (${allTimeWinPct})`}
        label="All-Time Record"
      />
      <Badge
        icon="🎯"
        value={playoffAppearances}
        label="Playoff Appearances"
      />
      <Badge
        icon="🔥"
        value={`${playoffRecord} (${playoffWinPct})`}
        label="Playoff Record"
      />
    </div>
  );
}

function Badge({ icon, value, label, prominent }) {
  return (
    <div
      className={`flex flex-col items-center px-3 py-2 rounded ${
        prominent
          ? "bg-yellow-400 text-black border-yellow-300 font-extrabold scale-110 shadow-lg"
          : "bg-black/30 text-white border-white/10"
      } min-w-[100px] border`}
    >
      <span className="text-2xl">{icon}</span>
      <span className={`font-bold text-base ${prominent ? "text-xl" : ""}`}>{value}</span>
      <span className="text-xs mt-1 text-center">{label}</span>
    </div>
  );
}