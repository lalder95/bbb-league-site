'use client';

const DEFAULT_YEAR_KEYS = ['curYear', 'year2', 'year3', 'year4'];

function formatValue(formatCapSpace, value) {
  if (typeof formatCapSpace === 'function') {
    return formatCapSpace(value);
  }

  return `$${Number(value || 0).toFixed(1)}`;
}

function TimelineCell({ amount, color }) {
  const value = Number(amount) || 0;

  return (
    <div
      className="relative flex h-12 items-center overflow-hidden rounded-2xl border border-white/10 px-3 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{
        backgroundColor: value > 0 ? `${color}26` : 'rgba(255,255,255,0.03)',
        borderColor: value > 0 ? `${color}55` : 'rgba(255,255,255,0.10)',
      }}
    >
      {value > 0 ? (
        <div
          className="absolute inset-y-0 left-0 rounded-2xl"
          style={{
            width: '100%',
            background: `linear-gradient(90deg, ${color}D9 0%, ${color}CC 100%)`,
          }}
        />
      ) : null}
      <div className="relative z-10 flex w-full items-center justify-center text-sm font-black">
        {value > 0 ? <span className="text-white">{formatValue(null, value)}</span> : <span className="text-white/20">--</span>}
      </div>
    </div>
  );
}

function TimelineRow({ row, yearKeys, color, isDraftPick = false }) {
  const title = isDraftPick
    ? row.displayLabel || row.pickNumber || 'Draft Pick'
    : row.playerName;

  return (
    <div className="grid grid-cols-[minmax(220px,1.3fr)_repeat(4,minmax(110px,1fr))] gap-2">
      <div className="flex min-h-12 items-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="truncate text-sm font-bold text-white">{title}</div>
        </div>
      </div>

      {yearKeys.map((yearKey) => (
        <TimelineCell
          key={yearKey}
          amount={row.yearAmounts?.[yearKey]}
          color={color}
        />
      ))}
    </div>
  );
}

function SectionBlock({ title, color, rows, yearKeys, emptyLabel, isDraftPick = false }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#071826] shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-2 border-b border-white/8 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <div className="text-lg font-black text-white">{title}</div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">{rows.length} row{rows.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 p-4 sm:p-5">
        {rows.length > 0 ? (
          rows.map((row) => (
            <TimelineRow
                key={isDraftPick ? `${row.pickNumber}-${row.round}-${row.originalOwner}` : `${row.playerName}-${row.position}-${row.status}`}
              row={row}
              yearKeys={yearKeys}
              color={color}
              isDraftPick={isDraftPick}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-6 text-sm text-white/45">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}

export default function TeamTimelineModal({
  isOpen,
  teamName,
  yearLabels = [],
  positionGroups = [],
  draftPickRows = [],
  colorMap = {},
  onClose,
}) {
  if (!isOpen) return null;

  const yearKeys = DEFAULT_YEAR_KEYS.slice(0, yearLabels.length || DEFAULT_YEAR_KEYS.length);
  const legendItems = [
    ...positionGroups
      .filter((group) => group.key !== 'Other' || (group.rows || []).length > 0)
      .map((group) => ({ key: group.key, label: group.label, color: group.color || colorMap[group.key] })),
    { key: 'Draft Pick', label: 'Draft Pick', color: colorMap['Draft Pick'] || '#fbbf24' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000814]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#031b2c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,75,31,0.16),rgba(255,255,255,0.02))] px-5 py-4 md:px-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFB087]">Salary Cap Timeline</div>
            <h2 className="mt-1 text-2xl font-black text-white md:text-3xl">{teamName}</h2>
            <p className="mt-1 text-sm text-white/55">Commitments across future years, grouped by position and draft picks.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={`Close ${teamName} timeline`}
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            {legendItems.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[940px] space-y-4">
              <div className="grid grid-cols-[minmax(220px,1.3fr)_repeat(4,minmax(110px,1fr))] gap-2">
                <div className="px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-white/35">Position / Player</div>
                {yearLabels.map((yearLabel) => (
                  <div key={yearLabel} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-center text-sm font-black text-white">
                    {yearLabel}
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {positionGroups
                  .filter((group) => group.key !== 'Other' || (group.rows || []).length > 0)
                  .map((group) => (
                    <SectionBlock
                      key={group.key}
                      title={group.label}
                      color={group.color || colorMap[group.key] || '#ffffff'}
                      rows={group.rows || []}
                      yearKeys={yearKeys}
                      emptyLabel={`No ${group.label} contracts on this roster.`}
                    />
                  ))}

                <SectionBlock
                  title="Draft Pick"
                  color={colorMap['Draft Pick'] || '#fbbf24'}
                  rows={draftPickRows || []}
                  yearKeys={yearKeys}
                  emptyLabel="No rookie pick obligations currently tracked for this team."
                  isDraftPick
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
