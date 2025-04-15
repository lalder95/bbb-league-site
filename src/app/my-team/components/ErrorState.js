'use client';
import React from 'react';

const ErrorState = ({ error }) => {
  return (
    <div className="min-h-screen bg-[#001A2B] flex items-center justify-center p-4">
      <div className="bg-black/30 rounded-lg border border-red-500/30 p-6 max-w-md w-full">
        <div className="text-red-400 text-3xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-white mb-4">Error Loading Team Data</h1>
        <p className="text-white/80 mb-6">{error}</p>
        <p className="text-sm text-white/60">
          Please try refreshing the page. If the problem persists, contact support.
        </p>
      </div>
    </div>
  );
};

export default ErrorState;