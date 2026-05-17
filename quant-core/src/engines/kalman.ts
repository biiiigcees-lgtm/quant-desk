export class KalmanFilter {
  private estimate = 0;
  private error = 1;

  update(price: number): number {
    const gain = this.error / (this.error + 1);
    this.estimate = this.estimate + gain * (price - this.estimate);
    this.error = (1 - gain) * this.error + 1;
    return this.estimate;
  }
}
