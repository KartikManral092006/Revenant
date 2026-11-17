/**
 * In-memory daily limiter for live Groq calls (Req 6.1, 6.2).
 * Counters are keyed by UTC date and IP, and by UTC date. They reset on restart.
 */

export const PER_IP_DAILY_LIMIT = 5;
export const TOTAL_DAILY_LIMIT = 50;

export interface Budget {
  remainingForIp: number;
  remainingTotal: number;
}

export interface RateLimitDecision extends Budget {
  allowed: boolean;
}

export interface RateLimiter {
  /** Reads the budget without consuming it. */
  peek(ip: string, now?: Date): Budget;
  /** Consumes one live call if both limits allow it. */
  tryConsume(ip: string, now?: Date): RateLimitDecision;
}

export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function createRateLimiter(
  perIpLimit: number = PER_IP_DAILY_LIMIT,
  totalLimit: number = TOTAL_DAILY_LIMIT,
): RateLimiter {
  const perIp = new Map<string, number>();
  const totals = new Map<string, number>();

  function prune(day: string): void {
    for (const key of perIp.keys()) {
      if (!key.startsWith(`${day}|`)) perIp.delete(key);
    }
    for (const key of totals.keys()) {
      if (key !== day) totals.delete(key);
    }
  }

  function budget(ip: string, day: string): Budget {
    const ipUsed = perIp.get(`${day}|${ip}`) ?? 0;
    const totalUsed = totals.get(day) ?? 0;
    return {
      remainingForIp: Math.max(0, Math.min(perIpLimit - ipUsed, totalLimit - totalUsed)),
      remainingTotal: Math.max(0, totalLimit - totalUsed),
    };
  }

  return {
    peek(ip, now = new Date()) {
      return budget(ip, utcDateKey(now));
    },
    tryConsume(ip, now = new Date()) {
      const day = utcDateKey(now);
      prune(day);
      const before = budget(ip, day);
      if (before.remainingForIp <= 0 || before.remainingTotal <= 0) {
        return { allowed: false, ...before };
      }
      const ipKey = `${day}|${ip}`;
      perIp.set(ipKey, (perIp.get(ipKey) ?? 0) + 1);
      totals.set(day, (totals.get(day) ?? 0) + 1);
      return { allowed: true, ...budget(ip, day) };
    },
  };
}

/** Process-wide limiter used by the API route. */
export const rateLimiter: RateLimiter = createRateLimiter();
