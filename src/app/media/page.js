import fs from "fs";
import path from "path";

// Helper to capitalize each word
function capitalizeWords(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SalaryCap() {
  // Get images from the public/players/cardimages directory
  const imagesDir = path.join(process.cwd(), "public", "players", "cardimages");
  let images = [];
  try {
    images = fs
      .readdirSync(imagesDir)
      .filter((file) => !file.startsWith("default") && file.endsWith(".png")) // Only .png files
      .map((file) => {
        // Remove extension, replace underscores with spaces, and split for player/team
        const base = file.replace(/\.[^/.]+$/, "");
        const [player, team] = base.split("_");
        return {
          src: `/players/cardimages/${file}`,
          player: capitalizeWords(player.replace(/-/g, " ")),
          team: team ? capitalizeWords(team.replace(/-/g, " ")) : "",
        };
      });
  } catch (e) {
    // Directory may not exist in dev serverless mode
  }

  return (
    <main className="max-w-7xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Media</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {images.map((img, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <a href={img.src} target="_blank" rel="noopener noreferrer">
              <img
                src={img.src}
                alt={img.player}
                className="w-48 h-auto rounded shadow mb-2 bg-black/20 object-contain cursor-pointer transition-transform hover:scale-105"
              />
            </a>
            <div className="text-center">
              <div className="font-semibold">
                {img.player}
                {img.team ? ` ${img.team}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
      {images.length === 0 && <p>No images found.</p>}
    </main>
  );
}