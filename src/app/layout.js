// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import Navigation from '@/components/Navigation';
import ConditionalNewsTicker from '@/components/ConditionalNewsTicker';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import { Providers } from './providers';
import { headers } from 'next/headers';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "BBB League",
  description: "BBB Fantasy Football League",
};

export const viewport = {
  themeColor: '#FF4B1F',
};

function toMilliseconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

function formatSinceLastTrade(lastTradeMs) {
  if (!lastTradeMs) return 'No trades yet this season';

  const diffMs = Math.max(0, Date.now() - lastTradeMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  let elapsed = '';
  if (days > 0) elapsed = `${days}d ${hours}h`;
  else if (hours > 0) elapsed = `${hours}h ${minutes}m`;
  else elapsed = `${minutes}m`;

  return `${elapsed} since last trade`;
}

async function getFooterTradeCounterData() {
  const fallback = {
    seasonLabel: `${new Date().getFullYear()} Season`,
    count: 0,
    sinceText: 'No trades yet this season',
  };

  try {
    const season = String(new Date().getFullYear());
    const headerStore = await headers();
    const host = headerStore.get('x-forwarded-host') || headerStore.get('host');

    if (!host) return fallback;

    const protocol = headerStore.get('x-forwarded-proto') || (process.env.NODE_ENV === 'development' ? 'http' : 'https');
    const response = await fetch(`${protocol}://${host}/api/history/trades?season=${encodeURIComponent(season)}`, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) return fallback;

    const payload = await response.json();
    const trades = Array.isArray(payload?.trades) ? payload.trades : [];

    let lastTradeMs = null;
    for (const trade of trades) {
      const createdAt = toMilliseconds(trade?.created);
      if (!createdAt) continue;
      if (!lastTradeMs || createdAt > lastTradeMs) lastTradeMs = createdAt;
    }

    return {
      seasonLabel: `${season} Season`,
      count: trades.length,
      sinceText: formatSinceLastTrade(lastTradeMs),
    };
  } catch {
    return fallback;
  }
}

export default async function RootLayout({ children }) {
  const tradeCounter = await getFooterTradeCounterData();

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#001A2B] min-h-screen pt-16 md:pt-28 pb-16`}>
        <Providers>
          <ServiceWorkerRegistration />
          <Navigation />
          {children}
          {/* Footer */}
          <footer style={{
            width: '100%',
            background: 'rgba(0,26,43,0.95)',
            color: '#bbb',
            padding: '1.5rem 0 1rem 0',
            fontSize: '0.95em',
            borderTop: '1px solid #223',
            marginTop: '2rem',
            letterSpacing: '0.01em',
            zIndex: 10,
          }}>
            <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-4 px-4 md:grid-cols-[minmax(180px,1fr)_auto_minmax(180px,1fr)] md:items-center">
              <div className="order-2 md:order-1 md:justify-self-start">
                <div className="inline-flex min-w-[150px] flex-col items-center rounded-md border border-[#223] bg-[rgba(0,0,0,0.2)] px-3 py-2 text-center">
                  <div className="text-[0.65rem] leading-tight text-[#888]">{tradeCounter.seasonLabel}</div>
                  <div className="mt-1 text-2xl font-semibold leading-none text-[#f2f2f2]">{tradeCounter.count} Trades</div>
                  <div className="mt-1 text-[0.65rem] leading-tight text-[#888]">{tradeCounter.sinceText}</div>
                </div>
              </div>

              <div className="order-1 text-center md:order-2">
                <span>&copy; {new Date().getFullYear()} Budget Blitz Bowl Fantasy Football League (Created by Lucas Alder) &mdash; Built with Next.js & Tailwind CSS</span>
                <div style={{ fontSize: '0.85em', color: '#888', marginTop: '0.5em' }}>
                  All KTC scores are courtesy of <a href="https://keeptradecut.com" target="_blank" rel="noopener noreferrer" style={{ color: '#bbb', textDecoration: 'underline' }}>KeepTradeCut.com</a>.<br />
                  All logos used in Player Images and Player Profile Cards are the property of the National Football League.
                </div>
              </div>

              <div className="order-3 hidden md:block" aria-hidden="true" />
            </div>
          </footer>
          <ConditionalNewsTicker />
        </Providers>
      </body>
    </html>
  );
}