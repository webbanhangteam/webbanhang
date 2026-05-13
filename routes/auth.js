const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/db');

const passwordHashPrefix = 'scrypt';
const passwordKeyLength = 64;

async function ensureUserDataFile(filePath) {
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM users');
  if (count > 0) return;

  let seedUsers = [];
  if (fs.existsSync(filePath)) {
    try {
      seedUsers = normalizeUsers(JSON.parse(fs.readFileSync(filePath, 'utf8').trim() || '[]'));
    } catch {
      seedUsers = [];
    }
  }

  if (!seedUsers.length) {
    seedUsers = createDefaultUsers();
  }

  for (const user of seedUsers) {
    await insertSeedUser(user);
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
      const updatedUser = await updateUserProfile(sessionUser.username, body);

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

    const user = await getUserByUsername(sessionUser.username);
    context.sendJson(res, 200, {
      ok: true,
      user: toPublicUser(user || sessionUser)
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

  const exists = await getUserByUsername(username);
  if (exists) {
    context.sendJson(res, 409, {
      ok: false,
      message: 'Username da ton tai'
    });
    return;
  }

  const user = await createUser({
    username,
    passwordHash: hashPassword(password),
    role: 'User',
    fullName: '',
    phone: '',
    address: ''
  });

  sendAuthSuccess(res, context, 201, user);
}

async function login(req, res, context) {
  const body = await context.readRequestBody(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || '').trim();
  const user = await getUserByUsername(username);

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
    id: publicUser.id,
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

async function createUser(user) {
  const normalized = normalizeUsers([user])[0];
  const [result] = await db.execute(
    `INSERT INTO users (username, password_hash, role, full_name, phone, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalized.username,
      normalized.passwordHash,
      normalized.role,
      normalized.fullName,
      normalized.phone,
      normalized.address
    ]
  );

  return {
    ...normalized,
    id: result.insertId
  };
}

async function insertSeedUser(user) {
  const normalized = normalizeUsers([user])[0];
  if (!normalized) return;

  await db.execute(
    `INSERT IGNORE INTO users (id, username, password_hash, role, full_name, phone, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(normalized.id) || null,
      normalized.username,
      normalized.passwordHash,
      normalized.role,
      normalized.fullName,
      normalized.phone,
      normalized.address
    ]
  );
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
      id: Number(user.id) || null,
      username,
      passwordHash,
      role,
      fullName: normalizeProfileField(user.fullName || user.full_name || user.name),
      phone: normalizeProfileField(user.phone),
      address: normalizeProfileField(user.address)
    });
    return result;
  }, []);
}

function normalizePasswordHash(user) {
  const existingHash = String(user.passwordHash || user.password_hash || '').trim();
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

function rowToUser(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    username: row.username,
    passwordHash: row.password_hash || row.passwordHash,
    role: normalizeRole(row.role),
    fullName: normalizeProfileField(row.full_name || row.fullName),
    phone: normalizeProfileField(row.phone),
    address: normalizeProfileField(row.address)
  };
}

function toPublicUser(user) {
  return {
    id: user.id || null,
    username: user.username,
    role: normalizeRole(user.role),
    fullName: normalizeProfileField(user.fullName || user.full_name),
    phone: normalizeProfileField(user.phone),
    address: normalizeProfileField(user.address)
  };
}

async function getUserByUsername(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const [rows] = await db.execute(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [normalizedUsername]
  );
  return rowToUser(rows[0]);
}

async function getUserById(id) {
  const [rows] = await db.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(id)]);
  return rowToUser(rows[0]);
}

async function updateUserProfile(username, input) {
  const user = await getUserByUsername(username);
  if (!user) return null;

  const fullName = normalizeProfileField(input.fullName || input.name);
  const phone = normalizeProfileField(input.phone);
  const address = normalizeProfileField(input.address);

  await db.execute(
    'UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?',
    [fullName, phone, address, user.id]
  );

  return {
    ...user,
    fullName,
    phone,
    address
  };
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

async function readUsers() {
  const [rows] = await db.execute('SELECT * FROM users ORDER BY id');
  return rows.map(rowToUser);
}

async function writeUsers(filePath, users) {
  for (const user of normalizeUsers(users)) {
    await insertSeedUser(user);
  }
}

module.exports = {
  ensureUserDataFile,
  handleAuthRoute,
  readUsers,
  writeUsers,
  hashPassword,
  verifyPassword,
  getUserByUsername,
  getUserById,
  updateUserProfile,
  toPublicUser
};
