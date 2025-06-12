// filepath: c:\Users\lalde\OneDrive\Documents\bbb-league-site\scripts\generateCardImageIndex.js
const fs = require("fs");
const path = require("path");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const cloudName = "drn1zhflh";
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const out = path.join(__dirname, "../public/players/cardimages/index.json");

async function generateIndex() {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?max_results=500`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Cloudinary API error:", errorText);
    process.exit(1);
  }

  const data = await response.json();
  const images = (data.resources || [])
    .filter(
      (img) =>
        !img.public_id.split("/").pop().startsWith("default") &&
        ["png", "jpg", "jpeg", "webp"].includes(img.format)
    )
    .map((img) => ({
      filename: img.public_id.split("/").pop(),
      src: img.secure_url,
    }));

  fs.writeFileSync(out, JSON.stringify(images, null, 2), "utf-8");
  console.log("index.json generated with", images.length, "files");
}

generateIndex().catch((err) => {
  console.error("Error generating Cloudinary index:", err);
  process.exit(1);
});