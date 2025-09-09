// Defensive display helper to avoid rendering objects/arrays as React children
function safeDisplay(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') return '[object]';
  return String(val);
}
import React, { useEffect, useState } from "react";
import Image from 'next/image';

// Add a small client-side cache with TTL for ESPN API responses
const ESPN_CACHE_TTL_DEFAULT = 20_000; // 20s
const ESPN_CACHE =
  typeof window !== "undefined"
    ? (window.__ESPN_CACHE ||= new Map())
    : new Map();

async function fetchCachedJson(url, ttlMs = ESPN_CACHE_TTL_DEFAULT, fetchOpts = {}) {
  const now = Date.now();
  const entry = ESPN_CACHE.get(url);
  if (entry && entry.expiresAt > now) {
    if (entry.data) return entry.data;
    if (entry.promise) return entry.promise;
  }
  const promise = fetch(url, fetchOpts)
    .then(r => r.json())
    .then(json => {
      ESPN_CACHE.set(url, { data: json, expiresAt: now + ttlMs });
      return json;
    })
    .catch(err => {
      ESPN_CACHE.delete(url);
      throw err;
    });
  ESPN_CACHE.set(url, { promise, expiresAt: now + ttlMs });
  return promise;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s'-]/g, "_")
    .replace(/[^a-z0-9_.]/g, "");
}

// Title-case utility (Passing, Rushing, etc.)
function titleCase(s) {
  if (!s) return '';
  return String(s)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

// Fallback headers for NFL groups in case ESPN.labels are missing
const NFL_FALLBACK_LABELS = {
  passing: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'],
  rushing: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
  receiving: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
  fumbles: ['FUM', 'LOST'],
  defensive: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD', 'QB HITS', 'TD', 'INT'],
  kicking: ['FG', 'PCT', 'LONG', 'XP', 'PTS'],
  kickReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
  puntReturns: ['RET', 'YDS', 'AVG', 'LONG', 'TD'],
  punts: ['NO', 'YDS', 'AVG', 'TB', 'IN20', 'LONG'],
};

// Resolve headers from ESPN, fallback to mapping by group name
function resolveStatHeaders(statGroup) {
  const labels = statGroup?.labels || statGroup?.headers;
  if (Array.isArray(labels) && labels.length) return labels;
  const key = (statGroup?.name || statGroup?.displayName || '').trim();
  if (!key) return [];
  // Try normalized key in our map
  const norm = key.replace(/\s+/g, '').toLowerCase();
  if (NFL_FALLBACK_LABELS[norm]) return NFL_FALLBACK_LABELS[norm];
  // Try raw key lowercased (passing, rushing, etc.)
  const low = key.toLowerCase();
  if (NFL_FALLBACK_LABELS[low]) return NFL_FALLBACK_LABELS[low];
  return [];
}

// Helper: ESPN athlete id
function getAthleteId(a) {
  return a?.athlete?.id ?? a?.id ?? null;
}

// Normalize ESPN stat group name for comparison (e.g., "Passing", "Rushing")
function normalizeGroupName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

// Which stat groups to show per position
function desiredGroupsForPosition(position) {
  const pos = String(position || '').toLowerCase();
  if (pos.includes('qb')) return ['passing', 'rushing'];
  if (pos.includes('rb')) return ['rushing', 'receiving'];
  return null; // default to the matched group only
}

export default function PlayerProfileCard({
  playerId,
  contracts,
  imageExtension = "png",
  expanded = false,
  onExpandClick,
  onClick,
  className = "",
  teamAvatars = {},
  teamName = "",
}) {
  if (typeof playerId !== 'string' && typeof playerId !== 'number') {
    return null;
  }
  const [contract, setContract] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [flippedContainer, setFlippedContainer] = useState(false);
  const [flippedCard, setFlippedCard] = useState(false);
  const [allContracts, setAllContracts] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [nextGame, setNextGame] = useState(null);

  useEffect(() => {
    async function fetchContract() {
      if (contracts && contracts.length) {
        const found = contracts.find(
          (c) => String(c.playerId) === String(playerId)
        );
        setContract(found || null);
        setAllContracts(contracts.filter(c => String(c.playerId) === String(playerId)));
      } else {
        const response = await fetch(
          "https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv"
        );
        const text = await response.text();
        const rows = text.split("\n");
        const headers = rows[0].split(",");
        const idx = headers.findIndex(
          (h) => h.trim().toLowerCase() === "player id" || h.trim().toLowerCase() === "playerid"
        );
        const nflTeamIdx = headers.findIndex(
          (h) => h.trim().toLowerCase() === "nfl team"
        );
        const playerContracts = rows
          .slice(1)
          .map((row) => row.split(","))
          .filter((cols) => String(cols[idx]) === String(playerId));

        if (playerContracts.length > 0) {
          const foundRow = playerContracts[0];
          setContract({
            playerId: foundRow[0],
            playerName: foundRow[1],
            contractType: foundRow[2],
            status: foundRow[14],
            team: foundRow[33],
            position: foundRow[21],
            curYear: foundRow[15] ? parseFloat(foundRow[15]) : 0,
            year2: foundRow[16] ? parseFloat(foundRow[16]) : 0,
            year3: foundRow[17] ? parseFloat(foundRow[17]) : 0,
            year4: foundRow[18] ? parseFloat(foundRow[18]) : 0,
            contractFinalYear: foundRow[5],
            age: foundRow[32],
            ktcValue: foundRow[34],
            rfaEligible: foundRow[37],
            franchiseTagEligible: foundRow[38],
            nflTeam: nflTeamIdx !== -1 ? foundRow[nflTeamIdx] : "", // <-- Use dynamic index
          });
          setAllContracts(playerContracts.map(cols => ({
            playerId: cols[0],
            playerName: cols[1],
            contractType: cols[2],
            status: cols[14],
            contractStartYear: cols[4],
            team: cols[33],
            position: cols[21],
            curYear: cols[15] ? parseFloat(cols[15]) : 0,
            year2: cols[16] ? parseFloat(cols[16]) : 0,
            year3: cols[17] ? parseFloat(cols[17]) : 0,
            year4: cols[18] ? parseFloat(cols[18]) : 0,
            contractFinalYear: cols[5],
            age: cols[32],
            ktcValue: cols[34],
            rfaEligible: cols[37],
            franchiseTagEligible: cols[38],
            nflTeam: nflTeamIdx !== -1 ? cols[nflTeamIdx] : "",
          })));
        } else {
          setContract(null);
          setAllContracts([]);
        }
      }
    }
    fetchContract();
  }, [playerId, contracts]);

  useEffect(() => {
    if (!contract) {
      setImgSrc(null);
      return;
    }
    const defaultImages = {
      qb: "/players/cardimages/default_qb.png",
      rb: "/players/cardimages/default_rb.png",
      te: "/players/cardimages/default_te.png",
      wr: "/players/cardimages/default_wr.png",
    };
    async function fetchImage() {
      const normalized = normalizeName(contract.playerName);
      const altNormalized = contract.playerName
        .toLowerCase()
        .replace(/[\s']/g, "_")
        .replace(/[^a-z0-9_.-]/g, "")
      let images = [];
      try {
        const res = await fetch("/players/cardimages/index.json");
        images = await res.json();
      } catch (e) {
        images = [];
      }
      let found = null;
      if (Array.isArray(images)) {
        found = images.find(img =>
          img.filename.toLowerCase().includes(normalized) ||
          img.filename.toLowerCase().includes(altNormalized)
        );
      }
      if (found) {
        setImgSrc(found.src);
        return;
      }
      const cloudinaryUrl = `https://res.cloudinary.com/drn1zhflh/image/upload/f_auto,q_auto,w_384/${normalized}.png`;
      try {
        const res = await fetch(cloudinaryUrl, { method: "HEAD" });
        if (res.ok) {
          setImgSrc(cloudinaryUrl);
          return;
        }
      } catch (e) {}
      const pos = (contract.position || "").toLowerCase();
      setImgSrc(defaultImages[pos] || "");
    }
    fetchImage();
  }, [contract, imageExtension]);

  const handleImgError = () => {
    if (!contract) return;
    const defaultImages = {
      qb: "/players/cardimages/default_qb.png",
      rb: "/players/cardimages/default_rb.png",
      te: "/players/cardimages/default_te.png",
      wr: "/players/cardimages/default_wr.png",
    };
    const pos = (contract.position || "").toLowerCase();
    const defaultSrc = defaultImages[pos] || "";
    if (imgSrc !== defaultSrc) setImgSrc(defaultSrc);
  };

  useEffect(() => {
    async function fetchStatsAndNextGame() {
      setPlayerStats(null);
      setNextGame(null);

      // Only fetch when the card is expanded to avoid N cards × M events
      if (!expanded) {
        return;
      }

      if (!contract?.playerName) {
        console.warn('[ESPN DEBUG] Skipping ESPN fetch: missing contract.playerName', { contract });
        return;
      }

      // Normalizers
      function normalizeLoose(str) {
        return String(str)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
      }
      const contractName = normalizeLoose(contract.playerName);

      function getAthleteName(a) {
        return (
          a?.displayName ||
          a?.athlete?.displayName ||
          a?.athlete?.shortName ||
          a?.athlete?.fullName ||
          a?.athlete?.name ||
          null
        );
      }

      let scoreboard;
      try {
        const json = await fetchCachedJson('/api/espn/scoreboard?seasontype=2', 15_000);
        if (!json?.ok) {
          console.error('[ESPN DEBUG] Scoreboard fetch failed', { ok: json?.ok, error: json?.error });
          return;
        }
        scoreboard = json.data;
      } catch (err) {
        console.error('[ESPN DEBUG] Error fetching scoreboard', err);
        return;
      }

      const allEvents = scoreboard?.events || [];
      if (!Array.isArray(allEvents) || allEvents.length === 0) return;

      // Filter to only the player’s team to avoid fetching every event summary
      let events = allEvents;
      let abbr = null;
      if (contract?.nflTeam) {
        abbr = String(contract.nflTeam).toUpperCase();
        events = allEvents.filter(e =>
          (e?.competitions?.[0]?.competitors || [])
            .some(c => c?.team?.abbreviation?.toUpperCase() === abbr)
        );
      }

      let foundStats = false;

      for (const event of events.slice(0, 2)) {
        const eventId = event?.id;
        if (!eventId) continue;

        try {
          const j = await fetchCachedJson(`/api/espn/summary?event=${eventId}`, 20_000);
          if (!j?.ok) {
            continue;
          }

          const summary = j.data;
          const playerBlocks = summary?.boxscore?.players || [];

          for (const team of playerBlocks) {
            for (const statGroup of team?.statistics || []) {
              for (const a of statGroup?.athletes || []) {
                const rawName = getAthleteName(a);
                if (!rawName) continue;
                const apiName = normalizeLoose(rawName);

                if (apiName.includes(contractName) || contractName.includes(apiName)) {
                  // We found the athlete. Collect one or more stat groups for this athlete.
                  const matchedAthleteId = getAthleteId(a);
                  const matchedNameNorm = normalizeLoose(rawName);

                  // Desired groups by position (QB -> Passing+Rushing, RB -> Rushing+Receiving)
                  const wanted = desiredGroupsForPosition(contract?.position);
                  const groupsOut = [];

                  // Utility: add a group's row for this same athlete if present
                  function addGroupRow(group) {
                    if (!group) return;
                    const headers = resolveStatHeaders(group);
                    // find the same athlete in this group
                    const ath = (group?.athletes || []).find(ga => {
                      const gaId = getAthleteId(ga);
                      const gaName = getAthleteName(ga);
                      const gaNorm = gaName ? normalizeLoose(gaName) : '';
                      return (matchedAthleteId && gaId && gaId === matchedAthleteId) ||
                             (!!gaNorm && gaNorm === matchedNameNorm);
                    });
                    const rowStats = ath?.stats || ath?.statistics || [];
                    if (rowStats && rowStats.length) {
                      groupsOut.push({
                        statType: titleCase(group?.displayName || group?.name || 'Stats'),
                        headers,
                        stats: rowStats,
                      });
                    }
                  }

                  if (Array.isArray(wanted) && wanted.length) {
                    for (const wName of wanted) {
                      const g = (team?.statistics || []).find(sg =>
                        normalizeGroupName(sg?.name || sg?.displayName) === normalizeGroupName(wName)
                      );
                      addGroupRow(g);
                    }
                  } else {
                    addGroupRow(statGroup);
                  }

                  if (groupsOut.length === 0) {
                    const rawStats = a?.stats || a?.statistics || [];
                    const headers = resolveStatHeaders(statGroup);
                    groupsOut.push({
                      statType: titleCase(statGroup?.displayName || statGroup?.name || 'Stats'),
                      headers,
                      stats: rawStats,
                    });
                  }

                  setPlayerStats({
                    displayName: rawName,
                    groups: groupsOut,
                  });
                  foundStats = true;
                  break;
                }
              }
              if (foundStats) break;
            }
            if (foundStats) break;
          }
          if (foundStats) break;
        } catch (e) {
          console.error('[ESPN DEBUG] Error fetching summary', { eventId }, e);
        }
      }

      // Next game (already filtered by team above)
      if (!foundStats && abbr) {
        let next = null;
        for (const event of events) {
          const comps = event?.competitions?.[0]?.competitors || [];
          const mine = comps.find(c => c?.team?.abbreviation?.toUpperCase() === abbr);
          if (mine) {
            const opp = comps.find(c => c?.team?.abbreviation?.toUpperCase() !== abbr);
            next = {
              opponent: opp?.team?.displayName || 'TBD',
              date: event.date,
              venue: event.competitions?.[0]?.venue?.fullName || '',
              homeAway: mine.homeAway,
              eventName: event.name,
              shortName: event.shortName,
            };
            break;
          }
        }
        if (next) setNextGame(next);
      }
    }

    fetchStatsAndNextGame();
  }, [expanded, contract?.playerName, contract?.nflTeam]);

  if (!contract) {
    return (
      <div
        className={
          expanded
            ? "w-[95vw] max-w-[95vw] aspect-[2.5/3.5] min-h-[22rem] max-h-[95vh] md:w-96 md:max-w-none md:aspect-[2.5/3.5] md:h-[32rem] flex items-center justify-center bg-gray-900 rounded-lg shadow-lg text-white text-xl overflow-hidden"
            : "w-16 h-16 flex items-center justify-center bg-gray-900 rounded-lg shadow-lg text-white text-xl overflow-hidden"
        }
      >
        Loading...
      </div>
    );
  }

  // Utility to safely render only strings/numbers in bubbles
  function safeDisplay(val) {
    if (val === null || val === undefined) return "-";
    if (typeof val === "string" || typeof val === "number") return val;
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return "-";
  }

  const Bubble = ({ children, className = "" }) => {
    let display;
    if (children === null || children === undefined) {
      display = "-";
    } else if (typeof children === "string" || typeof children === "number" || typeof children === "boolean") {
      display = safeDisplay(children);
    } else {
      display = "-";
    }
    return (
      <span
        className={
          "inline-flex items-center px-3 py-1.5 rounded-full text-sm sm:text-base font-semibold bg-black/30 text-white mr-1.5 mb-1.5 " +
          className
        }
      >
        {String(display)}
      </span>
    );
  };

  // Simple table for ESPN stats with headers
  const StatsTable = ({ statType, headers = [], stats = [] }) => {
    const hasHeaders = Array.isArray(headers) && headers.length > 0;
    const computedHeaders = hasHeaders ? headers : stats.map((_, i) => `Stat ${i + 1}`);
    const colCount = Math.max(computedHeaders.length, stats.length);
    const displayHeaders = Array.from({ length: colCount }, (_, i) => computedHeaders[i] ?? `Stat ${i + 1}`);
    const displayValues = Array.from({ length: colCount }, (_, i) => stats[i] ?? '-');

    return (
      <div className="w-full max-w-4xl px-2">
        <div className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm shadow-xl">
          <div className="text-lg font-bold text-[#FF4B1F] mb-1 text-center pt-2">
            {statType}
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm rounded-t-none">
              <thead className="bg-white/5 text-[#FF4B1F]">
                <tr>
                  {displayHeaders.map((h, i) => (
                    <th key={i} className="px-3 py-2 whitespace-nowrap text-center font-semibold border-b border-white/10">
                      {String(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white/0 text-base">
                <tr className="hover:bg-white/5">
                  {displayValues.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-center text-white/90 border-b border-white/10">
                      {String(v)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Small circular flip icon (top-right) with slow spin animation
  const FlipIconButton = ({ onClick, title = "Flip card" }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="pointer-events-auto inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FF4B1F] hover:bg-[#ff6a3d] border-2 border-black text-white shadow-md focus:outline-none focus:ring-2 focus:ring-black/60 transition"
      aria-label={title}
      title={title}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-none"
        style={{ animationDuration: '6s', willChange: 'transform' }}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
    </button>
  );

  // When the main "flipped" state changes, update both in sequence
  const handleFlip = () => {
    if (!flippedContainer && !flippedCard) {
      setFlippedContainer(true);
      setTimeout(() => setFlippedCard(true), 400);
    } else if (flippedContainer && flippedCard) {
      setFlippedCard(false);
      setTimeout(() => setFlippedContainer(false), 400);
    }
  };

  // Central close handler: ensure parent can set expanded = false
  const handleClose = (e) => {
    e?.stopPropagation?.();
    // unflip locally for a clean exit
    setFlippedCard(false);
    setTimeout(() => setFlippedContainer(false), 300);

    if (typeof onExpandClick === 'function') {
      // Prefer an explicit "close" signal
      onExpandClick(false);
      return;
    }
    if (typeof onClick === 'function') {
      onClick(false);
    }
  };

  return (
    <>
      {expanded && playerStats && (
        <div className="w-full flex flex-col items-center justify-center mb-0 pointer-events-auto">
          <div className="text-lg font-bold text-[#FF4B1F] mb-0">
            {playerStats.displayName}
          </div>

          {/* Render one table per selected stat group (e.g., Passing + Rushing for QB) */}
          {Array.isArray(playerStats.groups) && playerStats.groups.map((g, i) => (
            <div key={i} className={i > 0 ? "mt-2" : ""}>
              <StatsTable
                statType={g.statType}
                headers={g.headers}
                stats={g.stats}
              />
            </div>
          ))}
        </div>
      )}

      {/* Next Game panel above the card when no stats */}
      {expanded && !playerStats && nextGame && (
        <div className="w-full flex flex-col items-center justify-center mb-0 pointer-events-auto">
          <div className="w-full max-w-4xl px-2">
            <div className="rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm shadow-xl px-3 py-2">
              <div className="text-lg font-bold text-[#FF4B1F] mb-1 text-center">
                Next Game: {nextGame.shortName || nextGame.eventName}
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-white">
                <div>
                  Opponent: <span className="font-semibold">{nextGame.opponent}</span>
                </div>
                <div>
                  Date: <span className="font-semibold">{new Date(nextGame.date).toLocaleString()}</span>
                </div>
                {nextGame.venue && (
                  <div>
                    Venue: <span className="font-semibold">{nextGame.venue}</span>
                  </div>
                )}
                {nextGame.homeAway && (
                  <div>
                    Home/Away: <span className="font-semibold uppercase">{nextGame.homeAway}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={
          (expanded
            ? "flex flex-col items-center justify-start w-full py-0 mt-1"
            : "flex flex-col items-center justify-center"
          ) + " pointer-events-none"
        }
        style={{
          ...(expanded ? { overflowX: 'auto' } : {}),
          transition: "transform 1.1s cubic-bezier(.68,-0.55,.27,1.55)",
          transform: flippedContainer ? "rotate(-90deg)" : "rotate(0deg)",
          transformOrigin: "center center",
        }}
        onClick={onClick}
      >
        <div
          className={`relative ${
            expanded
              ? (className || "w-[95vw] max-w-[95vw] aspect-[2.5/3.5] min-h-[22rem] max-h-[95vh] md:w-96 md:max-w-none md:aspect-[2.5/3.5] md:h-[32rem]")
              : (className && className.match(/w-\d+/) ? className : 'w-36 h-36 sm:w-40 sm:h-40')
          } rounded-lg shadow-lg overflow-hidden transition-transform duration-300 ease-in-out ${flippedContainer ? "scale-90" : "scale-100"}`}
        >
          <div
            className="relative w-full h-full"
            style={{ perspective: "1200px" }}
          >
            <div
              className={`transition-transform w-full h-full absolute top-0 left-0`}
              style={{
                transition: "transform 1.1s cubic-bezier(.68,-0.55,.27,1.55)",
                transformStyle: "preserve-3d",
                transform: flippedCard ? "rotateY(180deg)" : "rotateY(0deg)",
                width: "100%",
                height: "100%",
              }}
            >
              {/* Front Side */}
              <div
                className="absolute w-full h-full backface-hidden"
                style={{ backfaceVisibility: "hidden" }}
              >
                {/* top-right controls (front only when expanded and not flipped) */}
                <div className="absolute top-1 right-2 z-50 flex items-center gap-2 pointer-events-none">
                  {expanded && !flippedCard && (
                    <>
                      <FlipIconButton onClick={handleFlip} />
                      <button
                        onClick={handleClose}
                        className="pointer-events-auto inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md border-2 border-black focus:outline-none focus:ring-2 focus:ring-black/60 transition"
                        aria-label="Close"
                        title="Close"
                        type="button"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                {imgSrc ? (
                  <Image
                    src={imgSrc}
                    alt={contract?.playerName}
                    width={expanded ? 384 : 144}
                    height={expanded ? 538 : 144}
                    className="object-contain w-full h-full"
                    onError={handleImgError}
                    unoptimized={imgSrc && imgSrc.startsWith('http')}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white text-lg">
                    Loading...
                  </div>
                )}
                {/* Bubbles moved below the card (removed overlay on image) */}
              </div>
              {/* Back Side */}
              <div
                className="absolute w-full h-full flex items-center justify-center bg-gray-800 text-white text-xl rounded-lg border-2 border-[#FF4B1F]"
                style={{
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                }}
              >
                {/* top-right controls (back only when expanded and flipped) */}
                {expanded && flippedCard && (
                  <div className="absolute top-1 right-2 z-50 flex items-center gap-2 pointer-events-none">
                    <FlipIconButton onClick={handleFlip} />
                    <button
                      onClick={handleClose}
                      className="pointer-events-auto inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md border-2 border-black focus:outline-none focus:ring-2 focus:ring-black/60 transition"
                      aria-label="Close"
                      title="Close"
                      type="button"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                           strokeLinecap="round"
                           strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}

                <div className="flex flex-col items-center justify-center w-full h-full box-border bg-gradient-to-br from-[#001A2B] via-gray-900 to-[#22223b] rounded-lg border border-white/10 shadow-xl relative overflow-x-auto">
                  {/* Player Name vertically on the right, rotated 90deg */}
                  <div
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-20 font-[Black_Ops_One] font-bold"
                    style={{
                      transform: "translateY(-50%) rotate(0deg)",
                      transformOrigin: "right center",
                      writingMode: "vertical-lr",
                      whiteSpace: "nowrap",
                      fontFamily: "'Black Ops One', 'Saira Stencil One', sans-serif",
                    }}
                  >
                    <span className="text-2xl font-bold text-[#FF4B1F] drop-shadow">
                      {safeDisplay(contract.playerName)}
                    </span>
                  </div>
                  {/* Player image background, 5% opacity, behind overlays */}
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={contract?.playerName}
                      className="absolute w-full h-full object-contain pointer-events-none select-none"
                      style={{
                        opacity: 0.05,
                        top: 0,
                        left: 0,
                        zIndex: 1,
                        filter: 'grayscale(0.2) blur(0.5px)',
                        transform: 'scaleX(-1)',
                      }}
                    />
                  )}
                  {/* Player card image as a low-opacity background */}
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={contract?.playerName}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        opacity: 0.05,
                        zIndex: 0,
                        pointerEvents: 'none',
                        transform: 'scaleX(-1)',
                      }}
                    />
                  )}
                  {/* Contract Table */}
                  {allContracts.filter(c => c.status === "Active" || c.status === "Future").length > 0 ? (
                    <div className="w-full h-full flex justify-center items-center overflow-y-auto p-3 mr-12 hide-scrollbar"
                      style={{
                        maxHeight: '100%',
                        maxWidth: '100%',
                        fontFamily: "'Black Ops One', 'Saira Stencil One', sans-serif",
                        overflowY: 'auto',
                        overflowX: 'auto'
                      }}>
                      <table
                        className="text-xs sm:text-sm md:text-base border border-white/10 rounded bg-black/30 mx-auto origin-center shadow-lg w-full"
                        style={{
                          margin: '0 auto',
                          maxWidth: '100%',
                          transform: 'rotate(90deg)',
                          tableLayout: 'auto',
                          fontFamily: "'Black Ops One', 'Saira Stencil One', sans-serif",
                        }}
                      >
                        <tbody>
                          {allContracts
                            .filter(c => c.status === "Active" || c.status === "Future")
                            .sort((a, b) => {
                              const aYear = Number(a.contractFinalYear) || 0;
                              const bYear = Number(b.contractFinalYear) || 0;
                              return aYear - bYear;
                            })
                            .map((c, idx) => (
                              <React.Fragment key={idx}>
                                {idx > 0 && (
                                  <tr>
                                    <td colSpan={6}>
                                      <div className="border-t-4 border-[#FF4B1F] my-2 w-full"></div>
                                    </td>
                                  </tr>
                                )}
                                <tr className="bg-black/60 text-[#FF4B1F]">
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Type</th>
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Final Year</th>
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base" colSpan={2}>Team</th>
                                </tr>
                                <tr className="border-b border-white/10 last:border-0 hover:bg-[#FF4B1F]/10 transition-colors">
                                  <td className="px-2 text-white/90 text-center">{safeDisplay(c.contractType)}</td>
                                  <td className="px-2 text-white/80 text-center">{safeDisplay(c.contractFinalYear)}</td>
                                  <td className="px-2 text-white font-bold text-center" colSpan={2}>{safeDisplay(c.team)}</td>
                                </tr>
                                <tr className="bg-black/60 text-[#FF4B1F]">
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Year 1</th>
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Year 2</th>
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Year 3</th>
                                  <th className="px-2 whitespace-nowrap text-center font-semibold text-xs sm:text-sm md:text-base">Year 4</th>
                                </tr>
                                <tr className="border-b border-white/10 last:border-0 hover:bg-[#FF4B1F]/10 transition-colors">
                                  <td className="px-2 text-green-400 text-center">
                                    {typeof c.curYear === 'number' && c.curYear === 0 ? '-' : typeof c.curYear === 'number' ? `$${c.curYear.toFixed(1)}` : safeDisplay(c.curYear)}
                                  </td>
                                  <td className="px-2 text-green-400 text-center">
                                    {typeof c.year2 === 'number' && c.year2 === 0 ? '-' : typeof c.year2 === 'number' ? `$${c.year2.toFixed(1)}` : safeDisplay(c.year2)}
                                  </td>
                                  <td className="px-2 text-green-400 text-center">
                                    {typeof c.year3 === 'number' && c.year3 === 0 ? '-' : typeof c.year3 === 'number' ? `$${c.year3.toFixed(1)}` : safeDisplay(c.year3)}
                                  </td>
                                  <td className="px-2 text-green-400 text-center">
                                    {typeof c.year4 === 'number' && c.year4 === 0 ? '-' : typeof c.year4 === 'number' ? `$${c.year4.toFixed(1)}` : safeDisplay(c.year4)}
                                  </td>
                                </tr>
                              </React.Fragment>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-white/60">No active or future contracts found.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>{/* end main card container */}

      {expanded && !playerStats && !nextGame && (
        <div className="w-full flex flex-col items-center justify-center mt-2">
          <div className="text-lg font-bold text-[#FF4B1F] mb-1">
            No Current Information Available
          </div>
          <div className="text-white/70 text-base">
            No stat line or upcoming game found for this player.
          </div>
        </div>
      )}

      {/* Bubbles directly below the card (front side only) */}
      {expanded && !flippedCard && contract && typeof contract === 'object' && !Array.isArray(contract) && (
        <div className="w-full flex justify-center mt-1 pointer-events-auto">
          <div className="flex flex-wrap justify-center text-center px-2 py-2 gap-1">
            {safeDisplay(contract.playerName) !== '-' && <Bubble className="bg-[#FF4B1F]/60">{String(safeDisplay(contract.playerName))}</Bubble>}
            {safeDisplay(contract.position) !== '-' && <Bubble className="bg-blue-700/60">{String(safeDisplay(contract.position))}</Bubble>}
            <Bubble className="bg-green-700/60">
              {typeof contract.curYear === 'number' ? `$${contract.curYear.toFixed(1)}` : "-"}
            </Bubble>
            {safeDisplay(contract.contractType) !== '-' && <Bubble className="bg-indigo-700/60">{String(safeDisplay(contract.contractType))}</Bubble>}
            {safeDisplay(contract.team) !== '-' && <Bubble className="bg-purple-700/60">{String(safeDisplay(contract.team))}</Bubble>}
            {safeDisplay(contract.age) !== '-' && (
              <Bubble
                className={
                  "bg-yellow-700/60 " +
                  (Number(contract.age) >= 30 ? "animate-pulse" : "")
                }
              >
                {`Age: ${String(safeDisplay(contract.age))}`}
              </Bubble>
            )}
            <Bubble
              className={
                "bg-cyan-700/60 " +
                (String(contract.rfaEligible).toLowerCase() === "true" ? "animate-pulse" : "")
              }
            >
              {`RFA: ${String(contract.rfaEligible).toLowerCase() === "true" ? "✅" : "❌"}`}
            </Bubble>
            <Bubble
              className={
                "bg-pink-700/60 " +
                (String(contract.franchiseTagEligible).toLowerCase() === "false" ? "animate-pulse" : "")
              }
            >
              {`Tag: ${String(contract.franchiseTagEligible).toLowerCase() === "true" ? "✅" : "❌"}`}
            </Bubble>
            <Bubble className="bg-teal-700/60">
              {`KTC: ${String(safeDisplay(contract.ktcValue))}`}
            </Bubble>
            <Bubble
              className={
                "bg-orange-700/60 " +
                (String(contract.contractFinalYear) === String(new Date().getFullYear()) ? "animate-pulse" : "")
              }
            >
              {`Final Year: ${String(safeDisplay(contract.contractFinalYear))}`}
            </Bubble>
          </div>
        </div>
      )}
    </>
  );
}