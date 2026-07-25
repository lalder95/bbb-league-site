"use client";
import React, { useEffect, useMemo, useState, useRef } from 'react';
import PlayerProfileCard from '../my-team/components/PlayerProfileCard';
import { useBudgetRatios } from '../providers';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import Image from 'next/image';
import AssistantGMChat from '../my-team/components/AssistantGMChat';
import { useSession } from 'next-auth/react';
import { describeTradeAsset, getAssetBudgetValue, getAssetKey, getDisplayDraftSlot, isDraftPickAsset } from '@/utils/draftPickTradeUtils';

const SUMMARY_TEAM_RADAR_COLORS = [
  '#34d399',
  '#38bdf8',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
  '#f87171',
];

const getBudgetValue = (player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }) => {
  const v = getAssetBudgetValue(player, {
    ktcPerDollar: salaryKtcRatio,
    positionRatios,
    usePositionRatios,
    avgKtcByPosition,
  });
  return Number.isNaN(v) ? 0 : v;
};

const getLongTermBudgetValue = (player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }) => {
  const v = getAssetBudgetValue(player, {
    ktcPerDollar: salaryKtcRatio,
    positionRatios,
    usePositionRatios,
    avgKtcByPosition,
    mode: 'long-term',
  });
  return Number.isNaN(v) ? 0 : v;
};

const getLeagueYearLabel = (baseSeason, yearKey) => {
  const resolvedBaseSeason = Number(baseSeason) || new Date().getFullYear();
  const offsets = {
    curYear: 0,
    year2: 1,
    year3: 2,
    year4: 3,
  };

  return String(resolvedBaseSeason + (offsets[yearKey] || 0));
};

const formatIncomingMetricValue = (value, type) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  if (type === 'currency') return `$${num.toFixed(1)}`;
  if (type === 'age') return num > 0 ? `${num.toFixed(1)}` : '-';
  return Math.round(num).toLocaleString();
};

const INCOMING_METRIC_INFO = {
  ktc: 'Total KTC value of players incoming to this team.',
  bv: 'Year 1 BV for players incoming this season.',
  ltbv: 'Long-Term BV across the full remaining contract.',
  cap: 'Net cap change = incoming cap minus outgoing cap. Lower is better.',
  age: 'Average incoming player age. Younger is better on this chart.',
};

const SHORT_INCOMING_METRIC_LABELS = {
  ktc: 'KTC',
  bv: 'Y1 BV',
  ltbv: 'LT BV',
  cap: 'Net Cap',
  age: 'Age',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const RADAR_VALUE_SCALES = {
  ktc: { min: 0, max: 10000 },
  bv: { min: 0, max: 8000 },
  ltbv: { min: 0, max: 12000 },
  cap: { min: -100, max: 100, invert: true },
  age: { min: 21, max: 35, invert: true },
};

function MetricTick({ x, y, payload, textAnchor, index }) {
  const metricKey = payload?.payload?.key || payload?.value?.toLowerCase?.();
  const tooltip = metricKey ? INCOMING_METRIC_INFO[metricKey] : '';
  const label = payload?.value || '';

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        fill="#ffffff"
        fontSize="12"
        fontWeight="600"
        textAnchor={textAnchor}
        dominantBaseline="central"
        title={tooltip}
      >
        <title>{tooltip}</title>
        {label}
      </text>
    </g>
  );
}

function SummaryIncomingBars({ metricSections }) {
  const [showDetails, setShowDetails] = useState(false);
  const radarTeams = useMemo(() => metricSections[0]?.entries || [], [metricSections]);
  const teamCards = useMemo(() => {
    if (!metricSections.length || !radarTeams.length) return [];

    return radarTeams.map((teamEntry) => ({
      team: teamEntry.team,
      colorClass: teamEntry.colorClass,
      data: metricSections.map((section) => {
        const teamMetric = section.entries.find((entry) => entry.team === teamEntry.team) || section.entries[0];
        const rawValue = Number(teamMetric?.value) || 0;
        const scale = RADAR_VALUE_SCALES[section.key] || { min: 0, max: 100 };
        const span = scale.max - scale.min || 1;
        const normalized = scale.invert
          ? ((scale.max - rawValue) / span) * 100
          : ((rawValue - scale.min) / span) * 100;

        return {
          metric: SHORT_INCOMING_METRIC_LABELS[section.key] || section.label,
          fullLabel: section.label,
          key: section.key,
          value: clamp(normalized, 0, 100),
          rawValue: teamMetric?.formattedValue ?? '-',
        };
      }),
    }));
  }, [metricSections, radarTeams]);

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-white/10 bg-black/20 p-3 md:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-white">Incoming Comparison</div>
          <div className="text-xs text-white/60">Each team gets its own five-point radar so the comparison stays readable.</div>
        </div>
        <button
          onClick={() => setShowDetails((prev) => !prev)}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          type="button"
        >
          {showDetails ? 'Hide Breakdown' : 'Show Breakdown'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {teamCards.map((teamCard, index) => (
          <div key={teamCard.team} className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: SUMMARY_TEAM_RADAR_COLORS[index % SUMMARY_TEAM_RADAR_COLORS.length] }} />
                <div className="truncate text-sm font-bold text-white">{teamCard.team}</div>
              </div>
              <div className="text-xs text-white/55">Five-point profile</div>
            </div>

            <div className="mt-3 h-80 md:h-96">
              <div className="flex h-full w-full flex-col gap-2">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={teamCard.data} outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,0.14)" />
                    <PolarAngleAxis dataKey="metric" tick={(tickProps) => <MetricTick {...tickProps} />} />
                    <PolarRadiusAxis angle={90} domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Radar
                      name={teamCard.team}
                      dataKey="value"
                      stroke={SUMMARY_TEAM_RADAR_COLORS[index % SUMMARY_TEAM_RADAR_COLORS.length]}
                      fill={SUMMARY_TEAM_RADAR_COLORS[index % SUMMARY_TEAM_RADAR_COLORS.length]}
                      fillOpacity={0.16}
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                    />
                  </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {teamCard.data.map((point) => (
                    <div
                      key={`${teamCard.team}-${point.metric}`}
                      className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-2 text-center"
                      title={`${point.fullLabel}: ${point.rawValue}`}
                    >
                      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">{point.metric}</div>
                      <div className="mt-0.5 text-sm font-bold text-white">{point.rawValue}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/65">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">Y1 BV = contract-adjusted value for this season.</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">LT BV = value across the full remaining contract.</span>
            </div>
          </div>
        ))}
      </div>

      {showDetails && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metricSections.map((section) => (
            <div key={`${section.key}-legend`} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold text-white">{section.label}</div>
                <div className="text-xs text-white/55">{section.totalFormatted}</div>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                {section.entries.map((entry, index) => (
                  <div key={`${section.key}-${entry.team}`} className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-2 py-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SUMMARY_TEAM_RADAR_COLORS[index % SUMMARY_TEAM_RADAR_COLORS.length] }} />
                      <span className="truncate text-white">{entry.team}</span>
                    </div>
                    <div className="font-semibold text-white/80">{entry.formattedValue}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TradeSummary = ({
  participants,
  impactsByTeam,
  onClose,
  teamAvatars,
  salaryKtcRatio,
  positionRatios,
  usePositionRatios,
  avgKtcByPosition,
  currentSeason,
  capDisplaySeason,
  hideCapAnalysis = false,
}) => {
  const labelSeason = capDisplaySeason || currentSeason;
  const { data: session } = useSession();
  const [showAssistantGM, setShowAssistantGM] = useState(false);
  const [playerContracts, setPlayerContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [assistantContext, setAssistantContext] = useState('');
  const [autoMessage, setAutoMessage] = useState('');
  const [autoSendTick, setAutoSendTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchPlayerData() {
      try {
        setContractsLoading(true);
        const response = await fetch('/api/contracts/normalized');
        const text = await response.text();
        const rows = text.split('\n').filter(Boolean);
        if (rows.length < 2) {
          if (!cancelled) setPlayerContracts([]);
          return;
        }
        const header = rows[0].split(',').map(h => h.trim());
        const headerMap = {};
        header.forEach((col, idx) => { headerMap[col] = idx; });

        const contracts = [];
        rows.slice(1).forEach((row) => {
          const values = row.split(',');
          if (values.length !== header.length) return;
          const status = values[headerMap["Status"]];
          contracts.push({
            playerId: values[headerMap["Player ID"]],
            playerName: values[headerMap["Player Name"]],
            position: values[headerMap["Position"]],
            contractType: values[headerMap["Contract Type"]],
            status,
            team: values[headerMap["TeamDisplayName"]],
            curYear: (status === 'Active' || status === 'Future')
              ? parseFloat(values[headerMap["Relative Year 1 Salary"]]) || 0
              : parseFloat(values[headerMap["Relative Year 1 Dead"]]) || 0,
            year2: (status === 'Active' || status === 'Future')
              ? parseFloat(values[headerMap["Relative Year 2 Salary"]]) || 0
              : parseFloat(values[headerMap["Relative Year 2 Dead"]]) || 0,
            year3: (status === 'Active' || status === 'Future')
              ? parseFloat(values[headerMap["Relative Year 3 Salary"]]) || 0
              : parseFloat(values[headerMap["Relative Year 3 Dead"]]) || 0,
            year4: (status === 'Active' || status === 'Future')
              ? parseFloat(values[headerMap["Relative Year 4 Salary"]]) || 0
              : parseFloat(values[headerMap["Relative Year 4 Dead"]]) || 0,
            isDeadCap: !(status === 'Active' || status === 'Future'),
            contractFinalYear: values[headerMap["Contract Final Year"]],
            age: values[headerMap["Age"]],
            ktcValue: values[headerMap["Current KTC Value"]] ? parseInt(values[headerMap["Current KTC Value"]], 10) : null,
            rfaEligible: values[headerMap["Will Be RFA?"]],
            franchiseTagEligible: values[headerMap["Franchise Tag Eligible?"]],
          });
        });
        if (!cancelled) setPlayerContracts(contracts);
      } catch (err) {
        if (!cancelled) setPlayerContracts([]);
      } finally {
        if (!cancelled) setContractsLoading(false);
      }
    }
    fetchPlayerData();
    return () => { cancelled = true; };
  }, []);
  // Helper function to format salary value
  const formatSalary = (value) => {
    const num = Number(value);
    if (isNaN(num)) return "$-";
    return `$${num.toFixed(1)}`;
  };

  // Get validation colors for cap space
  const getCapSpaceColor = (value) => {
    if (value < 0) return "text-red-500 font-bold";
    if (value < 50) return "text-[#FF4B1F] font-bold";
    if (value < 100) return "text-yellow-400";
    return "text-green-400";
  };

  // Get position color
  const getPositionColor = (position) => {
    switch (position) {
      case 'QB': return 'bg-red-500';
      case 'RB': return 'bg-blue-500';
      case 'WR': return 'bg-green-500';
      case 'TE': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const calculateTotalValue = (players) => players.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0);
  const calculateTotalKTC = (players) => players.reduce((sum, player) => sum + (parseFloat(player.ktcValue) || 0), 0);

  // Format team names to capitalize first letter
  const formatTeamName = (name) => {
    if (!name) return 'Team';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Responsive check
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // --- Custom trade validation for summary banner (aggregate across teams) ---
  const allTeams = participants.map(p => p.team).filter(Boolean);
  const hasCapIssue = allTeams.some(t => impactsByTeam?.[t]?.after?.curYear?.remaining < 0);
  const hasCapWarning = !hasCapIssue && allTeams.some(t => (
    impactsByTeam?.[t]?.after?.year2?.remaining < 0 ||
    impactsByTeam?.[t]?.after?.year3?.remaining < 0 ||
    impactsByTeam?.[t]?.after?.year4?.remaining < 0 ||
    impactsByTeam?.[t]?.after?.curYear?.remaining < 50
  ));
  const isInvalid = hideCapAnalysis ? false : hasCapIssue;
  const isWarning = hideCapAnalysis ? false : hasCapWarning;

  // Build detailed, specific cap messages for the banner
  const detailedMessages = useMemo(() => {
    const cur = [];
    const future = [];
    const close = [];
    allTeams.forEach(team => {
      const imp = impactsByTeam?.[team];
      if (!imp?.after) return;
      const { curYear, year2, year3, year4 } = imp.after;
      if (curYear.remaining < 0) cur.push({ team, remaining: curYear.remaining });
      const yearsNeg = [];
      if (year2.remaining < 0) yearsNeg.push({ year: getLeagueYearLabel(labelSeason, 'year2'), remaining: year2.remaining });
      if (year3.remaining < 0) yearsNeg.push({ year: getLeagueYearLabel(labelSeason, 'year3'), remaining: year3.remaining });
      if (year4.remaining < 0) yearsNeg.push({ year: getLeagueYearLabel(labelSeason, 'year4'), remaining: year4.remaining });
      if (yearsNeg.length) future.push({ team, years: yearsNeg });
      [
        { y: getLeagueYearLabel(labelSeason, 'curYear'), v: curYear.remaining },
        { y: getLeagueYearLabel(labelSeason, 'year2'), v: year2.remaining },
        { y: getLeagueYearLabel(labelSeason, 'year3'), v: year3.remaining },
        { y: getLeagueYearLabel(labelSeason, 'year4'), v: year4.remaining },
      ].forEach(({ y, v }) => {
        if (v >= 0 && v < 50) close.push({ team, year: y, remaining: v });
      });
    });
    return { cur, future, close };
  }, [allTeams, impactsByTeam, labelSeason]);

  // Helper for bar color
  const getBarColor = (delta) => {
    if (delta > 0) return "bg-green-500";
    if (delta < 0) return "bg-red-500";
    return "bg-gray-400";
  };

  // Helper for bar label
  const formatDelta = (delta) => {
    if (delta > 0) return `+$${Math.abs(delta).toFixed(1)}`;
    if (delta < 0) return `-$${Math.abs(delta).toFixed(1)}`;
    return "$0.0";
  };

  // Helper to safely format cap numbers
  const safeCap = (val) => (typeof val === "number" && !isNaN(val) ? val.toFixed(1) : "-");

  // Only show Remaining in the summary
  const CapBreakdown = ({ cap }) => (
    <div className="text-xs text-white/70 mt-1">
      <div className="font-bold">Remaining: ${safeCap(cap?.remaining)}</div>
    </div>
  );

  // Helper to build chart data
  const buildCapChartData = (impact) => [
    { year: getLeagueYearLabel(labelSeason, 'curYear'), value: impact.after.curYear.remaining },
    { year: getLeagueYearLabel(labelSeason, 'year2'), value: impact.after.year2.remaining },
    { year: getLeagueYearLabel(labelSeason, 'year3'), value: impact.after.year3.remaining },
    { year: getLeagueYearLabel(labelSeason, 'year4'), value: impact.after.year4.remaining },
  ];

  // Build received players per team
  const buildReceivedFor = (teamName) => {
    const received = [];
    const teams = participants.map(pp => pp.team).filter(Boolean);
    const unique = [...new Set(teams)];
    const isTwoTeam = unique.length === 2;
    participants.forEach(p => {
      p.selectedPlayers.forEach(sp => {
        let dest = sp.toTeam;
        if (!dest && isTwoTeam && p.team) {
          dest = unique.find(t => t !== p.team);
        }
        if (dest === teamName) received.push(sp);
      });
    });
    return received;
  };

  // Build outgoing players per team
  const buildOutgoingFor = (teamName) => {
    const p = participants.find(pp => pp.team === teamName);
    return p ? p.selectedPlayers : [];
  };

  const incomingMetricSections = useMemo(() => {
    const teams = [...new Set(participants.map((p) => p.team).filter(Boolean))];
    const eligibleToShow = teams.length >= 2 && participants.filter((p) => p.team).every((p) => p.selectedPlayers.length > 0);
    if (!eligibleToShow) return [];

    const metricConfigs = [
      {
        key: 'ktc',
        label: 'Total Incoming (KTC)',
        type: 'integer',
        getValue: (team) => {
          const received = buildReceivedFor(team);
          const incoming = received.reduce((sum, player) => sum + (parseFloat(player.ktcValue) || 0), 0);
          return incoming;
        },
      },
      {
        key: 'bv',
        label: 'Total Incoming (Year 1 BV)',
        type: 'integer',
        getValue: (team) => {
          const received = buildReceivedFor(team);
          const incoming = received.reduce((sum, player) => sum + getBudgetValue(player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
          return incoming;
        },
      },
      {
        key: 'ltbv',
        label: 'Total Incoming (Long-Term BV)',
        type: 'integer',
        getValue: (team) => {
          const received = buildReceivedFor(team);
          const incoming = received.reduce((sum, player) => sum + getLongTermBudgetValue(player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
          return incoming;
        },
      },
      {
        key: 'cap',
        label: 'Net Cap Change',
        type: 'currency',
        getValue: (team) => {
          const received = buildReceivedFor(team);
          const outgoing = buildOutgoingFor(team);
          const incoming = received.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0);
          const outgoingCap = outgoing.reduce((sum, player) => sum + (parseFloat(player.curYear) || 0), 0);
          return incoming - outgoingCap;
        },
      },
      {
        key: 'age',
        label: 'Average Age Incoming',
        type: 'age',
        getValue: (team) => {
          const received = buildReceivedFor(team);
          const ageEligiblePlayers = received.filter((player) => Number.isFinite(parseFloat(player.age)) && parseFloat(player.age) > 0);
          if (!ageEligiblePlayers.length) return 0;
          const totalAge = ageEligiblePlayers.reduce((sum, player) => sum + (parseFloat(player.age) || 0), 0);
          return totalAge / ageEligiblePlayers.length;
        },
      },
    ];

    return metricConfigs.map((metric) => {
      const baseEntries = teams.map((team, index) => {
        const value = metric.getValue(team);
        return {
          team,
          value,
          formattedValue: formatIncomingMetricValue(value, metric.type),
          colorClass: SUMMARY_TEAM_RADAR_COLORS[index % SUMMARY_TEAM_RADAR_COLORS.length],
        };
      });

      const net = baseEntries.reduce((sum, entry) => sum + (Number.isFinite(entry.value) ? entry.value : 0), 0);
      const positiveTotal = baseEntries.reduce((sum, entry) => sum + (entry.value > 0 ? entry.value : 0), 0);
      const negativeTotal = baseEntries.reduce((sum, entry) => sum + (entry.value < 0 ? Math.abs(entry.value) : 0), 0);
      const fallbackPercent = baseEntries.length ? 100 / baseEntries.length : 0;
      const positiveSpace = negativeTotal > 0 ? 50 : 100;
      const negativeSpace = positiveTotal > 0 ? 50 : 100;

      const buildSegments = (entries, total, widthSpace) => {
        let offset = 0;
        return entries
          .slice()
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          .map((entry) => {
            const width = total > 0 ? (Math.abs(entry.value) / total) * widthSpace : (entries.length ? widthSpace / entries.length : 0);
            const segment = { ...entry, width, offset };
            offset += width;
            return segment;
          });
      };

      const positiveEntries = baseEntries.filter((entry) => entry.value >= 0);
      const negativeEntries = baseEntries.filter((entry) => entry.value < 0);
      const positiveSegments = buildSegments(positiveEntries, positiveTotal, positiveSpace);
      const negativeSegments = buildSegments(negativeEntries, negativeTotal, negativeSpace);

      return {
        key: metric.key,
        label: metric.label,
        totalFormatted: formatIncomingMetricValue(net || (metric.type === 'age' ? 0 : net), metric.type),
        netFormatted: formatIncomingMetricValue(net, metric.type),
        positiveTotal,
        negativeTotal,
        hasBothSides: positiveEntries.length > 0 && negativeEntries.length > 0,
        positiveSegments,
        negativeSegments,
        entries: baseEntries.map((entry) => ({
          ...entry,
          side: entry.value < 0 ? 'negative' : 'positive',
          sharePercent: entry.value < 0
            ? (negativeTotal > 0 ? ((Math.abs(entry.value) / negativeTotal) * 100) : fallbackPercent)
            : (positiveTotal > 0 ? ((entry.value / positiveTotal) * 100) : fallbackPercent),
        })),
      };
    });
  }, [participants, salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition]);

  // Compose a concise auto message summarizing the trade
  const composeTradeSummaryContext = () => {
    const teams = participants.map(p => p.team).filter(Boolean);
    if (!teams.length) return '';
    const parts = [];
    teams.forEach(team => {
      const outgoing = buildOutgoingFor(team);
      const incoming = buildReceivedFor(team);
      const impact = impactsByTeam?.[team];
      const outNames = outgoing.map((o) => describeTradeAsset(o)).join(', ') || 'None';
      const inNames = incoming.map((i) => describeTradeAsset(i)).join(', ') || 'None';
      const yr = impact?.after?.curYear?.remaining;
      const y2 = impact?.after?.year2?.remaining;
      const y3 = impact?.after?.year3?.remaining;
      const y4 = impact?.after?.year4?.remaining;
      const capStr = (yr!=null && y2!=null && y3!=null && y4!=null)
        ? `Cap remaining after trade: ${getLeagueYearLabel(labelSeason, 'curYear')} $${Number(yr).toFixed(1)}, ${getLeagueYearLabel(labelSeason, 'year2')} $${Number(y2).toFixed(1)}, ${getLeagueYearLabel(labelSeason, 'year3')} $${Number(y3).toFixed(1)}, ${getLeagueYearLabel(labelSeason, 'year4')} $${Number(y4).toFixed(1)}`
        : 'Cap remaining after trade: n/a';
      // Build full roster line from playerContracts
      const rosterPlayers = playerContracts
        .filter(p => (p.status === 'Active' || p.status === 'Future') && (p.team || '').trim().toLowerCase() === (team || '').trim().toLowerCase())
        .sort((a,b) => (parseFloat(b.curYear)||0) - (parseFloat(a.curYear)||0));
      const rosterStr = rosterPlayers.map(p => `${p.playerName} (${p.position}, $${Number(p.curYear||0).toFixed(1)})`).join(', ') || 'None';
      parts.push(`- ${team}:\n  Sends: ${outNames}\n  Receives: ${inNames}\n  ${capStr}\n  Full Roster: ${rosterStr}`);
    });
    return `Trade summary context for the current deal. Use this as background context for the conversation. When answering follow-up questions, prioritize the user's latest message and do not repeat a full trade evaluation unless they ask for it explicitly.\n\nFor each involved team, consider KTC values, contract cost, cap impact, and roster composition. Here are the details by team:\n\n${parts.join('\n\n')}`;
  };

  const composeInitialTradeSummaryQuestion = () => {
    const teams = participants.map((p) => p.team).filter(Boolean);
    if (!teams.length) return '';
    return `Evaluate this proposed multi-team trade using the provided trade context. Reply using ONLY this structure (no preamble):\n1. Summary — 1–2 sentences\n2. Value delta by team — bullet per team with KTC vs contract takeaways\n3. Cap impact risks — bullets for any years or teams near or below $0 remaining\n4. Roster fit notes — short bullets by position if relevant\n5. Recommendation — Accept / Decline / Counter (bold one) + 1–2 bullets why\n6. Next actions — up to 3 terse bullets`;
  };

  // When opening Assistant GM, auto-compose and send the initial message
  useEffect(() => {
    if (!showAssistantGM) return;
    const context = composeTradeSummaryContext();
    const msg = composeInitialTradeSummaryQuestion();
    if (context) {
      setAssistantContext(context);
    }
    if (msg) {
      setAutoMessage(msg);
      setAutoSendTick(t => t + 1);
    }
  }, [showAssistantGM]);

  // Consume global ratios for fallback
  const ratiosCtx = useBudgetRatios?.() || {};
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-2 md:px-4">
      <div className="relative bg-[#001A2B] border border-white/10 rounded-lg max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10">
          <h2 className={`${isMobile ? "text-xl" : "text-2xl"} font-bold text-[#FF4B1F]`}>Trade Summary</h2>
          <p className="text-white/70 text-sm mt-1">
            Review the details of this trade before finalizing
          </p>
        </div>

        {!hideCapAnalysis && (
          <div className={`px-4 py-3 ${
            isInvalid ? 'bg-red-500/20 border-b border-red-500/50' :
            isWarning ? 'bg-yellow-500/20 border-b border-yellow-500/50' :
            'bg-green-500/20 border-b border-green-500/50'
          }`}>
            <div className="font-bold flex items-center mb-1">
              {isInvalid ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cap issues detected
                </>
              ) : isWarning ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Near cap threshold
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  All teams remain under the cap
                </>
              )}
            </div>
            {(isInvalid || isWarning) && (
              <div className="text-sm text-white/80 space-y-1">
                {detailedMessages.cur.length > 0 && (
                  <div>
                    Current year over cap: {detailedMessages.cur.map(d => `${d.team} ($${Math.abs(d.remaining).toFixed(1)} over)`).join(', ')}
                  </div>
                )}
                {detailedMessages.future.length > 0 && (
                  <div>
                    Future years over cap: {detailedMessages.future.map(d => `${d.team} (${d.years.map(y => `${y.year} -$${Math.abs(y.remaining).toFixed(1)}`).join(', ')})`).join('; ')}
                  </div>
                )}
                {detailedMessages.close.length > 0 && (
                  <div>
                    Close to cap (&lt;$50 remaining): {(() => {
                      const byTeam = detailedMessages.close.reduce((acc, c) => {
                        acc[c.team] = acc[c.team] || [];
                        acc[c.team].push(c);
                        return acc;
                      }, {});
                      return Object.entries(byTeam).map(([team, arr]) => `${team} (${arr.map(a => `${a.year} $${a.remaining.toFixed(1)}`).join(', ')})`).join('; ');
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trade Content */}
        <div className={`p-3 md:p-6`}>
          {/* Combined Trade Totals */}
          {(() => {
            const teams = participants.map(p => p.team).filter(Boolean);
            const uniqueTeams = [...new Set(teams)];
            // Build all incoming across teams
            const allIncoming = uniqueTeams.flatMap(t => {
              const isTwoTeam = uniqueTeams.length === 2;
              const received = [];
              participants.forEach(p => {
                p.selectedPlayers.forEach(sp => {
                  let dest = sp.toTeam;
                  if (!dest && isTwoTeam && p.team) {
                    dest = uniqueTeams.find(x => x !== p.team);
                  }
                  if (dest === t) received.push(sp);
                });
              });
              return received;
            });
            const totalSalary = allIncoming.reduce((s, p) => s + (parseFloat(p.curYear) || 0), 0);
            const totalKtc = allIncoming.reduce((s, p) => s + (parseFloat(p.ktcValue) || 0), 0);
            const totalYear1Value = (() => {
              const perSum = allIncoming.reduce((sum, p) => sum + getBudgetValue(p, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
              return Math.round(perSum);
            })();
            const totalLongTermValue = (() => {
              const perSum = allIncoming.reduce((sum, p) => sum + getLongTermBudgetValue(p, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
              return Math.round(perSum);
            })();
            return (
              <div className="mb-4 bg-black/20 border border-white/10 rounded p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Combined Trade Totals</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between text-sm">
                  <div className="text-white/80">KTC: {Math.round(totalKtc)}</div>
                  <div className="text-white/80">Salary: ${totalSalary.toFixed(1)}</div>
                  <div className="text-white/90">Year 1 BV: {totalYear1Value}</div>
                  <div className="text-white/90">Long-Term BV: {totalLongTermValue}</div>
                </div>
              </div>
            );
          })()}

          {incomingMetricSections.length > 0 && (
            <SummaryIncomingBars metricSections={incomingMetricSections} />
          )}

          <div className={`grid ${isMobile ? "grid-cols-1 gap-4" : "grid-cols-2 gap-6"}`}>
            {participants.filter(p => p.team).map((p, idx) => {
              const received = buildReceivedFor(p.team);
              const capImpact = impactsByTeam?.[p.team];
              const totalCap = calculateTotalValue(received);
              const totalKTC = calculateTotalKTC(received);
              const totalYear1Value = (() => {
                const perSum = received.reduce((sum, pl) => sum + getBudgetValue(pl, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
                return Math.round(perSum);
              })();
              const totalLongTermValue = (() => {
                const perSum = received.reduce((sum, pl) => sum + getLongTermBudgetValue(pl, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }), 0);
                return Math.round(perSum);
              })();
              return (
                <div key={p.team + idx} className="bg-black/30 rounded-lg border border-white/10 p-3 md:p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#FF4B1F]/20 flex items-center justify-center text-lg md:text-xl font-bold">
                      {formatTeamName(p.team)?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-base md:text-lg">{formatTeamName(p.team)} Receives</h3>
                      <p className="text-white/70 text-xs md:text-sm">
                        {received.length} asset{received.length !== 1 ? 's' : ''} • ${totalCap.toFixed(1)} current cap value • KTC: {totalKTC ? totalKTC.toFixed(0) : 0}
                      </p>
                      <div className="text-white/90 text-xs md:text-sm font-bold flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Year 1 BV: {totalYear1Value}</span>
                        <span>Long-Term BV: {totalLongTermValue}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cap Space Impact */}
                  {!hideCapAnalysis && capImpact && (
                    <div>
                      <h4 className="font-semibold text-xs md:text-sm border-b border-white/10 pb-1 mb-2">Cap Space After Trade</h4>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart
                          data={buildCapChartData(capImpact)}
                          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="year" tick={{ fill: "#fff", fontSize: 12 }} />
                          <YAxis 
                            domain={[-100, 300]}
                            tick={{ fill: "#fff", fontSize: 12 }} 
                            ticks={[-100, -75, -50, -25, 0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300]}
                            tickFormatter={v => Math.round(v)}
                          />
                          <Tooltip
                            formatter={(value) => `$${Number(value).toFixed(1)}`}
                            labelStyle={{ color: "#fff" }}
                            contentStyle={{ background: "#001A2B", border: "1px solid #334155" }}
                          />
                          <ReferenceLine 
                            y={0} 
                            stroke="#FF4B1F" 
                            strokeDasharray="4 2" 
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#38bdf8"
                            strokeWidth={3}
                            dot={({ cx, cy, value, index }) => (
                              <circle
                                key={`dot-${cx}-${cy}-${index}`}
                                cx={cx}
                                cy={cy}
                                r={6}
                                fill={value < 0 ? "#ef4444" : "#38bdf8"}
                                stroke="#fff"
                                strokeWidth={2}
                              />
                            )}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Assets received */}
                  <div className="space-y-2 mb-4 md:mb-6 mt-6">
                    {received.length > 0 ? (
                      received.map((player, index) => (
                        <div
                          key={`${getAssetKey(player)}-${index}`}
                          className="bg-black/20 rounded p-2 md:p-3 flex flex-row items-center gap-4"
                        >
                          <div className="flex items-center justify-center" style={{ width: 72, height: 72, minWidth: 72, minHeight: 72 }}>
                            {isDraftPickAsset(player) ? (
                              <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-violet-500/15 text-center">
                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100">Pick</div>
                                <div className="mt-1 text-2xl font-black leading-none text-white">R{player.round}</div>
                                <div className="mt-1 text-[11px] font-semibold text-white/70">{player.pickBucketLabel}</div>
                              </div>
                            ) : (
                              <PlayerProfileCard
                                playerId={player.id}
                                imageExtension="png"
                                expanded={false}
                                avatarOnly
                                className="w-20 h-20 object-contain"
                                ktcPerDollar={salaryKtcRatio ?? ratiosCtx.ktcPerDollar}
                                usePositionRatios={usePositionRatios ?? ratiosCtx.usePositionRatios}
                                positionRatios={positionRatios ?? ratiosCtx.positionRatios}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-base text-white truncate">{player.playerName}</div>
                            <div className="flex flex-row flex-wrap items-center gap-3 mt-1 text-sm">
                              <span className="text-white/80 font-semibold">{isDraftPickAsset(player) ? (getDisplayDraftSlot(player) || player.pickBucketLabel || 'PICK') : player.position}</span>
                              <span className="text-white/80 font-semibold">${isDraftPickAsset(player) ? Number(player.pickSalary || 0).toFixed(1) : (player.curYear ? Number(player.curYear).toFixed(1) : "-")}</span>
                              <span className="text-white/80 font-semibold">{player.contractType}</span>
                            </div>
                            <div className="mt-1 text-sm">
                              <span className="text-white/80 font-semibold">{isDraftPickAsset(player) ? `Original: ${player.originalTeam || '-'}` : player.team}</span>
                            </div>
                            <div className="mt-2 flex flex-col gap-1">
                              {!isDraftPickAsset(player) && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs md:text-sm font-semibold bg-white/10 text-white">
                                  <span className="text-white/60 mr-1">Age:</span>
                                  {player.age || "-"}
                                </span>
                              )}
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs md:text-sm font-semibold bg-white/10 text-white">
                                <span className="text-white/60 mr-1">KTC:</span>
                                {player.ktcValue ? player.ktcValue : "-"}
                              </span>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs md:text-sm font-semibold bg-white/10 text-white">
                                <span className="text-white/60 mr-1">Year 1 BV:</span>
                                {getBudgetValue(player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }) || '-'}
                              </span>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs md:text-sm font-semibold bg-white/10 text-white">
                                <span className="text-white/60 mr-1">Long-Term BV:</span>
                                {getLongTermBudgetValue(player, { salaryKtcRatio, positionRatios, usePositionRatios, avgKtcByPosition }) || '-'}
                              </span>
                              {isDraftPickAsset(player) && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs md:text-sm font-semibold bg-white/10 text-white">
                                  <span className="text-white/60 mr-1">Cap:</span>
                                  ${Number(player.pickSalary || 0).toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-green-400 font-bold ml-4 text-lg">${Number(isDraftPickAsset(player) ? (player.pickSalary || 0) : (player.curYear || 0)).toFixed(1)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-2 text-white/50 italic">No assets in this trade</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assistant GM Feedback */}
          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Assistant GM Feedback</h3>
              <button
                onClick={() => setShowAssistantGM(prev => !prev)}
                className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20"
              >
                {showAssistantGM ? 'Hide Chat' : 'Ask Assistant GM'}
              </button>
            </div>
            {showAssistantGM && (
              <div className="mt-4">
                <AssistantGMChat
                  id="assistant-gm-chat-in-trade-summary"
                  teamState={"Compete"}
                  assetPriority={["QB","RB","WR","TE","Picks"]}
                  strategyNotes={"Evaluate this proposed trade. Focus on KTC vs contracts and cap impact shown above."}
                  myContracts={[]}
                  playerContracts={playerContracts}
                  session={session}
                  tradedPicks={[]}
                  rosters={[]}
                  users={[]}
                  myDraftPicksList={[]}
                  leagueWeek={null}
                  leagueYear={currentSeason || null}
                  activeTab="Assistant GM"
                  supplementalSystemPrompt={assistantContext}
                  autoMessage={autoMessage}
                  autoSendTrigger={autoSendTick}
                  autoStartNewConversation={true}
                />
              </div>
            )}
          </div>

          {/* Footer with legend and buttons */}
          <div className={`mt-4 md:mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 sticky bottom-0 bg-[#001A2B] py-3`}>
            <div className="text-xs text-white/70 flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-500 mr-1 rounded-full"></div>
                <span>QB</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 mr-1 rounded-full"></div>
                <span>RB</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 mr-1 rounded-full"></div>
                <span>WR</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 mr-1 rounded-full"></div>
                <span>TE</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              {isInvalid && (
                <button 
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
                >
                  Invalid Trade
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          {/* Extra padding for mobile to ensure button is accessible */}
          <div className="h-8 md:h-0" />
        </div>
      </div>
    </div>
  );
};

export default TradeSummary;