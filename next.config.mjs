/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['sleepercdn.com'],
  },
  async headers() {
    return [
      {
        // Apply to all routes; adjust if you only want OCR pages isolated
        source: '/:path*',
        headers: [
          // Enable cross-origin isolation so Tesseract can use SIMD/threads
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          // If you later add a CSP elsewhere (middleware/vercel.json), ensure it allows:
          // worker-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: blob:;
        ],
      },
    ];
  },
};

export default nextConfig;
