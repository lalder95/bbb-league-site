'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const tabs = [
  { key: 'draft-order', label: 'Draft Order', href: '/draft' },
  { key: 'traded-picks', label: 'Traded Picks', href: '/draft/traded-picks' },
  { key: 'past-drafts', label: 'Past Drafts', href: '/draft/past-drafts' },
  { key: 'rookie-salaries', label: 'Rookie Salaries', href: '/draft/rookie-salaries' },
  { key: 'mock-draft', label: 'Mock Draft', href: '/draft/mock-draft' },
];

export default function DraftTabsNav({ activeTab }) {
  const pathname = usePathname();
  const current = activeTab || pathname;

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-md">
      <div className="flex min-w-max flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = current === t.key || pathname === t.href;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`group inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#FF4B1F] text-white shadow-[0_10px_28px_rgba(255,75,31,0.28)]'
                  : 'border border-white/10 bg-white/[0.03] text-white/70 hover:-translate-y-0.5 hover:border-[#FF4B1F]/30 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <span>{t.label}</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${isActive ? 'translate-x-0' : 'opacity-50 group-hover:translate-x-0.5'}`} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
