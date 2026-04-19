// Rate limiter em memória — por instância de edge worker. Sliding window.

class RateLimiter {
  private timestamps: number[] = [];
  constructor(private maxRequests: number, private windowMs: number) {}

  async waitForSlot(): Promise<number> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.timestamps[0]) + 50;
      if (waitTime > 0) await new Promise((r) => setTimeout(r, waitTime));
      const after = Date.now();
      this.timestamps = this.timestamps.filter((t) => after - t < this.windowMs);
      this.timestamps.push(Date.now());
      return waitTime;
    }
    this.timestamps.push(now);
    return 0;
  }
}

export const driveLimiter = new RateLimiter(100, 60_000);
export const sheetsLimiter = new RateLimiter(100, 60_000);
