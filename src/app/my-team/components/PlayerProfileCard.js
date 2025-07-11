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
  className = "",
  teamAvatars = {},
  teamName = "",
}) {
  const [contract, setContract] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [allContracts, setAllContracts] = useState([]);

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
      <div className="w-96 h-[32rem] flex items-center justify-center bg-gray-900 rounded-lg shadow-lg text-white text-xl">
        Loading...
      </div>
    );
  }

  const Bubble = ({ children, className = "" }) => (
    <span
      className={
        "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-black/20 text-white mr-1 mb-1 " +
        className
      }
    >
      {children}
    </span>
  );

  return (
    <div className="flex flex-col items-center w-full h-full">
      <div className={`relative w-full h-full rounded-lg shadow-lg bg-gray-900 ${className}`}>
        <div
          className="relative w-full h-full"
          style={{
            perspective: "1200px",
          }}
        >
          <div
            className={`transition-transform duration-[600ms] ease-in-out w-full h-full absolute top-0 left-0`}
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
                  className="absolute top-1 right-1 z-10 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  style={{ fontSize: 16, lineHeight: 1 }}
                  aria-label={expanded ? "Hide details" : "Show details"}
                >
                  {expanded ? "✕" : "i"}
                </button>
              )}
              {expanded && (
                <div className="absolute bottom-0 left-0 w-full flex flex-wrap justify-center text-center px-2 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <Bubble className="bg-[#FF4B1F] bg-opacity-50">{contract.playerName}</Bubble>
                  <Bubble className="bg-blue-700 bg-opacity-50">{contract.position}</Bubble>
                  <Bubble className="bg-green-700 bg-opacity-50">
                    ${contract.curYear ? contract.curYear.toFixed(1) : "-"}
                  </Bubble>
                  <Bubble className="bg-indigo-700 bg-opacity-50">{contract.contractType}</Bubble>
                  <Bubble className="bg-purple-700 bg-opacity-50">{contract.team}</Bubble>
                  <Bubble
                    className={
                      "bg-yellow-700 bg-opacity-50 " +
                      (Number(contract.age) >= 30 ? "animate-pulse" : "")
                    }
                  >
                    Age: {contract.age || "-"}
                  </Bubble>
                  <Bubble
                    className={
                      "bg-cyan-700 bg-opacity-50 " +
                      (String(contract.rfaEligible).toLowerCase() === "true" ? "animate-pulse" : "")
                    }
                  >
                    RFA: {String(contract.rfaEligible).toLowerCase() === "true" ? "✅" : "❌"}
                  </Bubble>
                  <Bubble
                    className={
                      "bg-pink-700 bg-opacity-50 " +
                      (String(contract.franchiseTagEligible).toLowerCase() === "false" ? "animate-pulse" : "")
                    }
                  >
                    Tag: {String(contract.franchiseTagEligible).toLowerCase() === "true" ? "✅" : "❌"}
                  </Bubble>
                  <Bubble className="bg-teal-700 bg-opacity-50">
                    KTC: {contract.ktcValue ? contract.ktcValue : "-"}
                  </Bubble>
                  <Bubble
                    className={
                      "bg-orange-700 bg-opacity-50 " +
                      (String(contract.contractFinalYear) === String(new Date().getFullYear()) ? "animate-pulse" : "")
                    }
                  >
                    Final Year: {contract.contractFinalYear || "-"}
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
            <div className="flex flex-col items-center justify-center w-full h-full p-4 bg-gradient-to-br from-[#001A2B] via-gray-900 to-[#22223b] rounded-lg border border-white/10 shadow-xl relative">
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
              {(contract?.position || contract?.age) && (
                <>
                  {contract?.position && (
                    <div
                      className="flex items-center gap-2 z-10"
                      style={{
                        position: 'absolute',
                        left: '1.5rem',
                        bottom: '8.5rem',
                        transform: 'rotate(90deg)',
                        transformOrigin: 'bottom left',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.75rem',
                        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.25)',
                        maxWidth: '90%',
                      }}
                    >
                      <span className="text-white/80 text-base font-semibold drop-shadow">{contract.position}</span>
                    </div>
                  )}
                  {contract?.age && (
                    <div
                      className="flex items-center gap-2 z-10"
                      style={{
                        position: 'absolute',
                        left: '1.5rem',
                        bottom: '6rem',
                        transform: 'rotate(90deg)',
                        transformOrigin: 'bottom left',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.75rem',
                        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.25)',
                        maxWidth: '90%',
                      }}
                    >
                      <span className="text-white/80 text-base font-semibold drop-shadow">Age: {contract.age}</span>
                    </div>
                  )}
                </>
              )}
              {/* Team avatar and name top-right, rotated 90deg */}
              {(teamName || teamAvatars[teamName]) && (
                <div
                  className="flex items-center gap-2 z-10"
                  style={{
                    position: 'absolute',
                    right: '1.5rem',
                    top: '7rem',
                    transform: 'rotate(90deg)',
                    transformOrigin: 'top right',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '0.75rem',
                    boxShadow: '0 2px 8px 0 rgba(0,0,0,0.25)',
                    maxWidth: '90%',
                  }}
                >
                  {teamAvatars[teamName] ? (
                    <img
                      src={`https://sleepercdn.com/avatars/${teamAvatars[teamName]}`}
                      alt={teamName}
                      className="w-8 h-8 rounded-full border border-white/20 shadow"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-white/10 inline-block"></span>
                  )}
                  <span className="text-white/80 text-base font-semibold drop-shadow truncate" style={{maxWidth: '7rem'}}>{teamName}</span>
                </div>
              )}
              <div className="mb-4 text-lg font-bold tracking-wide text-[#FF4B1F] drop-shadow">Active Contracts</div>
              {/* Contract Table */}
              {allContracts.filter(c => c.status === "Active" || c.status === "Future").length > 0 ? (
                <div className="w-full flex justify-center items-center h-full">
                  <table className="w-auto text-sm border border-white/10 rounded bg-black/30 mx-auto rotate-90 origin-center shadow-lg">
                    <thead>
                      <tr className="bg-black/60 text-[#FF4B1F] text-base">
                        <th className="p-2 border-b border-white/10 font-semibold">Type</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Status</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Start Year</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 1</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 2</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 3</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Year 4</th>
                        <th className="p-2 border-b border-white/10 font-semibold">Final Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allContracts.filter(c => c.status === "Active" || c.status === "Future").map((c, idx) => (
                        <tr key={idx} className="border-b border-white/10 last:border-0 hover:bg-[#FF4B1F]/10 transition-colors">
                          <td className="p-2 text-white/90">{c.contractType}</td>
                          <td className="p-2 text-white/90">{c.status}</td>
                          <td className="p-2 text-white/80">{c.contractStartYear || '-'}</td>
                          <td className="p-2 text-green-400">{c.curYear ? `$${c.curYear.toFixed(1)}` : '-'}</td>
                          <td className="p-2 text-green-400">{c.year2 ? `$${c.year2.toFixed(1)}` : '-'}</td>
                          <td className="p-2 text-green-400">{c.year3 ? `$${c.year3.toFixed(1)}` : '-'}</td>
                          <td className="p-2 text-green-400">{c.year4 ? `$${c.year4.toFixed(1)}` : '-'}</td>
                          <td className="p-2 text-white/80">{c.contractFinalYear || '-'}</td>
                        </tr>
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
      {/* Flip control below the card, only when expanded */}
      {expanded && (
        <button
          onClick={() => setFlipped(f => !f)}
          className="mt-4 bg-blue-700 text-white rounded px-4 py-2 text-base font-semibold shadow hover:bg-blue-800 transition-colors"
          aria-label="Flip card"
        >
          Flip
        </button>
      )}
    </div>
  );
}