'use client';

import React from 'react';
import { CalendarDays, Layers3, Sparkles, ShieldCheck } from 'lucide-react';

const DraftHeader = ({ draftInfo, draftYear }) => {
  const rounds = draftInfo?.settings?.rounds || '---';
  const format = draftInfo?.type ? draftInfo.type.charAt(0).toUpperCase() + draftInfo.type.slice(1) : '---';

  return (
    <header className="relative border-b border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,75,31,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_24%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
              <img
                src="/logo.png"
                alt="BBB League"
                className="h-14 w-14 rounded-xl object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#FF4B1F]/20 bg-[#FF4B1F]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#FFB39F]">
                <Sparkles className="h-3.5 w-3.5" />
                Draft Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{draftYear} Rookie Draft</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68 md:text-base">
                The rookie draft is where the league&apos;s future value is locked in. The revised wage scale now tracks every pick more precisely.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[460px] lg:grid-cols-3">
            <HeroStat icon={CalendarDays} label="Next draft" value={`May 1, ${draftYear || '---'}`} />
            <HeroStat icon={Layers3} label="Rounds" value={rounds} />
            <HeroStat icon={ShieldCheck} label="Format" value={format} />
          </div>
        </div>
      </div>
    </header>
  );
};

function HeroStat({ icon: Icon, label, value, accent = false }) {
  return (
    <div
      className={`rounded-2xl border p-3 shadow-[0_12px_30px_rgba(0,0,0,0.16)] ${
        accent ? 'border-[#FF4B1F]/20 bg-[#FF4B1F]/10' : 'border-white/10 bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</div>
          <div className="mt-1 text-sm font-bold text-white">{value}</div>
        </div>
        <div className={`rounded-xl p-2 ${accent ? 'bg-[#FF4B1F]/15 text-[#FFB39F]' : 'bg-white/5 text-white/70'}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default DraftHeader;
