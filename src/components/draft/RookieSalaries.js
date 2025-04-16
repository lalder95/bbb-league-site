'use client';
import React, { useState } from 'react';
import TeamPicksModal from './TeamPicksModal';
import { estimateDraftPositions } from '@/utils/draftUtils';

const RookieSalaries = ({ rosters, tradedPicks, draftInfo, draftOrder, getTeamName }) => {
  const [selectedTeam, setSelectedTeam] = useState(null);
  
  const teamPicks = estimateDraftPositions(rosters, tradedPicks, draftInfo, draftOrder, getTeamName);
  
  // Calculate total salary obligations
  const teamObligations = {};
  Object.entries(teamPicks).forEach(([teamName, picks]) => {
    const totalSalary = picks.currentPicks.reduce((sum, pick) => sum + pick.salary, 0);
    teamObligations[teamName] = totalSalary;
  });
  
  // Sort teams by name
  const sortedTeams = Object.keys(teamObligations).sort();
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-6">Rookie Salary Cap Obligations</h3>
      <p className="mb-6 text-white/70">
        This table shows the estimated salary cap commitments for each team based on their current draft picks.
        First round pick salaries are determined by draft position, while later rounds have fixed values.
        Click on any team to see a detailed breakdown of their picks.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Rookie Salary Table */}
        <div>
          <h4 className="text-lg font-semibold mb-3">Team Obligations</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Team</th>
                  <th className="py-2 text-right">Total Obligation</th>
                  <th className="py-2 text-right">Draft Picks</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((teamName, index) => (
                  <tr 
                    key={index} 
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => setSelectedTeam(teamName)}
                  >
                    <td className="py-3 font-medium text-[#FF4B1F] hover:underline">{teamName}</td>
                    <td className="py-3 text-right font-bold text-green-400">${teamObligations[teamName]}</td>
                    <td className="py-3 text-right">{teamPicks[teamName].currentPicks.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Rookie Salary Scale */}
        <div>
          <h4 className="text-lg font-semibold mb-3">Rookie Salary Scale</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-500/20 p-4 rounded-lg">
              <h5 className="font-bold mb-2 text-blue-400">First Round</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>1.01</span>
                  <span className="font-medium">$14</span>
                </div>
                <div className="flex justify-between">
                  <span>1.02</span>
                  <span className="font-medium">$12</span>
                </div>
                <div className="flex justify-between">
                  <span>1.03</span>
                  <span className="font-medium">$12</span>
                </div>
                <div className="flex justify-between">
                  <span>1.04</span>
                  <span className="font-medium">$10</span>
                </div>
                <div className="flex justify-between">
                  <span>1.05</span>
                  <span className="font-medium">$10</span>
                </div>
                <div className="flex justify-between">
                  <span>1.06</span>
                  <span className="font-medium">$10</span>
                </div>
                <div className="flex justify-between">
                  <span>1.07</span>
                  <span className="font-medium">$8</span>
                </div>
                <div className="flex justify-between">
                  <span>1.08</span>
                  <span className="font-medium">$8</span>
                </div>
                <div className="flex justify-between">
                  <span>1.09</span>
                  <span className="font-medium">$8</span>
                </div>
                <div className="flex justify-between">
                  <span>1.10</span>
                  <span className="font-medium">$6</span>
                </div>
                <div className="flex justify-between">
                  <span>1.11</span>
                  <span className="font-medium">$6</span>
                </div>
                <div className="flex justify-between">
                  <span>1.12</span>
                  <span className="font-medium">$6</span>
                </div>
              </div>
            </div>
            
            <div className="bg-green-500/20 p-4 rounded-lg">
              <h5 className="font-bold mb-2 text-green-400">Second Round</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>2.01</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.02</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.03</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.04</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.05</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.06</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.07</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.08</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.09</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.10</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.11</span>
                  <span className="font-medium">$4</span>
                </div>
                <div className="flex justify-between">
                  <span>2.12</span>
                  <span className="font-medium">$4</span>
                </div>
              </div>
            </div>
            
            <div className="bg-yellow-500/20 p-4 rounded-lg">
              <h5 className="font-bold mb-2 text-yellow-500">Third Round</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>3.01</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.02</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.03</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.04</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.05</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.06</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.07</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.08</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.09</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.10</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.11</span>
                  <span className="font-medium">$2</span>
                </div>
                <div className="flex justify-between">
                  <span>3.12</span>
                  <span className="font-medium">$2</span>
                </div>
              </div>
            </div>
            
            <div className="bg-purple-500/20 p-4 rounded-lg">
              <h5 className="font-bold mb-2 text-purple-400">Later Rounds</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>4.01</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>4.02</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>4.03</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>5.01</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>5.02</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>5.03</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>6.01</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>6.02</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>6.03</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>7.01</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>7.02</span>
                  <span className="font-medium">$1</span>
                </div>
                <div className="flex justify-between">
                  <span>7.03</span>
                  <span className="font-medium">$1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Team-by-Team Breakdown */}
      <div className="mt-8">
        <h4 className="text-lg font-semibold mb-3">Team-by-Team Breakdown</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTeams.map((teamName, index) => (
            <div 
              key={index} 
              className="bg-black/30 p-4 rounded-lg border border-white/10 hover:border-[#FF4B1F]/30 transition-colors cursor-pointer"
              onClick={() => setSelectedTeam(teamName)}
            >
              <h5 className="font-bold mb-2 text-[#FF4B1F] hover:underline">
                {teamName}
              </h5>
              <div className="text-sm mb-2">
                <span className="text-white/70">Total Obligation:</span>{' '}
                <span className="font-bold text-green-400">${teamObligations[teamName]}</span>
              </div>
              
              {teamPicks[teamName].currentPicks.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {teamPicks[teamName].currentPicks
                    .sort((a, b) => a.round !== b.round ? a.round - b.round : a.pickPosition - b.pickPosition)
                    .map((pick, pickIndex) => (
                      <div key={pickIndex} className="flex justify-between">
                        <span>{pick.pickNumber} ({pick.originalOwner !== teamName ? `via ${pick.originalOwner}` : 'Own'})</span>
                        <span className="font-medium">${pick.salary}</span>
                      </div>
                    ))
                  }
                </div>
              ) : (
                <div className="text-white/50 italic">No draft picks</div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Render the team picks detail modal */}
      {selectedTeam && (
        <TeamPicksModal 
          selectedTeam={selectedTeam} 
          teamPicks={teamPicks[selectedTeam]} 
          onClose={() => setSelectedTeam(null)} 
        />
      )}
    </div>
  );
};

export default RookieSalaries;