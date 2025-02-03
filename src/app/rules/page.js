'use client';

export default function Rules() {
  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className="bg-black/30 p-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-16 w-16 transition-transform hover:scale-105"
            />
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Rules & Resources</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="rounded-lg border border-white/10 shadow-xl bg-black/20 overflow-hidden">
          <iframe 
            src="/rulebook.pdf"
            className="w-full h-[800px]"
            title="BBB League Rulebook"
          />
        </div>
      </div>
    </main>
  );
}