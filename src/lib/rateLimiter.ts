interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  // Bloqueia até haver slot livre; devolve ms esperados (0 = sem espera).
  async waitForSlot(): Promise<number> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow) + 50; // +50ms margem
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        const afterWait = Date.now();
        this.timestamps = this.timestamps.filter(t => afterWait - t < this.windowMs);
      }
      this.timestamps.push(Date.now());
      return waitTime;
    }

    this.timestamps.push(now);
    return 0;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    return this.timestamps.length < this.maxRequests;
  }
}

// Tectos reais: Gemini (via OpenRouter) 60/min, Drive 12k/min, Sheets 300/min.
// Aplicamos margens para picos concorrentes e retries automáticos.
export const geminiLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });
export const driveLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
export const sheetsLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
