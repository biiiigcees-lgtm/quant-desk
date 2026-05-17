'use client';

import { useEffect, useState } from 'react';
import { MarketSwitcher } from '../components/MarketSwitcher';
import { KalshiPanel } from '../components/KalshiPanel';

interface AnalysisOutput {
  action: 'TRADE' | 'NO_TRADE';
  direction: 'ABOVE' | 'BELOW';
  probability: number;
  confidence: number;
  expectedValue: number;
  regime: string;
  riskStatus: string;
  explanation: string;
}

interface Snapshot {
  currentPrice: number;
  metadata: { dataHealth: number };
}

type MarketMode = 'BTC' | 'ETH';

export default function Home() {
  const [mode, setMode] = useState<MarketMode>('BTC');
  const [analysis, setAnalysis] = useState<AnalysisOutput | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(interval);
  }, [mode]);

  const fetchSnapshot = async () => {
    try {
      const res = await fetch(`/api/snapshot?symbol=${mode}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        setWsConnected(true);
      } else {
        setWsConnected(false);
      }
    } catch (e) {
      setWsConnected(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: mode })
      });
      const data = await res.json();
      setAnalysis(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="text-3xl font-bold">QUANT//DEK</div>
          <div className="flex items-center gap-4">
            <span className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="mb-6">
          <MarketSwitcher mode={mode} onChange={setMode} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">{mode} Price</div>
            <div className="text-2xl font-bold">${snapshot?.currentPrice?.toFixed(2) || '---'}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Regime</div>
            <div className="text-2xl font-bold">{analysis?.regime || '---'}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Action</div>
            <div className={`text-2xl font-bold ${analysis?.action === 'TRADE' ? 'text-green-600' : 'text-red-600'}`}>
              {analysis?.action || '---'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Probability</div>
            <div className="text-2xl font-bold">{analysis ? (analysis.probability * 100).toFixed(1) + '%' : '---'}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Expected Value</div>
            <div className={`text-2xl font-bold ${analysis?.expectedValue && analysis.expectedValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {analysis?.expectedValue?.toFixed(2) || '---'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Risk Status</div>
            <div className="text-2xl font-bold">{analysis?.riskStatus || '---'}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Data Health</div>
            <div className="text-2xl font-bold">{snapshot?.metadata?.dataHealth?.toFixed(2) || '---'}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-gray-600 text-sm">Confidence</div>
            <div className="text-2xl font-bold">{analysis ? (analysis.confidence * 100).toFixed(1) + '%' : '---'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-lg font-bold mb-4">Explanation</div>
            <div className="text-gray-600">{analysis?.explanation || 'Run analysis to see explanation'}</div>
          </div>

          <KalshiPanel symbol={mode} targetPrice={mode === 'BTC' ? 50000 : 3000} />
        </div>

        <button 
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          onClick={runAnalysis} 
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>
    </div>
  );
}
