// filepath: c:\Users\lalde\OneDrive\Documents\bbb-league-site\scripts\generateCardImageIndex.js
const fs = require("fs");
const path = require("path");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const cloudName = "drn1zhflh";
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const out = path.join(__dirname, "../public/players/cardimages/index.json");

function writeStub(reason) {
  try {
    if (!fs.existsSync(path.dirname(out))) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
    }
    const stub = [];
    fs.writeFileSync(out, JSON.stringify(stub, null, 2), "utf-8");
    console.warn(
      `Cloudinary index skipped (${reason}). Wrote stub index.json with 0 items.`
    );
  } catch (e) {
    console.error("Failed to write stub index.json:", e);
  }
}

async function generateIndex() {
  // If credentials are missing, don't block dev/build; write a stub
  if (!apiKey || !apiSecret) {
    writeStub("missing CLOUDINARY_API_KEY/SECRET");
    return;
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?max_results=500`;

  // Add a fetch timeout to avoid hanging indefinitely
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    writeStub(`network error or timeout: ${err && err.name ? err.name : "unknown"}`);
    return;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "<no body>");
    console.error("Cloudinary API error:", errorText);
    // Write stub instead of exiting so dev server can start
    writeStub(`API error status ${response.status}`);
    return;
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
  console.error("Unexpected error generating Cloudinary index:", err);
  // Do not block; write stub and continue
  writeStub("unexpected exception");
});