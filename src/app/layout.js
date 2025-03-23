import { Geist, Geist_Mono } from "next/font/google";
import Navigation from '@/components/Navigation';
import NewsTicker from '@/components/NewsTicker';
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#001A2B] min-h-screen pb-16`}>
        <Providers>
          <Navigation />
          {children}
          <NewsTicker />
        </Providers>
      </body>
    </html>
  );
}