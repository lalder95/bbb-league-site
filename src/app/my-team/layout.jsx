'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const tabs = [
  { href: '/my-team/roster', label: 'Roster' },
  { href: '/my-team/finance', label: 'Finance' },
  { href: '/my-team/draft', label: 'Draft' },
  { href: '/my-team/free-agency', label: 'Free Agency' },
  { href: '/my-team/assistant-gm', label: 'Assistant GM' },
  { href: '/my-team/badges', label: 'Badges' },
  { href: '/my-team/contract-management', label: 'Contract Management' },
];

export default function MyTeamLayout({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      {/* Header Banner */}
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="BBB League"
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">My Team</h1>
          </div>
          <div className="hidden md:block">
            <div className="text-white/70">
              {session?.user?.name || ''}
            </div>
          </div>
        </div>
      </div>

      {/* Subnav */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex flex-wrap gap-2 border-b border-white/10">
          {tabs.map(tab => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 font-semibold rounded-t-lg transition-colors duration-200 focus:outline-none ${
                  active ? 'bg-[#FF4B1F] text-white shadow' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto p-6">{children}</div>
    </main>
  );
}