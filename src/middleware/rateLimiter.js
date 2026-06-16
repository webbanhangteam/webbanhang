function createRateLimiter(config = {}) {
  const buckets = new Map();
  const defaultWindowMs = Number(config.windowMs) || 60 * 1000;
  const rules = Array.isArray(config.rules) ? config.rules : [];

  return function rateLimiter(req, res, requestUrl, sendJson) {
    const rule = rules.find((item) => {
      return item.method === req.method && item.paths.includes(requestUrl.pathname);
    });

    if (!rule) return false;

    const now = Date.now();
    const windowMs = Number(rule.windowMs) || defaultWindowMs;
    const limit = Number(rule.limit) || 10;
    const key = `${getClientIp(req)}:${req.method}:${requestUrl.pathname}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return false;
    }

    current.count += 1;
    if (current.count <= limit) return false;

    sendJson(res, 429, {
      ok: false,
      message: 'Qua nhieu yeu cau. Vui long thu lai sau.',
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000)
    });
    return true;
  };
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket.remoteAddress || 'unknown';
}

module.exports = {
  createRateLimiter
};
