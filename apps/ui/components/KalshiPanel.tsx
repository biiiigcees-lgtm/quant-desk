'use client';

import React, { useState, useEffect } from 'react';

interface KalshiPanelProps {
  symbol: string;
  targetPrice: number;
}

export function KalshiPanel({ symbol, targetPrice }: KalshiPanelProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [probability, setProbability] = useState(0);

  useEffect(() => {
    const getNext15mTimestamp = () => {
      const now = Date.now();
      const minutes = Math.floor(now / 60000);
      const next15m = (minutes + 15 - (minutes % 15)) * 60000;
      return next15m;
    };

    const updateCountdown = () => {
      const targetTime = getNext15mTimestamp();
      const diff = targetTime - Date.now();
      setTimeLeft(diff > 0 ? diff : 0);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const estimateProbability = () => {
      const timeMin = timeLeft / 60000;
      const distance = Math.abs(targetPrice - 50000);
      const baseProb = Math.exp(-distance / (0.5 * Math.sqrt(timeMin) + 1));
      const prob = Math.min(1, Math.max(0, baseProb));
      setProbability(prob * 100);
    };

    if (timeLeft > 0) {
      estimateProbability();
    }
  }, [timeLeft, targetPrice]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold mb-4">Kalshi 15-Minute Target</h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Countdown:</span>
          <span className="text-2xl font-mono font-bold">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Target Price:</span>
          <span className="font-semibold">${targetPrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Hit Probability:</span>
          <span className="font-semibold text-blue-600">
            {probability.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
