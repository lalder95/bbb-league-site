'use client';
import React from 'react';

const DraftStrategyTips = () => {
  return (
    <div className="mt-8 bg-black/30 p-6 rounded-lg border border-white/10">
      <h2 className="text-2xl font-bold mb-4 text-[#FF4B1F]">Rookie Draft Strategy Tips</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold mb-2">Salary Cap Considerations</h3>
          <p className="text-white/70">
            Rookie contracts are some of the most cost-effective options in a salary cap league. 
            Consider your cap situation when deciding between immediate contributors and long-term development projects.
          </p>
        </div>
        
        <div>
          <h3 className="text-lg font-bold mb-2">Draft for Value</h3>
          <p className="text-white/70">
            In dynasty leagues, it's often better to draft the best player available rather than drafting for need. 
            Use the pick value chart to help maximize the return on your draft capital.
          </p>
        </div>
        
        <div>
          <h3 className="text-lg font-bold mb-2">Trading Draft Picks</h3>
          <p className="text-white/70">
            Trading up can help you secure elite talent, while trading down can help you acquire more shots at finding value. 
            Consider the depth of the rookie class at positions of need when making trades.
          </p>
        </div>
        
        <div>
          <h3 className="text-lg font-bold mb-2">Landing Spot Matters</h3>
          <p className="text-white/70">
            A player's NFL team significantly impacts their fantasy value. 
            Consider opportunity, coaching staff, offensive scheme, and surrounding talent when evaluating rookies.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DraftStrategyTips;