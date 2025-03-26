'use client';
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function Rules() {
  const [windowHeight, setWindowHeight] = useState(800);
  const [isMobile, setIsMobile] = useState(false);

  // Update dimensions on window resize
  useEffect(() => {
    // Set initial values
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResize = () => {
    // Account for header and padding (roughly 200px)
    const availableHeight = window.innerHeight - 200;
    setWindowHeight(availableHeight > 400 ? availableHeight : 400);
    setIsMobile(window.innerWidth < 768);
  };

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
        {/* Mobile Warning and Download Option */}
        {isMobile && (
          <div className="mb-4 bg-[#FF4B1F]/10 rounded-lg border border-[#FF4B1F]/30 p-4">
            <p className="mb-2">
              The rulebook may be difficult to read on mobile devices. 
              Consider downloading it for a better experience.
            </p>
            <a 
              href="/rulebook.pdf" 
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-white"
            >
              <Download size={16} />
              <span>Download PDF</span>
            </a>
          </div>
        )}

        {/* Tabs for different viewing options */}
        <div className="mb-4 flex flex-wrap gap-2">
          <a 
            href="/rulebook.pdf" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors text-white"
          >
            Open in New Tab
          </a>
          <a 
            href="/rulebook.pdf" 
            download
            className="px-4 py-2 bg-black/30 rounded hover:bg-black/40 transition-colors text-white"
          >
            Download PDF
          </a>
        </div>

        {/* PDF Viewer */}
        <div className="rounded-lg border border-white/10 shadow-xl bg-black/20 overflow-hidden">
          <iframe 
            src="/rulebook.pdf"
            className="w-full"
            style={{ height: `${windowHeight}px` }}
            title="BBB League Rulebook"
          />
        </div>

        {/* Additional Resources */}
        <div className="mt-6">
          <h2 className="text-xl font-bold text-[#FF4B1F] mb-4">Additional Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a 
              href="/offseason"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Offseason Guide</h3>
              <p className="text-white/70">Key dates and deadlines for the offseason</p>
            </a>
            <a 
              href="/salary-cap"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Salary Cap</h3>
              <p className="text-white/70">Current team salary cap situations</p>
            </a>
            <a 
              href="/trade"
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/50 transition-colors"
            >
              <h3 className="font-bold mb-2">Trade Calculator</h3>
              <p className="text-white/70">Analyze and validate potential trades</p>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}