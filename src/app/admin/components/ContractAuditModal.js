'use client';

export default function ContractAuditModal({ isOpen, onClose, onRefresh, loading, error, auditData }) {
  if (!isOpen) return null;

  const issues = Array.isArray(auditData?.issues) ? auditData.issues : [];
  const teamSummaries = Array.isArray(auditData?.issuesByTeam) ? auditData.issuesByTeam : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="sticky top-0 z-10 bg-[#001A2B] border-b border-white/10 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#FF4B1F]">Contract Audit</h2>
            <p className="text-sm text-white/70 mt-1">
              Rostered players without an active contract on their owning team for {auditData?.contractYear || 'the current season'}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-2 rounded-md border border-white/15 bg-black/20 text-sm text-white hover:bg-black/30 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white text-2xl leading-none px-2"
              aria-label="Close contract audit"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(90vh-81px)] space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-black/20 border border-white/10 rounded-lg p-4">
              <div className="text-sm text-white/60">Issue Count</div>
              <div className="text-2xl font-bold text-white mt-1">{auditData?.issueCount ?? 0}</div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-4">
              <div className="text-sm text-white/60">Contract Year</div>
              <div className="text-2xl font-bold text-white mt-1">{auditData?.contractYear ?? '—'}</div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-4">
              <div className="text-sm text-white/60">League Season</div>
              <div className="text-2xl font-bold text-white mt-1">{auditData?.leagueSeason ?? '—'}</div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-4">
              <div className="text-sm text-white/60">Generated</div>
              <div className="text-sm font-semibold text-white mt-2">
                {auditData?.generatedAt ? new Date(auditData.generatedAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {loading && !auditData ? (
            <div className="bg-black/20 border border-white/10 rounded-lg p-6 text-white/70">Loading contract audit…</div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-4 text-red-200">{error}</div>
          ) : (
            <>
              {teamSummaries.length > 0 && (
                <div className="bg-black/20 border border-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-3">Issues by Team</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {teamSummaries.map((team) => (
                      <div key={team.teamName} className="bg-black/10 border border-white/10 rounded px-3 py-2 flex items-center justify-between">
                        <span className="text-white/80 truncate pr-3">{team.teamName}</span>
                        <span className="font-bold text-[#FF4B1F]">{team.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {issues.length === 0 ? (
                <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-6 text-green-200">
                  No rostered players are missing an active contract for the current season.
                </div>
              ) : (
                <div className="bg-black/20 border border-white/10 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-black/30">
                        <tr className="border-b border-white/10 text-white/80">
                          <th className="text-left px-4 py-3">Player</th>
                          <th className="text-left px-4 py-3">Owner Team</th>
                          <th className="text-left px-4 py-3">Issue</th>
                          <th className="text-left px-4 py-3">Contract Rows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issues.map((issue) => (
                          <tr key={`${issue.playerId}-${issue.ownerTeam}`} className="border-b border-white/5 align-top hover:bg-white/5">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white">{issue.playerName}</div>
                              <div className="text-xs text-white/60 mt-1">
                                {issue.position || '—'}{issue.nflTeam ? ` • ${issue.nflTeam}` : ''} • ID {issue.playerId}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-white/85">{issue.ownerTeam}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[#FF4B1F]">{issue.issueLabel}</div>
                              <div className="text-white/70 mt-1">{issue.issueDetail}</div>
                            </td>
                            <td className="px-4 py-3 text-white/70">{issue.contractSummary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}