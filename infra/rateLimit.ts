import { getRedis } from './redis';
import { createLogger } from './logger';

const logger = createLogger('RateLimit');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private redis = getRedis();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Get current requests
      const data = await this.redis.get(key);
      const requests: number[] = data ? JSON.parse(data) : [];

      // Filter out old requests
      const validRequests = requests.filter(t => t > windowStart);

      if (validRequests.length >= this.config.maxRequests) {
        const oldestRequest = Math.min(...validRequests);
        const resetAt = oldestRequest + this.config.windowMs;
        
        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }

      // Add current request
      validRequests.push(now);
      await this.redis.set(key, JSON.stringify(validRequests), Math.ceil(this.config.windowMs / 1000));

      return {
        allowed: true,
        remaining: this.config.maxRequests - validRequests.length,
        resetAt: now + this.config.windowMs,
      };
    } catch (error) {
      logger.error(`Rate limit check failed for ${identifier}`, error);
      // Fail open - allow request if Redis fails
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      };
    }
  }

  async reset(identifier: string): Promise<void> {
    const key = `ratelimit:${identifier}`;
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error(`Rate limit reset failed for ${identifier}`, error);
    }
  }
}

// Pre-configured limiters
export const apiLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 });
export const analyzeLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 20 });
export const strategyLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 10 });
