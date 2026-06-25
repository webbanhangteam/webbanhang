require('dotenv').config();
const http = require('http');
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
const returnRequestTypes = ['return', 'exchange'];
const returnRequestStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'];
const returnWindowMs = 7 * 24 * 60 * 60 * 1000;

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
  'Content-Security-Policy': 'default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.jsdelivr.net; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src \'self\' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src \'self\' https://images.unsplash.com https://img.vietqr.io data:; connect-src \'self\' https://provinces.open-api.vn'
};

const vietQrConfig = {
  bankId: String(process.env.VIETQR_BANK_ID || process.env.VIETQR_ACQ_ID || process.env.BANK_ID || '').trim(),
  accountNo: String(process.env.VIETQR_ACCOUNT_NO || process.env.BANK_ACCOUNT_NO || '').trim(),
  accountName: String(process.env.VIETQR_ACCOUNT_NAME || process.env.BANK_ACCOUNT_NAME || '').trim(),
  template: String(process.env.VIETQR_TEMPLATE || 'compact2').trim()
};
const bankTransferWebhookConfig = {
  secret: String(
    process.env.BANK_TRANSFER_WEBHOOK_SECRET ||
    process.env.BANK_WEBHOOK_SECRET ||
    process.env.CASSO_WEBHOOK_SECRET ||
    ''
  ).trim(),
  amountTolerance: parseNonNegativeInteger(process.env.BANK_TRANSFER_AMOUNT_TOLERANCE) || 0
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

  const productReviewsMatch = routeUrl.pathname.match(/^\/api\/products\/(\d+)\/reviews$/);
  if (productReviewsMatch) {
    await handleProductReviewsRoute(req, res, Number(productReviewsMatch[1]));
    return;
  }

  const returnRequestMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/return-request$/);
  if (req.method === 'POST' && returnRequestMatch) {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    const body = await readRequestBodySafely(req, res);
    if (!body) return;

    const result = await createReturnRequest(Number(returnRequestMatch[1]), user.id, body);
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    broadcastAdminOrderEvent('order.return_requested', {
      orderId: result.request.orderId,
      orderDbId: result.request.orderDbId,
      returnRequest: result.request
    });
    sendJson(res, 201, { ok: true, returnRequest: result.request });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/admin/return-requests') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    sendJson(res, 200, { ok: true, requests: await getReturnRequests() });
    return;
  }

  const adminReturnRequestMatch = routeUrl.pathname.match(/^\/api\/admin\/return-requests\/(\d+)$/);
  if (req.method === 'PUT' && adminReturnRequestMatch) {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    const body = await readRequestBodySafely(req, res);
    if (!body) return;

    const result = await updateReturnRequestByAdmin(Number(adminReturnRequestMatch[1]), body);
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    sendJson(res, 200, { ok: true, returnRequest: result.request });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/admin/revenue-summary') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    sendJson(res, 200, { ok: true, summary: await getRevenueSummary() });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/notifications/me') {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    sendJson(res, 200, { ok: true, notifications: await getUserNotifications(user.id) });
    return;
  }

  if (req.method === 'GET' && routeUrl.pathname === '/api/admin/notifications') {
    if (!isAdminRequest(req, getSessionFromRequest)) {
      sendForbidden(res, sendJson);
      return;
    }

    sendJson(res, 200, { ok: true, notifications: await getAdminNotifications() });
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/vietqr') {
    await createVietQrPayment(req, res);
    return;
  }

  if (req.method === 'POST' && routeUrl.pathname === '/api/payments/bank-transfer-webhook') {
    await handleBankTransferWebhook(req, res, routeUrl);
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

  const vietQrPaymentDetailsMatch = routeUrl.pathname.match(/^\/api\/orders\/(\d+)\/vietqr$/);
  if (req.method === 'GET' && vietQrPaymentDetailsMatch) {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    const result = await getVietQrOrderPaymentDetails(Number(vietQrPaymentDetailsMatch[1]), user.id);
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    sendJson(res, 200, { ok: true, payment: result.payment });
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

async function createVietQrPayment(req, res) {
  const sessionUser = getSessionFromRequest(req);
  if (!sessionUser) {
    sendJson(res, 401, { ok: false, message: 'Vui long dang nhap truoc khi thanh toan VietQR' });
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

  const missing = ['bankId', 'accountNo', 'accountName'].filter(key => !vietQrConfig[key]);
  if (missing.length) {
    sendJson(res, 500, { ok: false, message: `Thieu cau hinh VietQR: ${missing.join(', ')}` });
    return;
  }

  const body = await readRequestBodySafely(req, res);
  if (!body) return;

  const order = await createOrderFromCart(body.items);
  if (!order.ok) {
    sendJson(res, 400, { ok: false, message: order.message });
    return;
  }

  const orderId = `VQR${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
  const description = body.description || 'Thanh toan VietQR';
  let savedOrder;

  try {
    savedOrder = await createLocalOrder('vietqr', orderId, order, description, toOrderCustomer(user), {
      status: 'VIETQR_PENDING',
      applyStock: true,
      requestId: req.requestId
    });
  } catch (err) {
    logger.warn('order.create_failed', {
      requestId: req.requestId,
      provider: 'vietqr',
      orderId,
      userId: user.id || null,
      error: err.message
    });
    sendJson(res, 400, { ok: false, message: err.message || 'Khong tao duoc don VietQR' });
    return;
  }

  const transferContent = normalizeTransferContent(orderId);
  sendJson(res, 201, {
    ok: true,
    provider: 'vietqr',
    orderId,
    amount: order.amount,
    items: order.items,
    products: await readProducts(),
    customer: savedOrder.user,
    orderDbId: savedOrder.id,
    transferContent,
    qrImageUrl: buildVietQrImageUrl(order.amount, transferContent),
    bank: {
      bankId: vietQrConfig.bankId,
      accountNo: vietQrConfig.accountNo,
      accountName: vietQrConfig.accountName
    },
    message: 'Da tao don hang VietQR'
  });
}

async function handleBankTransferWebhook(req, res, routeUrl) {
  const body = await readRequestBodySafely(req, res);
  if (!body) return;

  if (!isValidBankTransferWebhookRequest(req, routeUrl, body)) {
    logger.warn('payment.bank_webhook_rejected', {
      requestId: req.requestId,
      reason: bankTransferWebhookConfig.secret ? 'invalid_secret' : 'missing_secret_config'
    });
    sendJson(res, 401, { ok: false, message: 'Webhook khong hop le' });
    return;
  }

  const transactions = extractBankTransferTransactions(body);
  const results = [];

  for (const transaction of transactions) {
    const result = await markVietQrOrderPaidFromBankTransaction(transaction, {
      requestId: req.requestId,
      payload: body
    });
    results.push(result);

    if (result.ok && result.order && result.changed !== false) {
      notifyOrderPaymentStatusChanged(result.order, req.requestId, 'bank_webhook');
    }
  }

  const matched = results.filter(result => result.ok).length;
  logger.info('payment.bank_webhook_processed', {
    requestId: req.requestId,
    transactionCount: transactions.length,
    matched
  });

  sendJson(res, 200, {
    ok: true,
    received: transactions.length,
    matched,
    results: results.map(result => ({
      ok: result.ok,
      orderId: result.order?.orderId || result.orderId || null,
      reason: result.reason || null
    }))
  });
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

async function handleProductReviewsRoute(req, res, productId) {
  const product = (await readProducts()).find(item => Number(item.id) === Number(productId));
  if (!product) {
    sendJson(res, 404, { ok: false, message: 'Khong tim thay san pham' });
    return;
  }

  if (req.method === 'GET') {
    const user = getSessionFromRequest(req);
    const reviewData = await getProductReviews(productId, user?.id || null);
    sendJson(res, 200, { ok: true, ...reviewData });
    return;
  }

  if (req.method === 'POST') {
    const user = getSessionFromRequest(req);
    if (!user) {
      sendJson(res, 401, { ok: false, message: 'Chua dang nhap' });
      return;
    }

    const body = await readRequestBodySafely(req, res);
    if (!body) return;

    const result = await createProductReview(productId, user.id, body);
    if (!result.ok) {
      sendJson(res, result.statusCode, { ok: false, message: result.message });
      return;
    }

    broadcastAdminOrderEvent('product.review_created', {
      ...result.review,
      productName: result.review?.productName || product.name,
      summary: result.summary
    });
    sendJson(res, 201, { ok: true, review: result.review, summary: result.summary });
    return;
  }

  sendJson(res, 405, { ok: false, message: 'Method not allowed' });
}

async function getProductReviews(productId, userId = null) {
  const [reviewRows] = await db.execute(
    `SELECT
       pr.id,
       pr.product_id,
       pr.order_id,
       pr.user_id,
       pr.rating,
       pr.comment,
       pr.created_at,
       pr.updated_at,
       o.order_code,
       o.customer_username,
       o.customer_name,
       u.username,
       u.full_name,
       p.name AS product_name
     FROM product_reviews pr
     INNER JOIN orders o ON o.id = pr.order_id
     LEFT JOIN users u ON u.id = pr.user_id
     LEFT JOIN products p ON p.id = pr.product_id
     WHERE pr.product_id = ?
     ORDER BY pr.created_at DESC, pr.id DESC`,
    [Number(productId)]
  );
  const reviews = reviewRows.map(rowToReview);
  const reviewableOrders = userId
    ? await getReviewableOrdersForProduct(productId, userId)
    : [];

  return {
    reviews,
    summary: summarizeReviews(reviews),
    canReview: reviewableOrders.length > 0,
    reviewableOrders
  };
}

async function getReviewableOrdersForProduct(productId, userId) {
  if (!userId) return [];

  const [rows] = await db.execute(
    `SELECT o.id, o.order_code, o.created_at, o.received_at
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN product_reviews pr
       ON pr.product_id = oi.product_id
      AND pr.order_id = o.id
      AND pr.user_id = o.user_id
     WHERE o.user_id = ?
       AND oi.product_id = ?
       AND o.fulfillment_status = 'DELIVERED'
       AND pr.id IS NULL
     GROUP BY o.id, o.order_code, o.created_at, o.received_at
     ORDER BY o.received_at DESC, o.id DESC`,
    [Number(userId), Number(productId)]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    orderId: row.order_code,
    createdAt: row.created_at,
    receivedAt: row.received_at
  }));
}

async function createProductReview(productId, userId, input) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, statusCode: 400, message: 'Diem danh gia phai tu 1 den 5' };
  }

  const comment = String(input.comment || '').trim().slice(0, 2000);
  const requestedOrderId = Number(input.orderId || input.order_id || 0);
  const reviewableOrders = await getReviewableOrdersForProduct(productId, userId);
  const order = requestedOrderId
    ? reviewableOrders.find(item => Number(item.id) === requestedOrderId)
    : reviewableOrders[0];

  if (!order) {
    return {
      ok: false,
      statusCode: 403,
      message: 'Chi co the danh gia sau khi don hang da giao thanh cong'
    };
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO product_reviews (product_id, order_id, user_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [Number(productId), Number(order.id), Number(userId), rating, comment || null]
    );
    const review = await getProductReviewById(result.insertId);
    const { summary } = await getProductReviews(productId, userId);
    return { ok: true, review, summary };
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return { ok: false, statusCode: 409, message: 'Don hang nay da duoc danh gia' };
    }
    throw err;
  }
}

async function getProductReviewById(id) {
  const [rows] = await db.execute(
    `SELECT
       pr.id,
       pr.product_id,
       pr.order_id,
       pr.user_id,
       pr.rating,
       pr.comment,
       pr.created_at,
       pr.updated_at,
       o.order_code,
       o.customer_username,
       o.customer_name,
       u.username,
       u.full_name,
       p.name AS product_name
     FROM product_reviews pr
     INNER JOIN orders o ON o.id = pr.order_id
     LEFT JOIN users u ON u.id = pr.user_id
     LEFT JOIN products p ON p.id = pr.product_id
     WHERE pr.id = ?
     LIMIT 1`,
    [Number(id)]
  );
  return rowToReview(rows[0]);
}

function rowToReview(row) {
  if (!row) return null;

  const authorName = row.full_name || row.customer_name || row.username || row.customer_username || 'Khach hang';
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    orderDbId: Number(row.order_id),
    orderId: row.order_code,
    userId: row.user_id === null ? null : Number(row.user_id),
    productName: row.product_name || '',
    rating: Number(row.rating),
    comment: row.comment || '',
    authorName,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function summarizeReviews(reviews) {
  const count = reviews.length;
  const total = reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0);
  const average = count ? Number((total / count).toFixed(1)) : 0;

  return { count, average };
}

async function createReturnRequest(orderDbId, userId, input) {
  const requestType = normalizeReturnRequestType(input.type || input.requestType);
  if (!requestType) {
    return { ok: false, statusCode: 400, message: 'Loai yeu cau khong hop le' };
  }

  const reason = String(input.reason || '').trim().slice(0, 2000);
  if (!reason) {
    return { ok: false, statusCode: 400, message: 'Vui long nhap ly do doi/tra hang' };
  }

  const connection = await db.getConnection();
  let requestId = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT
         o.id,
         o.order_code,
         o.user_id,
         o.fulfillment_status,
         o.received_at,
         rr.id AS return_request_id
       FROM orders o
       LEFT JOIN return_requests rr ON rr.order_id = o.id
       WHERE o.id = ?
       FOR UPDATE`,
      [Number(orderDbId)]
    );

    if (!rows.length || Number(rows[0].user_id) !== Number(userId)) {
      await connection.rollback();
      return { ok: false, statusCode: 404, message: 'Khong tim thay don hang' };
    }

    if (rows[0].return_request_id) {
      await connection.rollback();
      return { ok: false, statusCode: 409, message: 'Don hang nay da co yeu cau doi/tra' };
    }

    const fulfillmentStatus = normalizeFulfillmentStatus(rows[0].fulfillment_status) || 'ORDERED';
    if (fulfillmentStatus !== 'DELIVERED' || !rows[0].received_at) {
      await connection.rollback();
      return { ok: false, statusCode: 409, message: 'Chi co the doi/tra sau khi giao hang thanh cong' };
    }

    if (!isWithinReturnWindow(rows[0].received_at)) {
      await connection.rollback();
      return { ok: false, statusCode: 409, message: 'Da qua thoi han doi/tra 7 ngay' };
    }

    const [result] = await connection.execute(
      `INSERT INTO return_requests (order_id, user_id, request_type, reason, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [Number(orderDbId), Number(userId), requestType, reason]
    );
    requestId = Number(result.insertId);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return { ok: false, statusCode: 409, message: 'Don hang nay da co yeu cau doi/tra' };
    }
    throw err;
  } finally {
    connection.release();
  }

  return { ok: true, request: await getReturnRequestById(requestId) };
}

async function getReturnRequests() {
  const [rows] = await db.execute(
    `SELECT
       rr.id,
       rr.order_id,
       rr.user_id,
       rr.request_type,
       rr.reason,
       rr.status,
       rr.admin_note,
       rr.created_at,
       rr.updated_at,
       o.order_code,
       o.amount,
       o.customer_username,
       o.customer_name,
       o.customer_phone,
       o.customer_address,
       o.received_at,
       o.created_at AS order_created_at
     FROM return_requests rr
     INNER JOIN orders o ON o.id = rr.order_id
     ORDER BY rr.created_at DESC, rr.id DESC`
  );
  return rows.map(rowToReturnRequest);
}

async function getReturnRequestById(id) {
  const [rows] = await db.execute(
    `SELECT
       rr.id,
       rr.order_id,
       rr.user_id,
       rr.request_type,
       rr.reason,
       rr.status,
       rr.admin_note,
       rr.created_at,
       rr.updated_at,
       o.order_code,
       o.amount,
       o.customer_username,
       o.customer_name,
       o.customer_phone,
       o.customer_address,
       o.received_at,
       o.created_at AS order_created_at
     FROM return_requests rr
     INNER JOIN orders o ON o.id = rr.order_id
     WHERE rr.id = ?
     LIMIT 1`,
    [Number(id)]
  );
  return rowToReturnRequest(rows[0]);
}

async function updateReturnRequestByAdmin(id, input) {
  const status = normalizeReturnRequestStatus(input.status);
  if (!status) {
    return { ok: false, statusCode: 400, message: 'Trang thai yeu cau khong hop le' };
  }

  const adminNote = String(input.adminNote || input.admin_note || '').trim().slice(0, 2000);
  const [result] = await db.execute(
    `UPDATE return_requests
     SET status = ?, admin_note = ?
     WHERE id = ?`,
    [status, adminNote || null, Number(id)]
  );

  if (!result.affectedRows) {
    return { ok: false, statusCode: 404, message: 'Khong tim thay yeu cau doi/tra' };
  }

  return { ok: true, request: await getReturnRequestById(id) };
}

function rowToReturnRequest(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    orderDbId: Number(row.order_id),
    orderId: row.order_code,
    userId: row.user_id === null ? null : Number(row.user_id),
    type: row.request_type,
    reason: row.reason || '',
    status: normalizeReturnRequestStatus(row.status) || 'PENDING',
    adminNote: row.admin_note || '',
    amount: Number(row.amount) || 0,
    customer: {
      username: row.customer_username || '',
      fullName: row.customer_name || '',
      phone: row.customer_phone || '',
      address: row.customer_address || ''
    },
    orderCreatedAt: row.order_created_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeReturnRequestType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return returnRequestTypes.includes(normalized) ? normalized : null;
}

function normalizeReturnRequestStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return returnRequestStatuses.includes(normalized) ? normalized : null;
}

function isWithinReturnWindow(receivedAt) {
  const receivedTime = new Date(receivedAt).getTime();
  return Number.isFinite(receivedTime) && Date.now() - receivedTime <= returnWindowMs;
}

function getReturnWindowEndsAt(receivedAt) {
  if (!receivedAt) return null;
  const receivedTime = new Date(receivedAt || 0).getTime();
  if (!Number.isFinite(receivedTime)) return null;
  return new Date(receivedTime + returnWindowMs).toISOString();
}

async function getRevenueSummary() {
  const [totals] = await db.execute(
    `SELECT
       COUNT(*) AS order_count,
       COALESCE(SUM(amount), 0) AS revenue
     FROM orders
     WHERE fulfillment_status = 'DELIVERED'
       AND status IN ('PAID', 'COD_PENDING')
       AND NOT EXISTS (
         SELECT 1
         FROM return_requests rr
         WHERE rr.order_id = orders.id
           AND rr.request_type = 'return'
           AND rr.status IN ('APPROVED', 'COMPLETED')
       )`
  );

  return {
    totals: {
      orderCount: Number(totals[0]?.order_count) || 0,
      revenue: Number(totals[0]?.revenue) || 0
    },
    daily: await getRevenueSummaryByPeriod('day'),
    monthly: await getRevenueSummaryByPeriod('month'),
    yearly: await getRevenueSummaryByPeriod('year')
  };
}

async function getRevenueSummaryByPeriod(period) {
  const groupExpr = {
    day: 'DATE_FORMAT(created_at, \'%Y-%m-%d\')',
    month: 'DATE_FORMAT(created_at, \'%Y-%m\')',
    year: 'YEAR(created_at)'
  }[period];
  const limitClause = period === 'day' ? 'LIMIT 30' : period === 'month' ? 'LIMIT 12' : 'LIMIT 10';

  const [rows] = await db.execute(
    `SELECT
       ${groupExpr} AS period_key,
       COUNT(*) AS order_count,
       COALESCE(SUM(amount), 0) AS revenue
     FROM orders
     WHERE fulfillment_status = 'DELIVERED'
       AND status IN ('PAID', 'COD_PENDING')
       AND NOT EXISTS (
         SELECT 1
         FROM return_requests rr
         WHERE rr.order_id = orders.id
           AND rr.request_type = 'return'
           AND rr.status IN ('APPROVED', 'COMPLETED')
       )
     GROUP BY period_key
     ORDER BY period_key DESC
     ${limitClause}`
  );

  return rows.map((row) => ({
    period: String(row.period_key),
    orderCount: Number(row.order_count) || 0,
    revenue: Number(row.revenue) || 0
  })).reverse();
}

async function getUserNotifications(userId) {
  const orders = await getOrdersByUserId(userId);
  return orders
    .flatMap(orderToUserNotifications)
    .filter(Boolean)
    .sort(sortNotificationsByDate)
    .slice(0, 80);
}

async function getAdminNotifications() {
  const [orders, returnRequests, reviews] = await Promise.all([
    fetchOrders('WHERE o.admin_seen_at IS NULL OR o.fulfillment_status = ?', ['DELIVERED']),
    getReturnRequests(),
    getRecentProductReviews(60)
  ]);
  const notifications = [];

  orders.forEach((order) => {
    if (order.isNew) notifications.push(orderToAdminNewNotification(order));
    if (normalizeFulfillmentStatus(order.fulfillmentStatus) === 'DELIVERED') {
      notifications.push(orderToAdminDeliveredNotification(order));
    }
  });
  returnRequests.forEach((request) => {
    if (request) notifications.push(returnRequestToAdminNotification(request));
  });
  reviews.forEach((review) => {
    if (review) notifications.push(reviewToAdminNotification(review));
  });

  return notifications
    .filter(Boolean)
    .sort(sortNotificationsByDate)
    .slice(0, 120);
}

function orderToUserNotification(order) {
  const status = normalizeFulfillmentStatus(order.fulfillmentStatus) || 'ORDERED';
  const labels = {
    ORDERED: 'Đã đặt hàng',
    PREPARING: 'Đã xác nhận',
    SHIPPING: 'Đang giao',
    DELIVERED: 'Giao thành công',
    CANCELLED: 'Bị hủy'
  };
  const title = labels[status] || labels.ORDERED;

  return {
    id: `customer-order-${order.id}-${status}`,
    audience: 'customer',
    type: 'order_status',
    tone: status === 'CANCELLED' ? 'danger' : status === 'SHIPPING' ? 'info' : 'success',
    icon: status === 'CANCELLED' ? 'bi-x-circle' : status === 'SHIPPING' ? 'bi-truck' : 'bi-bag-check',
    title,
    message: `Đơn ${order.orderId || ''}: ${title.toLowerCase()}.`,
    orderDbId: order.id,
    orderId: order.orderId,
    status,
    amount: order.amount,
    createdAt: order.updatedAt || order.createdAt
  };
}

function orderToUserNotifications(order) {
  return [
    orderToUserPaymentNotification(order),
    orderToUserNotification(order)
  ].filter(Boolean);
}

function orderToUserPaymentNotification(order) {
  if (String(order?.provider || '').toLowerCase() !== 'vietqr') return null;
  if (String(order?.status || '').toUpperCase() !== 'PAID') return null;

  return {
    id: `customer-order-${order.id}-PAID`,
    audience: 'customer',
    type: 'payment_status',
    tone: 'success',
    icon: 'bi-check-circle-fill',
    title: 'Thanh toán thành công',
    message: `Đơn ${order.orderId || ''} đã thanh toán thành công.`,
    orderDbId: order.id,
    orderId: order.orderId,
    status: 'PAID',
    amount: order.amount,
    createdAt: order.updatedAt || order.createdAt
  };
}

function orderToAdminNewNotification(order) {
  const customer = order.customer || {};
  return {
    id: `admin-new-order-${order.id}`,
    audience: 'admin',
    type: 'order_created',
    tone: 'info',
    icon: 'bi-bell-fill',
    title: 'Có đơn hàng mới',
    message: `${customer.fullName || customer.username || 'Khách hàng'} vừa đặt đơn ${order.orderId || ''}.`,
    orderDbId: order.id,
    orderId: order.orderId,
    amount: order.amount,
    createdAt: order.createdAt || order.updatedAt
  };
}

function orderToAdminDeliveredNotification(order) {
  return {
    id: `admin-delivered-order-${order.id}`,
    audience: 'admin',
    type: 'order_delivered',
    tone: 'success',
    icon: 'bi-check-circle-fill',
    title: 'Đơn hàng giao thành công',
    message: `Đơn ${order.orderId || ''} đã được khách xác nhận nhận hàng.`,
    orderDbId: order.id,
    orderId: order.orderId,
    amount: order.amount,
    createdAt: order.receivedAt || order.updatedAt || order.createdAt
  };
}

function returnRequestToAdminNotification(request) {
  const customer = request.customer || {};
  return {
    id: `admin-return-request-${request.id}`,
    audience: 'admin',
    type: 'return_requested',
    tone: 'warning',
    icon: 'bi-arrow-counterclockwise',
    title: 'Yêu cầu đổi/trả hàng',
    message: `${customer.fullName || customer.username || 'Khách hàng'} yêu cầu ${request.type === 'exchange' ? 'đổi hàng' : 'trả hàng'} cho đơn ${request.orderId || ''}.`,
    orderDbId: request.orderDbId,
    orderId: request.orderId,
    returnRequestId: request.id,
    amount: request.amount,
    createdAt: request.createdAt || request.updatedAt
  };
}

function reviewToAdminNotification(review) {
  return {
    id: `admin-product-review-${review.id}`,
    audience: 'admin',
    type: 'product_review',
    tone: 'review',
    icon: 'bi-star-fill',
    title: 'Khách hàng đánh giá sản phẩm',
    message: `${review.authorName || 'Khách hàng'} đánh giá ${review.productName || 'sản phẩm'} ${Number(review.rating) || 0} sao.`,
    productId: review.productId,
    productName: review.productName || '',
    orderDbId: review.orderDbId,
    orderId: review.orderId,
    rating: Number(review.rating) || 0,
    createdAt: review.createdAt || review.updatedAt
  };
}

async function getRecentProductReviews(limit = 60) {
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 60));
  const [rows] = await db.execute(
    `SELECT
       pr.id,
       pr.product_id,
       pr.order_id,
       pr.user_id,
       pr.rating,
       pr.comment,
       pr.created_at,
       pr.updated_at,
       o.order_code,
       o.customer_username,
       o.customer_name,
       u.username,
       u.full_name,
       p.name AS product_name
     FROM product_reviews pr
     INNER JOIN orders o ON o.id = pr.order_id
     LEFT JOIN users u ON u.id = pr.user_id
     LEFT JOIN products p ON p.id = pr.product_id
     ORDER BY pr.created_at DESC, pr.id DESC
     LIMIT ${normalizedLimit}`
  );

  return rows.map(rowToReview);
}

function sortNotificationsByDate(a, b) {
  return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
}

function getTimeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
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

function normalizeTransferContent(orderId) {
  return String(orderId || '')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .trim()
    .slice(0, 80);
}

function buildVietQrImageUrl(amount, transferContent) {
  const bankId = encodeURIComponent(vietQrConfig.bankId);
  const accountNo = encodeURIComponent(vietQrConfig.accountNo);
  const template = encodeURIComponent(vietQrConfig.template || 'compact2');
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(Number(amount) || 0))),
    addInfo: transferContent,
    accountName: vietQrConfig.accountName
  });

  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?${params.toString()}`;
}

function isValidBankTransferWebhookRequest(req, routeUrl, body) {
  const expectedSecret = bankTransferWebhookConfig.secret;
  if (!expectedSecret) return false;

  const authorization = String(req.headers.authorization || '');
  const bearerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const suppliedSecrets = [
    routeUrl.searchParams.get('secret'),
    routeUrl.searchParams.get('token'),
    headerValue(req, 'x-webhook-secret'),
    headerValue(req, 'x-bank-webhook-secret'),
    headerValue(req, 'x-casso-secret'),
    bearerToken,
    body?.secret,
    body?.token,
    body?.secure_token,
    body?.secureToken,
    body?.webhookSecret
  ].filter(Boolean).map(value => String(value).trim());

  return suppliedSecrets.some(secret => timingSafeEqualString(secret, expectedSecret));
}

function headerValue(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function extractBankTransferTransactions(payload) {
  const candidates = [];
  collectBankTransactionCandidates(payload, candidates);

  return candidates
    .map(normalizeBankTransferTransaction)
    .filter(transaction => transaction.amount && (
      transaction.orderCode ||
      transaction.description ||
      transaction.reference
    ));
}

function collectBankTransactionCandidates(value, candidates) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach(item => collectBankTransactionCandidates(item, candidates));
    return;
  }

  if (typeof value !== 'object') return;

  const nestedKeys = [
    'data',
    'transactions',
    'transaction',
    'bankTransaction',
    'bankTransactions',
    'records',
    'items',
    'payload'
  ];
  const nested = nestedKeys
    .map(key => value[key])
    .filter(item => item && item !== value);

  if (looksLikeBankTransaction(value)) {
    candidates.push(value);
  }

  nested.forEach(item => collectBankTransactionCandidates(item, candidates));
}

function looksLikeBankTransaction(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      value.amount !== undefined ||
      value.creditAmount !== undefined ||
      value.transactionAmount !== undefined ||
      value.transferAmount !== undefined ||
      value.orderCode !== undefined ||
      value.description !== undefined ||
      value.content !== undefined ||
      value.tid !== undefined ||
      value.reference !== undefined
    )
  );
}

function normalizeBankTransferTransaction(value) {
  const description = [
    firstString(
      value.description,
      value.desc,
      value.content,
      value.transferContent,
      value.transactionContent,
      value.remark,
      value.memo,
      value.addInfo
    ),
    firstString(value.tid)
  ].filter(Boolean).join(' ');

  return {
    amount: normalizeBankTransferAmount(
      value.amount ??
      value.creditAmount ??
      value.transactionAmount ??
      value.transferAmount ??
      value.money ??
      value.value
    ),
    orderCode: firstString(value.orderCode, value.order_code),
    description,
    reference: firstString(value.reference, value.ref, value.transactionId, value.transaction_id, value.tid, value.id),
    accountNo: firstString(
      value.accountNumber,
      value.accountNo,
      value.bankAccount,
      value.bankAccountNo,
      value.receiverAccountNumber,
      value.receiveAccountNumber,
      value.toAccountNumber,
      value.virtualAccountNumber,
      value.subAccId
    ),
    raw: value
  };
}

function normalizeBankTransferAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  const text = String(value || '').trim();
  if (!text) return null;
  const sign = text.includes('-') && !text.includes('+') ? -1 : 1;
  if (sign < 0) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function firstString(...values) {
  const value = values.find(item => item !== undefined && item !== null && String(item).trim());
  return value === undefined ? '' : String(value).trim();
}

function getOrderCodeFromBankTransaction(transaction) {
  const explicitOrderCode = firstString(transaction.orderCode);
  if (/^VQR[a-zA-Z0-9._-]{8,80}$/.test(explicitOrderCode)) return explicitOrderCode;

  const haystack = [transaction.description, transaction.reference].filter(Boolean).join(' ');
  const match = haystack.match(/\bVQR[a-zA-Z0-9._-]{8,80}\b/);
  return match ? match[0] : '';
}

function normalizeAccountIdentifier(value) {
  return String(value || '').replace(/\D/g, '');
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

    const unitPrice = getProductVariantSalePrice(product, color, size);
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
  const price = getProductVariantBasePrice(product, '', '');
  const rawSalePercent = Number(product.salePercent) || 0;
  const salePercent = Math.min(95, Math.max(0, Math.trunc(rawSalePercent)));
  if (!salePercent) return price;
  return Math.max(0, Math.round(price * (100 - salePercent) / 100));
}

function getProductVariantBasePrice(product, color, size) {
  const basePrice = Math.max(0, Math.round(Number(product?.price) || 0));
  const variantPrices = product?.variantPrices;
  if (!variantPrices || typeof variantPrices !== 'object' || Array.isArray(variantPrices)) {
    return basePrice;
  }

  const colors = getProductColors(product);
  const sizes = getProductSizes(product);
  if (!colors.length && !sizes.length) return basePrice;

  const colorKey = colors.length ? String(color || '').trim() : '__default__';
  const sizeKey = sizes.length ? String(size || '').trim() : '__default__';
  const variantPrice = variantPrices?.[colorKey]?.[sizeKey];
  const price = Number(variantPrice);

  return Number.isFinite(price) && price >= 0 ? Math.round(price) : basePrice;
}

function getProductVariantSalePrice(product, color, size) {
  const price = getProductVariantBasePrice(product, color, size);
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

async function getVietQrOrderPaymentDetails(orderDbId, userId) {
  const [rows] = await db.execute(
    `SELECT id, order_code, user_id, provider, status, fulfillment_status, amount
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [Number(orderDbId)]
  );

  if (!rows.length || Number(rows[0].user_id) !== Number(userId)) {
    return { ok: false, statusCode: 404, message: 'Khong tim thay don hang' };
  }

  const order = rows[0];
  if (String(order.provider || '').toLowerCase() !== 'vietqr') {
    return { ok: false, statusCode: 400, message: 'Don hang nay khong thanh toan bang VietQR' };
  }

  if (normalizeFulfillmentStatus(order.fulfillment_status) === 'CANCELLED') {
    return { ok: false, statusCode: 409, message: 'Don hang da bi huy' };
  }

  const paymentStatus = String(order.status || '').toUpperCase();
  if (paymentStatus === 'PAID') {
    return { ok: false, statusCode: 409, message: 'Don hang da thanh toan' };
  }

  const missing = ['bankId', 'accountNo', 'accountName'].filter(key => !vietQrConfig[key]);
  if (missing.length) {
    return {
      ok: false,
      statusCode: 500,
      message: `Thieu cau hinh VietQR: ${missing.join(', ')}`
    };
  }

  const transferContent = normalizeTransferContent(order.order_code);
  const amount = Number(order.amount) || 0;
  return {
    ok: true,
    payment: {
      provider: 'vietqr',
      orderDbId: Number(order.id),
      orderId: order.order_code,
      amount,
      status: order.status,
      transferContent,
      qrImageUrl: buildVietQrImageUrl(amount, transferContent),
      bank: {
        bankId: vietQrConfig.bankId,
        accountNo: vietQrConfig.accountNo,
        accountName: vietQrConfig.accountName
      }
    }
  };
}

async function markVietQrOrderPaidFromBankTransaction(transaction, context = {}) {
  const orderCode = getOrderCodeFromBankTransaction(transaction);
  if (!orderCode) {
    return { ok: false, reason: 'missing_order_code' };
  }

  if (!transaction.amount) {
    return { ok: false, orderId: orderCode, reason: 'missing_amount' };
  }

  const configuredAccountNo = normalizeAccountIdentifier(vietQrConfig.accountNo);
  const transactionAccountNo = normalizeAccountIdentifier(transaction.accountNo);
  if (configuredAccountNo && transactionAccountNo && configuredAccountNo !== transactionAccountNo) {
    return { ok: false, orderId: orderCode, reason: 'account_mismatch' };
  }

  const connection = await db.getConnection();
  let orderDbId = null;
  let changed = false;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, order_code, provider, status, amount, stock_applied, fulfillment_status
       FROM orders
       WHERE order_code = ?
       FOR UPDATE`,
      [orderCode]
    );

    if (!rows.length) {
      await connection.rollback();
      return { ok: false, orderId: orderCode, reason: 'order_not_found' };
    }

    const order = rows[0];
    orderDbId = Number(order.id);
    if (String(order.provider || '').toLowerCase() !== 'vietqr') {
      await connection.rollback();
      return { ok: false, orderId: orderCode, reason: 'provider_mismatch' };
    }

    const expectedAmount = Number(order.amount) || 0;
    const delta = Math.abs(Number(transaction.amount) - expectedAmount);
    if (delta > bankTransferWebhookConfig.amountTolerance) {
      await connection.rollback();
      return { ok: false, orderId: orderCode, reason: 'amount_mismatch' };
    }

    const gatewayPayload = {
      source: 'bank_transfer_webhook',
      receivedAt: new Date().toISOString(),
      requestId: context.requestId || null,
      transaction,
      payload: context.payload || null
    };

    if (normalizeFulfillmentStatus(order.fulfillment_status) === 'CANCELLED') {
      if (String(order.status || '').toUpperCase() !== 'PAID_AFTER_CANCEL') {
        await connection.execute(
          'UPDATE orders SET status = ?, gateway_payload = ? WHERE id = ?',
          ['PAID_AFTER_CANCEL', JSON.stringify(gatewayPayload), orderDbId]
        );
        changed = true;
      }
      await connection.commit();
      logger.warn('order.paid_after_cancel', {
        requestId: context.requestId || null,
        orderId: orderCode,
        orderDbId
      });
    } else {
      if (!Number(order.stock_applied)) {
        await applyOrderStockByDbId(connection, orderDbId);
      }

      if (String(order.status || '').toUpperCase() !== 'PAID') {
        await connection.execute(
          'UPDATE orders SET status = ?, gateway_payload = ? WHERE id = ?',
          ['PAID', JSON.stringify(gatewayPayload), orderDbId]
        );
        changed = true;
      }
      await connection.commit();
      logger.info('order.status_changed', {
        requestId: context.requestId || null,
        orderId: orderCode,
        orderDbId,
        status: 'PAID',
        source: 'bank_transfer_webhook'
      });
    }
  } catch (err) {
    await connection.rollback();
    logger.error('payment.bank_webhook_update_failed', {
      requestId: context.requestId || null,
      orderId: orderCode,
      error: err
    });
    throw err;
  } finally {
    connection.release();
  }

  const orders = await fetchOrders('WHERE o.id = ?', [orderDbId]);
  return { ok: true, changed, order: orders[0] };
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

function notifyOrderPaymentStatusChanged(order, requestId, actor) {
  const payload = {
    id: order.id,
    orderId: order.orderId,
    userId: order.userId,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    updatedAt: order.updatedAt,
    actor
  };

  broadcastAdminOrderEvent('order.payment_status_changed', payload);
  broadcastUserOrderEvent(order.userId, 'order.payment_status_changed', payload);
  logger.info('order.payment_status_changed', {
    requestId,
    orderId: order.orderId,
    orderDbId: order.id,
    status: order.status,
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
       rr.id AS return_request_id,
       rr.request_type AS return_request_type,
       rr.reason AS return_request_reason,
       rr.status AS return_request_status,
       rr.admin_note AS return_request_admin_note,
       rr.created_at AS return_request_created_at,
       rr.updated_at AS return_request_updated_at,
       oi.id AS item_id,
       oi.product_id,
       oi.product_name,
       oi.size,
       oi.color,
       oi.quantity,
       oi.unit_price,
       oi.line_total
     FROM orders o
     LEFT JOIN return_requests rr ON rr.order_id = o.id
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
        returnEligibleUntil: getReturnWindowEndsAt(row.received_at),
        canRequestReturn: normalizeFulfillmentStatus(row.fulfillment_status) === 'DELIVERED' &&
          !row.return_request_id &&
          isWithinReturnWindow(row.received_at),
        returnRequest: row.return_request_id ? {
          id: Number(row.return_request_id),
          type: row.return_request_type,
          reason: row.return_request_reason || '',
          status: normalizeReturnRequestStatus(row.return_request_status) || 'PENDING',
          adminNote: row.return_request_admin_note || '',
          createdAt: row.return_request_created_at,
          updatedAt: row.return_request_updated_at
        } : null,
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
