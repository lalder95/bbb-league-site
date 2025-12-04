'use client';
import React from 'react';

const DraftOrder = ({ draftInfo, draftOrder }) => {
  if (!draftInfo || !draftOrder || draftOrder.length === 0) {
    return (
      <div className="bg-black/20 p-6 rounded-lg text-center">
        <h3 className="text-xl font-bold mb-4">Draft Order Not Yet Determined</h3>
        <p className="text-white/70">The draft order for the upcoming rookie draft has not been set yet. Check back closer to the draft date.</p>
        <p className="mt-4 font-semibold">Draft Date: May 1st</p>
      </div>
    );
  }
  
  return (
    <div className="bg-black/20 p-6 rounded-lg">
      <p className="text-white/70 text-sm mb-3">
        Draft order rules: Picks 1–6 go to non-playoff teams sorted by Max PF (lowest to highest). Ties break by win% (lower first), then total points (lower first), then coin flip. Picks 7–12 go to playoff teams in reverse bracket finish (champion gets 12). Consolation bracket is ignored.
      </p>
      <h3 className="text-xl font-bold mb-4">Rookie Draft Order</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-2 text-left">Pick</th>
              <th className="py-2 text-left">Team</th>
              <th className="py-2 text-left">Max PF</th>
            </tr>
          </thead>
          <tbody>
            {draftOrder.length > 0 ? (
              draftOrder.flatMap((entry, index) => {
                const row = (
                  <tr key={`row-${index}`} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 font-bold text-[#FF4B1F]">{entry.slot}</td>
                    <td className="py-3 flex items-center gap-3">
                      {entry.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.avatarUrl}
                          alt={`${entry.teamName} avatar`}
                          className="h-8 w-8 rounded-full border border-white/20"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-white/10 border border-white/20" />
                      )}
                      <span>{entry.teamName}</span>
                    </td>
                    <td className="py-3">{typeof entry.maxpf === 'number' ? entry.maxpf.toFixed(2) : '-'}</td>
                  </tr>
                );

                // Insert orange separator line after pick 6
                const separator = (entry.slot === 6) ? (
                  <tr key={`sep-${index}`}>
                    <td colSpan={3}>
                      <div className="h-0.5 bg-[#FF4B1F] my-1" />
                    </td>
                  </tr>
                ) : null;

                return separator ? [row, separator] : [row];
              })
            ) : (
              <tr>
                <td colSpan="2" className="py-4 text-center text-white/70">
                  Draft order not yet determined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DraftOrder;