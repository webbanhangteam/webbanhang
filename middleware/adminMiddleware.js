function getRequestRole(req) {
  return String(
    req.headers.role ||
    req.headers['x-user-role'] ||
    req.headers['x-role'] ||
    ''
  ).trim();
}

function isAdminRequest(req) {
  return getRequestRole(req) === 'Admin';
}

function sendForbidden(res, sendJson) {
  sendJson(res, 403, {
    ok: false,
    message: 'Forbidden'
  });
}

module.exports = {
  getRequestRole,
  isAdminRequest,
  sendForbidden
};
