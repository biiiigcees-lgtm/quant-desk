'use client';

import { useEffect, useState } from 'react';

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

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisOutput | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSnapshot = async () => {
    try {
      const res = await fetch('/api/snapshot');
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
      const res = await fetch('/api/analyze', { method: 'POST' });
      const data = await res.json();
      setAnalysis(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <div className="header">
        <div className="title">QUANT//DEK</div>
        <div>
          <span className={`status ${wsConnected ? 'connected' : 'disconnected'}`}></span>
          {wsConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-title">BTC Price</div>
          <div className="card-value">${snapshot?.currentPrice?.toFixed(2) || '---'}</div>
        </div>

        <div className="card">
          <div className="card-title">Regime</div>
          <div className="card-value">{analysis?.regime || '---'}</div>
        </div>

        <div className="card">
          <div className="card-title">Action</div>
          <div className={`card-value ${analysis?.action === 'TRADE' ? 'positive' : 'negative'}`}>
            {analysis?.action || '---'}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Probability</div>
          <div className="card-value">{analysis ? (analysis.probability * 100).toFixed(1) + '%' : '---'}</div>
        </div>

        <div className="card">
          <div className="card-title">Expected Value</div>
          <div className={`card-value ${analysis?.expectedValue && analysis.expectedValue > 0 ? 'positive' : 'negative'}`}>
            {analysis?.expectedValue?.toFixed(2) || '---'}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Risk Status</div>
          <div className="card-value">{analysis?.riskStatus || '---'}</div>
        </div>

        <div className="card">
          <div className="card-title">Data Health</div>
          <div className="card-value">{snapshot?.metadata?.dataHealth?.toFixed(2) || '---'}</div>
        </div>

        <div className="card">
          <div className="card-title">Confidence</div>
          <div className="card-value">{analysis ? (analysis.confidence * 100).toFixed(1) + '%' : '---'}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-title">Explanation</div>
        <div style={{ marginTop: '10px', color: '#aaa' }}>{analysis?.explanation || 'Run analysis to see explanation'}</div>
      </div>

      <button className="btn" onClick={runAnalysis} disabled={loading} style={{ marginTop: '20px' }}>
        {loading ? 'Analyzing...' : 'Run Analysis'}
      </button>
    </div>
  );
}
