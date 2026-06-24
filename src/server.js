require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./config/db');
const logger = require('./utils/logger');
const { ensureUserDataFile, handleAuthRoute, getUserByUsername } = require('./routes/auth');
const {
  ensureProductsDataFile,
  handleProductsRoute,
  readProducts,
  invalidateProductsCache
} = require('./routes/products');
const { getRequestToken, isAdminRequest, sendForbidden } = require('./middleware/adminMiddleware');
const { createRateLimiter } = require('./middleware/rateLimiter');

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'public');
const assetsRoot = path.join(webRoot, 'assets');
const bootstrapRoot = path.join(root, 'bootstrap-5.3.8-dist');
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const sessions = new Map();
const adminOrderEventClients = new Set();
const userOrderEventClients = new Set();
const userDataFile = path.join(root, 'data', 'DATA.txt');
const fulfillmentStatuses = ['ORDERED', 'PREPARING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];

const productsDataFile = path.join(root, 'data', 'products.json');
const maxBodySize = parsePositiveNumber(process.env.MAX_BODY_SIZE, 1024 * 1024);
const sessionMaxAgeMs = parsePositiveNumber(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 12);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultAdminPassword = 'change-this-admin-password';

const authRateLimiter = createRateLimiter({
  rules: [
    {
      method: 'POST',
      paths: ['/api/auth/login', '/api/v1/auth/login'],
      limit: 10,
      windowMs: 60 * 1000
    },
    {
      method: 'POST',
      paths: ['/api/auth/register', '/api/v1/auth/register'],
      limit: 5,
      windowMs: 60 * 1000
    }
  ]
});

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

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': 'default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.jsdelivr.net; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src \'self\' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src \'self\' https://images.unsplash.com data:; connect-src \'self\' https://provinces.open-api.vn'
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
  const requestId = getRequestId(req);
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('http.request', {
      requestId,
      method: req.method,
      path: getRequestPath(req.url),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: getRequestIp(req)
    });
  });

  try {
    res._request = req;
    const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

    if (isApiRequestPath(requestUrl.pathname)) {
      await handleApi(req, res, requestUrl);
      return;
    }

    serveStatic(requestUrl.pathname, req, res);
  } catch (err) {
    logger.error('http.request_error', {
      requestId,
      method: req.method,
      path: getRequestPath(req.url),
      error: err
    });
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, message: 'Loi may chu noi bo' });
    } else {
      res.end();
    }
  }
});

async function handleApi(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const routeUrl = new URL(requestUrl);
  routeUrl.pathname = normalizeApiPath(requestUrl.pathname);

  if (req.method === 'GET' && (routeUrl.pathname === '/api/health' || routeUrl.pathname === '/health')) {
    let dbOk = false;
    try {
      await db.execute('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    sendJson(res, dbOk ? 200 : 503, {
      ok: dbOk,
      service: 'shop-anh-thuan',
      database: dbOk ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      time: new Date().toISOString()
    });
    return;
  }

  if (authRateLimiter(req, res, routeUrl, sendJson)) {
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

  if (await handleAuthRoute(req, res, routeUrl, routeContext)) {
    return;
  }

  if (await handleProductsRoute(req, res, routeUrl, routeContext)) {
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/momo') {
    await createMomoPayment(req, res);
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/momo/ipn') {
    await handleMomoIpn(req, res);
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/payments/momo/return') {
    sendPaymentReturn(res, 'MoMo', Object.fromEntries(requestUrl.searchParams.entries()));
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/zalopay') {
    await createZaloPayPayment(req, res);
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/zalopay/callback') {
    await handleZaloPayCallback(req, res);
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/payments/zalopay/return') {
    sendPaymentReturn(res, 'ZaloPay', Object.fromEntries(requestUrl.searchParams.entries()));
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/zalopay/status') {
    await queryZaloPayStatus(req, res);
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/cod') {
    await createCodOrder(req, res);
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/orders/me') {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    sendJson(res, 200, { ok: true, orders: await getOrdersByUserId(user.id) });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/orders/me/events') {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    openUserOrderEventStream(req, res, user);
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/admin/order-events') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    openAdminOrderEventStream(req, res);
    return;
  }

  const seenOrderMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/seen$/);
  if (req.method === 'POST' && seenOrderMatch) {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    const order = await markOrderSeen(Number(seenOrderMatch[1]));
    if (!order) {
      sendJson(res, 404, { ok: false, message: 'Khong tim thay don hang' });
      return;
    }

    broadcastAdminOrderEvent('order.seen', {
      id: order.id,
      orderId: order.orderId,
      adminSeenAt: order.adminSeenAt
    });
    logger.info('order.admin_seen', {
      requestId: req.requestId,
      orderId: order.orderId,
      orderDbId: order.id
    });
    sendJson(res, 200, { ok: true, order });
    return;
  }

  const fulfillmentOrderMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/fulfillment$/);
  if (req.method === 'PUT' && fulfillmentOrderMatch) {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    const body = await readRequestBodySafely(req, res);
    if (!body) return;

    const result = await updateOrderFulfillmentByAdmin(
      Number(fulfillmentOrderMatch[1]),
      body.status
    );
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    notifyOrderFulfillmentChanged(result.order, req.requestId, 'admin');
    sendJson(res, 200, { ok: true, order: result.order });
    return;
  }

  const cancelOrderMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/cancel$/);
  if (req.method === 'POST' && cancelOrderMatch) {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    const actor = isAdminRequest(req, getSessionFromRequest) ? 'admin' : 'customer';
    const result = await cancelOrder(
      Number(cancelOrderMatch[1]),
      user.id,
      actor === 'admin'
    );
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    notifyOrderFulfillmentChanged(result.order, req.requestId, actor);
    sendJson(res, 200, { ok: true, order: result.order });
    return;
  }

  const receivedOrderMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/received$/);
  if (req.method === 'POST' && receivedOrderMatch) {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    const result = await confirmOrderReceived(Number(receivedOrderMatch[1]), user.id);
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    notifyOrderFulfillmentChanged(result.order, req.requestId, 'customer');
    sendJson(res, 200, { ok: true, order: result.order });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/orders') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    const afterId = parseNonNegativeInteger(routeUrl.searchParams.get('afterId'));
    const orders = afterId === null
      ? await getSalesHistory()
      : await getSalesHistoryAfterId(afterId);

    sendJson(res, 200, { ok: true, orders });
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Khong tim thay API' });
}

function isApiRequestPath(pathname) {
  return pathname.startsWith('/api/') ||
    pathname === '/health';
}

function normalizeApiPath(pathname) {
  if (pathname === '/api/v1') return '/api';
  if (pathname.startsWith('/api/v1/')) {
    return `/api/${pathname.slice('/api/v1/'.length)}`;
  }
  return pathname;
}

async function createMomoPayment(req, res) {
  const sessionUser = getSessionFromRequest(req);
  if (!sessionUser) {
    sendJson(res, 401, { ok: false, message: 'Vui long dang nhap truoc khi thanh toan' });
    return;
  }

  const user = await getUserByUsername(sessionUser.username);
  if (!user) {
    sendJson(res, 404, { ok: false, message: 'Khong tim thay tai khoan' });
    return;
  }

  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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

  await createLocalOrder('momo', orderId, order, orderInfo, toOrderCustomer(user), {
    status: 'CREATED',
    requestId: req.requestId
  });

  try {
    const momoResponse = await postJson(momoConfig.endpoint, payload);
    const status = momoResponse.resultCode === 0 || momoResponse.payUrl ? 'PENDING' : 'FAILED';
    await updateOrderGatewayResponse(orderId, status, momoResponse);
    sendJson(res, 200, { ok: true, provider: 'momo', orderId, paymentUrl: momoResponse.payUrl, momo: momoResponse });
  } catch (err) {
    await updateOrderGatewayResponse(orderId, 'FAILED', { error: err.message });
    logger.error('payment.gateway_request_failed', {
      requestId: req.requestId,
      provider: 'momo',
      orderId,
      error: err
    });
    sendJson(res, 502, { ok: false, message: 'Khong tao duoc thanh toan MoMo', error: err.message });
  }
}

async function handleMomoIpn(req, res) {
  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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
  const sessionUser = getSessionFromRequest(req);
  if (!sessionUser) {
    sendJson(res, 401, { ok: false, message: 'Vui long dang nhap truoc khi thanh toan' });
    return;
  }

  const user = await getUserByUsername(sessionUser.username);
  if (!user) {
    sendJson(res, 404, { ok: false, message: 'Khong tim thay tai khoan' });
    return;
  }

  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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

  await createLocalOrder('zalopay', appTransId, order, description, toOrderCustomer(user), {
    status: 'CREATED',
    requestId: req.requestId
  });

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
    logger.error('payment.gateway_request_failed', {
      requestId: req.requestId,
      provider: 'zalopay',
      orderId: appTransId,
      error: err
    });
    sendJson(res, 502, { ok: false, message: 'Khong tao duoc thanh toan ZaloPay', error: err.message });
  }
}

async function handleZaloPayCallback(req, res) {
  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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
  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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
    logger.error('payment.status_query_failed', {
      requestId: req.requestId,
      provider: 'zalopay',
      orderId: appTransId,
      error: err
    });
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

  const body = await readRequestBodySafely(req, res);
  if (!body) return;

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
      applyStock: true,
      requestId: req.requestId
    });
  } catch (err) {
    logger.warn('order.create_failed', {
      requestId: req.requestId,
      provider: 'cod',
      orderId,
      userId: user.id || null,
      error: err.message
    });
    sendJson(res, 400, { ok: false, message: err.message || 'Khong tao duoc don COD' });
    return;
  }

  sendJson(res, 201, {
    ok: true,
    provider: 'cod',
    orderId,
    amount: order.amount,
    items: order.items,
    products: await readProducts(),
    customer: savedOrder.user,
    message: 'Da tao don hang COD'
  });
}

function serveStatic(pathname, req, res) {
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    res.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Khong tim thay tep');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      serveFile(path.join(filePath, 'index.html'), req, res);
      return;
    }
    serveFile(filePath, req, res);
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

  if (
    route === '/' ||
    route === '/index.html' ||
    route === '/html' ||
    route === '/html/' ||
    route === '/html/index.html' ||
    route === '/web' ||
    route === '/web/' ||
    route === '/web/index.html'
  ) {
    return safeResolve(webRoot, 'html', 'index.html');
  }

  if (route === '/style.css' || route === '/tailwind.css' || route === '/script.js' || route === '/content.json') {
    return safeResolve(webRoot, route.slice(1));
  }

  if (route.startsWith('/css/')) {
    return safeResolve(webRoot, route.slice(1));
  }

  if (route.startsWith('/html/')) {
    return safeResolve(webRoot, route.slice(1));
  }

  if (route.endsWith('.html')) {
    return safeResolve(webRoot, 'html', route.slice(1));
  }

    if (route.startsWith('/js/')) {
      return safeResolve(webRoot, route.slice(1));
    }

    if (route.startsWith('/image/')) {
      return safeResolve(webRoot, route.slice(1));
    }
  if (route.startsWith('/assets/')) {
    return safeResolve(assetsRoot, route.slice('/assets/'.length));
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

function serveFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const isAsset = /\.(avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i.test(ext);

  fs.stat(filePath, (statErr, stats) => {
    if (statErr) {
      res.writeHead(statErr.code === 'ENOENT' ? 404 : 500, {
        ...securityHeaders,
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(statErr.code === 'ENOENT' ? '404 - Khong tim thay tep' : 'Loi may chu noi bo');
      return;
    }

    const etag = `"${stats.size}-${Math.trunc(stats.mtimeMs)}"`;
    const cacheControl = isAsset ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        ...securityHeaders,
        'Cache-Control': cacheControl,
        ETag: etag
      });
      res.end();
      return;
    }

    fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, {
        ...securityHeaders,
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(err.code === 'ENOENT' ? '404 - Khong tim thay tep' : 'Loi may chu noi bo');
      return;
    }

    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      ETag: etag
    });
    res.end(content);
  });
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

async function readRequestBodySafely(req, res) {
  try {
    return await readRequestBody(req);
  } catch (err) {
    sendJson(res, 400, {
      ok: false,
      message: err.message || 'Body khong hop le'
    });
    return null;
  }
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

function openAdminOrderEventStream(req, res) {
  const headers = {
    ...securityHeaders,
    ...getCorsHeaders(req),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };

  res.writeHead(200, headers);
  res.write('retry: 3000\n\n');
  writeServerSentEvent(res, 'connected', { time: new Date().toISOString() });

  const client = { req, res, heartbeat: null };
  const cleanup = () => {
    if (client.heartbeat) clearInterval(client.heartbeat);
    adminOrderEventClients.delete(client);
  };

  client.heartbeat = setInterval(() => {
    const user = getSessionFromRequest(req);
    if (!user || user.role !== 'Admin') {
      cleanup();
      res.end();
      return;
    }

    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 20000);
  client.heartbeat.unref();

  adminOrderEventClients.add(client);
  req.on('close', cleanup);
  res.on('error', cleanup);
}

function openUserOrderEventStream(req, res, user) {
  const headers = {
    ...securityHeaders,
    ...getCorsHeaders(req),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };

  res.writeHead(200, headers);
  res.write('retry: 3000\n\n');
  writeServerSentEvent(res, 'connected', { time: new Date().toISOString() });

  const client = {
    req,
    res,
    userId: Number(user.id),
    heartbeat: null
  };
  const cleanup = () => {
    if (client.heartbeat) clearInterval(client.heartbeat);
    userOrderEventClients.delete(client);
  };

  client.heartbeat = setInterval(() => {
    const sessionUser = getSessionFromRequest(req);
    if (!sessionUser || Number(sessionUser.id) !== client.userId) {
      cleanup();
      res.end();
      return;
    }

    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 20000);
  client.heartbeat.unref();

  userOrderEventClients.add(client);
  req.on('close', cleanup);
  res.on('error', cleanup);
}

function broadcastAdminOrderEvent(event, payload) {
  for (const client of adminOrderEventClients) {
    try {
      writeServerSentEvent(client.res, event, payload);
    } catch {
      if (client.heartbeat) clearInterval(client.heartbeat);
      adminOrderEventClients.delete(client);
    }
  }
}

function broadcastUserOrderEvent(userId, event, payload) {
  if (!userId) return;

  for (const client of userOrderEventClients) {
    if (Number(client.userId) !== Number(userId)) continue;

    try {
      writeServerSentEvent(client.res, event, payload);
    } catch {
      if (client.heartbeat) clearInterval(client.heartbeat);
      userOrderEventClients.delete(client);
    }
  }
}

function writeServerSentEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function closeAdminOrderEventStreams() {
  for (const client of adminOrderEventClients) {
    if (client.heartbeat) clearInterval(client.heartbeat);
    client.res.end();
  }
  adminOrderEventClients.clear();
}

function closeUserOrderEventStreams() {
  for (const client of userOrderEventClients) {
    if (client.heartbeat) clearInterval(client.heartbeat);
    client.res.end();
  }
  userOrderEventClients.clear();
}

function sendJson(res, statusCode, payload) {
  const headers = {
    ...securityHeaders,
    ...getCorsHeaders(res._request),
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
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': 'text/html; charset=utf-8'
  });
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

function getCorsHeaders(req) {
  const origin = req?.headers?.origin;

  if (origin && allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin'
    };
  }

  if (process.env.NODE_ENV === 'development' && !allowedOrigins.length) {
    return {
      'Access-Control-Allow-Origin': '*'
    };
  }

  return {};
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
  const validationMessage = validateCartItems(items);
  if (validationMessage) {
    return {
      ok: false,
      message: validationMessage
    };
  }

  const products = await readProducts();
  const orderItems = [];
  const requestedQuantities = new Map();

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
    const colors = getProductColors(product);
    const size = item.size === null || item.size === undefined ? '' : String(item.size).trim();
    let color = item.color === null || item.color === undefined ? '' : String(item.color).trim();
    if (!color && colors.length === 1) {
      [color] = colors;
    }

    if (colors.length) {
      if (!color) {
        return {
          ok: false,
          message: 'Vui long chon mau'
        };
      }

      if (!colors.includes(color)) {
        return {
          ok: false,
          message: 'Mau san pham khong hop le'
        };
      }
    }

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

      const stock = getProductVariantStock(product, color, size);
      const key = `${product.id}:${color || '__no_color__'}:${size}`;
      const requested = (requestedQuantities.get(key) || 0) + quantity;
      requestedQuantities.set(key, requested);

      if (requested > stock) {
        return {
          ok: false,
          message: 'So luong vuot qua ton kho'
        };
      }
    } else if (colors.length) {
      const stock = getProductVariantStock(product, color, '');
      const key = `${product.id}:${color}:__default__`;
      const requested = (requestedQuantities.get(key) || 0) + quantity;
      requestedQuantities.set(key, requested);

      if (requested > stock) {
        return {
          ok: false,
          message: 'So luong vuot qua ton kho'
        };
      }
    } else {
      const totalStock = getProductTotalStock(product);
      if (totalStock !== null) {
        const key = `${product.id}:__total`;
        const requested = (requestedQuantities.get(key) || 0) + quantity;
        requestedQuantities.set(key, requested);

        if (requested > totalStock) {
          return {
            ok: false,
            message: 'So luong vuot qua ton kho'
          };
        }
      }
    }

    const unitPrice = getProductSalePrice(product);
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
      color: color || null,
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

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return 'Gio hang trong';
  }

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return 'San pham trong gio hang khong hop le';
    }

    const productId = Number(item.productId || item.id);
    const quantity = Number(item.quantity || item.qty);

    if (!Number.isInteger(productId) || productId <= 0) {
      return 'Ma san pham khong hop le';
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return 'So luong san pham khong hop le';
    }
  }

  return null;
}

function requiresProductSize(product) {
  return ['shoes', 'clothing'].includes(product.category) || getProductSizes(product).length > 0;
}

function getProductSizes(product) {
  return Array.isArray(product.sizes) ? product.sizes.map(size => String(size)) : [];
}

function getProductColors(product) {
  return Array.isArray(product.colors)
    ? product.colors.map(color => String(color).trim()).filter(Boolean)
    : [];
}

function getProductVariantStock(product, color, size) {
  const colors = getProductColors(product);
  if (colors.length) {
    const sizeKey = size || '__default__';
    return Math.max(0, Number(product.variantStock?.[color]?.[sizeKey]) || 0);
  }

  if (size) {
    return Math.max(0, Number(product.stock?.[size]) || 0);
  }

  return getProductTotalStock(product) || 0;
}

function getProductTotalStock(product) {
  if (product.totalStock === null || product.totalStock === undefined || product.totalStock === '') {
    return null;
  }

  const totalStock = Number(product.totalStock);
  return Number.isFinite(totalStock) ? Math.max(0, totalStock) : null;
}

function getProductSalePrice(product) {
  const price = Number(product.price) || 0;
  const rawSalePercent = Number(product.salePercent) || 0;
  const salePercent = Math.min(95, Math.max(0, Math.trunc(rawSalePercent)));
  if (!salePercent) return price;
  return Math.max(0, Math.round(price * (100 - salePercent) / 100));
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
  let orderDbId = null;

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
    orderDbId = Number(result.insertId);

    for (const item of order.items) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, size, color, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          item.productId,
          item.name,
          item.size || null,
          item.color || null,
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

  const savedOrder = {
    id: orderDbId,
    provider,
    orderId,
    amount: order.amount,
    items: order.items,
    description,
    user: user || null,
    status,
    stockApplied,
    isNew: true,
    adminSeenAt: null,
    fulfillmentStatus: 'ORDERED',
    receivedAt: null,
    createdAt: new Date().toISOString()
  };

  logger.info('order.created', {
    requestId: options.requestId || null,
    orderId,
    provider,
    status,
    amount: order.amount,
    itemCount: order.items.length,
    userId: customer.id || null,
    username: customer.username || '',
    stockApplied
  });

  broadcastAdminOrderEvent('order.created', {
    id: savedOrder.id,
    orderId: savedOrder.orderId,
    provider: savedOrder.provider,
    status: savedOrder.status,
    stockApplied: savedOrder.stockApplied,
    amount: savedOrder.amount,
    description: savedOrder.description,
    customer: savedOrder.user,
    items: savedOrder.items,
    isNew: true,
    adminSeenAt: null,
    fulfillmentStatus: savedOrder.fulfillmentStatus,
    receivedAt: null,
    createdAt: savedOrder.createdAt
  });

  return savedOrder;
}

async function updateOrderGatewayResponse(orderId, status, gatewayResponse) {
  if (!orderId) return;

  await db.execute(
    'UPDATE orders SET status = ?, gateway_response = ? WHERE order_code = ?',
    [status, JSON.stringify(gatewayResponse || {}), orderId]
  );

  logger.info('order.status_changed', {
    orderId,
    status,
    source: 'gateway_create'
  });
}

async function updateOrderFromGateway(orderId, success, gatewayPayload) {
  if (!orderId) return;

  if (!success) {
    await db.execute(
      'UPDATE orders SET status = ?, gateway_payload = ? WHERE order_code = ?',
      ['FAILED', JSON.stringify(gatewayPayload || {}), orderId]
    );
    logger.warn('order.status_changed', {
      orderId,
      status: 'FAILED',
      source: 'gateway_callback'
    });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, stock_applied, fulfillment_status FROM orders WHERE order_code = ? FOR UPDATE',
      [orderId]
    );

    if (!rows.length) {
      await connection.rollback();
      return;
    }

    if (normalizeFulfillmentStatus(rows[0].fulfillment_status) === 'CANCELLED') {
      await connection.execute(
        'UPDATE orders SET status = ?, gateway_payload = ? WHERE id = ?',
        ['PAID_AFTER_CANCEL', JSON.stringify(gatewayPayload || {}), rows[0].id]
      );
      await connection.commit();
      logger.warn('order.paid_after_cancel', {
        orderId,
        orderDbId: Number(rows[0].id)
      });
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
    logger.info('order.status_changed', {
      orderId,
      status: 'PAID',
      source: 'gateway_callback'
    });
  } catch (err) {
    await connection.rollback();
    await db.execute(
      'UPDATE orders SET status = ?, gateway_payload = ? WHERE order_code = ?',
      ['PAID_STOCK_ERROR', JSON.stringify({ gatewayPayload, stockError: err.message }), orderId]
    );
    logger.error('order.stock_update_failed', {
      orderId,
      status: 'PAID_STOCK_ERROR',
      error: err
    });
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
    `SELECT product_id, size, color, quantity
     FROM order_items
     WHERE order_id = ?`,
    [orderDbId]
  );

  for (const item of items) {
    if (!item.product_id) continue;

    const [productRows] = await connection.execute(
      'SELECT id, colors, stock, variant_stock, total_stock FROM products WHERE id = ? FOR UPDATE',
      [item.product_id]
    );

    if (!productRows.length) {
      throw new Error('San pham trong don khong con ton tai');
    }

    const quantity = Number(item.quantity || 0);

    const colors = parseJson(productRows[0].colors, []);

    if (Array.isArray(colors) && colors.length) {
      const variantStock = parseJson(productRows[0].variant_stock, {});
      const color = String(item.color || (colors.length === 1 ? colors[0] : ''));
      const sizeKey = item.size ? String(item.size) : '__default__';
      const currentStock = Number(variantStock?.[color]?.[sizeKey] || 0);

      if (!color || !colors.map(String).includes(color) || currentStock < quantity) {
        throw new Error(`Khong du ton kho cho san pham #${item.product_id} mau ${color || 'khong xac dinh'} size ${sizeKey}`);
      }

      variantStock[color][sizeKey] = currentStock - quantity;
      await connection.execute(
        'UPDATE products SET variant_stock = ? WHERE id = ?',
        [JSON.stringify(variantStock), item.product_id]
      );
      continue;
    }

    if (item.size) {
      const stock = parseJson(productRows[0].stock, {});
      const size = String(item.size);
      const currentStock = Number(stock[size] || 0);

      if (currentStock < quantity) {
        throw new Error(`Khong du ton kho cho san pham #${item.product_id} size ${size}`);
      }

      stock[size] = currentStock - quantity;
      await connection.execute(
        'UPDATE products SET stock = ? WHERE id = ?',
        [JSON.stringify(stock), item.product_id]
      );
      continue;
    }

    if (productRows[0].total_stock === null || productRows[0].total_stock === undefined) continue;

    const currentStock = Number(productRows[0].total_stock || 0);
    if (currentStock < quantity) {
      throw new Error(`Khong du ton kho cho san pham #${item.product_id}`);
    }

    await connection.execute(
      'UPDATE products SET total_stock = ? WHERE id = ?',
      [currentStock - quantity, item.product_id]
    );
  }

  await connection.execute(
    'UPDATE orders SET stock_applied = 1 WHERE id = ?',
    [orderDbId]
  );

  invalidateProductsCache();
  return true;
}

async function restoreOrderStockByDbId(connection, orderDbId) {
  const [orderRows] = await connection.execute(
    'SELECT id, stock_applied FROM orders WHERE id = ? FOR UPDATE',
    [orderDbId]
  );

  if (!orderRows.length) {
    throw new Error('Khong tim thay don hang');
  }

  if (!Number(orderRows[0].stock_applied)) {
    return false;
  }

  const [items] = await connection.execute(
    `SELECT product_id, size, color, quantity
     FROM order_items
     WHERE order_id = ?`,
    [orderDbId]
  );

  for (const item of items) {
    if (!item.product_id) continue;

    const [productRows] = await connection.execute(
      'SELECT id, colors, stock, variant_stock, total_stock FROM products WHERE id = ? FOR UPDATE',
      [item.product_id]
    );
    if (!productRows.length) continue;

    const quantity = Math.max(0, Number(item.quantity) || 0);
    const colors = parseJson(productRows[0].colors, []);

    if (Array.isArray(colors) && colors.length) {
      const variantStock = parseJson(productRows[0].variant_stock, {});
      const color = String(item.color || (colors.length === 1 ? colors[0] : ''));
      const sizeKey = item.size ? String(item.size) : '__default__';
      if (!color || !colors.map(String).includes(color)) continue;

      if (!variantStock[color] || typeof variantStock[color] !== 'object') {
        variantStock[color] = {};
      }
      variantStock[color][sizeKey] = Math.max(0, Number(variantStock[color][sizeKey]) || 0) + quantity;
      await connection.execute(
        'UPDATE products SET variant_stock = ? WHERE id = ?',
        [JSON.stringify(variantStock), item.product_id]
      );
      continue;
    }

    if (item.size) {
      const stock = parseJson(productRows[0].stock, {});
      const size = String(item.size);
      stock[size] = Math.max(0, Number(stock[size]) || 0) + quantity;
      await connection.execute(
        'UPDATE products SET stock = ? WHERE id = ?',
        [JSON.stringify(stock), item.product_id]
      );
      continue;
    }

    if (productRows[0].total_stock === null || productRows[0].total_stock === undefined) continue;
    await connection.execute(
      'UPDATE products SET total_stock = ? WHERE id = ?',
      [Math.max(0, Number(productRows[0].total_stock) || 0) + quantity, item.product_id]
    );
  }

  invalidateProductsCache();
  return true;
}

async function getOrdersByUserId(userId) {
  if (!userId) return [];
  return fetchOrders('WHERE o.user_id = ?', [Number(userId)]);
}

async function getSalesHistory() {
  return fetchOrders('', []);
}

async function getSalesHistoryAfterId(afterId) {
  return fetchOrders('WHERE o.id > ?', [Number(afterId)]);
}

async function markOrderSeen(orderDbId) {
  const [result] = await db.execute(
    `UPDATE orders
     SET admin_seen_at = COALESCE(admin_seen_at, CURRENT_TIMESTAMP)
     WHERE id = ?`,
    [Number(orderDbId)]
  );

  if (!result.affectedRows) return null;

  const orders = await fetchOrders('WHERE o.id = ?', [Number(orderDbId)]);
  return orders[0] || null;
}

async function updateOrderFulfillmentByAdmin(orderDbId, requestedStatus) {
  const nextStatus = normalizeFulfillmentStatus(requestedStatus);
  if (!nextStatus || ['DELIVERED', 'CANCELLED'].includes(nextStatus)) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Trang thai giao hang khong hop le'
    };
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, order_code, user_id, status, fulfillment_status
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [Number(orderDbId)]
    );

    if (!rows.length) {
      await connection.rollback();
      return { ok: false, statusCode: 404, message: 'Khong tim thay don hang' };
    }

    const order = rows[0];
    if (['FAILED', 'PAID_STOCK_ERROR'].includes(String(order.status))) {
      await connection.rollback();
      return {
        ok: false,
        statusCode: 409,
        message: 'Khong the giao don thanh toan that bai'
      };
    }

    const currentStatus = normalizeFulfillmentStatus(order.fulfillment_status) || 'ORDERED';
    const currentIndex = fulfillmentStatuses.indexOf(currentStatus);
    const nextIndex = fulfillmentStatuses.indexOf(nextStatus);

    if (nextIndex < currentIndex || nextIndex > currentIndex + 1) {
      await connection.rollback();
      return {
        ok: false,
        statusCode: 409,
        message: 'Can cap nhat trang thai don hang theo dung thu tu'
      };
    }

    if (nextStatus !== currentStatus) {
      await connection.execute(
        'UPDATE orders SET fulfillment_status = ? WHERE id = ?',
        [nextStatus, Number(orderDbId)]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const orders = await fetchOrders('WHERE o.id = ?', [Number(orderDbId)]);
  return { ok: true, order: orders[0] };
}

async function cancelOrder(orderDbId, userId, isAdmin) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, user_id, fulfillment_status
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [Number(orderDbId)]
    );

    if (!rows.length || (!isAdmin && Number(rows[0].user_id) !== Number(userId))) {
      await connection.rollback();
      return { ok: false, statusCode: 404, message: 'Khong tim thay don hang' };
    }

    const currentStatus = normalizeFulfillmentStatus(rows[0].fulfillment_status) || 'ORDERED';
    const canCancel = isAdmin
      ? currentStatus === 'ORDERED'
      : ['ORDERED', 'PREPARING'].includes(currentStatus);

    if (!canCancel) {
      await connection.rollback();
      return {
        ok: false,
        statusCode: 409,
        message: isAdmin
          ? 'Admin chi co the huy don truoc khi xac nhan'
          : 'Chi co the huy don truoc khi don chuyen sang dang giao'
      };
    }

    await restoreOrderStockByDbId(connection, Number(orderDbId));
    await connection.execute(
      `UPDATE orders
       SET fulfillment_status = 'CANCELLED', received_at = NULL
       WHERE id = ?`,
      [Number(orderDbId)]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const orders = await fetchOrders('WHERE o.id = ?', [Number(orderDbId)]);
  return { ok: true, order: orders[0] };
}

async function confirmOrderReceived(orderDbId, userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, user_id, fulfillment_status
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [Number(orderDbId)]
    );

    if (!rows.length || Number(rows[0].user_id) !== Number(userId)) {
      await connection.rollback();
      return { ok: false, statusCode: 404, message: 'Khong tim thay don hang' };
    }

    const currentStatus = normalizeFulfillmentStatus(rows[0].fulfillment_status) || 'ORDERED';
    if (currentStatus === 'DELIVERED') {
      await connection.commit();
    } else if (currentStatus !== 'SHIPPING') {
      await connection.rollback();
      return {
        ok: false,
        statusCode: 409,
        message: 'Chi co the xac nhan khi don hang dang giao'
      };
    } else {
      await connection.execute(
        `UPDATE orders
         SET fulfillment_status = 'DELIVERED', received_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(orderDbId)]
      );
      await connection.commit();
    }
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const orders = await fetchOrders('WHERE o.id = ?', [Number(orderDbId)]);
  return { ok: true, order: orders[0] };
}

function notifyOrderFulfillmentChanged(order, requestId, actor) {
  const payload = {
    id: order.id,
    orderId: order.orderId,
    fulfillmentStatus: order.fulfillmentStatus,
    receivedAt: order.receivedAt,
    updatedAt: order.updatedAt,
    actor
  };

  broadcastAdminOrderEvent('order.fulfillment_changed', payload);
  broadcastUserOrderEvent(order.userId, 'order.fulfillment_changed', payload);
  logger.info('order.fulfillment_changed', {
    requestId,
    orderId: order.orderId,
    orderDbId: order.id,
    fulfillmentStatus: order.fulfillmentStatus,
    actor
  });
}

function normalizeFulfillmentStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return fulfillmentStatuses.includes(normalized) ? normalized : null;
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
       o.admin_seen_at,
       o.fulfillment_status,
       o.received_at,
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
       oi.color,
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
        userId: row.user_id === null ? null : Number(row.user_id),
        provider: row.provider,
        status: row.status,
        stockApplied: Boolean(row.stock_applied),
        isNew: !row.admin_seen_at,
        adminSeenAt: row.admin_seen_at,
        fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillment_status) || 'ORDERED',
        receivedAt: row.received_at,
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
        color: row.color || null,
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

function parseNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function getRequestId(req) {
  const suppliedId = String(req.headers['x-request-id'] || '').trim();
  if (/^[a-zA-Z0-9._-]{1,100}$/.test(suppliedId)) return suppliedId;
  return crypto.randomUUID();
}

function getRequestPath(url) {
  try {
    return new URL(url || '/', 'http://localhost').pathname;
  } catch {
    return String(url || '/').split('?')[0];
  }
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket.remoteAddress || 'unknown';
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
  warnOnUnsafeDefaults();
  await ensureUserDataFile(userDataFile);
  await ensureProductsDataFile(productsDataFile);

  server.listen(port, host, () => {
    logger.info('server.started', {
      host,
      port: Number(port),
      localUrl: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
      publicUrl: publicBaseUrl,
      environment: process.env.NODE_ENV || 'development',
      logFile: logger.logFile
    });
  });
}

function warnOnUnsafeDefaults() {
  if (process.env.DEFAULT_ADMIN_PASSWORD === defaultAdminPassword) {
    logger.warn('security.default_admin_password', {
      message: 'Dang dung mat khau admin mac dinh. Vui long doi DEFAULT_ADMIN_PASSWORD trong .env'
    });
  }
}

async function shutdown(signal) {
  logger.info('server.shutdown_started', { signal });
  closeAdminOrderEventStreams();
  closeUserOrderEventStreams();

  server.close(async () => {
    try {
      await db.end();
    } catch (err) {
      logger.error('database.close_failed', { error: err });
    }

    logger.info('server.stopped', { signal });
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('server.shutdown_timeout', { signal });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch((err) => {
  logger.error('server.start_failed', { error: err });
  process.exit(1);
});
