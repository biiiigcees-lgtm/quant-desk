import { BaseFeatures, SyntheticFeatures } from '../features';
import { Regime } from '../regime/detect';

export interface RiskAssessment {
  allowed: boolean;
  reason: string;
  dataHealthScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  checks: {
    confidence: boolean;
    dataHealth: boolean;
    volatility: boolean;
    liquidity: boolean;
    drawdown: boolean;
    killSwitch: boolean;
  };
}

export async function assessRisk(
  baseFeatures: BaseFeatures,
  syntheticFeatures: SyntheticFeatures,
  regime: Regime,
  confidence: number,
  currentDrawdown: number = 0
): Promise<RiskAssessment> {
  const checks = {
    confidence: true,
    dataHealth: true,
    volatility: true,
    liquidity: true,
    drawdown: true,
    killSwitch: false,
  };
  
  let riskLevel: RiskAssessment['riskLevel'] = 'LOW';
  const reasons: string[] = [];
  
  // Check confidence threshold
  const minConfidence = 0.7;
  if (confidence < minConfidence) {
    checks.confidence = false;
    reasons.push(`Confidence ${confidence.toFixed(2)} below threshold ${minConfidence}`);
    riskLevel = 'HIGH';
  }
  
  // Check data health
  const dataHealthScore = computeDataHealthScore(baseFeatures, syntheticFeatures);
  const minDataHealth = 0.8;
  if (dataHealthScore < minDataHealth) {
    checks.dataHealth = false;
    reasons.push(`Data health ${dataHealthScore.toFixed(2)} below threshold ${minDataHealth}`);
    riskLevel = 'HIGH';
  }
  
  // Check extreme volatility + low liquidity
  if (baseFeatures.realizedVol > 80 && syntheticFeatures.liquidityStressIndex > 0.7) {
    checks.volatility = false;
    checks.liquidity = false;
    reasons.push('Extreme volatility with low liquidity');
    riskLevel = 'CRITICAL';
  }
  
  // Check drawdown threshold
  const maxDrawdown = 0.05; // 5%
  if (currentDrawdown > maxDrawdown) {
    checks.drawdown = false;
    reasons.push(`Drawdown ${(currentDrawdown * 100).toFixed(2)}% exceeds threshold ${(maxDrawdown * 100).toFixed(2)}%`);
    riskLevel = 'CRITICAL';
  }
  
  // Check kill switch
  const killSwitchEnabled = await checkKillSwitch();
  if (killSwitchEnabled) {
    checks.killSwitch = true;
    reasons.push('Global kill switch activated');
    riskLevel = 'CRITICAL';
  }
  
  // Determine overall risk level
  if (riskLevel === 'LOW' && (regime === 'PANIC' || regime === 'VOLATILE')) {
    riskLevel = 'MEDIUM';
  }
  
  const allowed = !Object.values(checks).some(c => c === true && ['killSwitch'].includes('')) && 
                  checks.confidence && 
                  checks.dataHealth && 
                  checks.volatility && 
                  checks.liquidity && 
                  checks.drawdown &&
                  !checks.killSwitch;
  
  return {
    allowed,
    reason: reasons.join('; ') || 'All checks passed',
    dataHealthScore,
    riskLevel,
    checks,
  };
}

function computeDataHealthScore(baseFeatures: BaseFeatures, syntheticFeatures: SyntheticFeatures): number {
  let score = 1.0;
  
  // Penalize missing data
  if (baseFeatures.ema9 === 0) score -= 0.2;
  if (baseFeatures.rsi === 50) score -= 0.1; // Default value
  if (baseFeatures.volatility === 0) score -= 0.15;
  
  // Penalize extreme values
  if (baseFeatures.spread > 100) score -= 0.2;
  if (syntheticFeatures.liquidityStressIndex > 0.8) score -= 0.15;
  
  // Penalize regime stress
  if (syntheticFeatures.entropyScore > 0.9) score -= 0.1;
  
  return Math.max(0, score);
}

async function checkKillSwitch(): Promise<boolean> {
  // Check Redis for kill switch flag
  // For now, return false
  return false;
}

export async function setKillSwitch(enabled: boolean): Promise<void> {
  // Set kill switch in Redis
  // Implementation pending Redis integration
}
