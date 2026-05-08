const fs = require('fs');
const path = require('path');

const defaultUsers = [
  {
    username: 'admin',
    password: '123456',
    role: 'Admin'
  },
  {
    username: 'user1',
    password: '123456',
    role: 'User'
  }
];

function ensureUserDataFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    writeUsers(filePath, defaultUsers);
    return;
  }

  try {
    readUsers(filePath);
  } catch {
    writeUsers(filePath, defaultUsers);
  }
}

async function handleAuthRoute(req, res, requestUrl, context) {
  const route = normalizeAuthPath(requestUrl.pathname);
  if (!route) return false;

  if (req.method !== 'POST') {
    context.sendJson(res, 405, {
      ok: false,
      message: 'Method not allowed'
    });
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
    password,
    role: 'User'
  };

  users.push(user);
  writeUsers(context.userDataFile, users);

  context.sendJson(res, 201, {
    ok: true,
    username: user.username,
    role: user.role
  });
}

async function login(req, res, context) {
  const body = await context.readRequestBody(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || '').trim();

  const users = readUsers(context.userDataFile);
  const user = users.find((item) => {
    return item.username.toLowerCase() === username.toLowerCase() &&
      item.password === password;
  });

  if (!user) {
    context.sendJson(res, 401, {
      ok: false,
      message: 'Sai username hoac password'
    });
    return;
  }

  context.sendJson(res, 200, {
    ok: true,
    username: user.username,
    role: user.role
  });
}

function normalizeAuthPath(pathname) {
  const routes = {
    '/register': 'register',
    '/login': 'login',
    '/logout': 'logout',
    '/api/auth/register': 'register',
    '/api/auth/login': 'login',
    '/api/auth/logout': 'logout'
  };

  return routes[pathname] || null;
}

function normalizeUsername(value) {
  return String(value || '').trim();
}

function readUsers(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  const users = JSON.parse(content);
  return Array.isArray(users) ? users : [];
}

function writeUsers(filePath, users) {
  fs.writeFileSync(filePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

module.exports = {
  ensureUserDataFile,
  handleAuthRoute,
  readUsers,
  writeUsers
};
