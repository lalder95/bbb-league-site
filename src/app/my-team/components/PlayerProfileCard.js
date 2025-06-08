import React, { useEffect, useState } from "react";

export default function PlayerProfileCard({
  playerId,
  contracts,
  imageExtension = "png",
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
          // Debug: log the entire row and the values you are about to use
          console.log("Found row for playerId", playerId, foundRow);
          console.log({
            playerId: foundRow[0],
            playerName: foundRow[1],
            contractType: foundRow[2],
            status: foundRow[14],
            team: foundRow[32],
            position: foundRow[21],
            curYear: foundRow[15],
            year2: foundRow[16],
            year3: foundRow[17],
            year4: foundRow[18],
            contractFinalYear: foundRow[5],
            age: foundRow[31],
            ktcValue: foundRow[33],
            rfaEligible: foundRow[36],
            franchiseTagEligible: foundRow[37],
          });

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

  // Set image source when contract is loaded
  useEffect(() => {
    if (!contract) {
      setImgSrc(null);
      return;
    }
    const fileName = contract.playerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const imageSrc = `/players/cardimages/${fileName}.${imageExtension}`;
    setImgSrc(imageSrc);
  }, [contract, imageExtension]);

  // Handle image error fallback
  const handleImgError = () => {
    if (!contract) return;
    const defaultSrc = `/players/cardimages/default_${contract.position?.toLowerCase()}.${imageExtension}`;
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
    <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg bg-gray-900">
      <img
        src={imgSrc}
        alt={contract.playerName}
        className="object-contain w-full h-full"
        onError={handleImgError}
      />
      {/* Bubble overlay */}
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
        <Bubble
          className={
            "bg-teal-700 bg-opacity-50"
          }
        >
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
    </div>
  );
}