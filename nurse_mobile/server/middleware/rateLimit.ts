/**
 * AI Rate Limiting Middleware
 *
 * Prevents abuse by limiting AI requests per IP address
 */

const requests = new Map<string, number[]>();

export default defineEventHandler((event) => {
  const ip = getRequestIP(event) || 'local';
  const now = Date.now();
  const window = 60_000;

  const log = requests.get(ip) || [];
  const recent = log.filter(t => now - t < window);
  recent.push(now);
  requests.set(ip, recent);

  const limit = useRuntimeConfig().aiRateLimit;
  if (recent.length > limit) {
    throw createError({
      statusCode: 429,
      statusMessage: 'AI rate limit exceeded'
    });
  }
});
