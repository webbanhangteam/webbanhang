const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureUserDataFile, handleAuthRoute } = require('./routes/auth');
const { ensureProductsDataFile, handleProductsRoute } = require('./routes/products');
const { isAdminRequest, sendForbidden } = require('./middleware/adminMiddleware');

loadEnvFile(path.join(__dirname, '.env'));

const root = path.resolve(__dirname);
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const orders = {};
const userDataFile = path.join(root, 'data', 'DATA.txt');
const productsDataFile = path.join(root, 'data', 'products.json');
const maxBodySize = Number(process.env.MAX_BODY_SIZE || 1024 * 1024);

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

ensureUserDataFile(userDataFile);
ensureProductsDataFile(productsDataFile);

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
    isAdminRequest,
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

  if (req.method === 'GET' && requestUrl.pathname === '/api/orders') {
    sendJson(res, 200, { ok: true, orders });
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
  const amount = normalizeAmount(body.amount);
  if (!amount) {
    sendJson(res, 400, { ok: false, message: 'amount khong hop le' });
    return;
  }

  const missing = ['partnerCode', 'accessKey', 'secretKey'].filter(key => !momoConfig[key]);
  if (missing.length) {
    sendJson(res, 500, { ok: false, message: `Thieu cau hinh MoMo: ${missing.join(', ')}` });
    return;
  }

  const requestId = `${momoConfig.partnerCode}${Date.now()}`;
  const orderId = requestId;
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

  orders[orderId] = createLocalOrder('momo', orderId, amount, body.items, orderInfo);

  try {
    const momoResponse = await postJson(momoConfig.endpoint, payload);
    orders[orderId].gatewayResponse = momoResponse;
    orders[orderId].status = momoResponse.resultCode === 0 || momoResponse.payUrl ? 'PENDING' : 'FAILED';
    sendJson(res, 200, { ok: true, provider: 'momo', orderId, paymentUrl: momoResponse.payUrl, momo: momoResponse });
  } catch (err) {
    orders[orderId].status = 'FAILED';
    orders[orderId].error = err.message;
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

  updateOrderFromGateway(body.orderId, Number(body.resultCode) === 0, body);
  sendJson(res, 200, { status: 'OK' });
}

async function createZaloPayPayment(req, res) {
  const body = await readRequestBody(req);
  const amount = normalizeAmount(body.amount);
  if (!amount) {
    sendJson(res, 400, { ok: false, message: 'amount khong hop le' });
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
  const description = body.description || 'Thanh toan don hang UrbanCart';
  const embedData = JSON.stringify({ redirecturl: zalopayConfig.returnUrl });
  const item = JSON.stringify(body.items || []);
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

  orders[appTransId] = createLocalOrder('zalopay', appTransId, amount, body.items, description);

  try {
    const zaloResponse = await postJson(zalopayConfig.createUrl, payload);
    orders[appTransId].gatewayResponse = zaloResponse;
    orders[appTransId].status = zaloResponse.return_code === 1 ? 'PENDING' : 'FAILED';
    sendJson(res, 200, {
      ok: zaloResponse.return_code === 1,
      provider: 'zalopay',
      orderId: appTransId,
      paymentUrl: zaloResponse.order_url,
      zalopay: zaloResponse
    });
  } catch (err) {
    orders[appTransId].status = 'FAILED';
    orders[appTransId].error = err.message;
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

  const parsed = JSON.parse(data);
  const success = Number(parsed.return_code || parsed.resultCode || parsed.returncode || -1) === 1;
  updateOrderFromGateway(parsed.app_trans_id, success, parsed);
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
    return safeResolve(root, 'web', 'index.html');
  }

  if (route === '/style.css' || route === '/testscript.js') {
    return safeResolve(root, 'web', route.slice(1));
  }

  if (route.startsWith('/accesst/')) {
    return safeResolve(root, 'web', route.slice(1));
  }

  if (route.startsWith('/web/')) {
    return safeResolve(root, route.slice(1));
  }

  if (route.startsWith('/bootstrap-5.3.8-dist/')) {
    return safeResolve(root, route.slice(1));
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
    'Access-Control-Allow-Headers': 'Content-Type,role,x-user-role,x-role,x-username',
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

function createLocalOrder(provider, orderId, amount, items, description) {
  return {
    provider,
    orderId,
    amount,
    items: Array.isArray(items) ? items : [],
    description,
    status: 'CREATED',
    createdAt: new Date().toISOString()
  };
}

function updateOrderFromGateway(orderId, success, gatewayPayload) {
  if (!orderId || !orders[orderId]) return;
  orders[orderId].status = success ? 'PAID' : 'FAILED';
  orders[orderId].gatewayPayload = gatewayPayload;
  orders[orderId].updatedAt = new Date().toISOString();
}

function formatDateYYMMDD(date) {
  return String(date.getFullYear()).slice(-2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
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

server.listen(port, host, () => {
  console.log(`Server chay tai http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`Public URL: ${publicBaseUrl}`);
});
