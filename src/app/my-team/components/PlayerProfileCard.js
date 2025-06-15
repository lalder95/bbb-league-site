import React, { useEffect, useState } from "react";

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s'-]/g, "_") // replace spaces, apostrophes, hyphens with underscore
    // .replace(/\./g, "_")   // <-- REMOVE this line to keep periods
    .replace(/[^a-z0-9_.]/g, ""); // allow a-z, 0-9, underscore, and period
}

export default function PlayerProfileCard({
  playerId,
  contracts,
  imageExtension = "png",
  expanded = false,
  onExpandClick,
  className = "",
}) {
  const [contract, setContract] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);

  useEffect(() => {
    async function fetchContract() {
      if (contracts && contracts.length) {
        const found = contracts.find(
          (c) => String(c.playerId) === String(playerId)
        );
        setContract(found || null);
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
        const foundRow = rows
          .slice(1)
          .map((row) => row.split(","))
          .find((cols) => String(cols[idx]) === String(playerId));

        if (foundRow) {
          setContract({
            playerId: foundRow[0],
            playerName: foundRow[1],
            contractType: foundRow[2],
            status: foundRow[14],
            team: foundRow[33], // TeamDisplayName
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
        } else {
          setContract(null);
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

    // Map positions to local default image paths
    const defaultImages = {
      qb: "/players/cardimages/default_qb.png",
      rb: "/players/cardimages/default_rb.png",
      te: "/players/cardimages/default_te.png",
      wr: "/players/cardimages/default_wr.png",
    };

    async function fetchImage() {
      const normalized = normalizeName(contract.playerName);

      // Also try a version that keeps hyphens
      const altNormalized = contract.playerName
        .toLowerCase()
        .replace(/[\s']/g, "_") // spaces and apostrophes to underscores
        // keep hyphens as hyphens
        .replace(/[^a-z0-9_.-]/g, ""); // allow a-z, 0-9, underscore, period, hyphen

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
        console.log("Found image in index.json:", found.src);
        return;
      }

      // Fallback: Try Cloudinary with normalized name (may not work for all)
      const cloudinaryUrl = `https://res.cloudinary.com/drn1zhflh/image/upload/v1749697886/${normalized}.png`;
      try {
        const res = await fetch(cloudinaryUrl, { method: "HEAD" });
        if (res.ok) {
          setImgSrc(cloudinaryUrl);
          console.log("Fallback Cloudinary URL used:", cloudinaryUrl);
          return;
        }
      } catch (e) {
        console.log("Cloudinary fetch error:", e);
      }

      // Fallback to default image
      const pos = (contract.position || "").toLowerCase();
      setImgSrc(defaultImages[pos] || "");
      console.log("Using default image for position:", pos);
    }

    fetchImage();
  }, [contract, imageExtension]);

  // Handle image error fallback
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

  // Helper for bubble
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
    <div className={`relative w-full h-full rounded-lg overflow-hidden shadow-lg bg-gray-900 ${className}`}>
      <img
        src={imgSrc}
        alt={contract.playerName}
        className="object-contain w-full h-full"
        onError={handleImgError}
      />
      {/* Expand button */}
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
      {/* Bubble overlay */}
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
  );
}