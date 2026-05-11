/**
 * Probability Velocity Calculator
 * Tracks rate of change of implied probability
 */
export class ProbabilityVelocityCalculator {
  private lastProb: number | null = null;
  private lastTimestamp: number = 0;
  private history: Array<{ prob: number; timestamp: number }> = [];
  private readonly maxHistory: number = 20;

  update(prob: number, timestamp: number): number {
    // Velocity: change in probability per second
    let velocity = 0;

    if (this.lastProb !== null && timestamp > this.lastTimestamp) {
      const timeDelta = (timestamp - this.lastTimestamp) / 1000; // seconds
      const probDelta = prob - this.lastProb;
      velocity = timeDelta > 0 ? probDelta / timeDelta : 0;
    }

    this.lastProb = prob;
    this.lastTimestamp = timestamp;

    this.history.push({ prob, timestamp });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return velocity;
  }

  /**
   * Acceleration: rate of change of velocity
   */
  getAcceleration(): number {
    if (this.history.length < 2) return 0;

    const velocities: number[] = [];
    for (let i = 1; i < this.history.length; i++) {
      const timeDelta = (this.history[i].timestamp - this.history[i - 1].timestamp) / 1000;
      if (timeDelta > 0) {
        const probDelta = this.history[i].prob - this.history[i - 1].prob;
        velocities.push(probDelta / timeDelta);
      }
    }

    if (velocities.length < 2) return 0;

    const lastVel = velocities[velocities.length - 1];
    const prevVel = velocities[velocities.length - 2];

    return lastVel - prevVel;
  }

  reset(): void {
    this.lastProb = null;
    this.lastTimestamp = 0;
    this.history = [];
  }
}
