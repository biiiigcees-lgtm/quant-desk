'use client';

import React from 'react';

type MarketMode = 'BTC' | 'ETH';

interface MarketSwitcherProps {
  mode: MarketMode;
  onChange: (mode: MarketMode) => void;
}

export function MarketSwitcher({ mode, onChange }: MarketSwitcherProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('BTC')}
        className={`px-4 py-2 rounded ${
          mode === 'BTC' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
        }`}
      >
        BTC
      </button>
      <button
        onClick={() => onChange('ETH')}
        className={`px-4 py-2 rounded ${
          mode === 'ETH' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
        }`}
      >
        ETH
      </button>
    </div>
  );
}
