import React from "react";

/**
 * @param {Object} props
 * @param {Object} props.contract - Contract info from BBB_Contracts
 * @param {string} [props.imageExtension] - e.g. "png" (default: png)
 */
export default function PlayerProfileCard({
  contract,
  imageExtension = "png",
}) {
  // Convert player name to snake_case for filename
  const fileName = contract.playerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  // Try custom image, fallback to default for position
  const imageSrc = `/players/cardimages/${fileName}.${imageExtension}`;
  const defaultSrc = `/players/cardimages/default_${contract.position?.toLowerCase()}.${imageExtension}`;

  // Use onError to fallback to default image if custom not found
  const [imgSrc, setImgSrc] = React.useState(imageSrc);

  const handleImgError = () => {
    if (imgSrc !== defaultSrc) setImgSrc(defaultSrc);
  };

  // Helper for bubble
  const Bubble = ({ children, className = "" }) => (
    <span
      className={
        "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-black/70 text-white mr-1 mb-1 " +
        className
      }
    >
      {children}
    </span>
  );

  return (
    <div className="relative w-48 h-64 rounded-lg overflow-hidden shadow-lg bg-gray-900">
      <img
        src={imgSrc}
        alt={contract.playerName}
        className="object-cover w-full h-full"
        onError={handleImgError}
      />
      {/* Bubble overlay */}
      <div className="absolute bottom-0 left-0 w-full flex flex-wrap px-2 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <Bubble className="bg-[#FF4B1F]">{contract.playerName}</Bubble>
        <Bubble className="bg-blue-700">{contract.position}</Bubble>
        <Bubble className="bg-green-700">
          ${contract.curYear ? contract.curYear.toFixed(1) : "-"}
        </Bubble>
        <Bubble className="bg-white/20">{contract.contractType}</Bubble>
        <Bubble className="bg-purple-700">{contract.team}</Bubble>
        <Bubble className="bg-yellow-700">Age: {contract.age || "-"}</Bubble>
        <Bubble className="bg-cyan-700">
          RFA: {contract.rfaEligible === "Yes" ? "✅" : "❌"}
        </Bubble>
        <Bubble className="bg-pink-700">
          Tag: {contract.franchiseTagEligible === "Yes" ? "✅" : "❌"}
        </Bubble>
        <Bubble className="bg-gray-700">
          KTC: {contract.ktcValue ? contract.ktcValue : "-"}
        </Bubble>
      </div>
    </div>
  );
}