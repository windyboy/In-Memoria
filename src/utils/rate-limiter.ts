/**
 * Rate limiter utility for protecting against excessive tool calls
 * Uses a sliding window approach to track requests over time
 */

export interface RateLimitOptions {
  maxRequests: number;        // Maximum requests allowed
  windowMs: number;          // Time window in milliseconds
  blockDurationMs?: number;  // How long to block after limit exceeded (default: windowMs)
}

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;  // When the window resets
  blockedUntil?: number; // If blocked, when unblocked
}

export class RateLimiter {
  private requestHistory: Map<string, number[]> = new Map();
  private blockedUntil: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private options: RateLimitOptions) {
    // Clean up old entries periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, Math.min(options.windowMs, 60000)); // Clean up at least every minute
  }

  /**
   * Check if a request is allowed for the given identifier
   */
  check(identifier: string = 'global'): RateLimitResult {
    const now = Date.now();

    // Check if currently blocked
    const blockedUntil = this.blockedUntil.get(identifier);
    if (blockedUntil && now < blockedUntil) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: blockedUntil,
        blockedUntil
      };
    }

    // Get or initialize request history
    let history = this.requestHistory.get(identifier) || [];

    // Remove old requests outside the window
    const windowStart = now - this.options.windowMs;
    history = history.filter(timestamp => timestamp > windowStart);

    // Check if under limit
    if (history.length < this.options.maxRequests) {
      // Allow request
      history.push(now);
      this.requestHistory.set(identifier, history);

      const resetTime = windowStart + this.options.windowMs;
      return {
        allowed: true,
        remainingRequests: this.options.maxRequests - history.length,
        resetTime
      };
    } else {
      // Rate limit exceeded - block
      const blockDuration = this.options.blockDurationMs || this.options.windowMs;
      const blockedUntil = now + blockDuration;
      this.blockedUntil.set(identifier, blockedUntil);

      // Reset history to prevent immediate unblocking
      this.requestHistory.delete(identifier);

      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: windowStart + this.options.windowMs,
        blockedUntil
      };
    }
  }

  /**
   * Reset rate limiting for an identifier
   */
  reset(identifier: string = 'global'): void {
    this.requestHistory.delete(identifier);
    this.blockedUntil.delete(identifier);
  }

  /**
   * Get current stats for an identifier
   */
  getStats(identifier: string = 'global'): {
    requestCount: number;
    isBlocked: boolean;
    blockedUntil?: number;
    windowStart: number;
  } {
    const now = Date.now();
    const history = this.requestHistory.get(identifier) || [];
    const windowStart = now - this.options.windowMs;
    const validRequests = history.filter(timestamp => timestamp > windowStart);

    return {
      requestCount: validRequests.length,
      isBlocked: (this.blockedUntil.get(identifier) || 0) > now,
      blockedUntil: this.blockedUntil.get(identifier),
      windowStart
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = Math.max(this.options.windowMs, this.options.blockDurationMs || 0) * 2;

    // Clean request history
    for (const [identifier, history] of this.requestHistory.entries()) {
      const validRequests = history.filter(timestamp => now - timestamp < maxAge);
      if (validRequests.length === 0) {
        this.requestHistory.delete(identifier);
      } else {
        this.requestHistory.set(identifier, validRequests);
      }
    }

    // Clean blocked entries
    for (const [identifier, blockedUntil] of this.blockedUntil.entries()) {
      if (blockedUntil < now) {
        this.blockedUntil.delete(identifier);
      }
    }
  }

  /**
   * Stop the rate limiter and clean up
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requestHistory.clear();
    this.blockedUntil.clear();
  }
}

// Pre-configured rate limiters for common scenarios
export const createToolCallRateLimiter = (): RateLimiter => {
  return new RateLimiter({
    maxRequests: 100,     // 100 tool calls
    windowMs: 60000,      // per minute
    blockDurationMs: 300000 // Block for 5 minutes if exceeded
  });
};

export const createStrictRateLimiter = (): RateLimiter => {
  return new RateLimiter({
    maxRequests: 10,      // 10 requests
    windowMs: 10000,      // per 10 seconds
    blockDurationMs: 60000 // Block for 1 minute
  });
};
