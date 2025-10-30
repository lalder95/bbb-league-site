// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import Navigation from '@/components/Navigation';
import ConditionalNewsTicker from '@/components/ConditionalNewsTicker';
import { Providers } from './providers';
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#001A2B] min-h-screen pt-16 pb-16`}>
        <Providers>
          <Navigation />
          {children}
          {/* Footer */}
          <footer style={{
            width: '100%',
            background: 'rgba(0,26,43,0.95)',
            color: '#bbb',
            textAlign: 'center',
            padding: '1.5rem 0 1rem 0',
            fontSize: '0.95em',
            borderTop: '1px solid #223',
            marginTop: '2rem',
            letterSpacing: '0.01em',
            zIndex: 10,
          }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1rem' }}>
              <span>&copy; {new Date().getFullYear()} Budget Blitz Bowl Fantasy Football League (Created by Lucas Alder) &mdash; Built with Next.js & Tailwind CSS</span>
              <div style={{ fontSize: '0.85em', color: '#888', marginTop: '0.5em' }}>
                All KTC scores are courtesy of <a href="https://keeptradecut.com" target="_blank" rel="noopener noreferrer" style={{ color: '#bbb', textDecoration: 'underline' }}>KeepTradeCut.com</a>.<br />
                All logos used in Player Images and Player Profile Cards are the property of the National Football League.
              </div>
            </div>
          </footer>
          <ConditionalNewsTicker />
        </Providers>
      </body>
    </html>
  );
}