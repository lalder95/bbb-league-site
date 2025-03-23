'use client';
import React from 'react';

const PlayerProfileModal = ({ player, onClose }) => {
  if (!player) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
      <div className="bg-[#001A2B] p-4 rounded-lg">
        <button onClick={onClose}>Close</button>
        <h2>{player.name}</h2>
        <p>{player.position}</p>
      </div>
    </div>
  );
};

export default PlayerProfileModal;