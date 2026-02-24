import rateLimit from 'express-rate-limit';

// TODO: Replace in-memory store with Upstash Redis for multi-instance deployments.
// Use @upstash/ratelimit with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from .env.

export const apiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  standardHeaders: 'draft-7', // sets RateLimit-* headers (RFC 9110 draft-7)
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests — free tier allows 1000 requests per hour.',
    },
  },
  keyGenerator: (req) => {
    // Trust X-Forwarded-For when behind a proxy/load balancer
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
    return req.ip ?? '0.0.0.0';
  },
});
