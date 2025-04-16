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
      <h3 className="text-xl font-bold mb-4">Rookie Draft Order</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-2 text-left">Pick</th>
              <th className="py-2 text-left">Team</th>
            </tr>
          </thead>
          <tbody>
            {draftOrder.length > 0 ? (
              draftOrder.map((entry, index) => (
                <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 font-bold text-[#FF4B1F]">{entry.slot}</td>
                  <td className="py-3">{entry.teamName}</td>
                </tr>
              ))
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