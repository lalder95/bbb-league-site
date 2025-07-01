'use client';

import React, { useState, useEffect } from 'react';
import { FaFlagCheckered, FaTags, FaExchangeAlt, FaUserClock, FaUserGraduate, FaGavel, FaCut, FaUserEdit } from 'react-icons/fa';

const EVENT_ICONS = {
  'First day of League Year': <FaFlagCheckered className="text-[#FF4B1F] text-xl" />,
  'Last day to apply Franchise Tags': <FaTags className="text-[#FF4B1F] text-xl" />,
  'Trades OPEN': <FaExchangeAlt className="text-[#FF4B1F] text-xl" />,
  'Final day to make a decision on holdout players': <FaUserClock className="text-[#FF4B1F] text-xl" />,
  'Rookie Draft': <FaUserGraduate className="text-[#FF4B1F] text-xl" />,
  'Free Agency Auction Draft': <FaGavel className="text-[#FF4B1F] text-xl" />,
  'Roster Cuts': <FaCut className="text-[#FF4B1F] text-xl" />,
  'Final day to extend players entering the final year of their contract': <FaUserEdit className="text-[#FF4B1F] text-xl" />
};

export default function Offseason() {
  const schedule = [
    {
      date: 'APRIL 1ST',
      events: [
        'First day of League Year',
        'Last day to apply Franchise Tags',
        'Trades OPEN'
      ]
    },
    {
      date: 'APRIL 30TH',
      events: [
        'Final day to make a decision on holdout players'
      ]
    },
    {
      date: 'MAY 1ST',
      events: [
        'Rookie Draft'
      ]
    },
    {
      date: 'JULY 1ST',
      events: [
        'Free Agency Auction Draft'
      ]
    },
    {
      date: 'AUGUST 31ST',
      events: [
        'Roster Cuts',
        'Final day to extend players entering the final year of their contract'
      ]
    }
  ];
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#001A2B] via-[#0A223A] to-[#FF4B1F] text-white font-sans">
      {/* Header Section */}
      <section className="w-full py-10 px-4 bg-black/60 shadow-lg border-b border-[#FF4B1F]/30">
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center gap-4">
          <img src="/logo.png" alt="BBB League" className="h-20 w-20 mb-2 drop-shadow-lg" />
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#FF4B1F] tracking-tight drop-shadow">Offseason Roadmap</h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl">Your step-by-step guide to the BBB League offseason. Stay on top of every key date and event with this visual breakdown!</p>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="max-w-3xl mx-auto py-12 px-2 md:px-0">
        <div className="relative border-l-4 border-[#FF4B1F]/40 ml-6">
          {schedule.map((item, index) => (
            <div key={item.date} className="mb-16 flex items-start group relative">
              {/* Timeline Marker */}
              <div className="absolute -left-8 top-0 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF4B1F] to-[#FF9068] border-4 border-white shadow-xl flex items-center justify-center text-2xl font-bold text-white mb-2 animate-pulse">
                  {item.date.split(' ')[0][0]}
                </div>
                {index !== schedule.length - 1 && (
                  <div className="w-1 h-24 bg-gradient-to-b from-[#FF4B1F]/60 to-transparent" />
                )}
              </div>
              {/* Card */}
              <div className="ml-20 flex-1 bg-black/70 rounded-2xl shadow-2xl border border-[#FF4B1F]/20 p-6 hover:scale-[1.025] transition-transform">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-2xl font-bold text-[#FF4B1F] tracking-wide">{item.date}</span>
                  <span className="h-2 w-2 rounded-full bg-[#FF4B1F] animate-pulse" />
                </div>
                <ul className="space-y-4 mt-2">
                  {item.events.map((event, eventIndex) => (
                    <li key={eventIndex} className="flex items-center gap-3 text-lg">
                      <span>{EVENT_ICONS[event] || <span className='text-[#FF4B1F]'>•</span>}</span>
                      <span className="text-white/90">{event}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}