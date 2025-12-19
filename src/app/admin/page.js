'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Use the same name matching logic as PlayerProfileCard (Player Contracts page)
function getImageFilename(playerName) {
  // Remove punctuation, replace spaces with underscores, lowercase, remove apostrophes, periods, etc.
  return playerName
    .replace(/[.'’]/g, "") // Remove periods and apostrophes
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect if not admin
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [session, status, router]);

  const [missingImages, setMissingImages] = useState([]);
  const [loadingMissing, setLoadingMissing] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "playerName", direction: "asc" });
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);
  const [progressText, setProgressText] = useState("");
  const [poolPreview, setPoolPreview] = useState(null);
  const [orderPreview, setOrderPreview] = useState(null);
  const [approvedPool, setApprovedPool] = useState(false);
  const [approvedOrder, setApprovedOrder] = useState(false);
  const [draftTitle, setDraftTitle] = useState('BBB AI Mock Draft');
  const [draftDescription, setDraftDescription] = useState('AI-generated multi-round mock draft with per-pick reasoning.');
  const [progressKey, setProgressKey] = useState(null);
  const [progressPollId, setProgressPollId] = useState(null);
  const [rounds, setRounds] = useState(7);
  // No external URL needed anymore; we scrape internally

  async function safeReadJson(res) {
    try {
      return await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      const preview = text ? text.slice(0, 280) : '';
      throw new Error(
        `Non-JSON response from ${res.url || 'request'} (HTTP ${res.status}). ${preview}`
      );
    }
  }

  useEffect(() => {
    async function fetchMissing() {
      setLoadingMissing(true);

      // 1. Fetch contracts CSV from GitHub
      const csvUrl = "https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv";
      const csvRes = await fetch(csvUrl);
      const csvText = await csvRes.text();

      // 2. Fetch image index (array of objects with filename)
      const imgRes = await fetch("/players/cardimages/index.json");
      const imageFiles = await imgRes.json();

      // Build a Set of normalized player names from image filenames (before the last underscore)
      const imageNameSet = new Set(
        imageFiles.map(img => {
          // Remove the trailing unique hash after the last underscore
          // e.g. "josh_allen_qqfqyc" -> "josh_allen"
          const base = img.filename.replace(/_[^_]+$/, "");
          return base;
        })
      );

      // 3. Find active contracts missing an image
      const rows = csvText.split('\n');
      if (rows.length && !rows[rows.length - 1].trim()) rows.pop();

      const missing = rows.slice(1)
        .filter(row => row.trim())
        .map(row => row.split(','))
        .filter(values => values[1] && values[14] === "Active")
        .filter(values => {
          const imgBase = getImageFilename(values[1]);
          // Only compare the normalized name (no hash)
          return !imageNameSet.has(imgBase);
        })
        .map(values => ({
          playerName: values[1],
          team: values[33],
          position: values[21],
          salary: values[15] && !isNaN(values[15]) ? parseFloat(values[15]) : "",
          ktc: values[34] && !isNaN(values[34]) ? parseFloat(values[34]) : "",
        }));

      setMissingImages(missing);
      setLoadingMissing(false);
    }
    fetchMissing();
  }, []);

  // Sorting logic
  const sortedImages = [...missingImages].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue = a[key] ?? "";
    let bValue = b[key] ?? "";
    if (key === "salary" || key === "ktc") { // <-- Add "ktc" here
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    } else {
      aValue = aValue.toString().toLowerCase();
      bValue = bValue.toString().toLowerCase();
    }
    if (aValue < bValue) return direction === "asc" ? -1 : 1;
    if (aValue > bValue) return direction === "asc" ? 1 : -1;
    return 0;
  });

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  async function handleApproveAndRun() {
    try {
      if (!approvedPool || !approvedOrder) {
        setGenError('Please approve both the player pool and the draft order to proceed.');
        return;
      }
      setGenError(null);
      setGenerating(true);
      // Create a progress key and start polling
      const key = Math.random().toString(36).slice(2);
      setProgressKey(key);
      setProgressText('Generating AI mock draft...');
      const pollId = setInterval(async () => {
        try {
          const res = await fetch(`/api/admin/mock-drafts/progress?key=${key}`, { cache: 'no-store' });
          const json = await res.json();
          if (json?.ok) {
            const msg = json.message || 'Generating AI mock draft...';
            const pickSuffix = json.currentPickNumber ? ` (Pick ${json.currentPickNumber})` : '';
            setProgressText(`${msg}${pickSuffix}`);
            if (json.status === 'done') {
              clearInterval(pollId);
              setProgressPollId(null);
            }
          }
        } catch {}
      }, 750);
      setProgressPollId(pollId);
      const res = await fetch('/api/admin/mock-drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds, maxPicks: rounds * 12, trace: true, dryRun: false, model: 'gpt-4o-mini', title: draftTitle, description: draftDescription, progressKey: key })
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || 'Generation failed');
      }
      setGenResult(json);
      setProgressText('Mock draft generated and published.');
    } catch (e) {
      setGenError(e.message || String(e));
    } finally {
      setGenerating(false);
      if (progressPollId) {
        clearInterval(progressPollId);
        setProgressPollId(null);
      }
    }
  }

  async function handleGenerateMockDraft() {
    try {
      setGenerating(true);
      setGenError(null);
      setGenResult(null);
      setProgressText('Creating player database...');
      setApprovedPool(false);
      setApprovedOrder(false);
      setPoolPreview(null);
      setOrderPreview(null);
      // Step 1: Scrape and generate player pool locally
      const poolRes = await fetch('/api/admin/player-pool/scrape', { method: 'POST' });
      const poolJson = await safeReadJson(poolRes);
      if (!poolRes.ok || !poolJson.ok) {
        throw new Error(poolJson?.error || 'Failed to generate player pool');
      }

      // Load pool preview:
      // - In dev we can read /data/player-pool.json
      // - In prod/serverless the pool is stored in MongoDB (filesystem may not have the JSON)
      if (poolJson?.file) {
        const poolDataRes = await fetch(poolJson.file, { cache: 'no-store' });
        const poolData = await safeReadJson(poolDataRes);
        setPoolPreview(Array.isArray(poolData) ? poolData : []);
      } else {
        setPoolPreview(Array.isArray(poolJson?.poolPreview) ? poolJson.poolPreview : []);
      }

      setProgressText('Calculating draft order (including traded picks)...');
  const ordRes = await fetch('/api/admin/draft-order/preview', { cache: 'no-store' });
  const ordJson = await safeReadJson(ordRes);
      if (!ordRes.ok || !ordJson.ok) {
        throw new Error(ordJson?.error || 'Failed to compute draft order');
      }
  setOrderPreview(Array.isArray(ordJson.order) ? ordJson.order : []);
  setGenResult({ ...(genResult || {}), draftOrderDebug: ordJson.debug || null });
      setProgressText('Review the player pool and draft order below, then approve to continue.');
      setGenerating(false);
      return;
    } catch (e) {
      setGenError(e.message || String(e));
    } finally {
      // generating flag toggled off above on success
    }
  }

  if (status === 'loading') {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-8">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            href="/admin/announcements" 
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Announcements</h2>
            <p className="text-white/70">Create banners for the home page</p>
          </Link>
          <Link 
            href="/admin/users" 
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">User Management</h2>
            <p className="text-white/70">Create, edit, and manage user accounts</p>
          </Link>
          <Link 
            href="/admin/drafts/create"
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Create Draft</h2>
            <p className="text-white/70">Start a new draft and manage draft settings</p>
          </Link>
          <Link
            href="/admin/drafts"
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">Drafts Overview</h2>
            <p className="text-white/70">View and manage all drafts</p>
          </Link>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">AI Mock Draft Generator</h2>
            <p className="text-white/70 mb-4">Generate a multi-round AI mock draft and publish to the Mock Drafts tab.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Mock Draft Title</label>
                <input
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={draftTitle}
                  onChange={e=>setDraftTitle(e.target.value)}
                  placeholder="BBB 2026 AI Mock Draft"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Description</label>
                <input
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={draftDescription}
                  onChange={e=>setDraftDescription(e.target.value)}
                  placeholder="AI-generated mock with per-pick reasoning"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Rounds (1–7)</label>
                <select
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                  value={rounds}
                  onChange={e=>setRounds(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
                >
                  {[1,2,3,4,5,6,7].map(r=> (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-3 text-white/70 text-sm">
              This will scrape the latest KTC rookie rankings and store the normalized player pool locally.
            </div>
            {progressText && (
              <div className="mb-3 text-white/80 text-sm">{progressText}</div>
            )}
            <button
              onClick={handleGenerateMockDraft}
              disabled={generating}
              className={`px-4 py-2 rounded-lg ${generating ? 'bg-white/20' : 'bg-[#FF4B1F] hover:bg-[#FF4B1F]/80'} text-white`}
            >
              {generating ? 'Generating…' : 'Generate Mock Draft'}
            </button>
            {genError && (
              <div className="mt-3 text-red-400 text-sm">{genError}</div>
            )}
            {(poolPreview || orderPreview) && (
              <div className="mt-4 space-y-4">
                {Array.isArray(poolPreview) && poolPreview.length > 0 && (
                  <div className="bg-black/20 rounded border border-white/10 p-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-white">Player Pool Preview ({poolPreview.length})</h3>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={approvedPool} onChange={e=>setApprovedPool(e.target.checked)} />
                        <span>Approve Player Pool</span>
                      </label>
                    </div>
                    <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                      {poolPreview.slice(0, 200).map((p, i) => (
                        <div key={i} className="py-0.5 border-b border-white/5">
                          {p.name} ({p.position}) rank {p.rank}
                        </div>
                      ))}
                      {poolPreview.length > 200 && (
                        <div className="text-white/50 mt-1">Showing first 200 players…</div>
                      )}
                    </div>
                  </div>
                )}
                {Array.isArray(orderPreview) && orderPreview.length > 0 && (
                  <div className="bg-black/20 rounded border border-white/10 p-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-white">Draft Order Preview (Round 1)</h3>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={approvedOrder} onChange={e=>setApprovedOrder(e.target.checked)} />
                        <span>Approve Draft Order</span>
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {orderPreview
                        .sort((a,b)=>Number(a.slot)-Number(b.slot))
                        .map((o,i)=> (
                          <div key={i} className="bg-black/10 p-2 rounded border border-white/10">
                            <span className="text-[#FF4B1F] font-bold">{String(o.slot).padStart(2,'0')}</span>
                            <span className="ml-2 text-white/90">{o.teamName}</span>
                            {o.originalOwnerId && o.rosterId && (Number(o.originalOwnerId) !== Number(o.rosterId)) && (
                              <span className="ml-2 text-white/60 text-xs">(via trade)</span>
                            )}
                          </div>
                        ))}
                    </div>
                    {genResult?.draftOrderDebug && (
                      <details className="mt-3 bg-black/10 p-2 rounded border border-white/10">
                        <summary className="cursor-pointer text-white/80 text-sm">Debug</summary>
                        <div className="mt-2 text-xs text-white/70 whitespace-pre-wrap">
                          {JSON.stringify(genResult.draftOrderDebug, null, 2)}
                        </div>
                      </details>
                    )}
                  </div>
                )}
                {(approvedPool && approvedOrder) && (
                  <div>
                    <button
                      onClick={handleApproveAndRun}
                      className="px-4 py-2 rounded-lg bg-[#1FDDFF] text-black hover:bg-[#1FDDFF]/80"
                    >
                      Run AI Mock Draft
                    </button>
                  </div>
                )}
              </div>
            )}
            {genResult && (
              <div className="mt-3 text-sm text-white/80 space-y-2">
                <div>Draft created: {genResult.draftId ? String(genResult.draftId) : 'Preview only (dry run)'}</div>
                <details className="bg-black/20 p-3 rounded border border-white/10">
                  <summary className="cursor-pointer">Debug Trace</summary>
                  <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                    {JSON.stringify(genResult.trace || [], null, 2)}
                  </div>
                </details>
                <details className="bg-black/20 p-3 rounded border border-white/10">
                  <summary className="cursor-pointer">Article Markdown</summary>
                  <div className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{genResult.article}</div>
                </details>
                <Link href="/draft" className="inline-block mt-1 text-[#FF4B1F] underline">View in Draft Center → Mock Draft tab</Link>
              </div>
            )}
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">League Settings</h2>
            <p className="text-white/70">Configure league settings (Coming Soon)</p>
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-6">
            <h2 className="text-xl font-bold mb-2">Content Management</h2>
            <p className="text-white/70">Manage website content (Coming Soon)</p>
          </div>
        </div>
        
        {/* System Stats */}
        <div className="mt-8 bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-4">System Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Current User</div>
              <div className="font-bold">{session?.user?.name || 'Unknown'}</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Role</div>
              <div className="font-bold">{session?.user?.role || 'Unknown'}</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Environment</div>
              <div className="font-bold">Development</div>
            </div>
            <div className="bg-black/20 p-4 rounded">
              <div className="text-sm text-white/70">Server Time</div>
              <div className="font-bold">{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Missing Images Section */}
        <div className="mt-8 bg-black/30 rounded-lg border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-4">Players Missing Card Images</h2>
          {loadingMissing ? (
            <div>Loading...</div>
          ) : sortedImages.length === 0 ? (
            <div className="text-green-400">All active players have images!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("playerName")}>
                      Player {sortConfig.key === "playerName" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("team")}>
                      Team {sortConfig.key === "team" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("position")}>
                      Position {sortConfig.key === "position" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("salary")}>
                      Salary {sortConfig.key === "salary" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-3 cursor-pointer" onClick={() => handleSort("ktc")}>
                      KTC Score {sortConfig.key === "ktc" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedImages.map((p, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-black/20">
                      <td className="py-2 px-3">{p.playerName}</td>
                      <td className="py-2 px-3">{p.team}</td>
                      <td className="py-2 px-3">{p.position}</td>
                      <td className="py-2 px-3">
                        {p.salary !== "" && !isNaN(p.salary)
                          ? `$${Number(p.salary).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                          : "-"}
                      </td>
                      <td className="py-2 px-3">
                        {p.ktc !== "" && !isNaN(p.ktc)
                          ? Number(p.ktc).toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}