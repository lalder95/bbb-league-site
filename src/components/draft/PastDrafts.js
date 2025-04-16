'use client';
import React from 'react';
import { formatPickNumber } from '@/utils/draftUtils';

const PastDrafts = ({ pastDrafts, getTeamName }) => {
  if (pastDrafts.length === 0) {
    return (
      <div className="bg-black/20 p-6 rounded-lg text-center">
        <h3 className="text-xl font-bold mb-4">No Draft History Available</h3>
        <p className="text-white/70">There is no draft history available yet.</p>
      </div>
    );
  }
  
  // Sort drafts by date (newest first)
  const sortedDrafts = [...pastDrafts].sort((a, b) => b.created - a.created);
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <h3 className="text-xl font-bold mb-6">Past Drafts</h3>
      
      <div className="space-y-8">
        {sortedDrafts.map((draft) => (
          <div key={draft.draft_id} className="border border-white/10 rounded-lg overflow-hidden">
            <div className="bg-black/30 p-4">
              <h4 className="text-lg font-bold">{draft.season} {draft.metadata?.name || 'Draft'}</h4>
              <div className="text-sm text-white/70">
                {new Date(draft.created).toLocaleDateString()} • {draft.picks?.length || 0} selections
              </div>
            </div>
            
            {draft.picks && draft.picks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20">
                      <th className="py-2 px-3 text-left">Pick</th>
                      <th className="py-2 px-3 text-left">Team</th>
                      <th className="py-2 px-3 text-left">Player</th>
                      <th className="py-2 px-3 text-left">Position</th>
                      <th className="py-2 px-3 text-left">NFL Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.picks.slice(0, 12).map((pick, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-3 font-bold text-[#FF4B1F]">
                          {formatPickNumber(pick.round, pick.pick_no)}
                        </td>
                        <td className="py-3 px-3">
                          {getTeamName(pick.roster_id)}
                        </td>
                        <td className="py-3 px-3 font-medium">
                          {pick.metadata?.first_name} {pick.metadata?.last_name}
                        </td>
                        <td className="py-3 px-3">
                          {pick.metadata?.position}
                        </td>
                        <td className="py-3 px-3">
                          {pick.metadata?.team}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-white/70">
                No pick data available for this draft.
              </div>
            )}
            
            {draft.picks && draft.picks.length > 12 && (
              <div className="p-4 text-center">
                <button className="text-[#FF4B1F] hover:underline">
                  View Full Draft Results
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PastDrafts;