'use client';

import React, { useState, useEffect } from 'react';

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
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className={isMobile ? "h-12 w-12 transition-transform hover:scale-105" : "h-16 w-16 transition-transform hover:scale-105"}
            />
            <h1 className={isMobile ? "text-2xl font-bold text-[#FF4B1F]" : "text-3xl font-bold text-[#FF4B1F]"}>Offseason Guide</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        <div className="space-y-8">
          {schedule.map((item, index) => (
            <div 
              key={item.date}
              className={`relative flex flex-col md:flex-row items-start ${isMobile ? 'gap-4' : 'gap-8'} group`}
            >
              {/* Vertical line */}
              {!isMobile && index !== schedule.length - 1 && (
                <div className="absolute left-[59px] top-16 w-0.5 h-full bg-white/10 group-hover:bg-[#FF4B1F]/20 transition-colors" />
              )}
              
              {/* Date circle */}
              <div className="relative flex-shrink-0 mb-4 md:mb-0">
                <div className={isMobile 
                  ? "w-20 h-20 rounded-full bg-black/30 border border-white/10 flex items-center justify-center p-2 text-center group-hover:border-[#FF4B1F] transition-colors"
                  : "w-[120px] h-[120px] rounded-full bg-black/30 border border-white/10 flex items-center justify-center p-4 text-center group-hover:border-[#FF4B1F] transition-colors"
                }>
                  <div className="text-[#FF4B1F] font-bold">{item.date}</div>
                </div>
              </div>

              {/* Events */}
              <div className="flex-1 bg-black/30 rounded-lg border border-white/10 p-4 md:p-6 group-hover:border-[#FF4B1F] transition-colors">
                <ul className="space-y-2">
                  {item.events.map((event, eventIndex) => (
                    <li 
                      key={eventIndex}
                      className="flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#FF4B1F]" />
                      <span>{event}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}