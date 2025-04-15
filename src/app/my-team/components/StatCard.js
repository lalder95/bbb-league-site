'use client';
import React from 'react';

const StatCard = ({ title, value, description, icon, onClick }) => {
  return (
    <div 
      className={`bg-black/20 p-4 rounded-lg border border-white/10 transition-colors ${
        onClick ? 'cursor-pointer hover:bg-black/30 hover:border-[#FF4B1F]/30' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-white/70 text-sm mb-1">{title}</div>
          <div className="text-2xl font-bold">{value}</div>
          {description && <div className="text-xs text-white/50 mt-1">{description}</div>}
        </div>
        {icon && (
          <div className="text-2xl opacity-80">{icon}</div>
        )}
      </div>
    </div>
  );
};

export default StatCard;