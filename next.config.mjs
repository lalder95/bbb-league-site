/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow external images we use around the site
    domains: [
      'sleepercdn.com',          // Sleeper avatars
      'res.cloudinary.com',      // Player card images on Cloudinary
    ],
  },
  async headers() {
    return [
      {
        // Only enable cross-origin isolation on the Trade tools where OCR (tesseract.js) runs
        // Using COEP: credentialless so normal third‑party images (Cloudinary/Sleeper) still load
        source: '/trade/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

export default nextConfig;
