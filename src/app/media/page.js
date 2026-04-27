"use client";

import { useEffect, useState } from "react";
import Image from "next/image"; // Add this import
import BankerFeed from "@/components/BankerFeed";

export default function MediaPage() {
  const [images, setImages] = useState([]);

  // --- BankerFeed state and fetch ---
  const [tweets, setTweets] = useState([]);
  const [showAdamOnly, setShowAdamOnly] = useState(false);
  const [peopleFilterOpen, setPeopleFilterOpen] = useState(false);
  const [peopleOptions, setPeopleOptions] = useState([]);
  const [peopleEnabled, setPeopleEnabled] = useState({});
  const [teamOptions, setTeamOptions] = useState(["All"]);
  const [selectedTeam, setSelectedTeam] = useState("All");

  function extractTweetTeams(tweet) {
    const teamValue = String(tweet?._team || "").trim();
    if (!teamValue) return [];

    return teamValue
      .split(',')
      .map((team) => team.trim())
      .filter(Boolean);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchTweets() {
      try {
        if (typeof document !== "undefined" && document.hidden) {
          return;
        }

        const res = await fetch("/api/media-feed?sync=1", { cache: "no-store" });
        const data = await res.json();
        const sorted = Array.isArray(data?.tweets) ? data.tweets : [];

        if (cancelled) {
          return;
        }

        // Build people and team options
        const personMap = {};
        const teamSet = new Set();
        sorted.forEach((t) => {
          const display = (t?.name || "").replace(/^@/, "").trim();
          const norm = display.toLowerCase();
          if (display) personMap[norm] = display;
          extractTweetTeams(t).forEach((team) => teamSet.add(team));
        });

        setTweets(sorted);
        setPeopleOptions(
          Object.values(personMap).sort((a, b) => a.localeCompare(b))
        );
        setPeopleEnabled((prev) => {
          const next = { ...prev };
          Object.keys(personMap).forEach((k) => {
            if (!Object.prototype.hasOwnProperty.call(next, k)) {
              next[k] = true;
            }
          });
          return next;
        });
        setTeamOptions(["All", ...Array.from(teamSet).sort()]);
      } catch (err) {
        if (!cancelled) {
          setTweets([]);
        }
      }
    }

    fetchTweets();

    const intervalId = window.setInterval(fetchTweets, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  function isAdamTweet(t) {
    const name = (t?.name || "").replace(/^@/, "").trim().toLowerCase();
    return name === "adam glazerport";
  }

  // Apply filters
  const visibleTweets = (showAdamOnly ? tweets.filter(isAdamTweet) : tweets)
    .filter((t) => {
      const key = (t?.name || "").replace(/^@/, "").trim().toLowerCase();
      return peopleEnabled[key] !== false;
    })
    .filter((t) => selectedTeam === "All" || extractTweetTeams(t).includes(selectedTeam));

  // --- End BankerFeed state and fetch ---

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
      {/* --- Banker Feed at top --- */}
      <div className="mb-8 bg-black/30 rounded-lg border border-white/10 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-[#FF4B1F]">
            League bAnker Feed
          </h1>
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => setShowAdamOnly((v) => !v)}
              title={
                showAdamOnly
                  ? "Showing Adam Glazerport only"
                  : "Show only Adam Glazerport"
              }
              className={`text-xs px-2 py-1 rounded border transition-colors
                ${
                  showAdamOnly
                    ? "bg-[#FF4B1F] text-black border-[#FF4B1F]"
                    : "bg-black/20 text-white/70 border-white/20 hover:text-white hover:border-[#FF4B1F]"
                }`}
            >
              AG Only
            </button>
            {/* People filter toggle + panel */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeopleFilterOpen((o) => !o)}
                className="text-xs px-2 py-1 rounded border bg-black/20 text-white/70 border-white/20 hover:text-white hover:border-[#FF4B1F] transition-colors"
                title="Filter by person"
              >
                People
              </button>
              {peopleFilterOpen && (
                <div className="absolute right-0 mt-2 w-56 max-h-64 overflow-auto bg-[#0b1420] border border-white/10 rounded-md shadow-lg z-10 p-2 space-y-1">
                  {peopleOptions.length === 0 ? (
                    <div className="text-xs text-white/60 px-1 py-1">
                      No people found
                    </div>
                  ) : (
                    peopleOptions.map((displayName) => {
                      const key = displayName.toLowerCase();
                      const checked = peopleEnabled[key] !== false;
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-xs text-white/80 px-1 py-1 hover:bg-white/5 rounded"
                        >
                          <input
                            type="checkbox"
                            className="accent-[#FF4B1F]"
                            checked={checked}
                            onChange={(e) =>
                              setPeopleEnabled((prev) => ({
                                ...prev,
                                [key]: e.target.checked,
                              }))
                            }
                          />
                          <span>@{displayName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {/* Team filter */}
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="text-xs px-2 py-1 rounded border bg-black/20 text-white/80 border-white/20 hover:border-[#FF4B1F] focus:outline-none"
              title="Filter by team"
            >
              {teamOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <BankerFeed tweets={visibleTweets} />
      </div>
      {/* --- End Banker Feed --- */}

      <h1 className="text-3xl font-bold text-[#FF4B1F] mb-4">Gallery</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {Array.isArray(images) &&
          images.map((img, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <a href={img.src} target="_blank" rel="noopener noreferrer">
                <Image
                  src={img.src}
                  alt={img.filename}
                  width={300}
                  height={200}
                  className="rounded-lg"
                  loading="lazy"
                  unoptimized={img.src.startsWith("http")}
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