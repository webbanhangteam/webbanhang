const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./config/db');
const { ensureUserDataFile, handleAuthRoute, getUserByUsername } = require('./routes/auth');
const { ensureProductsDataFile, handleProductsRoute, readProducts } = require('./routes/products');
const { getRequestToken, isAdminRequest, sendForbidden } = require('./middleware/adminMiddleware');

loadEnvFile(path.join(__dirname, '.env'));

const root = path.resolve(__dirname);
const webRoot = path.join(root, 'web');
const assetsRoot = path.join(webRoot, 'accesst');
const bootstrapRoot = path.join(root, 'bootstrap-5.3.8-dist');
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const sessions = new Map();
const userDataFile = path.join(root, 'data', 'DATA.txt');

const productsDataFile = path.join(root, 'data', 'products.json');
const maxBodySize = parsePositiveNumber(process.env.MAX_BODY_SIZE, 1024 * 1024);
const sessionMaxAgeMs = parsePositiveNumber(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 12);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const momoConfig = {
  partnerCode: process.env.MOMO_PARTNER_CODE || process.env.PARTNER_CODE || '',
  accessKey: process.env.MOMO_ACCESS_KEY || process.env.ACCESS_KEY || '',
  secretKey: process.env.MOMO_SECRET_KEY || process.env.SECRET_KEY || '',
  endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create',
  returnUrl: process.env.MOMO_RETURN_URL || `${publicBaseUrl}/api/payments/momo/return`,
  ipnUrl: process.env.MOMO_IPN_URL || `${publicBaseUrl}/api/payments/momo/ipn`
};

const zalopayConfig = {
  appId: process.env.ZALOPAY_APP_ID || process.env.APP_ID || '2554',
  key1: (process.env.ZALOPAY_KEY1 || process.env.KEY1 || '').trim(),
  key2: (process.env.ZALOPAY_KEY2 || process.env.KEY2 || '').trim(),
  createUrl: process.env.ZALOPAY_CREATE_URL || process.env.CREATE_URL || 'https://sb-openapi.zalopay.vn/v2/create',
  queryUrl: process.env.ZALOPAY_QUERY_URL || 'https://sb-openapi.zalopay.vn/v2/query',
  callbackUrl: process.env.ZALOPAY_CALLBACK_URL || `${publicBaseUrl}/api/payments/zalopay/callback`,
  returnUrl: process.env.ZALOPAY_RETURN_URL || `${publicBaseUrl}/api/payments/zalopay/return`
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

    if (isApiRequestPath(requestUrl.pathname)) {
      await handleApi(req, res, requestUrl);
      return;
    }

    serveStatic(requestUrl.pathname, res);
  } catch (err) {
    console.error('Request error:', err);
    sendJson(res, 500, { ok: false, message: 'Loi may chu noi bo' });
  }
});

async function handleApi(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && (requestUrl.pathname === '/api/health' || requestUrl.pathname === '/health')) {
    sendJson(res, 200, {
      ok: true,
      service: 'shop-anh-thuan',
      time: new Date().toISOString()
    });
    return;
  }

  const routeContext = {
    userDataFile,
    productsDataFile,
    readRequestBody,
    sendJson,
    createSession,
    destroySession,
    getSessionFromRequest,
    updateSessionUser,
    isAdminRequest: req => isAdminRequest(req, getSessionFromRequest),
    sendForbidden
  };

  if (await handleAuthRoute(req, res, requestUrl, routeContext)) {
    return;
  }

  if (await handleProductsRoute(req, res, requestUrl, routeContext)) {
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/momo') {
    await createMomoPayment(req, res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/momo/ipn') {
    await handleMomoIpn(req, res);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/payments/momo/return') {
    sendPaymentReturn(res, 'MoMo', Object.fromEntries(requestUrl.searchParams.entries()));
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/zalopay') {
    await createZaloPayPayment(req, res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/zalopay/callback') {
    await handleZaloPayCallback(req, res);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/payments/zalopay/return') {
    sendPaymentReturn(res, 'ZaloPay', Object.fromEntries(requestUrl.searchParams.entries()));
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/zalopay/status') {
    await queryZaloPayStatus(req, res);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/payments/cod') {
    await createCodOrder(req, res);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/orders/me') {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    sendJson(res, 200, { ok: true, orders: await getOrdersByUserId(user.id) });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/orders') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    sendJson(res, 200, { ok: true, orders: await getSalesHistory() });
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Khong tim thay API' });
}

function isApiRequestPath(pathname) {
  return pathname.startsWith('/api/') ||
    pathname === '/health' ||
    pathname === '/register' ||
    pathname === '/login' ||
    pathname === '/logout';
}

async function createMomoPayment(req, res) {
  const body = await readRequestBody(req);
  const order = await createOrderFromCart(body.items);

  if (!order.ok) {
    sendJson(res, 400, { ok: false, message: order.message });
    return;
  }

  const missing = ['partnerCode', 'accessKey', 'secretKey'].filter(key => !momoConfig[key]);
  if (missing.length) {
    sendJson(res, 500, { ok: false, message: `Thieu cau hinh MoMo: ${missing.join(', ')}` });
    return;
  }

  const requestId = `${momoConfig.partnerCode}${Date.now()}`;
  const orderId = requestId;
  const amount = order.amount;
  const orderInfo = body.orderInfo || 'Thanh toan don hang UrbanCart';
  const extraData = body.extraData || '';
  const requestType = 'captureWallet';
  const rawSignature =
    `accessKey=${momoConfig.accessKey}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${momoConfig.ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${momoConfig.partnerCode}` +
    `&redirectUrl=${momoConfig.returnUrl}` +
    `&requestId=${requestId}` +
    `&requestType=${requestType}`;

  const payload = {
    partnerCode: momoConfig.partnerCode,
    accessKey: momoConfig.accessKey,
    requestId,
    amount: String(amount),
    orderId,
    orderInfo,
    redirectUrl: momoConfig.returnUrl,
    ipnUrl: momoConfig.ipnUrl,
    extraData,
    requestType,
    signature: hmacSha256(momoConfig.secretKey, rawSignature),
    lang: 'vi'
  };

  await createLocalOrder('momo', orderId, order, orderInfo, getSessionFromRequest(req), 'CREATED');

  try {
    const momoResponse = await postJson(momoConfig.endpoint, payload);
    const status = momoResponse.resultCode === 0 || momoResponse.payUrl ? 'PENDING' : 'FAILED';
    await updateOrderGatewayResponse(orderId, status, momoResponse);
    sendJson(res, 200, { ok: true, provider: 'momo', orderId, paymentUrl: momoResponse.payUrl, momo: momoResponse });
  } catch (err) {
    await updateOrderGatewayResponse(orderId, 'FAILED', { error: err.message });
    sendJson(res, 502, { ok: false, message: 'Khong tao duoc thanh toan MoMo', error: err.message });
  }
}

async function handleMomoIpn(req, res) {
  const body = await readRequestBody(req);
  const rawSignature =
    `accessKey=${body.accessKey || momoConfig.accessKey}` +
    `&amount=${body.amount || ''}` +
    `&extraData=${body.extraData || ''}` +
    `&message=${body.message || ''}` +
    `&orderId=${body.orderId || ''}` +
    `&orderInfo=${body.orderInfo || ''}` +
    `&orderType=${body.orderType || ''}` +
    `&partnerCode=${body.partnerCode || ''}` +
    `&payType=${body.payType || ''}` +
    `&requestId=${body.requestId || ''}` +
    `&responseTime=${body.responseTime || ''}` +
    `&resultCode=${body.resultCode || ''}`;

  if (hmacSha256(momoConfig.secretKey, rawSignature) !== (body.signature || '')) {
    sendJson(res, 400, { status: 'invalid signature' });
    return;
  }

  await updateOrderFromGateway(body.orderId, Number(body.resultCode) === 0, body);
  sendJson(res, 200, { status: 'OK' });
}

async function createZaloPayPayment(req, res) {
  const body = await readRequestBody(req);
  const order = await createOrderFromCart(body.items);

  if (!order.ok) {
    sendJson(res, 400, { ok: false, message: order.message });
    return;
  }

  const missing = ['appId', 'key1', 'key2'].filter(key => !zalopayConfig[key]);
  if (missing.length) {
    sendJson(res, 500, { ok: false, message: `Thieu cau hinh ZaloPay: ${missing.join(', ')}` });
    return;
  }

  const appTime = Date.now();
  const appTransId = `${formatDateYYMMDD(new Date())}_${appTime}`;
  const appUser = body.appUser || 'urbancart';
  const amount = order.amount;
  const description = body.description || 'Thanh toan don hang UrbanCart';
  const embedData = JSON.stringify({ redirecturl: zalopayConfig.returnUrl });
  const item = JSON.stringify(order.items);
  const raw = `${zalopayConfig.appId}|${appTransId}|${appUser}|${amount}|${appTime}|${embedData}|${item}`;

  const payload = {
    app_id: Number(zalopayConfig.appId),
    app_trans_id: appTransId,
    app_user: appUser,
    app_time: appTime,
    amount,
    embed_data: embedData,
    item,
    description,
    callback_url: zalopayConfig.callbackUrl,
    mac: hmacSha256(zalopayConfig.key1, raw)
  };

  await createLocalOrder('zalopay', appTransId, order, description, getSessionFromRequest(req), 'CREATED');

  try {
    const zaloResponse = await postJson(zalopayConfig.createUrl, payload);
    const status = zaloResponse.return_code === 1 ? 'PENDING' : 'FAILED';
    await updateOrderGatewayResponse(appTransId, status, zaloResponse);
    sendJson(res, 200, {
      ok: zaloResponse.return_code === 1,
      provider: 'zalopay',
      orderId: appTransId,
      paymentUrl: zaloResponse.order_url,
      zalopay: zaloResponse
    });
  } catch (err) {
    await updateOrderGatewayResponse(appTransId, 'FAILED', { error: err.message });
    sendJson(res, 502, { ok: false, message: 'Khong tao duoc thanh toan ZaloPay', error: err.message });
  }
}

async function handleZaloPayCallback(req, res) {
  const body = await readRequestBody(req);
  const { data, mac } = body;

  if (!data || !mac) {
    sendJson(res, 400, { return_code: -1, return_message: 'missing data/mac' });
    return;
  }

  if (hmacSha256(zalopayConfig.key2, data) !== mac) {
    sendJson(res, 400, { return_code: -1, return_message: 'mac not equal' });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    sendJson(res, 400, { return_code: -1, return_message: 'invalid data' });
    return;
  }

  const success = Number(parsed.return_code || parsed.resultCode || parsed.returncode || -1) === 1;
  await updateOrderFromGateway(parsed.app_trans_id, success, parsed);
  sendJson(res, 200, { return_code: 1, return_message: 'OK' });
}

async function queryZaloPayStatus(req, res) {
  const body = await readRequestBody(req);
  const appTransId = body.app_trans_id || body.orderId;
  if (!appTransId) {
    sendJson(res, 400, { ok: false, message: 'Missing app_trans_id' });
    return;
  }

  const data = `${zalopayConfig.appId}|${appTransId}|${zalopayConfig.key1}`;
  const params = new URLSearchParams();
  params.append('app_id', zalopayConfig.appId);
  params.append('app_trans_id', appTransId);
  params.append('mac', hmacSha256(zalopayConfig.key1, data));

  try {
    const response = await postForm(zalopayConfig.queryUrl, params);
    sendJson(res, 200, { ok: true, zalopay: response });
  } catch (err) {
    sendJson(res, 502, { ok: false, message: 'Khong kiem tra duoc trang thai ZaloPay', error: err.message });
  }
}

async function createCodOrder(req, res) {
  const sessionUser = getSessionFromRequest(req);
  if (!sessionUser) {
    sendJson(res, 401, { ok: false, message: 'Vui long dang nhap truoc khi dat COD' });
    return;
  }

  const user = await getUserByUsername(sessionUser.username);
  if (!user) {
    sendJson(res, 404, { ok: false, message: 'Khong tim thay tai khoan' });
    return;
  }

  if (!hasDeliveryProfile(user)) {
    sendJson(res, 400, { ok: false, message: 'Vui long cap nhat ten, so dien thoai va dia chi giao hang' });
    return;
  }

  const body = await readRequestBody(req);
  const order = await createOrderFromCart(body.items);

  if (!order.ok) {
    sendJson(res, 400, { ok: false, message: order.message });
    return;
  }

  const orderId = `COD${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
  const description = body.description || 'Thanh toan khi nhan hang';
  let savedOrder;
  try {
    savedOrder = await createLocalOrder('cod', orderId, order, description, toOrderCustomer(user), {
      status: 'COD_PENDING',
      applyStock: true
    });
  } catch (err) {
    sendJson(res, 400, { ok: false, message: err.message || 'Khong tao duoc don COD' });
    return;
  }

  sendJson(res, 201, {
    ok: true,
    provider: 'cod',
    orderId,
    amount: order.amount,
    items: order.items,
    customer: savedOrder.user,
    message: 'Da tao don hang COD'
  });
}

function serveStatic(pathname, res) {
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Khong tim thay tep');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      serveFile(path.join(filePath, 'index.html'), res);
      return;
    }
    serveFile(filePath, res);
  });
}

function resolveStaticPath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const route = decodedPath.replace(/\\/g, '/');

  if (route === '/' || route === '/index.html' || route === '/web' || route === '/web/') {
    return safeResolve(webRoot, 'index.html');
  }

  if (route === '/style.css' || route === '/script.js') {
    return safeResolve(webRoot, route.slice(1));
  }

  if (route.startsWith('/accesst/')) {
    return safeResolve(assetsRoot, route.slice('/accesst/'.length));
  }

  if (route.startsWith('/web/')) {
    return safeResolve(webRoot, route.slice('/web/'.length));
  }

  if (route.startsWith('/bootstrap-5.3.8-dist/')) {
    return safeResolve(bootstrapRoot, route.slice('/bootstrap-5.3.8-dist/'.length));
  }

  return null;
}

function safeResolve(basePath, ...segments) {
  const target = path.resolve(basePath, ...segments);
  const relative = path.relative(basePath, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return target;
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.code === 'ENOENT' ? '404 - Khong tim thay tep' : 'Loi may chu noi bo');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    req.on('data', chunk => {
      totalLength += chunk.length;

      if (totalLength > maxBodySize) {
        req.destroy(new Error('Body qua lon'));
        return;
      }

      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }

      const contentType = req.headers['content-type'] || '';
      try {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
          return;
        }
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Body khong hop le: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function postJson(url, payload) {
  return request(url, JSON.stringify(payload), { 'Content-Type': 'application/json' });
}

function postForm(url, params) {
  return request(url, params.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
}

function request(url, body, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(JSON.stringify(data)));
          return;
        }
        resolve(data);
      });
    });

    req.on('timeout', () => req.destroy(new Error('Gateway timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendJson(res, statusCode, payload) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (statusCode === 204) {
    res.writeHead(statusCode, headers);
    res.end();
    return;
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function sendPaymentReturn(res, provider, params) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ket qua thanh toan ${provider}</title>
  <style>body{font-family:Arial,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;color:#151515}pre{background:#f6f6f6;padding:16px;border-radius:8px;overflow:auto}</style>
</head>
<body>
  <h1>Ket qua thanh toan ${provider}</h1>
  <p>Cong thanh toan da chuyen huong ve website. Ket qua chinh thuc nen duoc cap nhat qua IPN/callback.</p>
  <pre>${escapeHtml(JSON.stringify(params, null, 2))}</pre>
  <p><a href="/">Quay lai UrbanCart</a></p>
</body>
</html>`);
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + sessionMaxAgeMs;

  sessions.set(token, {
    user: {
      id: user.id || null,
      username: user.username,
      role: user.role,
      fullName: user.fullName || '',
      phone: user.phone || '',
      address: user.address || ''
    },
    expiresAtMs
  });

  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

function getSessionFromRequest(req) {
  const token = getRequestToken(req);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAtMs <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session.user;
}

function updateSessionUser(req, user) {
  const token = getRequestToken(req);
  if (!token || !sessions.has(token)) return;

  const session = sessions.get(token);
  session.user = {
    id: user.id || null,
    username: user.username,
    role: user.role,
    fullName: user.fullName || '',
    phone: user.phone || '',
    address: user.address || ''
  };
}

function destroySession(req) {
  const token = getRequestToken(req);
  if (token) sessions.delete(token);
}

async function createOrderFromCart(items) {
  if (!Array.isArray(items) || !items.length) {
    return {
      ok: false,
      message: 'Gio hang trong'
    };
  }

  const products = await readProducts();
  const orderItems = [];

  for (const item of items) {
    const productId = Number(item.productId || item.id);
    const quantity = Number(item.quantity || item.qty);
    const product = products.find(entry => Number(entry.id) === productId);

    if (!product) {
      return {
        ok: false,
        message: 'San pham khong ton tai'
      };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        ok: false,
        message: 'So luong san pham khong hop le'
      };
    }

    const sizes = getProductSizes(product);
    const size = item.size === null || item.size === undefined ? '' : String(item.size).trim();

    if (requiresProductSize(product)) {
      if (!size) {
        return {
          ok: false,
          message: 'Vui long chon size'
        };
      }

      if (!sizes.includes(size)) {
        return {
          ok: false,
          message: 'Size san pham khong hop le'
        };
      }

      const stock = Number(product.stock?.[size] || 0);
      if (quantity > stock) {
        return {
          ok: false,
          message: 'So luong vuot qua ton kho'
        };
      }
    }

    const unitPrice = Number(product.price) || 0;
    if (!normalizeAmount(unitPrice)) {
      return {
        ok: false,
        message: 'Gia san pham khong hop le'
      };
    }

    orderItems.push({
      productId: Number(product.id),
      name: product.name,
      size: size || null,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity
    });
  }

  const amount = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);

  if (!normalizeAmount(amount)) {
    return {
      ok: false,
      message: 'amount khong hop le'
    };
  }

  return {
    ok: true,
    amount,
    items: orderItems
  };
}

function requiresProductSize(product) {
  return ['shoes', 'clothing'].includes(product.category) || getProductSizes(product).length > 0;
}

function getProductSizes(product) {
  return Array.isArray(product.sizes) ? product.sizes.map(size => String(size)) : [];
}

function hasDeliveryProfile(user) {
  return Boolean(
    String(user.fullName || '').trim() &&
    String(user.phone || '').trim() &&
    String(user.address || '').trim()
  );
}

function toOrderCustomer(user) {
  return {
    id: user.id || null,
    username: user.username,
    role: user.role,
    fullName: String(user.fullName || '').trim(),
    phone: String(user.phone || '').trim(),
    address: String(user.address || '').trim()
  };
}

async function createLocalOrder(provider, orderId, order, description, user, options = {}) {
  const connection = await db.getConnection();
  const customer = user || {};
  const status = options.status || 'CREATED';
  let stockApplied = false;

  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO orders
        (order_code, user_id, provider, status, amount, description,
         customer_username, customer_name, customer_phone, customer_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        customer.id || null,
        provider,
        status,
        order.amount,
        description || '',
        customer.username || '',
        customer.fullName || '',
        customer.phone || '',
        customer.address || ''
      ]
    );

    for (const item of order.items) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, size, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          item.productId,
          item.name,
          item.size || null,
          item.quantity,
          item.unitPrice,
          item.lineTotal
        ]
      );
    }

    if (options.applyStock) {
      stockApplied = await applyOrderStockByDbId(connection, result.insertId);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return {
    provider,
    orderId,
    amount: order.amount,
    items: order.items,
    description,
    user: user || null,
    status,
    stockApplied,
    createdAt: new Date().toISOString()
  };
}

async function updateOrderGatewayResponse(orderId, status, gatewayResponse) {
  if (!orderId) return;

  await db.execute(
    'UPDATE orders SET status = ?, gateway_response = ? WHERE order_code = ?',
    [status, JSON.stringify(gatewayResponse || {}), orderId]
  );
}

async function updateOrderFromGateway(orderId, success, gatewayPayload) {
  if (!orderId) return;

  if (!success) {
    await db.execute(
      'UPDATE orders SET status = ?, gateway_payload = ? WHERE order_code = ?',
      ['FAILED', JSON.stringify(gatewayPayload || {}), orderId]
    );
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, stock_applied FROM orders WHERE order_code = ? FOR UPDATE',
      [orderId]
    );

    if (!rows.length) {
      await connection.rollback();
      return;
    }

    if (!Number(rows[0].stock_applied)) {
      await applyOrderStockByDbId(connection, rows[0].id);
    }

    await connection.execute(
      'UPDATE orders SET status = ?, gateway_payload = ? WHERE id = ?',
      ['PAID', JSON.stringify(gatewayPayload || {}), rows[0].id]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    await db.execute(
      'UPDATE orders SET status = ?, gateway_payload = ? WHERE order_code = ?',
      ['PAID_STOCK_ERROR', JSON.stringify({ gatewayPayload, stockError: err.message }), orderId]
    );
    throw err;
  } finally {
    connection.release();
  }
}

async function applyOrderStockByDbId(connection, orderDbId) {
  const [orderRows] = await connection.execute(
    'SELECT id, stock_applied FROM orders WHERE id = ? FOR UPDATE',
    [orderDbId]
  );

  if (!orderRows.length) {
    throw new Error('Khong tim thay don hang');
  }

  if (Number(orderRows[0].stock_applied)) {
    return false;
  }

  const [items] = await connection.execute(
    `SELECT product_id, size, quantity
     FROM order_items
     WHERE order_id = ?`,
    [orderDbId]
  );

  for (const item of items) {
    if (!item.product_id || !item.size) continue;

    const [productRows] = await connection.execute(
      'SELECT id, stock FROM products WHERE id = ? FOR UPDATE',
      [item.product_id]
    );

    if (!productRows.length) {
      throw new Error('San pham trong don khong con ton tai');
    }

    const stock = parseJson(productRows[0].stock, {});
    const size = String(item.size);
    const currentStock = Number(stock[size] || 0);
    const quantity = Number(item.quantity || 0);

    if (currentStock < quantity) {
      throw new Error(`Khong du ton kho cho san pham #${item.product_id} size ${size}`);
    }

    stock[size] = currentStock - quantity;
    await connection.execute(
      'UPDATE products SET stock = ? WHERE id = ?',
      [JSON.stringify(stock), item.product_id]
    );
  }

  await connection.execute(
    'UPDATE orders SET stock_applied = 1 WHERE id = ?',
    [orderDbId]
  );

  return true;
}

async function getOrdersByUserId(userId) {
  if (!userId) return [];
  return fetchOrders('WHERE o.user_id = ?', [Number(userId)]);
}

async function getSalesHistory() {
  return fetchOrders('', []);
}

async function fetchOrders(whereClause, params) {
  const [rows] = await db.execute(
    `SELECT
       o.id,
       o.order_code,
       o.user_id,
       o.provider,
       o.status,
       o.stock_applied,
       o.amount,
       o.description,
       o.customer_username,
       o.customer_name,
       o.customer_phone,
       o.customer_address,
       o.gateway_response,
       o.gateway_payload,
       o.created_at,
       o.updated_at,
       oi.id AS item_id,
       oi.product_id,
       oi.product_name,
       oi.size,
       oi.quantity,
       oi.unit_price,
       oi.line_total
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereClause}
     ORDER BY o.created_at DESC, o.id DESC, oi.id ASC`,
    params
  );

  const ordersById = new Map();

  rows.forEach((row) => {
    if (!ordersById.has(row.id)) {
      ordersById.set(row.id, {
        id: Number(row.id),
        orderId: row.order_code,
        provider: row.provider,
        status: row.status,
        stockApplied: Boolean(row.stock_applied),
        amount: Number(row.amount),
        description: row.description || '',
        customer: {
          username: row.customer_username || '',
          fullName: row.customer_name || '',
          phone: row.customer_phone || '',
          address: row.customer_address || ''
        },
        gatewayResponse: parseJson(row.gateway_response, null),
        gatewayPayload: parseJson(row.gateway_payload, null),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items: []
      });
    }

    if (row.item_id) {
      ordersById.get(row.id).items.push({
        productId: row.product_id === null ? null : Number(row.product_id),
        name: row.product_name,
        size: row.size || null,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        lineTotal: Number(row.line_total)
      });
    }
  });

  return Array.from(ordersById.values());
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatDateYYMMDD(date) {
  return String(date.getFullYear()).slice(-2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
}

function parsePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function startServer() {
  await db.initDatabase();
  await ensureUserDataFile(userDataFile);
  await ensureProductsDataFile(productsDataFile);

  server.listen(port, host, () => {
    console.log(`Server chay tai http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`Public URL: ${publicBaseUrl}`);
  });
}

startServer().catch((err) => {
  console.error('Khong khoi dong duoc server:', err);
  process.exit(1);
});
