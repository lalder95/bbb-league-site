'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

function formatImageName(playerName) {
  return playerName.replace(/\s+/g, "_").toLowerCase() + ".png";
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

  useEffect(() => {
    async function fetchMissing() {
      setLoadingMissing(true);

      // 1. Fetch contracts CSV from GitHub
      const csvUrl = "https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv";
      const csvRes = await fetch(csvUrl);
      const csvText = await csvRes.text();

      // 2. Fetch image index
      const imgRes = await fetch("/players/cardimages/index.json");
      const imageFiles = await imgRes.json();

      // 3. Find active contracts missing an image (parse as array, match Player Contracts logic)
      const rows = csvText.split('\n');
      // Defensive: Remove empty trailing row if present
      if (rows.length && !rows[rows.length - 1].trim()) rows.pop();

      const missing = rows.slice(1)
        .filter(row => row.trim())
        .map(row => row.split(','))
        .filter(values => values[1] && values[14] === "Active")
        .filter(values => {
          const imgName = formatImageName(values[1]);
          return !imageFiles.includes(imgName);
        })
        .map(values => ({
          playerName: values[1],
          team: values[33],
          position: values[21],
          salary: values[15] && !isNaN(values[15]) ? parseFloat(values[15]) : "",
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
    if (key === "salary") {
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

  if (status === 'loading') {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-8">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link 
            href="/admin/users" 
            className="bg-black/30 rounded-lg border border-white/10 p-6 hover:bg-black/40 transition-colors"
          >
            <h2 className="text-xl font-bold mb-2">User Management</h2>
            <p className="text-white/70">Create, edit, and manage user accounts</p>
          </Link>
          
          {/* You can add more admin features here as needed */}
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