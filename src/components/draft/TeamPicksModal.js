'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';

const formatSalary = (value) => `$${Number(value || 0).toFixed(1)}`;

const TeamPicksModal = ({ selectedTeam, teamPicks, draftYearToShow, onClose }) => {
  const summary = useMemo(() => {
    if (!teamPicks) return null;

    const totalObligation = teamPicks.currentPicks.reduce((sum, pick) => sum + Number(pick.salary || 0), 0);
    const roundCounts = teamPicks.currentPicks.reduce((acc, pick) => {
      acc[pick.round] = (acc[pick.round] || 0) + 1;
      return acc;
    }, {});

    return {
      totalObligation,
      totalPicks: teamPicks.currentPicks.length,
      roundCounts,
    };
  }, [teamPicks]);

  if (!selectedTeam || !teamPicks || !summary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#071622] shadow-[0_30px_120px_rgba(0,0,0,0.5)]">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#071622]/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FFB39F]">Rookie picks</div>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-white">{selectedTeam}</h3>
              <p className="mt-1 text-sm text-white/60">{draftYearToShow || 'Upcoming'} rookie draft</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_14px_50px_rgba(0,0,0,0.15)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-white">Pick breakdown</h4>
                <p className="text-sm text-white/55">Sorted by round and pick position.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                {summary.totalPicks} total
              </div>
            </div>

            {teamPicks.currentPicks.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-black/25 text-white/55">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Pick</th>
                        <th className="px-4 py-3 text-left font-medium">Origin</th>
                        <th className="px-4 py-3 text-left font-medium">Years</th>
                        <th className="px-4 py-3 text-right font-medium">Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamPicks.currentPicks
                        .slice()
                        .sort((left, right) => left.round - right.round || left.pickPosition - right.pickPosition)
                        .map((pick) => {
                          const contractYears = Number(pick.contractYears) || (pick.round <= 3 ? 3 : 2);
                          return (
                            <tr key={`${pick.season}-${pick.round}-${pick.pickPosition}-${pick.originalOwner}`} className="border-t border-white/5 hover:bg-white/5">
                              <td className="px-4 py-3 font-semibold text-white">{pick.pickNumber}</td>
                              <td className="px-4 py-3 text-white/72">
                                {pick.originalOwner === selectedTeam ? 'Own pick' : `Via ${pick.originalOwner}`}
                              </td>
                              <td className="px-4 py-3 text-white/72">{contractYears} yrs</td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-300">{formatSalary(pick.salary)}</td>
                            </tr>
                          );
                        })}
                      <tr className="border-t border-white/10 bg-black/20 font-bold">
                        <td colSpan="3" className="px-4 py-3 text-right text-white/72">Total cap obligation</td>
                        <td className="px-4 py-3 text-right text-emerald-300">{formatSalary(summary.totalObligation)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-white/60">
                No draft picks currently owned by {selectedTeam}.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function SummaryTile({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{label}</div>
          <div className="mt-2 text-2xl font-black text-white">{value}</div>
          <div className="mt-1 text-sm text-white/55">{detail}</div>
        </div>
        <div className="rounded-2xl border border-[#FF4B1F]/20 bg-[#FF4B1F]/10 p-2 text-[#FFB39F]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default TeamPicksModal;
