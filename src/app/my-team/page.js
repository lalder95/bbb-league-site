'use client';
import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function MyTeam() {
  // Session and router
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Redirect if not logged in
  React.useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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
              {session?.user?.name || 'My Team'}
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-8">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-24 w-24 text-[#FF4B1F] opacity-80"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
              />
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
              />
            </svg>
          </div>
          
          <h2 className="text-4xl font-bold mb-6 text-white">Coming Soon</h2>
          
          <div className="max-w-2xl bg-black/30 rounded-lg p-8 shadow-xl border border-white/10">
            <p className="text-xl text-white/80 mb-6">
              We're working on an improved My Team experience for BBB League members.
            </p>
            <p className="text-white/60 mb-8">
              This page will show your team roster, player contracts, salary cap situation, draft capital, and league comparison tools.
            </p>
            <div className="py-4 px-6 bg-black/40 rounded-lg inline-block">
              <p className="text-[#FF4B1F]">Expected launch: idk lol</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}