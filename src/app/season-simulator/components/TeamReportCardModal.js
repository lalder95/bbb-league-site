'use client';

import { useMemo, useState } from 'react';
import {
  avatarUrl,
  buildDivisionMap,
  buildReportData,
  formatPercent,
  formatPoints,
  formatSlotLabel,
  isDivisionOpponent,
  getPositionGroupPlayers,
  number,
} from '../utils/teamReportCardData';

function gradeColor(grade = '') {
  if (grade.startsWith('A')) return 'text-emerald-300';
  if (grade.startsWith('B')) return 'text-lime-300';
  if (grade.startsWith('C')) return 'text-amber-300';
  if (grade.startsWith('D')) return 'text-orange-300';
  return 'text-red-300';
}

function TeamAvatar({ team, size = 'h-12 w-12' }) {
  const src = avatarUrl(team?.avatar);
  const fallback = String(team?.userName || team?.displayName || team?.teamName || '?').slice(0, 1).toUpperCase();
  return src ? (
    <img src={src} alt="" className={`${size} rounded-full border border-white/15 bg-black/30 object-cover`} />
  ) : (
    <div className={`${size} flex items-center justify-center rounded-full border border-white/15 bg-[#173247] text-sm font-black text-white/70`}>
      {fallback}
    </div>
  );
}

function DivisionBadge({ compact = false }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-sky-300/30 bg-sky-300/10 font-black uppercase tracking-[0.12em] text-sky-200 ${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[9px]'}`}>
      DIV
    </span>
  );
}

function MetricRankingModal({ metricKey, selectedRosterId, data, divisionByRosterId, onClose }) {
  const definition = data.metricDefinitions.get(metricKey);
  const rows = data.rankings.get(metricKey) || [];
  const selectedDivision = divisionByRosterId?.get(String(selectedRosterId));
  if (!definition) return null;

  const groupPositions = Array.isArray(definition.positionGroupPositions)
    ? definition.positionGroupPositions
    : [];
  const canShowPositionGroups = groupPositions.length > 0;
  const positionGroupLabel = groupPositions.length === 4
    ? 'QB / RB / WR / TE'
    : groupPositions.join(' / ');

  const rowTone = (row) => {
    const selected = String(row.team.rosterId) === String(selectedRosterId);
    const divisionOpponent = isDivisionOpponent(row.team.rosterId, selectedRosterId, divisionByRosterId);
    if (selected) return 'border-[#FF4B1F]/50 bg-[#FF4B1F]/10';
    if (divisionOpponent) return 'border-sky-300/30 bg-sky-300/[0.075] shadow-[inset_3px_0_0_rgba(125,211,252,0.65)]';
    return 'border-white/10 bg-black/15';
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/15 bg-[#081827] shadow-[0_30px_100px_rgba(0,0,0,0.55)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#FF8A6D]">League comparison</div>
              <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{definition.label}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/45">{definition.description} Grades are curved so the league leader receives A+, the lowest receives F, and league-average performance centers on C.</p>
              {selectedDivision !== undefined ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-white/40"><DivisionBadge /><span>Division opponents are highlighted throughout league comparisons.</span></div>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-white/55 hover:bg-white/[0.08] hover:text-white">×</button>
          </div>

        </div>

        <div className="max-h-[68vh] overflow-y-auto p-3 sm:p-4">
          {canShowPositionGroups ? (
            <div>
              <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/45">
                Showing each team&apos;s <span className="font-black text-white/70">{positionGroupLabel}</span> room. Player values are average weekly Sleeper projections when a projection is available; starter share shows how often the player appears in that team&apos;s healthy optimal lineup across the simulated regular-season weeks.
              </div>
              <div className="space-y-2">
                {rows.map((row) => {
                  const selected = String(row.team.rosterId) === String(selectedRosterId);
                  const divisionOpponent = isDivisionOpponent(row.team.rosterId, selectedRosterId, divisionByRosterId);
                  const players = getPositionGroupPlayers(row.team, groupPositions);
                  return (
                    <details key={row.team.rosterId} open={selected} className={`group overflow-hidden rounded-2xl border ${rowTone(row)}`}>
                      <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden sm:px-4">
                        <div className="grid grid-cols-[38px_minmax(0,1fr)_80px_54px_24px] items-center gap-3 sm:grid-cols-[42px_minmax(0,1fr)_110px_64px_24px]">
                          <div className="text-center text-sm font-black text-white/45">#{row.rank}</div>
                          <div className="flex min-w-0 items-center gap-3">
                            <TeamAvatar team={row.team} size="h-9 w-9" />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate text-sm font-bold text-white">{row.team.teamName || row.team.displayName}</div>
                                {divisionOpponent ? <DivisionBadge compact /> : null}
                              </div>
                              <div className="truncate text-xs text-white/40">{players.length} player{players.length === 1 ? '' : 's'} in group</div>
                            </div>
                          </div>
                          <div className="text-right text-sm font-black text-white/80">{definition.formatValue(row.value)}</div>
                          <div className={`text-right text-2xl font-black ${gradeColor(row.grade)}`}>{row.grade}</div>
                          <div className="text-center text-white/35 transition group-open:rotate-180">⌄</div>
                        </div>
                      </summary>

                      <div className="border-t border-white/10 bg-black/10 px-3 py-3 sm:px-4">
                        {players.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {players.map((player) => {
                              const starterRate = number(player.starterRate);
                              const roleLabel = starterRate >= 50 ? 'Primary starter' : starterRate > 0 ? 'Rotational starter' : 'Reserve';
                              return (
                                <div key={player.playerId || `${player.position}-${player.name}`} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-bold text-white/85">{player.name || `Player ${player.playerId}`}</div>
                                      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/35">{player.position}{player.nflTeam ? ` · ${player.nflTeam}` : ''} · {roleLabel}</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-sm font-black text-white">{formatPoints(player.avgProjectedPoints)}</div>
                                      <div className="text-[10px] text-white/35">avg proj</div>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-[#FF4B1F]" style={{ width: `${Math.max(0, Math.min(100, starterRate))}%` }} /></div>
                                    <div className="w-16 text-right text-[10px] font-semibold text-white/45">{starterRate.toFixed(0)}% starts</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/35">No players in this position group were available in the simulation data.</div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const selected = String(row.team.rosterId) === String(selectedRosterId);
                const divisionOpponent = isDivisionOpponent(row.team.rosterId, selectedRosterId, divisionByRosterId);
                return (
                  <div key={row.team.rosterId} className={`grid grid-cols-[38px_minmax(0,1fr)_80px_54px] items-center gap-3 rounded-2xl border px-3 py-3 sm:grid-cols-[42px_minmax(0,1fr)_110px_64px] ${rowTone(row)}`}>
                    <div className="text-center text-sm font-black text-white/45">#{row.rank}</div>
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamAvatar team={row.team} size="h-9 w-9" />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-sm font-bold text-white">{row.team.teamName || row.team.displayName}</div>
                          {divisionOpponent ? <DivisionBadge compact /> : null}
                        </div>
                        <div className="truncate text-xs text-white/40">@{row.team.userName || row.team.displayName}</div>
                      </div>
                    </div>
                    <div className="text-right text-sm font-black text-white/80">{definition.formatValue(row.value)}</div>
                    <div className={`text-right text-2xl font-black ${gradeColor(row.grade)}`}>{row.grade}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GradeCard({ label, grade, value, onClick, large = false }) {
  return (
    <button type="button" onClick={onClick} className={`group rounded-2xl border border-white/10 bg-white/[0.035] text-left transition hover:-translate-y-0.5 hover:border-[#FF4B1F]/35 hover:bg-white/[0.06] ${large ? 'px-5 py-4' : 'px-3 py-3'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">{label}</div>
        <div className="text-[10px] text-white/20 opacity-0 transition group-hover:opacity-100">compare ↗</div>
      </div>
      <div className={`${large ? 'mt-1 text-4xl' : 'mt-2 text-3xl'} font-black ${gradeColor(grade)}`}>{grade || '—'}</div>
      {value ? <div className="mt-1 text-xs font-semibold text-white/65">{value}</div> : null}
    </button>
  );
}

function OddsCard({ label, icon, value, grade, onClick, barValue, tone = 'orange' }) {
  const fillClass = tone === 'blue' ? 'bg-sky-400' : tone === 'purple' ? 'bg-violet-400' : 'bg-[#FF4B1F]';
  return (
    <button type="button" onClick={onClick} className="group rounded-2xl border border-white/10 bg-black/15 p-3 text-left transition hover:-translate-y-0.5 hover:border-[#FF4B1F]/35 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold text-white/55">{label}</div>
        <div className={`text-lg font-black ${gradeColor(grade)}`}>{grade}</div>
      </div>
      <div className="mt-3 text-2xl">{icon}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className={`h-full rounded-full ${fillClass}`} style={{ width: `${Math.max(3, Math.min(100, number(barValue)))}%` }} /></div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/25 group-hover:text-white/40">View league rankings</div>
    </button>
  );
}

export default function TeamReportCardModal({ isOpen, team, teams = [], rosters = [], slotLabels = [], simulations = 0, onClose }) {
  const [metricKey, setMetricKey] = useState(null);
  const data = useMemo(() => buildReportData(teams, slotLabels), [teams, slotLabels]);
  const divisionByRosterId = useMemo(() => buildDivisionMap(teams, rosters), [teams, rosters]);
  const report = team ? data.reports.get(String(team.rosterId)) : null;
  const selectedDivision = team ? divisionByRosterId.get(String(team.rosterId)) : undefined;

  if (!isOpen || !team || !report) return null;

  const h2hRows = (team.headToHead || [])
    .map((row) => ({
      ...row,
      opponent: teams.find((candidate) => String(candidate.rosterId) === String(row.opponentRosterId)),
      divisionOpponent: isDivisionOpponent(row.opponentRosterId, team.rosterId, divisionByRosterId),
    }))
    .filter((row) => row.opponent)
    .sort((left, right) => number(right.winOdds) - number(left.winOdds));

  const volatilityRank = report.volatility?.rank || 0;
  const consistencyPercentile = teams.length > 1
    ? Math.round(((teams.length - volatilityRank) / (teams.length - 1)) * 100)
    : 50;

  return (
    <>
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/75 px-2 py-3 backdrop-blur-sm sm:px-4 sm:py-6" onMouseDown={onClose}>
        <div className="mx-auto w-full max-w-[1320px] overflow-hidden rounded-[28px] border border-white/15 bg-[#071725] shadow-[0_35px_120px_rgba(0,0,0,0.6)]" onMouseDown={(event) => event.stopPropagation()}>
          <div className="sticky top-0 z-10 border-b border-white/10 bg-[#071725]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-2xl font-black text-white sm:text-3xl">Team Report Card</h2>
                  <span className="text-xs italic text-white/40">Grades are curved: A+ = league best · F = lowest · C = league average</span>
                  <span className="text-[10px] text-white/30">Overall = 50% starters · 20% depth · 20% margin · 10% consistency</span>
                </div>
              </div>
              <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-2xl text-white/55 transition hover:bg-white/[0.08] hover:text-white">×</button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px_210px] lg:items-stretch">
              <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-white/0 py-1">
                <TeamAvatar team={team} size="h-16 w-16 sm:h-20 sm:w-20" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-white/55 sm:text-lg">@{team.userName || team.displayName}</div>
                  <div className="mt-0.5 truncate text-xl font-black text-white sm:text-2xl lg:text-3xl">{team.teamName || team.displayName}</div>
                  {selectedDivision !== undefined ? (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-100/75">Division {selectedDivision}</div>
                  ) : null}
                </div>
              </div>
              <GradeCard label="Overall Grade" grade={report.overall?.grade} value={`#${report.overall?.rank || '—'} in league`} large onClick={() => setMetricKey('overall')} />
              <GradeCard label="Scoring Margin Grade" grade={report.margin?.grade} value={formatPoints(report.margin?.value, true)} large onClick={() => setMetricKey('margin')} />
            </div>
          </div>

          <div className="space-y-4 p-3 sm:p-5 lg:p-6">
            <section className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4B1F] text-xs font-black text-[#FF8A6D]">1</span>
                <h3 className="font-black text-white">Starter Slot Grades</h3>
                <span className="text-xs text-white/38">Average simulated weekly score from each starting lineup slot.</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                {report.slots.map((slot) => (
                  <GradeCard key={slot.slot} label={formatSlotLabel(slot.slot)} grade={slot.grade} value={formatPoints(slot.value)} onClick={() => setMetricKey(`slot:${slot.slot}`)} />
                ))}
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.8fr_0.8fr]">
              <section className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4B1F] text-xs font-black text-[#FF8A6D]">2</span>
                  <h3 className="font-black text-white">Depth Grades</h3>
                  <span className="text-xs text-white/38">Replacement value: best reserve QB/TE and best two reserve RBs/WRs.</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-5">
                  {report.depth.map((depth) => (
                    <GradeCard
                      key={depth.position}
                      label={depth.position === 'BENCH' ? 'Overall Bench' : `${depth.position} Depth`}
                      grade={depth.grade}
                      onClick={() => setMetricKey(`depth:${depth.position}`)}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.08] p-4">
                <div className="flex items-center gap-2 text-lg font-black text-white"><span className="text-emerald-300">✓</span> Strengths</div>
                <div className="mt-4 space-y-3">
                  {(team.strengths || []).slice(0, 4).map((item) => <div key={item} className="flex gap-2 text-sm leading-5 text-white/75"><span className="mt-1 text-emerald-300">●</span><span>{item}</span></div>)}
                </div>
              </section>

              <section className="rounded-3xl border border-orange-500/30 bg-orange-500/[0.08] p-4">
                <div className="flex items-center gap-2 text-lg font-black text-white"><span className="text-orange-300">△</span> Weaknesses</div>
                <div className="mt-4 space-y-3">
                  {(team.weaknesses || []).slice(0, 4).map((item) => <div key={item} className="flex gap-2 text-sm leading-5 text-white/75"><span className="mt-1 text-orange-300">●</span><span>{item}</span></div>)}
                </div>
              </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr_0.85fr]">
              <section className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-3 sm:p-4">
                <div className="flex items-center gap-3 px-1 pb-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4B1F] text-xs font-black text-[#FF8A6D]">3</span><h3 className="font-black text-white">Odds Snapshot</h3></div>
                <div className="grid grid-cols-3 gap-2">
                  <OddsCard label="Playoff Odds" icon="🏆" value={formatPercent(team.playoffOdds)} grade={report.playoffs?.grade} barValue={team.playoffOdds} tone="blue" onClick={() => setMetricKey('playoffs')} />
                  <OddsCard label="Championship" icon="🏆" value={formatPercent(team.championshipOdds)} grade={report.championship?.grade} barValue={team.championshipOdds} tone="purple" onClick={() => setMetricKey('championship')} />
                  <OddsCard label="#1 Pick Odds" icon="①" value={formatPercent(team.firstPickOdds)} grade={report.firstPick?.grade} barValue={team.firstPickOdds} onClick={() => setMetricKey('firstPick')} />
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3 px-1 pb-3">
                  <div>
                    <div className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4B1F] text-xs font-black text-[#FF8A6D]">4</span><h3 className="font-black text-white">Head-to-Head Win Odds</h3></div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-9 text-xs text-white/38"><span>Neutral matchup odds using the same weekly score draws.</span>{selectedDivision !== undefined ? <><DivisionBadge compact /><span>division opponent</span></> : null}</div>
                  </div>
                  <button type="button" onClick={() => setMetricKey('h2hPower')} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right transition hover:border-[#FF4B1F]/35 hover:bg-white/[0.07]"><div className="text-[9px] font-black uppercase tracking-wide text-white/30">League H2H grade</div><div className={`text-xl font-black ${gradeColor(report.h2hPower?.grade)}`}>{report.h2hPower?.grade}</div></button>
                </div>
                <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {h2hRows.map((row) => (
                    <div key={row.opponentRosterId} className={`grid grid-cols-[minmax(0,1fr)_105px_46px] items-center gap-2 rounded-xl border px-2.5 py-2 ${row.divisionOpponent ? 'border-sky-300/30 bg-sky-300/[0.075] shadow-[inset_3px_0_0_rgba(125,211,252,0.65)]' : 'border-transparent bg-black/15'}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <TeamAvatar team={row.opponent} size="h-7 w-7" />
                        <div className="flex min-w-0 items-center gap-1.5"><span className={`truncate text-xs font-semibold ${row.divisionOpponent ? 'text-sky-100' : 'text-white/70'}`}>{row.opponent.teamName || row.opponent.displayName}</span>{row.divisionOpponent ? <DivisionBadge compact /> : null}</div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className={`h-full rounded-full ${row.divisionOpponent ? 'bg-sky-300' : 'bg-[#FF4B1F]'}`} style={{ width: `${Math.max(2, Math.min(100, number(row.winOdds)))}%` }} /></div>
                      <div className={`text-right text-xs font-black ${row.divisionOpponent ? 'text-sky-100' : 'text-white/75'}`}>{formatPercent(row.winOdds)}</div>
                    </div>
                  ))}
                </div>
              </section>

              <button type="button" onClick={() => setMetricKey('volatility')} className="rounded-3xl border border-white/10 bg-[#0A1D2B] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#FF4B1F]/35 hover:bg-[#0C2233]">
                <div className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FF4B1F] text-xs font-black text-[#FF8A6D]">5</span><h3 className="font-black text-white">Scoring Volatility</h3></div>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                  <div><div className="text-[10px] uppercase tracking-wide text-white/35">Volatility Grade</div><div className={`mt-1 text-4xl font-black ${gradeColor(report.volatility?.grade)}`}>{report.volatility?.grade}</div></div>
                  <div className="border-l border-white/10 pl-3"><div className="text-[10px] uppercase tracking-wide text-white/35">Std Dev</div><div className="mt-1 text-3xl font-black text-white">{number(team.scoringVolatility ?? team.pointsForVolatility).toFixed(1)}</div></div>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-white/45"><span>Consistency rank</span><span className="font-black text-white/75">#{report.volatility?.rank || '—'} of {teams.length}</span></div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-[#FF4B1F]" style={{ width: `${Math.max(3, consistencyPercentile)}%` }} /></div>
                  <p className="mt-3 text-xs leading-5 text-white/45">More consistent than <span className="font-black text-[#FF8A6D]">{Math.max(0, consistencyPercentile)}%</span> of league teams. Lower weekly standard deviation earns the stronger grade.</p>
                </div>
              </button>
            </div>

            <div className="px-2 pb-1 text-center text-xs text-white/30">Based on {Number(simulations || 0).toLocaleString()} simulated seasons. Click any graded or statistical card to see the league comparison for that metric.</div>
          </div>
        </div>
      </div>

      {metricKey ? <MetricRankingModal key={metricKey} metricKey={metricKey} selectedRosterId={team.rosterId} data={data} divisionByRosterId={divisionByRosterId} onClose={() => setMetricKey(null)} /> : null}
    </>
  );
}
