export async function GET() {
  const cloudName = "drn1zhflh";
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  // No prefix, just get all uploaded images
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?max_results=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Cloudinary API error:", errorText);
    return new Response(JSON.stringify({ error: "Failed to fetch images", details: errorText }), { status: 500 });
  }

  const data = await response.json();
  const images = data.resources.map((img) => ({
    src: img.secure_url,
    filename: img.public_id,
  }));

  return new Response(JSON.stringify(images), { status: 200 });
}