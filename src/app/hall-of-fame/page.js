'use client';
import React, { useState } from 'react';

// Sample data - with division information added
const champions = [
  {
    year: 2024,
    userName: "Chewy2552",
    teamName: "InPolesWeTrust",
    division: {
      name: "Poor House Division",  // CHANGE DIVISION NAME
      logo: "/Division3Logo.png"    // CHANGE DIVISION LOGO PATH
    },
    mvpPlayer: {
      name: "Joe Burrow",
      position: "QB",
      yards: 4918,
      touchdowns: 43,
      fantasyPoints: 458.82,
      photo: "/2024-MVP.png"      // CHANGE MVP PHOTO PATH
    },
    regularSeason: {
      wins: 11,
      losses: 3,
      pointsFor: 1729.16,
      pointsAgainst: 1510.34
    },

    quote: "After years of heartbreaking losses, finally capturing this championship feels surreal. The season was a roller coaster, but my team peaked at exactly the right time.",
    teamPhoto: "/2024-championlogo.png", // CHANGE TEAM PHOTO PATH
    keyPlayers: [
      { name: "Jayden Daniels", position: "QB" },
      { name: "Mike Evans", position: "WR" },
      { name: "Alvin Kamara", position: "RB" },
      { name: "Jaylen Waddle", position: "WR" },
      { name: "Mark Andrews", position: "TE" }
    ]
  },
  {
    year: 2023,
    userName: "TEST",
    teamName: "TEST",
    division: {
      name: "West Division",
      logo: "/images/west-division.png" // Add division logo path
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
    playoffBracket: "/images/2023-bracket.png",
    quote: "This championship was a testament to patience in the draft and aggressive moves on the waiver wire. Building around McCaffrey was the best decision I ever made.",
    teamPhoto: "/images/2023-team.png",
    keyPlayers: [
      { name: "Christian McCaffrey", position: "RB" },
      { name: "Josh Allen", position: "QB" },
      { name: "CeeDee Lamb", position: "WR" },
      { name: "Travis Kelce", position: "TE" },
      { name: "Mike Evans", position: "WR" }
    ]
  }
];

export default function HallOfFame() {
  const [selectedChampion, setSelectedChampion] = useState(champions[0]);

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
            <h1 className="text-3xl font-bold text-[#FF4B1F]">Hall of Fame</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Year selection */}
        <div className="flex overflow-x-auto space-x-4 mb-8 pb-2">
          {champions.map(champion => (
            <button
              key={champion.year}
              onClick={() => setSelectedChampion(champion)}
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
        <div className="bg-black/30 rounded-lg border border-white/10 p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Champion details */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-[#FF4B1F]">{selectedChampion.year} Champion</h2>
                <div className="mt-4 flex items-center gap-4">
                  <div className="bg-[#FF4B1F]/20 p-4 rounded-lg">
                    <div className="text-3xl font-bold text-[#FF4B1F]">{selectedChampion.userName}</div>
                    <div className="text-white/70">{selectedChampion.teamName}</div>
                    
                    {/* Division Information */}
                    <div className="flex items-center mt-2 pt-2 border-t border-white/10">
                      {selectedChampion.division.logo && (
                        <img 
                          src={selectedChampion.division.logo} 
                          alt={selectedChampion.division.name}
                          className="w-6 h-6 mr-2"
                        />
                      )}
                      <span className="text-sm text-white/70">{selectedChampion.division.name}</span>
                    </div>
                  </div>
                  
                  <div className="flex-1">
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
                <h3 className="text-xl font-bold mb-4">Winner's Quote</h3>
                <div className="bg-black/20 p-4 rounded-lg italic border-l-4 border-[#FF4B1F]">
                  "{selectedChampion.quote}"
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">Championship Team</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {selectedChampion.keyPlayers.map((player, index) => (
                    <div key={index} className="bg-black/20 p-3 rounded-lg text-center">
                      <div className="font-bold truncate">{player.name}</div>
                      <div className="text-sm text-white/70">{player.position}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MVP section with photo */}
            <div className="lg:col-span-1">
              <div className="bg-[#FF4B1F]/10 p-6 rounded-lg border border-[#FF4B1F]/30">
                <h3 className="text-xl font-bold mb-4 text-center">Season MVP</h3>
                
                {/* MVP Player Photo */}
                <div className="mb-4 flex justify-center">
                  {selectedChampion.mvpPlayer.photo ? (
                    <div className="w-40 h-40 rounded-full border-4 border-[#FF4B1F] overflow-hidden">
                      <img 
                        src={selectedChampion.mvpPlayer.photo} 
                        alt={selectedChampion.mvpPlayer.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-40 h-40 rounded-full border-4 border-[#FF4B1F] bg-black/30 flex items-center justify-center">
                      <span className="text-white/50">No photo</span>
                    </div>
                  )}
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

        {/* Playoff Bracket (placeholder) */}
        <div className="bg-black/30 rounded-lg border border-white/10 p-6 mb-8">
          <h3 className="text-xl font-bold mb-4">Playoff Bracket</h3>
          <div className="flex items-center justify-center h-64 bg-black/20 rounded-lg border border-dashed border-white/20">
            {selectedChampion.playoffBracket ? (
              <img 
                src={selectedChampion.playoffBracket}
                alt={`${selectedChampion.year} Playoff Bracket`}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-white/50">
                Playoff bracket visualization will be displayed here
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}