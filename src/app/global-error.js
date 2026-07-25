'use client';

import Link from 'next/link';

export default function GlobalError() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#001A2B] px-6 text-center text-white">
        <main className="max-w-lg space-y-4">
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-white/50">Error</div>
          <h1 className="text-3xl font-black text-[#FF4B1F] sm:text-4xl">Something went wrong</h1>
          <p className="text-sm text-white/70 sm:text-base">
            The page could not be rendered.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-[#FF4B1F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ff6a45]"
          >
            Go home
          </Link>
        </main>
      </body>
    </html>
  );
}