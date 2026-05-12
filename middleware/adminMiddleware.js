function getRequestToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch) {
    return bearerMatch[1].trim();
  }

  return String(req.headers['x-session-token'] || '').trim();
}

function getRequestUser(req, getSession) {
  if (typeof getSession !== 'function') return null;
  return getSession(req);
}

function isAdminRequest(req, getSession) {
  const user = getRequestUser(req, getSession);
  return Boolean(user && user.role === 'Admin');
}

function sendForbidden(res, sendJson) {
  sendJson(res, 403, {
    ok: false,
    message: 'Forbidden'
  });
}

module.exports = {
  getRequestToken,
  getRequestUser,
  isAdminRequest,
  sendForbidden
};
