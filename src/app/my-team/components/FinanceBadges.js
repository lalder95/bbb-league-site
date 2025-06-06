import React from "react";

/**
 * FinanceBadges
 * @param {object} props
 * @param {number} props.salaryCap - Current salary cap
 * @param {number} props.capSpace - Current cap space
 * @param {number} props.deadCap - Current dead cap
 * @param {number} props.contracts - Number of active contracts
 * @param {number} props.extensions - Number of contract extensions
 * @param {number} props.franchiseTags - Number of franchise tags used
 * @param {number} props.transitionTags - Number of transition tags used
 */
export default function FinanceBadges({
  salaryCap = 0,
  capSpace = 0,
  deadCap = 0,
  contracts = 0,
  extensions = 0,
  franchiseTags = 0,
  transitionTags = 0,
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <Badge icon="💰" value={salaryCap} label="Salary Cap" />
      <Badge icon="🟢" value={capSpace} label="Cap Space" />
      <Badge icon="🔴" value={deadCap} label="Dead Cap" />
      <Badge icon="📄" value={contracts} label="Active Contracts" />
      <Badge icon="📝" value={extensions} label="Extensions" />
      <Badge icon="🏷️" value={franchiseTags} label="Franchise Tags" />
      <Badge icon="🔖" value={transitionTags} label="Transition Tags" />
    </div>
  );
}

function Badge({ icon, value, label }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded bg-black/30 text-white min-w-[70px] border border-white/10">
      <span className="text-lg">{icon}</span>
      <span className="font-bold text-base">{value}</span>
      <span className="text-xs mt-1">{label}</span>
    </div>
  );
}