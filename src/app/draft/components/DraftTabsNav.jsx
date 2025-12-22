'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((t) => {
        const isActive = current === t.key || pathname === t.href;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`px-4 py-2 rounded inline-flex items-center whitespace-nowrap ${
              isActive
                ? 'bg-[#FF4B1F] text-white'
                : 'bg-black/30 text-white/70 hover:bg-black/40'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
