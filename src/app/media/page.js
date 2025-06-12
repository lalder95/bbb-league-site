"use client";

import { useEffect, useState } from "react";

export default function SalaryCap() {
  const [images, setImages] = useState([]);

  useEffect(() => {
    fetch("/players/cardimages/index.json")
      .then((res) => res.json())
      .then((data) => {
        // Sort images alphabetically by filename
        const sorted = [...data].sort((a, b) => {
          const nameA = a.filename?.toLowerCase() || "";
          const nameB = b.filename?.toLowerCase() || "";
          return nameA.localeCompare(nameB);
        });
        setImages(sorted);
      });
  }, []);

  function stripLast7CharsAndUnderscores(filename) {
    // Remove last 7 chars, underscores, numbers, and capitalize each word
    const name = filename
      .slice(0, -7)
      .replace(/_/g, " ")
      .replace(/[0-9]/g, "")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return name.trim();
  }

  return (
    <main className="max-w-7xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Media</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {Array.isArray(images) &&
          images.map((img, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <a href={img.src} target="_blank" rel="noopener noreferrer">
                <img
                  src={img.src}
                  alt={img.filename}
                  className="w-48 h-auto rounded shadow mb-2 bg-black/20 object-contain cursor-pointer transition-transform hover:scale-105"
                />
              </a>
              <div className="text-center">
                <div className="font-semibold">
                  {stripLast7CharsAndUnderscores(
                    img.filename || img.src.split("/").pop().split(".")[0]
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
      {(!Array.isArray(images) || images.length === 0) && <p>No images found.</p>}
    </main>
  );
}