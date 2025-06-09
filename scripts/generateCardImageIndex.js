// filepath: scripts/generateCardImageIndex.js
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../public/players/cardimages");
const out = path.join(dir, "index.json");

const files = fs.readdirSync(dir)
  .filter(f => !f.startsWith("default") && f !== "index.json" && f.endsWith(".png"));
fs.writeFileSync(out, JSON.stringify(files, null, 2));
console.log("index.json generated with", files.length, "files");