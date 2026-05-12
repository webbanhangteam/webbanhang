const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const passwordHashPrefix = 'scrypt';
const passwordKeyLength = 64;

function ensureUserDataFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    writeUsers(filePath, createDefaultUsers());
    return;
  }

  try {
    const rawUsers = readRawUsers(filePath);
    const users = normalizeUsers(rawUsers);

    if (JSON.stringify(rawUsers) !== JSON.stringify(users)) {
      writeUsers(filePath, users);
    }
  } catch {
    writeUsers(filePath, createDefaultUsers());
  }
}

async function handleAuthRoute(req, res, requestUrl, context) {
  const route = normalizeAuthPath(requestUrl.pathname);
  if (!route) return false;

  if (route === 'me') {
    if (!['GET', 'PUT'].includes(req.method)) {
      sendMethodNotAllowed(res, context);
      return true;
    }

    const sessionUser = context.getSessionFromRequest(req);
    if (!sessionUser) {
      context.sendJson(res, 401, {
        ok: false,
        message: 'Chua dang nhap'
      });
      return true;
    }

    if (req.method === 'PUT') {
      const body = await context.readRequestBody(req);
      const updatedUser = updateUserProfile(context.userDataFile, sessionUser.username, body);

      if (!updatedUser) {
        context.sendJson(res, 404, {
          ok: false,
          message: 'Khong tim thay tai khoan'
        });
        return true;
      }

      context.updateSessionUser(req, toPublicUser(updatedUser));
      context.sendJson(res, 200, {
        ok: true,
        user: toPublicUser(updatedUser)
      });
      return true;
    }

    const user = getUserByUsername(context.userDataFile, sessionUser.username) || sessionUser;
    context.sendJson(res, 200, {
      ok: true,
      user: toPublicUser(user)
    });
    return true;
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, context);
    return true;
  }

  if (route === 'register') {
    await register(req, res, context);
    return true;
  }

  if (route === 'login') {
    await login(req, res, context);
    return true;
  }

  if (route === 'logout') {
    context.destroySession(req);
    context.sendJson(res, 200, {
      ok: true,
      message: 'Logged out'
    });
    return true;
  }

  return false;
}

async function register(req, res, context) {
  const body = await context.readRequestBody(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || '').trim();

  if (!username || !password) {
    context.sendJson(res, 400, {
      ok: false,
      message: 'Username va password la bat buoc'
    });
    return;
  }

  const users = readUsers(context.userDataFile);
  const exists = users.some((user) => {
    return user.username.toLowerCase() === username.toLowerCase();
  });

  if (exists) {
    context.sendJson(res, 409, {
      ok: false,
      message: 'Username da ton tai'
    });
    return;
  }

  const user = {
    username,
    passwordHash: hashPassword(password),
    role: 'User'
  };

  users.push(user);
  writeUsers(context.userDataFile, users);

  sendAuthSuccess(res, context, 201, user);
}

async function login(req, res, context) {
  const body = await context.readRequestBody(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || '').trim();

  const users = readUsers(context.userDataFile);
  const user = users.find((item) => {
    return item.username.toLowerCase() === username.toLowerCase();
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    context.sendJson(res, 401, {
      ok: false,
      message: 'Sai username hoac password'
    });
    return;
  }

  sendAuthSuccess(res, context, 200, user);
}

function sendAuthSuccess(res, context, statusCode, user) {
  const publicUser = toPublicUser(user);
  const session = context.createSession(publicUser);

  context.sendJson(res, statusCode, {
    ok: true,
    username: publicUser.username,
    role: publicUser.role,
    fullName: publicUser.fullName,
    phone: publicUser.phone,
    address: publicUser.address,
    token: session.token,
    expiresAt: session.expiresAt
  });
}

function sendMethodNotAllowed(res, context) {
  context.sendJson(res, 405, {
    ok: false,
    message: 'Method not allowed'
  });
}

function normalizeAuthPath(pathname) {
  const routes = {
    '/register': 'register',
    '/login': 'login',
    '/logout': 'logout',
    '/api/auth/register': 'register',
    '/api/auth/login': 'login',
    '/api/auth/logout': 'logout',
    '/api/auth/me': 'me'
  };

  return routes[pathname] || null;
}

function createDefaultUsers() {
  const users = [];
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const userPassword = process.env.DEFAULT_USER_PASSWORD;

  if (adminPassword) {
    users.push({
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      passwordHash: hashPassword(adminPassword),
      role: 'Admin'
    });
  }

  if (userPassword) {
    users.push({
      username: process.env.DEFAULT_USER_USERNAME || 'user1',
      passwordHash: hashPassword(userPassword),
      role: 'User'
    });
  }

  return users;
}

function normalizeUsers(users) {
  if (!Array.isArray(users)) return [];

  return users.reduce((result, user) => {
    const username = normalizeUsername(user.username);
    const role = normalizeRole(user.role);
    const passwordHash = normalizePasswordHash(user);

    if (!username || !passwordHash) return result;

    result.push({
      username,
      passwordHash,
      role,
      fullName: normalizeProfileField(user.fullName || user.name),
      phone: normalizeProfileField(user.phone),
      address: normalizeProfileField(user.address)
    });
    return result;
  }, []);
}

function normalizePasswordHash(user) {
  const existingHash = String(user.passwordHash || '').trim();
  if (isPasswordHash(existingHash)) return existingHash;

  const legacyPassword = String(user.password || '').trim();
  if (!legacyPassword) return '';

  return hashPassword(legacyPassword);
}

function normalizeUsername(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || '').trim() === 'Admin' ? 'Admin' : 'User';
}

function normalizeProfileField(value) {
  return String(value || '').trim();
}

function toPublicUser(user) {
  return {
    username: user.username,
    role: user.role,
    fullName: normalizeProfileField(user.fullName),
    phone: normalizeProfileField(user.phone),
    address: normalizeProfileField(user.address)
  };
}

function getUserByUsername(filePath, username) {
  const normalizedUsername = normalizeUsername(username).toLowerCase();
  return readUsers(filePath).find((user) => {
    return user.username.toLowerCase() === normalizedUsername;
  }) || null;
}

function updateUserProfile(filePath, username, input) {
  const normalizedUsername = normalizeUsername(username).toLowerCase();
  const users = readUsers(filePath);
  const index = users.findIndex((user) => {
    return user.username.toLowerCase() === normalizedUsername;
  });

  if (index === -1) return null;

  users[index] = {
    ...users[index],
    fullName: normalizeProfileField(input.fullName || input.name),
    phone: normalizeProfileField(input.phone),
    address: normalizeProfileField(input.address)
  };

  writeUsers(filePath, users);
  return users[index];
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, passwordKeyLength).toString('hex');
  return `${passwordHashPrefix}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!isPasswordHash(storedHash)) return false;

  const [, salt, hash] = storedHash.split('$');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function isPasswordHash(value) {
  const parts = String(value || '').split('$');
  return parts.length === 3 &&
    parts[0] === passwordHashPrefix &&
    /^[a-f0-9]{32}$/i.test(parts[1]) &&
    /^[a-f0-9]+$/i.test(parts[2]);
}

function readRawUsers(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  return JSON.parse(content);
}

function readUsers(filePath) {
  return normalizeUsers(readRawUsers(filePath));
}

function writeUsers(filePath, users) {
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeUsers(users), null, 2)}\n`, 'utf8');
}

module.exports = {
  ensureUserDataFile,
  handleAuthRoute,
  readUsers,
  writeUsers,
  hashPassword,
  verifyPassword,
  getUserByUsername,
  updateUserProfile
};
