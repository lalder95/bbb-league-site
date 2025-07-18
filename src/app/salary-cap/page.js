'use client';
import React, { useState, useEffect } from 'react';

const USER_ID = '456973480269705216'; // Your Sleeper user ID

export default function SalaryCap() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'team', direction: 'asc' });
  const [isMobile, setIsMobile] = useState(false);
  const [leagueId, setLeagueId] = useState(null);
  const [teamAvatars, setTeamAvatars] = useState({});

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-detect league ID (copied from home page)
  useEffect(() => {
    async function findBBBLeague() {
      try {
        const seasonResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const seasonState = await seasonResponse.json();
        const currentSeason = seasonState.season;

        const userLeaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${USER_ID}/leagues/nfl/${currentSeason}`);
        const userLeagues = await userLeaguesResponse.json();

        let bbbLeagues = userLeagues.filter(league =>
          league.name && (
            league.name.includes('Budget Blitz Bowl') ||
            league.name.includes('budget blitz bowl') ||
            league.name.includes('BBB') ||
            (league.name.toLowerCase().includes('budget') && league.name.toLowerCase().includes('blitz'))
          )
        );

        if (bbbLeagues.length === 0 && userLeagues.length > 0) {
          bbbLeagues = [userLeagues[0]];
        }

        const mostRecentLeague = bbbLeagues.sort((a, b) => b.season - a.season)[0];
        setLeagueId(mostRecentLeague.league_id);
      } catch (err) {
        setLeagueId(null);
      }
    }
    findBBBLeague();
  }, []);

  // Fetch team avatars using detected leagueId
  useEffect(() => {
    if (!leagueId) return;
    async function fetchAvatars() {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        const users = await res.json();
        if (!users || !Array.isArray(users)) return;
        const avatarMap = {};
        users.forEach(user => {
          avatarMap[user.display_name] = user.avatar;
        });
        setTeamAvatars(avatarMap);
      } catch (e) {
        // Optionally handle error
      }
    }
    fetchAvatars();
  }, [leagueId]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch contracts data
        const contractsResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
        const contractsText = await contractsResponse.text();
        
        // Fetch fines data
        const finesResponse = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_TeamFines.csv');
        const finesText = await finesResponse.text();
        
        // Parse contracts
        const contractRows = contractsText.split('\n');
        const contracts = contractRows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',');
            const status = values[14];
            const isActive = status === 'Active';
            
            return {
              team: values[33], // TeamDisplayName
              isActive: isActive,
              curYear: isActive ? parseFloat(values[15]) || 0 : parseFloat(values[24]) || 0,
              year2: isActive ? parseFloat(values[16]) || 0 : parseFloat(values[25]) || 0,
              year3: isActive ? parseFloat(values[17]) || 0 : parseFloat(values[26]) || 0,
              year4: isActive ? parseFloat(values[18]) || 0 : parseFloat(values[27]) || 0,
            };
          });

        // Parse fines
        const finesRows = finesText.split('\n');
        const fines = finesRows.slice(1)
          .filter(row => row.trim())
          .reduce((acc, row) => {
            const [team, year1, year2, year3, year4] = row.split(',');
            acc[team] = {
              curYear: parseFloat(year1) || 0,
              year2: parseFloat(year2) || 0,
              year3: parseFloat(year3) || 0,
              year4: parseFloat(year4) || 0,
            };
            return acc;
          }, {});

        // Calculate cap space for each team
        const teamCaps = {};
        
        // Initialize team data
        contracts.forEach(contract => {
          if (!teamCaps[contract.team]) {
            teamCaps[contract.team] = {
              team: contract.team,
              curYear: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year2: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year3: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 },
              year4: { total: 300, active: 0, dead: 0, fines: 0, remaining: 300 }
            };
          }
          
          // Add contract values
          const capData = teamCaps[contract.team];
          if (contract.isActive) {
            capData.curYear.active += contract.curYear;
            capData.year2.active += contract.year2;
            capData.year3.active += contract.year3;
            capData.year4.active += contract.year4;
          } else {
            capData.curYear.dead += contract.curYear;
            capData.year2.dead += contract.year2;
            capData.year3.dead += contract.year3;
            capData.year4.dead += contract.year4;
          }
        });

        // Add fines and calculate remaining
        Object.entries(teamCaps).forEach(([teamName, capData]) => {
          const teamFines = fines[teamName] || { curYear: 0, year2: 0, year3: 0, year4: 0 };
          
          capData.curYear.fines = teamFines.curYear;
          capData.year2.fines = teamFines.year2;
          capData.year3.fines = teamFines.year3;
          capData.year4.fines = teamFines.year4;
          
          // Calculate remaining for each year
          ['curYear', 'year2', 'year3', 'year4'].forEach(year => {
            capData[year].remaining = capData[year].total - 
              capData[year].active - 
              capData[year].dead - 
              capData[year].fines;
          });
        });

        setTeams(Object.values(teamCaps));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const sortedTeams = [...teams].sort((a, b) => {
    const aVal = sortConfig.key === 'team' ? a[sortConfig.key] : a[sortConfig.key].remaining;
    const bVal = sortConfig.key === 'team' ? b[sortConfig.key] : b[sortConfig.key].remaining;
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    if (sortConfig.direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const formatCapSpace = (value) => {
    return `$${value.toFixed(1)}`;
  };

  const getCapSpaceColor = (value) => {
    if (value >= 100) return 'text-green-400';
    if (value >= 75) return 'text-yellow-400';
    if (value >= 50) return 'text-[#FF4B1F]';
    return 'text-red-500';
  };

  const CapSpaceCell = ({ data, isFirstRow = false }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
      <td 
        className={`p-3 relative ${getCapSpaceColor(data.remaining)}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {formatCapSpace(data.remaining)}
        
        {showTooltip && (
          <div className={`absolute z-50 bg-gray-900 text-white p-3 rounded shadow-lg ${
            isFirstRow ? 'mt-2' : '-mt-32'
          } ml-8`}>
            <div className="text-sm">
              <div>Total Cap: {formatCapSpace(data.total)}</div>
              <div className="text-green-400">Active Cap: {formatCapSpace(data.active)}</div>
              <div className="text-red-400">Dead Cap: {formatCapSpace(data.dead)}</div>
              <div className="text-yellow-400">Fines: {formatCapSpace(data.fines)}</div>
              <div className="border-t border-gray-700 mt-1 pt-1">
                Remaining: {formatCapSpace(data.remaining)}
              </div>
            </div>
          </div>
        )}
      </td>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#001A2B] text-white">
      <div className={`${isMobile ? 'p-4' : 'p-6'} bg-black/30 border-b border-white/10`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className={isMobile ? "h-12 w-12 transition-transform hover:scale-105" : "h-16 w-16 transition-transform hover:scale-105"}
            />
            <h1 className={isMobile ? "text-2xl font-bold text-[#FF4B1F]" : "text-3xl font-bold text-[#FF4B1F]"}>Salary Cap Space</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="overflow-x-auto rounded-lg border border-white/10 shadow-xl bg-black/20">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-white/10">
                {[
                  { key: 'team', label: 'Team' },
                  { key: 'curYear', label: 'Cur Year Cap Space' },
                  { key: 'year2', label: 'Year 2 Cap Space' },
                  { key: 'year3', label: 'Year 3 Cap Space' },
                  { key: 'year4', label: 'Year 4 Cap Space' },
                ].map(({ key, label }) => (
                  <th 
                    key={key}
                    onClick={() => handleSort(key)}
                    className="p-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {label}
                      {sortConfig.key === key && (
                        <span className="text-[#FF4B1F]">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, index) => (
                <tr 
                  key={index}
                  className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="p-3 font-medium flex items-center gap-2">
                    {teamAvatars[team.team] ? (
                      <img
                        src={`https://sleepercdn.com/avatars/${teamAvatars[team.team]}`}
                        alt={team.team}
                        className="w-5 h-5 rounded-full mr-2"
                      />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-white/10 mr-2 inline-block"></span>
                    )}
                    {team.team}
                  </td>
                  <CapSpaceCell data={team.curYear} isFirstRow={index === 0} />
                  <CapSpaceCell data={team.year2} isFirstRow={index === 0} />
                  <CapSpaceCell data={team.year3} isFirstRow={index === 0} />
                  <CapSpaceCell data={team.year4} isFirstRow={index === 0} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}