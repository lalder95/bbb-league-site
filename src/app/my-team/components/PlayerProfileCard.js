// Defensive display helper to avoid rendering objects/arrays as React children
function safeDisplay(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') return '[object]';
  return String(val);
}
import React, { useEffect, useState } from "react";

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s'-]/g, "_")
    .replace(/[^a-z0-9_.]/g, "");
}

export default function PlayerProfileCard({
  playerId,
  contracts,
  imageExtension = "png",
  expanded = false,
  onExpandClick,
  onClick, // <-- Add this line
  className = "",
  teamAvatars = {},
  teamName = "",
}) {
  // Debug: Log playerId and its type
  console.log('[PlayerProfileCard] playerId:', playerId, '| type:', typeof playerId);
  if (typeof playerId !== 'string' && typeof playerId !== 'number') {
    console.warn('[PlayerProfileCard] Invalid playerId, not string/number:', playerId);
    return null;
  }
  const [contract, setContract] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [allContracts, setAllContracts] = useState([]);
  // No internal expanded state; rely on prop only

  // Debug: Log contract and allContracts after they are set
  useEffect(() => {
    console.log('[PlayerProfileCard] contract:', contract, '| type:', typeof contract);
    console.log('[PlayerProfileCard] allContracts:', allContracts, '| type:', typeof allContracts);
    if (Array.isArray(allContracts)) {
      allContracts.forEach((c, idx) => {
        console.log(`[PlayerProfileCard] allContracts[${idx}]:`, c, '| type:', typeof c);
      });
    }
  }, [contract, allContracts]);

  useEffect(() => {
    async function fetchContract() {
      if (contracts && contracts.length) {
        const found = contracts.find(
          (c) => String(c.playerId) === String(playerId)
        );
        setContract(found || null);
        // Also filter all contracts for this player
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
        const playerContracts = rows
          .slice(1)
          .map((row) => row.split(","))
          .filter((cols) => String(cols[idx]) === String(playerId));

        if (playerContracts.length > 0) {
          // Use the first contract for the main card
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
          });
          // Store all contracts for this player
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

      const cloudinaryUrl = `https://res.cloudinary.com/drn1zhflh/image/upload/v1749697886/${normalized}.png`;
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
    // If it's an object or array, return a dash
    return "-";
  }

  const Bubble = ({ children, className = "" }) => {
    // Debug: Log Bubble children and their type
    if (typeof window !== 'undefined') {
      console.log('[Bubble] children:', children, '| type:', typeof children);
    }
    let display;
    if (children === null || children === undefined) {
      display = "-";
    } else if (typeof children === "string" || typeof children === "number" || typeof children === "boolean") {
      display = safeDisplay(children);
    } else {
      display = "-";
    }
    // Always coerce to string to avoid React child errors
    return (
      <span
        className={
          "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-black/20 text-white mr-1 mb-1 " +
          className
        }
      >
        {String(display)}
      </span>
    );
  };

  return (
    <div
      className={
        expanded
          ? "flex flex-col items-center justify-center min-h-screen w-full py-8"
          : "flex flex-col items-center justify-center"
      }
      style={expanded ? { overflowX: 'auto' } : {}}
      onClick={onClick}
    >
      <div
        className={`relative ${
          expanded
            ? (
                flipped
                  ? "h-[95vh] max-h-[95vh] aspect-[3.5/2.5] min-w-[22rem] max-w-[95vw] md:h-[32rem] md:max-h-none md:aspect-[3.5/2.5] md:w-[32rem]"
                  : "w-[95vw] max-w-[95vw] aspect-[2.5/3.5] min-h-[22rem] max-h-[95vh] md:w-96 md:max-w-none md:aspect-[2.5/3.5] md:h-[32rem]"
              )
            // --- CHANGE: Use larger size for mobile list view, small for table avatar ---
            : `${className} ${className.includes('w-8') ? '' : 'w-36 h-36 sm:w-40 sm:h-40'}`
        } rounded-lg shadow-lg bg-gray-900 overflow-hidden`}
      >
        <div
          className="relative w-full h-full"
          style={{
            perspective: "1200px",
          }}
        >
          <div
            className={`transition-transform duration-[1500ms] ease-in-out w-full h-full absolute top-0 left-0`}
            style={{
              transformStyle: "preserve-3d",
              // Diagonal flip: rotateY(180deg) rotateZ(90deg)
              transform: flipped ? "rotateY(180deg) rotateZ(90deg)" : "rotateY(0deg) rotateZ(0deg)",
              width: "100%",
              height: "100%",
            }}
          >
            {/* Front Side */}
            <div
              className="absolute w-full h-full backface-hidden"
              style={{ backfaceVisibility: "hidden" }}
            >
              <img
                src={imgSrc}
                alt={contract?.playerName}
                className="object-contain w-full h-full"
                onError={handleImgError}
              />
              {onExpandClick && (
                <button
                  onClick={onExpandClick}
                  className="absolute top-2 right-2 z-20 bg-[#FF4B1F] text-white rounded-full p-3 hover:bg-orange-600 shadow-lg border-2 border-white/80 transition-all duration-200"
                  style={{ fontSize: 32, lineHeight: 1, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label={expanded ? "Hide details" : "Show details"}
                >
                  {expanded ? "✕" : "i"}
                </button>
              )}
              {expanded && !flipped && contract && typeof contract === 'object' && !Array.isArray(contract) && (
                <div className="w-full flex flex-wrap justify-center text-center px-2 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent mt-2 absolute bottom-0 left-0 z-10">
                  {safeDisplay(contract.playerName) !== '-' && <Bubble className="bg-[#FF4B1F] bg-opacity-50">{String(safeDisplay(contract.playerName))}</Bubble>}
                  {safeDisplay(contract.position) !== '-' && <Bubble className="bg-blue-700 bg-opacity-50">{String(safeDisplay(contract.position))}</Bubble>}
                  <Bubble className="bg-green-700 bg-opacity-50">
                    {typeof contract.curYear === 'number' ? `$${contract.curYear.toFixed(1)}` : "-"}
                  </Bubble>
                  {safeDisplay(contract.contractType) !== '-' && <Bubble className="bg-indigo-700 bg-opacity-50">{String(safeDisplay(contract.contractType))}</Bubble>}
                  {safeDisplay(contract.team) !== '-' && <Bubble className="bg-purple-700 bg-opacity-50">{String(safeDisplay(contract.team))}</Bubble>}
                  {safeDisplay(contract.age) !== '-' && (
                    <Bubble
                      className={
                        "bg-yellow-700 bg-opacity-50 " +
                        (Number(contract.age) >= 30 ? "animate-pulse" : "")
                      }
                    >
                      {`Age: ${String(safeDisplay(contract.age))}`}
                    </Bubble>
                  )}
                  <Bubble
                    className={
                      "bg-cyan-700 bg-opacity-50 " +
                      (String(contract.rfaEligible).toLowerCase() === "true" ? "animate-pulse" : "")
                    }
                  >
                    {`RFA: ${String(contract.rfaEligible).toLowerCase() === "true" ? "✅" : "❌"}`}
                  </Bubble>
                  <Bubble
                    className={
                      "bg-pink-700 bg-opacity-50 " +
                      (String(contract.franchiseTagEligible).toLowerCase() === "false" ? "animate-pulse" : "")
                    }
                  >
                    {`Tag: ${String(contract.franchiseTagEligible).toLowerCase() === "true" ? "✅" : "❌"}`}
                  </Bubble>
                  <Bubble className="bg-teal-700 bg-opacity-50">
                    {`KTC: ${String(safeDisplay(contract.ktcValue))}`}
                  </Bubble>
                  <Bubble
                    className={
                      "bg-orange-700 bg-opacity-50 " +
                      (String(contract.contractFinalYear) === String(new Date().getFullYear()) ? "animate-pulse" : "")
                    }
                  >
                    {`Final Year: ${String(safeDisplay(contract.contractFinalYear))}`}
                  </Bubble>
                </div>
              )}
            </div>
            {/* Back Side */}
            <div
              className="absolute w-full h-full flex items-center justify-center bg-gray-800 text-white text-xl rounded-lg"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
            <div className="flex flex-col items-center justify-center w-full h-full box-border bg-gradient-to-br from-[#001A2B] via-gray-900 to-[#22223b] rounded-lg border border-white/10 shadow-xl relative overflow-x-auto">
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
            {/* Player age bottom-left, rotated 90deg */}
            {/* Position and age bubbles removed from back of card as requested */}
            {/* Team avatar and KTC score removed from back of card */}
            {/* Contract Table */}
            {allContracts.filter(c => c.status === "Active" || c.status === "Future").length > 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center" style={{height: '100%', minHeight: 0}}>
                <div className="flex flex-col h-full w-full justify-center items-center" style={{height: '100%', minHeight: 0}}>
                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%'}}>
                    <table className="w-auto text-sm border border-white/10 rounded bg-black/30 mx-auto rotate-90 origin-center shadow-lg" style={{margin: '0 auto', maxWidth: '95%', transform: 'scale(0.925) rotate(90deg)'}}>
                    <thead>
                      <tr className="bg-black/60 text-[#FF4B1F] text-base">
                        <th className="p-2 border-b border-white/10 font-semibold">Type</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Start Year</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 1</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 2</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 3</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 4</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Final Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allContracts.filter(c => c.status === "Active" || c.status === "Future").map((c, idx) => {
                        // Debug: Log each contract row before rendering
                        console.log(`[PlayerProfileCard] Rendering contract row idx=${idx}:`, c, '| type:', typeof c);
                        return (
                          <tr key={idx} className="border-b border-white/10 last:border-0 hover:bg-[#FF4B1F]/10 transition-colors">
                            <td className="p-2 text-white/90">{safeDisplay(c.contractType)}</td>
                            <td className="p-2 text-white/80">{safeDisplay(c.contractStartYear)}</td>
                            <td className="p-2 text-green-400">{typeof c.curYear === 'number' ? `$${c.curYear.toFixed(1)}` : safeDisplay(c.curYear)}</td>
                            <td className="p-2 text-green-400">{typeof c.year2 === 'number' ? `$${c.year2.toFixed(1)}` : safeDisplay(c.year2)}</td>
                            <td className="p-2 text-green-400">{typeof c.year3 === 'number' ? `$${c.year3.toFixed(1)}` : safeDisplay(c.year3)}</td>
                            <td className="p-2 text-green-400">{typeof c.year4 === 'number' ? `$${c.year4.toFixed(1)}` : safeDisplay(c.year4)}</td>
                            <td className="p-2 text-white/80">{safeDisplay(c.contractFinalYear)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/60">No active or future contracts found.</div>
            )}
            </div>
            </div>
          </div>
        </div>
      </div>
      {/* Flip control below the card, only when expanded */}
      {expanded && (
        <div className="flex flex-row gap-4 mt-4 w-full justify-center">
          <button
            onClick={() => setFlipped(f => !f)}
            className="bg-blue-700 text-white rounded px-4 py-2 text-base font-semibold shadow hover:bg-blue-800 transition-colors min-w-[90px]"
            aria-label="Flip card"
            type="button"
          >
            Flip
          </button>
        </div>
      )}
    </div>
  );
}