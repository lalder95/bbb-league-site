'use client';

import React, { useEffect, useMemo, useState } from 'react';
import TeamPicksModal from './TeamPicksModal';
import { estimateDraftPositions } from '@/utils/draftUtils';
import {
  getRookieContractYears,
  getRookieDeadMoneyRate,
  getRookieSalary,
} from '@/utils/rookieSalaryScale';

const formatSalary = (value) => `$${Number(value || 0).toFixed(1)}`;

const RookieSalaries = ({
  rosters,
  tradedPicks,
  draftInfo,
  draftOrder,
  getTeamName,
  draftYearToShow,
  standingsRows,
}) => {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const availableYears = useMemo(() => {
    const years = new Set();
    if (draftYearToShow) years.add(Number(draftYearToShow));
    (tradedPicks || []).forEach((pick) => {
      const season = Number(pick?.season);
      if (Number.isFinite(season)) years.add(season);
    });
    if (years.size === 0) {
      const baseYear = Number(draftYearToShow) || new Date().getFullYear() + 1;
      [baseYear - 1, baseYear, baseYear + 1].forEach((year) => years.add(year));
    }
    return [...years].sort((left, right) => left - right);
  }, [draftYearToShow, tradedPicks]);
  const [selectedYear, setSelectedYear] = useState(() => Number(draftYearToShow) || availableYears[0] || new Date().getFullYear() + 1);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(Number(draftYearToShow) || availableYears[0] || selectedYear);
    }
  }, [availableYears, draftYearToShow, selectedYear]);

  const teamPicks = useMemo(
    () => estimateDraftPositions(
      rosters,
      tradedPicks,
      draftInfo,
      draftOrder,
      getTeamName,
      selectedYear,
      standingsRows,
    ),
    [rosters, tradedPicks, draftInfo, draftOrder, getTeamName, selectedYear, standingsRows],
  );

  const teamRows = useMemo(() => {
    return Object.entries(teamPicks)
      .map(([teamName, picks]) => {
        const totalSalary = (picks.currentPicks || []).reduce((sum, pick) => sum + Number(pick.salary || 0), 0);
        return {
          teamName,
          totalSalary,
          pickCount: picks.currentPicks.length,
          picks,
        };
      })
      .sort((left, right) => right.totalSalary - left.totalSalary || left.teamName.localeCompare(right.teamName));
  }, [teamPicks]);

  const totalLeagueSalary = teamRows.reduce((sum, row) => sum + row.totalSalary, 0);
  const wageTableRows = useMemo(() => {
    const rounds = [1, 2, 3, 4, 5, 6, 7];
    const pickRows = Array.from({ length: 12 }, (_, index) => index + 1);

    return {
      rounds,
      pickRows: pickRows.map((pickPosition) => ({
        pickPosition,
        salaries: rounds.map((round) => getRookieSalary(round, pickPosition)),
      })),
    };
  }, []);

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-black/25 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-6">
      <div className="rounded-2xl border border-[#FF4B1F]/20 bg-gradient-to-r from-[#FF4B1F]/15 via-[#FF4B1F]/5 to-transparent p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#FFB39F]">Rookie salaries</p>
            <h3 className="text-2xl font-black tracking-tight text-white md:text-3xl">Rookie wage scale</h3>
            <p className="max-w-2xl text-sm leading-6 text-white/72 md:text-base">
              Rookie obligations now follow the pick-by-pick wage scale, with estimated draft slots driven by current standings.
              The worst team maps to the first rookie slot and the champion maps to the final slot.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <StatCard label="Year" value={selectedYear} tone="amber" />
            <StatCard label="Teams" value={teamRows.length || 0} tone="emerald" />
            <StatCard label="Total salary" value={formatSalary(totalLeagueSalary)} tone="orange" />
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">Team obligations</h4>
            <p className="text-sm text-white/60">Sorted by total rookie salary commitment for the selected year.</p>
          </div>
          <label className="inline-flex w-full max-w-xs flex-col gap-1 text-sm text-white/70 md:w-auto">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">View year</span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-[#081826] px-3 py-2 text-white outline-none transition focus:border-[#FF4B1F]/40"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[#081826]/95 backdrop-blur-sm">
                <tr className="text-left text-white/60">
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 text-right font-medium">Pick count</th>
                  <th className="px-4 py-3 text-right font-medium">Total obligation</th>
                  <th className="px-4 py-3 text-right font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((row, index) => (
                  <tr
                    key={row.teamName}
                    onClick={() => setSelectedTeam(row.teamName)}
                    className={`cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5 ${index === 0 ? 'bg-white/[0.03]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.teamName}</div>
                      <div className="text-xs text-white/45">Click for pick breakdown</div>
                    </td>
                    <td className="px-4 py-3 text-right text-white/72">{row.pickCount}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-300">{formatSalary(row.totalSalary)}</td>
                    <td className="px-4 py-3 text-right text-white/72">{row.pickCount ? formatSalary(row.totalSalary / row.pickCount) : '$0.0'}</td>
                  </tr>
                ))}
                {!teamRows.length && (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-white/55">
                      No draft picks available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Rookie wage scale</h4>
            <p className="text-sm text-white/60">Round, years, dead money, and per-pick values for the selected year.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#081826]/95 backdrop-blur-sm">
                <tr className="text-white/70">
                  <th className="sticky left-0 z-10 bg-[#081826] px-4 py-3 text-left font-semibold">Pick</th>
                  {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                    <th key={round} className="px-4 py-3 text-right font-semibold">Round {round}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5 bg-red-500/10">
                  <td className="sticky left-0 z-10 bg-red-950 px-4 py-3 font-semibold text-red-200">Dead</td>
                  {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                    <td key={round} className="px-4 py-3 text-right text-red-100">{getRookieDeadMoneyRate(round)}%</td>
                  ))}
                </tr>
                <tr className="border-t border-white/5 bg-orange-500/10">
                  <td className="sticky left-0 z-10 bg-orange-950 px-4 py-3 font-semibold text-orange-200">Years</td>
                  {[1, 2, 3, 4, 5, 6, 7].map((round) => (
                    <td key={round} className="px-4 py-3 text-right text-orange-100">{getRookieContractYears(round)}</td>
                  ))}
                </tr>
                {wageTableRows.pickRows.map((row) => (
                  <tr key={row.pickPosition} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="sticky left-0 z-10 bg-[#07141f] px-4 py-3 font-semibold text-white">Pick {row.pickPosition}</td>
                    {row.salaries.map((salary, index) => (
                      <td key={`${row.pickPosition}-${index + 1}`} className="px-4 py-3 text-right text-white/80">{formatSalary(salary)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#081826] p-4 text-sm text-white/70">
          Draft slots are estimated from current standings order. If a pick has not been assigned a concrete slot yet, the app will keep that estimate aligned with the league standings until the draft order is finalized.
        </div>
      </section>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Team-by-team breakdown</h4>
            <p className="text-sm text-white/60">Open a team to see every owned rookie pick.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamRows.map((row) => (
            <button
              key={row.teamName}
              type="button"
              onClick={() => setSelectedTeam(row.teamName)}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#FF4B1F]/35 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white transition-colors group-hover:text-[#FFB39F]">{row.teamName}</div>
                  <div className="text-xs text-white/45">{row.pickCount} rookie picks</div>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {formatSalary(row.totalSalary)}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/72">
                <div className="rounded-xl bg-black/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Avg pick</div>
                  <div className="mt-1 font-semibold text-white">{row.pickCount ? formatSalary(row.totalSalary / row.pickCount) : '$0.0'}</div>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Current team</div>
                  <div className="mt-1 font-semibold text-white">{row.picks.currentPicks.length ? 'Active' : 'None'}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedTeam && teamPicks[selectedTeam] && (
        <TeamPicksModal
          selectedTeam={selectedTeam}
          teamPicks={teamPicks[selectedTeam]}
          draftYearToShow={draftYearToShow}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
};

function StatCard({ label, value, detail, tone = 'slate' }) {
  const toneClasses = {
    amber: 'from-amber-400/15 to-amber-400/5 border-amber-300/20 text-amber-100',
    emerald: 'from-emerald-400/15 to-emerald-400/5 border-emerald-300/20 text-emerald-100',
    orange: 'from-[#FF4B1F]/15 to-[#FF4B1F]/5 border-[#FF4B1F]/20 text-white',
    slate: 'from-white/10 to-white/[0.03] border-white/10 text-white',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-b p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] ${toneClasses[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className="mt-2 text-lg font-black leading-none">{value}</div>
      {detail ? <div className="mt-1 text-xs text-white/60">{detail}</div> : null}
    </div>
  );
}

export default RookieSalaries;
