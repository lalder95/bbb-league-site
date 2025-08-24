'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import PlayerProfileCard from '../components/PlayerProfileCard';

export default function ContractManagementPage() {
  const { data: session, status } = useSession();

  const [playerContracts, setPlayerContracts] = useState([]);
  const [extensionChoices, setExtensionChoices] = useState({});
  const [pendingExtension, setPendingExtension] = useState(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  const [recentContractChanges, setRecentContractChanges] = useState([]);
  const [capModalInfo, setCapModalInfo] = useState(null);

  // Admin
  const isAdmin = Boolean(
    session?.user?.isAdmin ||
    session?.user?.role === 'admin' ||
    (process.env.NEXT_PUBLIC_ADMIN_EMAIL && session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  );
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedTeamName, setSelectedTeamName] = useState('');

  // Load contracts
  useEffect(() => {
    async function fetchPlayerData() {
      const response = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await response.text();
      const rows = text.split('\n');
      const contracts = [];
      rows.slice(1).forEach(row => {
        const values = row.split(',');
        if (values.length > 38) {
          contracts.push({
            playerId: values[0],
            playerName: values[1],
            position: values[21],
            contractType: values[2],
            status: values[14],
            team: values[33],
            curYear: (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
            year2:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
            year3:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
            year4:  (values[14] === 'Active' || values[14] === 'Future') ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            isDeadCap: !(values[14] === 'Active' || values[14] === 'Future'),
            contractFinalYear: values[5],
            age: values[32],
            ktcValue: values[34] ? parseInt(values[34], 10) : null,
            rfaEligible: values[37],
            franchiseTagEligible: values[38],
          });
        }
      });
      setPlayerContracts(contracts);
    }
    fetchPlayerData();
  }, []);

  // Recent changes
  useEffect(() => {
    async function fetchRecentContractChanges() {
      try {
        const res = await fetch('/api/admin/contract_changes');
        const data = await res.json();
        if (Array.isArray(data)) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const recent = data.filter(
            c =>
              c.change_type === 'extension' &&
              c.playerId &&
              c.timestamp &&
              new Date(c.timestamp) > oneYearAgo
          );
          setRecentContractChanges(recent);
        } else {
          setRecentContractChanges([]);
        }
      } catch {
        setRecentContractChanges([]);
      }
    }
    fetchRecentContractChanges();
  }, [playerContracts]);

  function isExtensionWindowOpen() {
    const now = new Date();
    const year = now.getFullYear();
    const may1 = new Date(year, 4, 1);
    const aug31 = new Date(year, 7, 31);
    return now >= may1 && now <= aug31;
  }
  function roundUp1(num) { return Math.ceil(num * 10) / 10; }

  if (status === 'loading') return null;

  const curYear = new Date().getFullYear();
  const CAP = 300;

  const allTeamNames = Array.from(new Set(playerContracts.filter(p => p.team).map(p => p.team.trim())));
  let myTeamName = '';
  if (session?.user?.name) {
    const nameLower = session.user.name.trim().toLowerCase();
    myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
    if (!myTeamName) myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
  }
  if (!myTeamName) {
    const teamCounts = {};
    playerContracts.forEach(p => {
      if (!p.team) return;
      const t = p.team.trim();
      teamCounts[t] = (teamCounts[t] || 0) + 1;
    });
    myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  const teamNameForUI = (isAdmin && isAdminMode && (selectedTeamName || myTeamName))
    ? (selectedTeamName || myTeamName)
    : myTeamName;

  const myContractsAll = playerContracts.filter(
    p => p.team && p.team.trim().toLowerCase() === teamNameForUI.trim().toLowerCase()
  );

  const yearSalaries = [0, 0, 0, 0];
  const yearDead = [0, 0, 0, 0];

  myContractsAll.forEach(p => {
    if (p.status === 'Active' || p.status === 'Future') {
      yearSalaries[0] += parseFloat(p.curYear) || 0;
      yearSalaries[1] += parseFloat(p.year2) || 0;
      yearSalaries[2] += parseFloat(p.year3) || 0;
      yearSalaries[3] += parseFloat(p.year4) || 0;
    } else {
      yearDead[0] += parseFloat(p.curYear) || 0;
      yearDead[1] += parseFloat(p.year2) || 0;
      yearDead[2] += parseFloat(p.year3) || 0;
      yearDead[3] += parseFloat(p.year4) || 0;
    }
  });

  const playerIdsWithFuture = new Set(
    playerContracts
      .filter(p => p.status === 'Future' && p.team && p.team.trim().toLowerCase() === teamNameForUI.trim().toLowerCase())
      .map(p => p.playerId)
  );

  let eligiblePlayers = myContractsAll.filter(
    p =>
      p.status === 'Active' &&
      String(p.contractType).toLowerCase() === 'base' &&
      String(p.rfaEligible).toLowerCase() !== 'true' &&
      String(p.contractFinalYear) === String(curYear) &&
      !playerIdsWithFuture.has(p.playerId)
  );

  if (recentContractChanges.length > 0) {
    const recentlyExtendedIds = new Set(recentContractChanges.map(c => String(c.playerId).trim()));
    eligiblePlayers = eligiblePlayers.filter(p => !recentlyExtendedIds.has(String(p.playerId).trim()));
  }

  const extensionMap = {};
  eligiblePlayers.forEach(p => {
    const choice = extensionChoices[p.playerId] || { years: 0, deny: false };
    extensionMap[p.playerId] = choice;
  });

  // Simulate cap with current extension choices
  eligiblePlayers.forEach(p => {
    const ext = extensionMap[p.playerId] || { years: 0, deny: false };
    if (ext.deny || !ext.years) return;
    let base = parseFloat(p.curYear) || 0;
    for (let i = 1; i <= ext.years; ++i) {
      base = roundUp1(base * 1.10);
      if (i < 4) {
        yearSalaries[i] += base;
      }
    }
  });

  function openCapModal(yearIdx) {
    const yearMap = [
      { salary: 'curYear', label: 'Current Year' },
      { salary: 'year2', label: 'Year 2' },
      { salary: 'year3', label: 'Year 3' },
      { salary: 'year4', label: 'Year 4' },
    ];
    const { salary, label } = yearMap[yearIdx];

    const players = myContractsAll
      .map(c => {
        const contractSalary = parseFloat(c[salary]) || 0;
        const isDead = !(c.status === 'Active' || c.status === 'Future');
        return { playerName: c.playerName, contractType: c.contractType, salary: contractSalary, status: c.status, isDead };
      })
      .filter(c => c.salary > 0)
      .sort((a, b) => b.salary - a.salary);

    const grouped = players.reduce((acc, p) => {
      if (!acc[p.status]) acc[p.status] = [];
      acc[p.status].push(p);
      return acc;
    }, {});

    const statusOrder = ['Active', 'Future', 'Expired', 'Cut'];
    const orderedGroups = Object.keys(grouped)
      .sort((a, b) => {
        const ai = statusOrder.indexOf(a);
        const bi = statusOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(status => ({ status, players: grouped[status] }));

    setCapModalInfo({ yearIdx, label, groups: orderedGroups, teamNameForUI });
  }

  return (
    <div className="w-full flex flex-col items-center">
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Contract Management</h2>

      {/* Admin Controls */}
      {isAdmin && (
        <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 p-4 mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#FF4B1F]"
                checked={isAdminMode}
                onChange={(e) => setIsAdminMode(e.target.checked)}
              />
              <span className="font-semibold">Admin Mode</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white/60">Acting as team:</span>
              <select
                className="bg-white/10 text-white rounded px-2 py-1 min-w-[200px] disabled:opacity-50"
                disabled={!isAdminMode}
                value={isAdminMode ? (selectedTeamName || myTeamName) : myTeamName}
                onChange={(e) => setSelectedTeamName(e.target.value)}
              >
                {allTeamNames.map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          </div>
          <div className="mt-2 text-xs text-white/60">
            When Admin Mode is enabled, you can select any team and finalize extensions on their behalf.
          </div>
        </div>
      )}

      {/* Cap usage table */}
      <div className="w-full max-w-3xl bg-black/30 rounded-xl border border-white/10 p-8 shadow-lg mb-10">
        <h3 className="text-xl font-bold text-[#FF4B1F] mb-1">Contract Extensions</h3>
        <div className="mb-6 text-white/80 text-base">
          Extend players on expiring base contracts (not entering RFA). Simulate different extension scenarios and see the impact on your cap space.
        </div>
        <div className="mb-4 text-white/70 font-semibold">
          Team: <span className="text-[#1FDDFF]">{teamNameForUI || 'Unknown'}</span>
        </div>

        <div className="mb-8">
          <h4 className="font-semibold text-white mb-2">Simulated Cap Usage</h4>
          <table className="w-full text-center border border-white/10 rounded bg-white/5 mb-2">
            <thead>
              <tr>
                <th className="p-2 text-white/80">Year</th>
                <th className="p-2 text-white/80 border-l border-white/10">Cap Used</th>
                <th className="p-2 text-white/80 border-l border-white/10">Extension Cost</th>
                <th className="p-2 text-white/80 border-l border-white/10">Cap Space</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map(i => {
                let extensionCost = 0;
                eligiblePlayers.forEach(p => {
                  const ext = extensionMap[p.playerId] || { years: 0, deny: false };
                  if (ext.deny || !ext.years) return;
                  let base = parseFloat(p.curYear) || 0;
                  for (let y = 1; y <= ext.years; ++y) {
                    base = roundUp1(base * 1.10);
                    if (i === y) extensionCost += base;
                  }
                });
                const capUsed = yearSalaries[i] + yearDead[i];
                return (
                  <tr key={i} className="cursor-pointer hover:bg-white/10" onClick={() => openCapModal(i)}>
                    <td className="p-2">{curYear + i}</td>
                    <td className="p-2 border-l border-white/10">${capUsed.toFixed(1)}</td>
                    <td className="p-2 border-l border-white/10 text-blue-300 font-semibold">
                      {i === 0 ? '-' : `$${extensionCost.toFixed(1)}`}
                    </td>
                    <td className={`p-2 border-l border-white/10 font-bold ${capUsed > CAP ? 'text-red-400' : 'text-green-400'}`}>
                      {(CAP - capUsed).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-xs text-white/60">Cap limit: ${CAP} per year</div>
        </div>

        {/* Eligible list */}
        <div>
          <h4 className="font-semibold text-white mb-2">Eligible Players</h4>
          {eligiblePlayers.length === 0 ? (
            <div className="text-white/60 italic">No players eligible for extension this year.</div>
          ) : (
            <div className="overflow-x-auto rounded">
              <table className="min-w-[600px] w-full text-sm border border-white/10 rounded bg-white/5">
                <thead>
                  <tr>
                    <th className="p-2 text-white/80">Player</th>
                    <th className="p-2 text-white/80">Current Salary</th>
                    <th className="p-2 text-white/80">Extension</th>
                    <th className="p-2 text-white/80">Simulated Years</th>
                    <th className="p-2 text-white/80"></th>
                  </tr>
                </thead>
                <tbody>
                  {eligiblePlayers.map(player => {
                    const ext = extensionMap[player.playerId] || { years: 0, deny: false };
                    let base = parseFloat(player.curYear) || 0;
                    const simYears = [];
                    let extensionSalaries = [];
                    for (let i = 1; i <= ext.years; ++i) {
                      base = roundUp1(base * 1.10);
                      simYears.push(`Year ${i + 1}: $${base}`);
                      extensionSalaries.push(base);
                    }
                    const showFinalize = !ext.deny && ext.years > 0;
                    return (
                      <tr key={player.playerId}>
                        <td className="p-2 font-semibold text-white flex items-center gap-2">
                          <PlayerProfileCard playerId={player.playerId} expanded={false} className="w-8 h-8 rounded-full overflow-hidden shadow" />
                          {player.playerName}
                        </td>
                        <td className="p-2">${parseFloat(player.curYear).toFixed(1)}</td>
                        <td className="p-2">
                          <select
                            className="bg-white/10 text-white rounded px-2 py-1"
                            value={ext.deny ? 'deny' : ext.years}
                            onChange={e => {
                              const val = e.target.value;
                              setExtensionChoices(prev => ({
                                ...prev,
                                [player.playerId]: val === 'deny'
                                  ? { years: 0, deny: true }
                                  : { years: Number(val), deny: false }
                              }));
                              if (val !== '0' && val !== 'deny') {
                                setPendingExtension({
                                  player,
                                  years: Number(val),
                                  baseSalary: parseFloat(player.curYear),
                                  extensionSalaries,
                                });
                              } else if (pendingExtension && pendingExtension.player.playerId === player.playerId) {
                                setPendingExtension(null);
                              }
                            }}
                          >
                            <option value={0}>No Extension</option>
                            <option value={1}>1 Year</option>
                            <option value={2}>2 Years</option>
                            <option value={3}>3 Years</option>
                            <option value="deny">Deny</option>
                          </select>
                        </td>
                        <td className="p-2">
                          {ext.deny || !ext.years ? (
                            <span className="text-white/60 italic">No extension</span>
                          ) : (
                            <div className="flex flex-col items-start">
                              {simYears.map((s, i) => (<span key={i}>{s}</span>))}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {showFinalize && pendingExtension && pendingExtension.player.playerId === player.playerId && (
                            <button
                              className="px-3 py-1 bg-[#FF4B1F] text-white rounded hover:bg-orange-600 font-semibold"
                              disabled={finalizeLoading || !isExtensionWindowOpen()}
                              onClick={async () => {
                                const confirmMsg = `Are you sure you want to finalize a ${pendingExtension.years} year contract extension for ${player.playerName} (Team: ${teamNameForUI})? This cannot be undone or changed later.`;
                                if (!window.confirm(confirmMsg)) return;

                                setFinalizeLoading(true);
                                setFinalizeMsg('');
                                setFinalizeError('');
                                try {
                                  let base = parseFloat(player.curYear);
                                  const extensionSalaries = [];
                                  for (let i = 1; i <= pendingExtension.years; ++i) {
                                    base = Math.ceil(base * 1.10 * 10) / 10;
                                    extensionSalaries.push(base);
                                  }
                                  const contractChange = {
                                    change_type: 'extension',
                                    user: session?.user?.name || '',
                                    timestamp: new Date().toISOString(),
                                    notes: `Extended ${player.playerName} for ${pendingExtension.years} year(s) at $${extensionSalaries.join(', $')}`,
                                    ai_notes: '',
                                    playerId: player.playerId,
                                    playerName: player.playerName,
                                    years: pendingExtension.years,
                                    extensionSalaries,
                                    team: teamNameForUI,
                                  };

                                  try {
                                    const aiRes = await fetch('/api/ai/transaction_notes', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ contractChange }),
                                    });
                                    const aiData = await aiRes.json();
                                    contractChange.ai_notes = aiData.ai_notes || 'AI summary unavailable.';
                                  } catch {
                                    contractChange.ai_notes = 'AI summary unavailable.';
                                  }

                                  const res = await fetch('/api/admin/contract_changes', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(contractChange),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || 'Failed to save extension');
                                  setFinalizeMsg('Extension finalized and saved!');

                                  const refreshRes = await fetch('/api/admin/contract_changes');
                                  const refreshData = await refreshRes.json();
                                  if (Array.isArray(refreshData)) {
                                    const oneYearAgo = new Date();
                                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                    const recent = refreshData.filter(
                                      c =>
                                        c.change_type === 'extension' &&
                                        c.playerId &&
                                        c.timestamp &&
                                        new Date(c.timestamp) > oneYearAgo
                                    );
                                    setRecentContractChanges(recent);
                                  }

                                  setExtensionChoices(prev => {
                                    const updated = { ...prev };
                                    delete updated[player.playerId];
                                    return updated;
                                  });

                                  setPendingExtension(null);
                                } catch (err) {
                                  setFinalizeError(err.message);
                                } finally {
                                  setFinalizeLoading(false);
                                }
                              }}
                            >
                              {finalizeLoading ? 'Saving...' : 'Finalize Extension'}
                            </button>
                          )}
                          {!isExtensionWindowOpen() && (
                            <div className="mt-2 text-yellow-400 text-sm">
                              Extensions can only be finalized between May 1st and August 31st.
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cap modal */}
      {capModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a2233] rounded-lg shadow-2xl p-6 w-full max-w-md relative max-h-[90vh] overflow-y-auto" tabIndex={-1} role="dialog" aria-modal="true">
            <button
              className="absolute top-2 right-2 text-white hover:text-[#FF4B1F] text-2xl font-bold focus:outline-none"
              onClick={() => setCapModalInfo(null)}
              aria-label="Close"
              tabIndex={0}
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-2 text-[#FF4B1F]">
              {(capModalInfo.teamNameForUI || teamNameForUI)} – {capModalInfo.label} Contracts
            </h2>
            {(!capModalInfo.groups || capModalInfo.groups.length === 0) ? (
              <div className="text-gray-300">No players under contract for this season.</div>
            ) : (
              capModalInfo.groups.map(group => (
                <div key={group.status} className="mb-4">
                  <div className="font-semibold text-lg text-white mb-1">{group.status}</div>
                  <table className="w-full text-sm mb-2">
                    <thead>
                      <tr>
                        <th className="text-left pb-1">Player</th>
                        <th className="text-left pb-1">Type</th>
                        <th className="text-right pb-1">Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.players.map((p, i) => (
                        <tr key={i}>
                          <td className={(p.status === 'Active' || p.status === 'Future') ? 'text-green-300' : 'text-red-300'}>
                            {p.playerName}
                          </td>
                          <td>{p.contractType}</td>
                          <td className="text-right">${p.salary.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
            <div className="flex justify-end mt-4">
              <button className="px-4 py-2 bg-[#FF4B1F] text-white rounded hover:bg-[#ff6a3c] font-semibold" onClick={() => setCapModalInfo(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
