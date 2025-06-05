'use client';
import React, { useState } from 'react';

// Sample data - with division information added
const champions = [
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
      { name: "Joe Burrow", position: "QB", nflTeam: "Cincinnati Bengals", photo: "/players/joe-burrow.png" },
      { name: "Jayden Daniels", position: "QB", nflTeam: "Washington Commanders", photo: "/players/jayden-daniels.png" },
      { name: "Mike Evans", position: "WR", nflTeam: "Tampa Bay Buccaneers", photo: "/players/mike-evans.png" },
      { name: "Davante Adams", position: "WR", nflTeam: "Las Vegas Raiders/New York Jets", photo: "/players/davante-adams.png" },
      { name: "Keenan Allen", position: "WR", nflTeam: "Chicago Bears", photo: "/players/keenan-allen.png" },
      { name: "Alvin Kamara", position: "RB", nflTeam: "New Orleans Saints", photo: "/players/alvin-kamara.png" },
      { name: "Najee Harris", position: "RB", nflTeam: "Pittsburgh Steelers", photo: "/players/najee-harris.png" },
      { name: "Travis Etienne", position: "RB", nflTeam: "Jacksonville Jaguars", photo: "/players/travis-etienne.png" },
      { name: "Mark Andrews", position: "TE", nflTeam: "Baltimore Ravens", photo: "/players/mark-andrews.png" }
    ]
  },
  {
    year: 2023,
    userName: "TEST",
    teamName: "TEST",
    division: {
      name: "West Division",
      logo: "/images/west-division.png"
    },
    mvpPlayer: {
      name: "TEST",
      position: "RB",
      yards: 2023,
      touchdowns: 21,
      fantasyPoints: 401.2,
      photo: "/images/test-mvp.jpg"
    },
    regularSeason: {
      wins: 11,
      losses: 3,
      pointsFor: 1943,
      pointsAgainst: 1552
    },
    quote: "This championship was a testament to patience in the draft and aggressive moves on the waiver wire. Building around McCaffrey was the best decision I ever made.",
    teamPhoto: "/images/2023-team.png",
    keyPlayers: [
      { name: "Christian McCaffrey", position: "RB", nflTeam: "SF", photo: "/players/christian-mccaffrey.png" },
      { name: "Josh Allen", position: "QB", nflTeam: "BUF", photo: "/players/josh-allen.png" },
      { name: "CeeDee Lamb", position: "WR", nflTeam: "DAL", photo: "/players/ceedee-lamb.png" },
      { name: "Travis Kelce", position: "TE", nflTeam: "KC", photo: "/players/travis-kelce.png" },
      { name: "Mike Evans", position: "WR", nflTeam: "TB", photo: "/players/mike-evans.png" }
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
    <img 
      src={src} 
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setImageError(true)}
    />
  );
};

export default function HallOfFame() {
  const [selectedChampion, setSelectedChampion] = useState(champions[0]);
  const [mvpImageError, setMvpImageError] = useState(false);

  // Group players by position
  const getPlayersByPosition = (position) => {
    return selectedChampion.keyPlayers.filter(player => player.position === position);
  };

  // Responsive padding
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className={`${isMobile ? 'h-12 w-12' : 'h-16 w-16'} transition-transform hover:scale-105`
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
                      <div className="text-white/70">{selectedChampion.teamName}</div>
                      <div className="flex items-center mt-2 pt-2 border-t border-white/10">
                        {selectedChampion.division.logo && (
                          <img 
                            src={selectedChampion.division.logo} 
                            alt={selectedChampion.division.name}
                            className="w-6 h-6 mr-2"
                            onError={(e) => e.target.style.display = 'none'}
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
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-white/20">
                      <img 
                        src={selectedChampion.teamPhoto}
                        alt={`${selectedChampion.teamName} logo`}
                        className="w-full h-full object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    </div>
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
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-black/30 mr-3">
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
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-black/30 mr-3">
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
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-black/30 mr-3">
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
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-black/30 mr-3">
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
                  <div className="w-40 h-40 rounded-full border-4 border-[#FF4B1F] overflow-hidden bg-black/30">
                    {selectedChampion.mvpPlayer.photo && !mvpImageError ? (
                      <img 
                        src={selectedChampion.mvpPlayer.photo} 
                        alt={selectedChampion.mvpPlayer.name}
                        className="w-full h-full object-cover"
                        onError={() => setMvpImageError(true)}
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