export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(cost = 1): Promise<void> {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }
    const waitTime = ((cost - this.tokens) / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens -= cost;
  }
}

// Provider-specific rate limiters
export const mondayRateLimiter = new RateLimiter(60, 10); // 60 tokens, 10/sec
export const hubspotRateLimiter = new RateLimiter(100, 10); // 100/10sec
export const sheetsRateLimiter = new RateLimiter(60, 1); // 60/min
