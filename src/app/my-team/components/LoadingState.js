'use client';
import React from 'react';

const LoadingState = () => {
  return (
    <div className="min-h-screen bg-[#001A2B] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading team data...</p>
      </div>
    </div>
  );
};

export default LoadingState;