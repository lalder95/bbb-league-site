"use client";

import { useEffect, useState } from "react";
import Image from "next/image"; // Add this import

// --- BankerFeed component (copied from Home page) ---
function BankerFeed({ tweets }) {
  if (!tweets || tweets.length === 0) {
    return (
      <div className="text-center text-white/70 py-6 md:py-8">
        No posts available
      </div>
    );
  }
  return (
    <div
      className="space-y-2 overflow-y-auto"
      style={{
        maxHeight: "420px",
        scrollbarWidth: "thin",
        scrollbarColor: "#FF4B1F #1a232b",
      }}
    >
      {tweets.map((tweet, idx) => (
        <div
          key={idx}
          className="bg-black/20 rounded-xl px-4 py-3 border border-white/10 flex flex-col gap-2"
        >
          {/* Top: Avatar, Name, Handle */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {tweet.role === "journalist" ? (
                <span
                  title="Verified"
                  className="inline-block w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl border-2 border-blue-300"
                >
                  ✓
                </span>
              ) : (
                <span className="inline-block w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-2xl border-2 border-gray-500">
                  {tweet.name?.charAt(1) || "@"}
                </span>
              )}
            </div>
            {/* Name and handle */}
            <div className="flex flex-col">
              <span className="font-bold text-white leading-tight text-base">
                {tweet.name?.replace(/^@/, "") || "Unknown"}
              </span>
              <span className="text-gray-400 text-sm leading-tight">
                @{tweet.name?.replace(/^@/, "")}
              </span>
            </div>
          </div>
          {/* Body */}
          <div className="text-white/90 text-lg leading-snug px-1 pt-1 pb-2">
            {tweet.reaction}
          </div>
          {/* Timestamp */}
          <div className="text-xs text-gray-400 pl-1 pt-1 flex items-center gap-2">
            {tweet._timestamp ? formatTweetDate(tweet._timestamp) : ""}
            <span>·</span>
            <span className="text-blue-400 font-medium">bAnker for iPhone</span>
          </div>
          {/* NEW: Small print from contract change notes */}
          {tweet._parentNotes ? (
            <div className="text-[11px] text-white/50 italic pl-1">
              {tweet._parentNotes}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// Helper to format the date like ... (e.g., "1:21 PM · 1/4/21")
function formatTweetDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return "";
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = date.getHours() >= 12 ? "PM" : "AM";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${hours}:${minutes} ${ampm} · ${month}/${day}/${year}`;
}
// --- End BankerFeed ---

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

  useEffect(() => {
    async function fetchTweets() {
      try {
        const res = await fetch("/api/admin/contract_changes");
        const data = await res.json();
        const allChanges = Array.isArray(data) ? data : [];
        const allTweets = [];
        allChanges.forEach((change) => {
          if (Array.isArray(change.ai_notes)) {
            const shuffledNotes = shuffleArray(change.ai_notes);
            shuffledNotes.forEach((note) => {
              allTweets.push({
                ...note,
                _timestamp: change.timestamp,
                _team: change.team || "",
                _parentNotes: change.notes || "",
              });
            });
          }
        });
        // Sort newest -> oldest by timestamp
        const sorted = allTweets.sort((a, b) => {
          const at = new Date(a?._timestamp).getTime();
          const bt = new Date(b?._timestamp).getTime();
          if (isNaN(bt) && isNaN(at)) return 0;
          if (isNaN(bt)) return -1;
          if (isNaN(at)) return 1;
          return bt - at;
        });

        // Build people and team options
        const personMap = {};
        const teamSet = new Set();
        sorted.forEach((t) => {
          const display = (t?.name || "").replace(/^@/, "").trim();
          const norm = display.toLowerCase();
          if (display) personMap[norm] = display;
          if (t?._team) teamSet.add(t._team);
        });

        setTweets(sorted);
        setPeopleOptions(
          Object.values(personMap).sort((a, b) => a.localeCompare(b))
        );
        setPeopleEnabled((prev) => {
          if (Object.keys(prev).length) return prev;
          const init = {};
          Object.keys(personMap).forEach((k) => (init[k] = true));
          return init;
        });
        setTeamOptions(["All", ...Array.from(teamSet).sort()]);
      } catch (err) {
        setTweets([]);
      }
    }
    fetchTweets();
  }, []);

  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

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
    .filter(
      (t) => selectedTeam === "All" || (t._team || "") === selectedTeam
    );

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