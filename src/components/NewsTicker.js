'use client';
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function NewsTicker() {
  const [news, setNews] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const decodeHTML = (html) => {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  };

  useEffect(() => {
    async function fetchNews() {
      try {
        const response = await fetch('/api/news');
        const newsItems = await response.json();
        const decodedNewsItems = newsItems.map(item => ({
          ...item,
          title: decodeHTML(item.title)
        }));
        setNews(decodedNewsItems);
      } catch (error) {
        console.error('Error fetching news:', error);
        setNews([
          { 
            title: "Loading news...", 
            link: "#", 
            category: "News", 
            timestamp: new Date().toISOString() 
          }
        ]);
      }
    }

    fetchNews();

    const interval = setInterval(fetchNews, 300000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible || news.length === 0) return null;

  const duplicatedNews = [...news, ...news];

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-black/80 border-t border-white/10 z-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
        <button
          onClick={() => setIsVisible(false)}
          className="text-white/50 hover:text-white p-2 -ml-2 mr-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close news ticker"
        >
          <X size={16} />
        </button>
        <div className="bg-[#FF4B1F] text-white px-4 py-2 mr-4 h-full flex items-center font-bold">
          Latest News
        </div>
        <div className="flex-1 overflow-hidden">
          <div 
            className="flex gap-8 scroll-animation"
            style={{
              '--total-items': duplicatedNews.length,
              '--scroll-width': `${duplicatedNews.length * 324}px`,
              animationPlayState: isPaused ? 'paused' : 'running'
            }}
          >
            {duplicatedNews.map((item, index) => (
              <a
                key={`${item.title}-${index}`}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 min-w-[300px] text-white hover:text-[#FF4B1F] transition-colors group"
              >
                <div className="text-sm text-[#FF4B1F] mb-1">
                  {item.category} • {new Date(item.timestamp).toLocaleTimeString()}
                </div>
                <div className="truncate group-hover:underline">
                  {item.title}
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-1 * var(--scroll-width) / 2));
          }
        }

        .scroll-animation {
          animation: scroll 120s linear infinite;
        }
      `}</style>
    </div>
  );
}