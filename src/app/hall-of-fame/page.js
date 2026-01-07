'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image'; // Add this import

// Sleeper user id used across the app to locate the BBB league
const USER_ID = '456973480269705216';

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s'-]/g, '_')
    .replace(/[^a-z0-9_.]/g, '');
}

const DEFAULT_CARD_IMAGES = {
  qb: '/players/cardimages/default_qb.png',
  rb: '/players/cardimages/default_rb.png',
  te: '/players/cardimages/default_te.png',
  wr: '/players/cardimages/default_wr.png',
};

function resolveCardImageSrc(playerName, position, cardImageIndex) {
  const pos = String(position || '').toLowerCase();
  const fallback = DEFAULT_CARD_IMAGES[pos] || '';
  const normalized = normalizeName(playerName);
  const altNormalized = String(playerName || '')
    .toLowerCase()
    .replace(/[\s']/g, '_')
    .replace(/[^a-z0-9_.-]/g, '');

  if (Array.isArray(cardImageIndex)) {
    const found = cardImageIndex.find((img) => {
      const filename = String(img?.filename || '').toLowerCase();
      return filename.includes(normalized) || filename.includes(altNormalized);
    });
    if (found?.src) return found.src;
  }

  // Mirror PlayerProfileCard fallback behavior: try predictable Cloudinary path,
  // then rely on Image error handling to show the position placeholder.
  if (normalized) {
    return `https://res.cloudinary.com/drn1zhflh/image/upload/f_auto,q_auto,w_384/${normalized}.png`;
  }
  return fallback;
}

// Sample data - with division information added
const champions = [
  {
    year: 2025,
    userName: "Schoontang",
    teamName: "What's a Salary Cap?",
    division: {
      name: "Middle Class Division",
      logo: "/Division2Logo.png"
    },
    mvpPlayer: {
      name: "Bijan Robinson",
      position: "RB",
      yards: 2255,
      touchdowns: 11,
      fantasyPoints: 363.50,
      photo: "/2025-MVP.png"
    },
    regularSeason: {
      wins: 7,
      losses: 7,
      pointsFor: 1672.72,
      pointsAgainst: 1687.58
    },
    quote: "Jordan like football. Other people bad at football. Jordan good at football.",
    teamPhoto: "/2025-championlogo.png",
    keyPlayers: [
      { name: "C.J. Stroud", position: "QB", nflTeam: "Houston Texans" },
      { name: "Justin Herbert", position: "QB", nflTeam: "LA Chargers" },
      { name: "Bijan Robinson", position: "RB", nflTeam: "Atlanta Falcons" },
      { name: "Amon-Ra St. Brown", position: "WR", nflTeam: "Detroit Lions" },
      { name: "Ashton Jeanty", position: "RB", nflTeam: "Las Vegas Raiders" },
      { name: "Daniel Jones", position: "QB", nflTeam: "Indianapolis Colts" },
      { name: "Jordan Addison", position: "WR", nflTeam: "Minnesota Vikings" },
      { name: "Dawson Knox", position: "TE", nflTeam: "Buffalo Bills" },
      { name: "RJ Harvey", position: "RB", nflTeam: "Denver Broncos" }
    ]
  },
  {
    year: 2024,
    userName: "Chewy2552",
    teamName: "InPolesWeTrust",
    division: {
      name: "Poor House Division",
      logo: "/Division3Logo.png"
    },
    mvpPlayer: {
      name: "Joe Burrow",
      position: "QB",
      yards: 4918,
      touchdowns: 43,
      fantasyPoints: 458.82,
      photo: "/2024-MVP.png"
    },
    regularSeason: {
      wins: 11,
      losses: 3,
      pointsFor: 1729.16,
      pointsAgainst: 1510.34
    },
    quote: "Matt like football. Other people bad at football. Matt good at football.",
    teamPhoto: "/2024-championlogo.png",
    keyPlayers: [
      { name: "Joe Burrow", position: "QB", nflTeam: "Cincinnati Bengals" },
      { name: "Jayden Daniels", position: "QB", nflTeam: "Washington Commanders" },
      { name: "Mike Evans", position: "WR", nflTeam: "Tampa Bay Buccaneers" },
      { name: "Davante Adams", position: "WR", nflTeam: "Las Vegas Raiders/New York Jets" },
      { name: "Keenan Allen", position: "WR", nflTeam: "Chicago Bears" },
      { name: "Alvin Kamara", position: "RB", nflTeam: "New Orleans Saints" },
      { name: "Najee Harris", position: "RB", nflTeam: "Pittsburgh Steelers" },
      { name: "Travis Etienne", position: "RB", nflTeam: "Jacksonville Jaguars" },
      { name: "Mark Andrews", position: "TE", nflTeam: "Baltimore Ravens" }
    ]
  }
];

// Image component with error handling
const PlayerImage = ({ src, alt, position }) => {
  const [imageError, setImageError] = useState(false);
  return imageError ? (
    <div className="w-full h-full flex items-center justify-center text-white/30">
      <span>{position}</span>
    </div>
  ) : (
    <Image
      src={src}
      alt={alt}
      width={100}
      height={100}
      className="w-full h-full object-contain"
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
};

export default function HallOfFame() {
  const [selectedChampion, setSelectedChampion] = useState(champions[0]);
  const [mvpImageError, setMvpImageError] = useState(false);
  const [cardImageIndex, setCardImageIndex] = useState(null);
  const [championAvatarUrl, setChampionAvatarUrl] = useState(null);
  const [championAvatarError, setChampionAvatarError] = useState(false);

  // Load the same image index used by PlayerProfileCard (Cloudinary-backed list).
  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      try {
        // Small in-browser cache to avoid refetching when switching years.
        const cached = typeof window !== 'undefined' ? window.__BBB_CARDIMAGE_INDEX : null;
        if (Array.isArray(cached) && cached.length) {
          if (!cancelled) setCardImageIndex(cached);
          return;
        }

        const res = await fetch('/players/cardimages/index.json', { cache: 'force-cache' });
        const json = await res.json();
        if (!cancelled) {
          setCardImageIndex(Array.isArray(json) ? json : []);
          if (typeof window !== 'undefined') window.__BBB_CARDIMAGE_INDEX = Array.isArray(json) ? json : [];
        }
      } catch {
        if (!cancelled) setCardImageIndex([]);
      }
    }

    loadIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the champion's Sleeper avatar for the selected season.
  useEffect(() => {
    let cancelled = false;

    async function loadChampionAvatar() {
      setChampionAvatarError(false);
      setChampionAvatarUrl(null);

      const year = selectedChampion?.year;
      const displayName = String(selectedChampion?.userName || '').trim();
      if (!year || !displayName) return;

      try {
        // 1) Find the BBB league for the selected season
        const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${year}`, { cache: 'no-store' });
        const userLeagues = await leaguesRes.json();
        const leagues = Array.isArray(userLeagues) ? userLeagues : [];

        let bbbLeagues = leagues.filter((league) =>
          String(league?.name || '').toLowerCase().includes('bbb')
        );
        if (bbbLeagues.length === 0 && leagues.length > 0) bbbLeagues = [leagues[0]];
        const leagueId = bbbLeagues[0]?.league_id;
        if (!leagueId) throw new Error('No league_id found for selected season');

        // 2) Fetch users + map display_name -> avatar
        const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { cache: 'no-store' });
        const usersJson = await usersRes.json();
        const users = Array.isArray(usersJson) ? usersJson : [];

        const want = displayName.toLowerCase();
        const matched = users.find((u) => String(u?.display_name || '').trim().toLowerCase() === want);
        const avatarId = matched?.avatar || null;

        if (avatarId) {
          const url = `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
          if (!cancelled) setChampionAvatarUrl(url);
          return;
        }

        // 3) Fallback: try lookup by username (works only if userName == username)
        const userRes = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(displayName)}`, { cache: 'no-store' });
        const user = await userRes.json();
        const fallbackId = user?.avatar || null;
        if (fallbackId && !cancelled) setChampionAvatarUrl(`https://sleepercdn.com/avatars/thumbs/${fallbackId}`);
      } catch {
        // Silently fail; UI will just show team name without avatar
      }
    }

    loadChampionAvatar();
    return () => {
      cancelled = true;
    };
  }, [selectedChampion]);

  // Group players by position
  const getPlayersByPosition = (position) => {
    return selectedChampion.keyPlayers
      .filter((player) => player.position === position)
      .map((player) => ({
        ...player,
        photo: resolveCardImageSrc(player.name, player.position, cardImageIndex),
      }));
  };

  // Responsive padding
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <Image
              src="/logo.png"
              alt="BBB League"
              width={isMobile ? 48 : 64}
              height={isMobile ? 48 : 64}
              className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`}
              priority
            />
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>Hall of Fame</h1>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto ${isMobile ? 'p-2' : 'p-6'}`}>
        {/* Year selection */}
        <div className="flex overflow-x-auto space-x-4 mb-8 pb-2">
          {champions.map(champion => (
            <button
              key={champion.year}
              onClick={() => {
                setSelectedChampion(champion);
                setMvpImageError(false);
              }}
              className={`px-6 py-3 rounded-lg ${
                selectedChampion.year === champion.year 
                  ? 'bg-[#FF4B1F] text-white' 
                  : 'bg-black/30 text-white/70 hover:bg-black/50'
              } transition-colors`}
            >
              {champion.year} Season
            </button>
          ))}
        </div>

        {/* Champion infographic */}
        <div className={`bg-black/30 rounded-lg border border-white/10 ${isMobile ? 'p-3' : 'p-6'} mb-8`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Champion details */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-[#FF4B1F]`}>{selectedChampion.year} Champion</h2>
                <div className="mt-4 flex flex-col md:flex-row items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-[#FF4B1F]/20 p-4 rounded-lg">
                      <div className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-[#FF4B1F]`}>{selectedChampion.userName}</div>
                      <div className="text-white/70 flex items-center gap-2">
                        {championAvatarUrl && !championAvatarError && (
                          <Image
                            src={championAvatarUrl}
                            alt={`${selectedChampion.userName} avatar`}
                            width={20}
                            height={20}
                            className="w-5 h-5 rounded-full"
                            onError={() => setChampionAvatarError(true)}
                            unoptimized
                            loading="lazy"
                          />
                        )}
                        <span>{selectedChampion.teamName}</span>
                      </div>
                      <div className="flex items-center mt-2 pt-2 border-t border-white/10">
                        {selectedChampion.division.logo && (
                          <Image
                            src={selectedChampion.division.logo}
                            alt={selectedChampion.division.name}
                            width={24}
                            height={24}
                            className="w-6 h-6 mr-2"
                            onError={(e) => e.target.style.display = 'none'}
                            unoptimized
                            loading="lazy"
                          />
                        )}
                        <span className="text-sm text-white/70">{selectedChampion.division.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/20 p-3 rounded-lg">
                        <div className="text-white/70 text-sm">Record</div>
                        <div className="font-bold">{selectedChampion.regularSeason.wins}-{selectedChampion.regularSeason.losses}</div>
                      </div>
                      <div className="bg-black/20 p-3 rounded-lg">
                        <div className="text-white/70 text-sm">Points For</div>
                        <div className="font-bold">{selectedChampion.regularSeason.pointsFor}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4`}>Winner's Quote</h3>
                <div className="flex items-start gap-4">
                  {selectedChampion.teamPhoto && (
                    <Image
                      src={selectedChampion.teamPhoto}
                      alt={`${selectedChampion.teamName} logo`}
                      width={96}
                      height={96}
                      className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-white/20"
                      onError={(e) => e.target.style.display = 'none'}
                      unoptimized
                      loading="lazy"
                    />
                  )}
                  <div className="bg-black/20 p-4 rounded-lg italic border-l-4 border-[#FF4B1F] flex-1">
                    "{selectedChampion.quote}"
                  </div>
                </div>
              </div>

              <div>
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4`}>Championship Team</h3>
                {/* Quarterbacks Section */}
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-[#FF4B1F] mb-2">Quarterbacks</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {getPlayersByPosition("QB").map((player, index) => (
                      <div key={`qb-${index}`} className="bg-black/20 p-3 rounded-lg flex items-center">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/30 mr-3">
                          {player.photo ? (
                            <PlayerImage 
                              src={player.photo}
                              alt={player.name}
                              position="QB"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                              <span>QB</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold">{player.name}</div>
                          <div className="text-sm text-[#FF4B1F]/80">{player.nflTeam}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Wide Receivers Section */}
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-[#FF4B1F] mb-2">Wide Receivers</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {getPlayersByPosition("WR").map((player, index) => (
                      <div key={`wr-${index}`} className="bg-black/20 p-3 rounded-lg flex items-center">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/30 mr-3">
                          {player.photo ? (
                            <PlayerImage 
                              src={player.photo}
                              alt={player.name}
                              position="WR"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                              <span>WR</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold">{player.name}</div>
                          <div className="text-sm text-[#FF4B1F]/80">{player.nflTeam}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Running Backs Section */}
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-[#FF4B1F] mb-2">Running Backs</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {getPlayersByPosition("RB").map((player, index) => (
                      <div key={`rb-${index}`} className="bg-black/20 p-3 rounded-lg flex items-center">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/30 mr-3">
                          {player.photo ? (
                            <PlayerImage 
                              src={player.photo}
                              alt={player.name}
                              position="RB"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                              <span>RB</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold">{player.name}</div>
                          <div className="text-sm text-[#FF4B1F]/80">{player.nflTeam}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Tight Ends Section */}
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-[#FF4B1F] mb-2">Tight Ends</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {getPlayersByPosition("TE").map((player, index) => (
                      <div key={`te-${index}`} className="bg-black/20 p-3 rounded-lg flex items-center">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/30 mr-3">
                          {player.photo ? (
                            <PlayerImage 
                              src={player.photo}
                              alt={player.name}
                              position="TE"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                              <span>TE</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold">{player.name}</div>
                          <div className="text-sm text-[#FF4B1F]/80">{player.nflTeam}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* MVP section with photo */}
            <div className="lg:col-span-1">
              <div className="bg-[#FF4B1F]/10 p-6 rounded-lg border border-[#FF4B1F]/30">
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold mb-4 text-center`}>Season MVP</h3>
                {/* MVP Player Photo */}
                <div className="mb-4 flex justify-center">
                  <div className="w-40 h-40 rounded-lg border-4 border-[#FF4B1F] overflow-hidden bg-black/30">
                    {selectedChampion.mvpPlayer.photo && !mvpImageError ? (
                      <Image
                        src={selectedChampion.mvpPlayer.photo} 
                        alt={selectedChampion.mvpPlayer.name}
                        width={160}
                        height={160}
                        className="w-full h-full object-contain"
                        onError={() => setMvpImageError(true)}
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/50">
                        <span>{selectedChampion.mvpPlayer.position}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center mb-4">
                  <div className="text-2xl font-bold">{selectedChampion.mvpPlayer.name}</div>
                  <div className="text-white/70">{selectedChampion.mvpPlayer.position}</div>
                </div>
                <div className="space-y-4">
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-sm text-white/70">Total Yards</div>
                    <div className="font-bold text-xl">{selectedChampion.mvpPlayer.yards}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-sm text-white/70">Touchdowns</div>
                    <div className="font-bold text-xl">{selectedChampion.mvpPlayer.touchdowns}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-sm text-white/70">Fantasy Points</div>
                    <div className="font-bold text-xl">{selectedChampion.mvpPlayer.fantasyPoints}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}