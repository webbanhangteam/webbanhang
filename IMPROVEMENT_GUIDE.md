# 🚀 Hướng Dẫn Cải Thiện & Nâng Cấp Dự Án Shop Anh Thuan

> **Mục đích**: Tài liệu này hướng dẫn agent (AI coding assistant) thực hiện cải thiện, nâng cấp và sửa các thiếu sót trong dự án web bán hàng **Shop Anh Thuan**.

> [!IMPORTANT]
> Mỗi mục được đánh dấu mức độ ưu tiên:
> - 🔴 **CRITICAL** — Phải sửa ngay, ảnh hưởng bảo mật / chức năng chính
> - 🟡 **HIGH** — Nên sửa sớm, ảnh hưởng chất lượng / trải nghiệm
> - 🟢 **MEDIUM** — Cải thiện dần, nâng cao chất lượng code
> - 🔵 **LOW** — Nice-to-have, tối ưu hóa

---

## Mục Lục

1. [Bảo Mật & Xác Thực](#1-bảo-mật--xác-thực)
2. [Kiến Trúc & Cấu Trúc Code](#2-kiến-trúc--cấu-trúc-code)
3. [Backend API](#3-backend-api)
4. [Frontend UI/UX](#4-frontend-uiux)
5. [Database & Performance](#5-database--performance)
6. [DevOps & Triển Khai](#6-devops--triển-khai)
7. [Tính Năng Mới](#7-tính-năng-mới)
8. [Chất Lượng Code](#8-chất-lượng-code)

---

## 1. Bảo Mật & Xác Thực

### 🔴 1.1. Mật khẩu mặc định admin bị lộ trong `.env`

**File**: `.env` (dòng 10)

**Vấn đề**: Mật khẩu admin mặc định `change-this-admin-password` vẫn đang được sử dụng. Dù `.env` nằm trong `.gitignore`, đây vẫn là rủi ro nếu ai đó deploy mà quên đổi.

**Cách sửa**:
- Thêm validation khi server khởi động: nếu `DEFAULT_ADMIN_PASSWORD` bằng giá trị mặc định, in cảnh báo rõ ràng ra console.
- Trong `server.js` → hàm `startServer()`, thêm:
```js
if (process.env.DEFAULT_ADMIN_PASSWORD === 'change-this-admin-password') {
  console.warn('⚠️  CẢNH BÁO: Đang dùng mật khẩu admin mặc định! Vui lòng đổi DEFAULT_ADMIN_PASSWORD trong .env');
}
```

### 🔴 1.2. Thiếu Rate Limiting trên API xác thực

**Files**: `server.js`, `routes/auth.js`

**Vấn đề**: Không có giới hạn số lần đăng nhập/đăng ký sai → dễ bị brute-force.

**Cách sửa**:
- Tạo file `middleware/rateLimiter.js`:
  ```js
  // Sử dụng Map lưu IP + số lần request trong khoảng thời gian
  // Key: `${ip}:${route}`, Value: { count, resetAt }
  // Giới hạn: 10 lần/phút cho /login, 5 lần/phút cho /register
  // Trả về 429 nếu vượt quá
  ```
- Áp dụng vào `handleApi()` trước khi xử lý route auth.

### 🔴 1.3. CORS quá mở

**File**: `server.js` (dòng 590)

**Vấn đề**: `Access-Control-Allow-Origin: *` cho phép mọi domain gọi API → rủi ro CSRF.

**Cách sửa**:
- Thêm biến `ALLOWED_ORIGINS` vào `.env.example`
- Trong `sendJson()`, kiểm tra `req.headers.origin` và chỉ cho phép các domain trong danh sách
- Fallback về `*` chỉ khi `NODE_ENV === 'development'`

### 🔴 1.4. Thiếu Helmet-style security headers

**File**: `server.js` → hàm `sendJson()` và `serveFile()`

**Vấn đề**: Thiếu các security headers quan trọng.

**Cách sửa**: Thêm vào mọi response:
```js
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' https://images.unsplash.com data:"
};
```

### 🟡 1.5. Session token lưu trong memory — mất khi restart

**File**: `server.js` (dòng 20: `const sessions = new Map()`)

**Vấn đề**: Tất cả session bị mất khi server restart. Tất cả user phải đăng nhập lại.

**Cách sửa**:
- Tạo bảng `sessions` trong MySQL:
  ```sql
  CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    user_data JSON NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  ```
- Thay `Map` bằng DB queries cho `createSession`, `getSessionFromRequest`, `destroySession`.
- Thêm cron job xóa session hết hạn (có thể dùng MySQL EVENT hoặc cleanup khi khởi động).

### 🟡 1.6. Thiếu validation độ mạnh mật khẩu

**File**: `routes/auth.js` → hàm `register()` (dòng 104-136)

**Vấn đề**: Chấp nhận mật khẩu bất kỳ, kể cả rỗng sau trim hoặc "1".

**Cách sửa**:
```js
function validatePassword(password) {
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ hoa';
  if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất 1 số';
  return null;
}
```

---

## 2. Kiến Trúc & Cấu Trúc Code

### 🔴 2.1. File `server.js` quá lớn (1135 dòng)

**File**: `server.js`

**Vấn đề**: Monolithic — chứa cả server setup, payment logic, order logic, session management, static file serving, utility functions. Rất khó maintain.

**Cách sửa** — Tách thành các module:

```
server.js                          → Chỉ giữ server creation + startup (< 100 dòng)
routes/payments.js        [NEW]    → createMomoPayment, handleMomoIpn, createZaloPayPayment, handleZaloPayCallback, queryZaloPayStatus, createCodOrder
routes/orders.js           [NEW]   → getOrdersByUserId, getSalesHistory, fetchOrders, order API handlers
services/orderService.js   [NEW]   → createLocalOrder, createOrderFromCart, updateOrderGatewayResponse, updateOrderFromGateway, applyOrderStockByDbId
services/sessionService.js [NEW]   → createSession, getSessionFromRequest, destroySession, updateSessionUser
utils/http.js              [NEW]   → postJson, postForm, request, readRequestBody
utils/helpers.js           [NEW]   → sendJson, sendPaymentReturn, hmacSha256, normalizeAmount, escapeHtml, parseJson, formatDateYYMMDD, parsePositiveNumber, loadEnvFile
middleware/staticMiddleware.js [NEW] → serveStatic, resolveStaticPath, serveFile, safeResolve
config/payment.js          [NEW]   → momoConfig, zalopayConfig
```

### 🟡 2.2. Hardcoded sản phẩm trong cả HTML và JS

**Files**: `web/index.html` (dòng 156-306), `routes/products.js` (dòng 4-93)

**Vấn đề**: Sản phẩm được hardcode trong HTML (static cards) VÀ trong `defaultProducts` array. Khi API load xong, JS render lại → gây flash of content. HTML cards trở thành dead code sau khi JS chạy.

**Cách sửa**:
- Xóa tất cả product cards khỏi `index.html` (dòng 157-227, 243-305)
- Giữ chỉ container rỗng `<div id="productGrid"></div>` và `<div class="secondary-products"></div>`
- Thêm loading skeleton/spinner CSS khi chờ API
- Trong `script.js`, bỏ hàm `extractProductsFromDom()` — chỉ dùng API data

### 🟡 2.3. Thư mục assets đặt tên sai: `accesst`

**Files**: Nhiều file tham chiếu đến `/accesst/`

**Vấn đề**: Thư mục `web/accesst` rõ ràng là typo của "assets". Gây confuse cho developer mới.

**Cách sửa**:
- Đổi tên thư mục `web/accesst` → `web/assets`
- Tìm và thay thế tất cả reference trong:
  - `server.js`: dòng 15, 461-462
  - `web/index.html`: tất cả `./accesst/` → `./assets/`
  - `routes/products.js`: dòng 55
- Cập nhật `resolveStaticPath()` để map cả `/assets/` thay vì `/accesst/`

### 🟢 2.4. Thiếu cấu trúc thư mục rõ ràng

**Cách sửa** — Refactor theo structure:
```
project/
├── config/
│   ├── db.js
│   └── payment.js          [NEW]
├── middleware/
│   ├── adminMiddleware.js
│   ├── rateLimiter.js       [NEW]
│   └── staticMiddleware.js  [NEW]
├── routes/
│   ├── auth.js
│   ├── orders.js            [NEW]
│   ├── payments.js          [NEW]
│   └── products.js
├── services/                [NEW]
│   ├── orderService.js
│   └── sessionService.js
├── utils/                   [NEW]
│   ├── helpers.js
│   └── http.js
├── web/
│   ├── assets/              (renamed from accesst)
│   ├── index.html
│   ├── script.js
│   └── style.css
├── server.js                (simplified)
└── ...
```

---

## 3. Backend API

### 🔴 3.1. Không có input validation trên payment routes

**File**: `server.js` → `createMomoPayment()`, `createZaloPayPayment()`

**Vấn đề**: `body.items` không được validate trước khi truyền vào `createOrderFromCart()`. Nếu body không phải JSON hợp lệ hoặc items chứa giá trị bất thường, có thể gây crash.

**Cách sửa**:
- Wrap `readRequestBody()` trong try-catch cho mọi route
- Validate `items` là array, mỗi item có `productId` (number) và `quantity` (positive integer)
- Trả 400 nếu không hợp lệ, thay vì để crash bubble up to global handler

### 🔴 3.2. MoMo/ZaloPay payment không gắn với user

**File**: `server.js` (dòng 184-243, 270-324)

**Vấn đề**: `createMomoPayment` và `createZaloPayPayment` KHÔNG yêu cầu đăng nhập (`getSessionFromRequest` chỉ được gọi để truyền user info nhưng không bắt buộc). Ai cũng có thể tạo payment request → có thể spam payment gateway.

**Cách sửa**:
- Thêm auth check tương tự COD:
```js
const sessionUser = getSessionFromRequest(req);
if (!sessionUser) {
  sendJson(res, 401, { ok: false, message: 'Vui long dang nhap truoc khi thanh toan' });
  return;
}
```

### 🟡 3.3. API route matching không dùng router — dùng if/else chain

**File**: `server.js` → `handleApi()` (dòng 76-174)

**Vấn đề**: 15+ if/else blocks nối tiếp nhau → khó maintain, dễ miss route.

**Cách sửa**:
- Tạo một simple router utility:
```js
// utils/router.js
class Router {
  constructor() { this.routes = []; }
  get(path, handler) { this.routes.push({ method: 'GET', path, handler }); }
  post(path, handler) { this.routes.push({ method: 'POST', path, handler }); }
  // ...match() method
}
```
- Hoặc đơn giản hơn: dùng một Map/Object để map routes:
```js
const apiRoutes = {
  'POST /api/payments/momo': createMomoPayment,
  'POST /api/payments/zalopay': createZaloPayPayment,
  'GET /api/orders/me': getMyOrders,
  // ...
};
```

### 🟡 3.4. `loadEnvFile()` tự viết — nên dùng `dotenv`

**File**: `server.js` (dòng 1094-1108)

**Vấn đề**: Project đã có `dotenv` trong `dependencies` nhưng `server.js` lại tự viết `loadEnvFile()` thay vì dùng. Trong khi `config/db.js` lại dùng `require('dotenv').config()`. Không nhất quán.

**Cách sửa**:
- Xóa hàm `loadEnvFile()` trong `server.js`
- Thêm `require('dotenv').config()` ở đầu `server.js` (trước tất cả require khác)
- Xóa dòng `loadEnvFile(path.join(__dirname, '.env'))` (dòng 11)

### 🟡 3.5. Thiếu API versioning

**Vấn đề**: Tất cả route đều là `/api/xxx` — không có version prefix.

**Cách sửa**:
- Đổi thành `/api/v1/xxx`
- Giữ backward compatibility bằng cách map cả `/api/xxx` → `/api/v1/xxx`
- Điều này giúp sau này thêm v2 mà không break client cũ

### 🟡 3.6. Lỗi auth route mapping không nhất quán

**File**: `server.js` → `isApiRequestPath()` (dòng 176-182), `routes/auth.js` → `normalizeAuthPath()` (dòng 179-191)

**Vấn đề**: `/register`, `/login`, `/logout` được coi là API path (dòng 179-181) nhưng cũng là alias cho `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`. Gây nhầm lẫn giữa frontend route và API route.

**Cách sửa**:
- Chỉ giữ `/api/auth/xxx` routes
- Trong frontend `script.js`, cập nhật tất cả auth fetch calls từ `/login`, `/register`, `/logout` sang `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`

### 🟢 3.7. Thiếu pagination cho danh sách sản phẩm và đơn hàng

**Files**: `routes/products.js` → `readProducts()`, `server.js` → `fetchOrders()`

**Vấn đề**: `GET /api/products` và `GET /api/orders` trả về TẤT CẢ records. Khi data lớn sẽ chậm.

**Cách sửa**:
- Thêm query params: `?page=1&limit=20`
- Trả thêm `total`, `page`, `limit`, `totalPages` trong response
- Frontend cần thêm UI pagination hoặc infinite scroll

### 🟢 3.8. Thiếu logging có cấu trúc

**Vấn đề**: Chỉ dùng `console.log` / `console.error` — không có timestamp, request ID, log level.

**Cách sửa**:
- Tạo `utils/logger.js`:
```js
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(entry));
}
module.exports = {
  info: (msg, meta) => log('INFO', msg, meta),
  warn: (msg, meta) => log('WARN', msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta)
};
```

---

## 4. Frontend UI/UX

### 🔴 4.1. Detail section luôn hiển thị sản phẩm ID=1 (hardcoded)

**File**: `web/script.js` → `renderProductDetail()` (dòng 344-379)

**Vấn đề**: Section "product detail" luôn show sản phẩm đầu tiên (ID=1). Click vào bất kỳ product card nào đều dẫn về `#product-detail` nhưng nội dung KHÔNG thay đổi. Đây là bug UX nghiêm trọng.

**Cách sửa**:
- Khi click product card (`.product-media`), lấy `productId` từ card
- Gọi `renderProductDetail(productId)` với product được click
- Cập nhật cả gallery images từ product data (hiện tại gallery cũng hardcoded)
- Thêm logic: nếu product có nhiều ảnh, hiển thị; nếu không, hiển thị ảnh chính

### 🔴 4.2. Nút "Thêm" ở HTML cards ban đầu không hoạt động đúng

**File**: `web/index.html` (cards cũ), `web/script.js`

**Vấn đề**: Các product cards hardcode trong HTML (trước khi JS render lại) không có `data-product-id`, dẫn đến nút "Thêm" không tìm được product đúng khi click.

**Cách sửa**: (Đã đề cập ở mục 2.2) Xóa HTML cards, chỉ dùng JS render.

### 🟡 4.3. Không có loading state / skeleton UI

**File**: `web/index.html`, `web/style.css`, `web/script.js`

**Vấn đề**: Khi page load, product grid trống cho đến khi API trả về → trải nghiệm kém.

**Cách sửa**:
- Thêm CSS skeleton animation:
```css
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius);
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```
- Render 4-8 skeleton cards khi đang load
- Thay skeleton bằng real cards khi API trả về

### 🟡 4.4. Thiếu Toast / Notification system

**File**: `web/script.js`

**Vấn đề**: Dùng `alert()` cho thông báo lỗi (dòng 416, 437, 464) → xấu, block UI.

**Cách sửa**:
- Tạo toast notification system:
```js
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
```
- Thay tất cả `alert()` bằng `showToast()`
- Thêm CSS cho toast (slide in từ top-right, màu theo type: success=green, error=red, info=blue)

### 🟡 4.5. Hero banner text không chuyên nghiệp

**File**: `web/index.html` (dòng 100, 117)

**Vấn đề**: 
- `"Sneaker chẤt vãi L"` — viết chữ in hoa giữa từ, dùng từ lóng không phù hợp
- `"Boi phố chuẩn Hà Nội gốc 36"` — typo ("Boi" → "Bơi" hoặc "Bội")

**Cách sửa**: Viết lại các tagline chuyên nghiệp hơn:
```
Slide 1: "Sneaker Đỉnh Cao — Phong Cách Không Giới Hạn"
Slide 2: "Giày, Áo Và Phụ Kiện — Cùng Một Tinh Thần"
Slide 3: "Streetwear Chuẩn Phố — Định Nghĩa Phong Cách"
```

### 🟡 4.6. Top strip quá casual

**File**: `web/index.html` (dòng 24)

**Vấn đề**: `"WEB nay de nop do an"` — không phù hợp cho website thương mại, kể cả là đồ án.

**Cách sửa**: Thay bằng nội dung chuyên nghiệp:
```html
<span>Miễn phí vận chuyển đơn từ 500.000đ | Hỗ trợ 24/7</span>
```

### 🟡 4.7. Thiếu feedback khi thêm vào giỏ hàng

**File**: `web/script.js` → `addToCart()`

**Vấn đề**: Sau khi thêm sản phẩm, không có visual feedback. User không biết sản phẩm đã được thêm.

**Cách sửa**:
- Hiển thị toast "Đã thêm [tên sản phẩm] vào giỏ"
- Animation bounce trên cart icon
- Hoặc tự động mở cart drawer sau khi thêm

### 🟡 4.8. Sản phẩm Accessory không có tồn kho nhưng vẫn mua được

**File**: `routes/products.js` (dòng 66-70, 78-80), `web/script.js` → `canAddQuantity()`

**Vấn đề**: Sản phẩm category "accessory" có `sizes: []` và `stock: {}`. Hàm `requiresSize()` trả về `false` → `canAddQuantity()` luôn return `true` → không giới hạn số lượng.

**Cách sửa**:
- Thêm field `totalStock` cho sản phẩm không có size
- Hoặc thêm logic kiểm tra tồn kho generic:
```js
function canAddQuantity(product, size, currentQuantity) {
  if (requiresSize(product)) {
    if (!size) return false;
    const stock = Number(product.stock?.[String(size)] || 0);
    return currentQuantity + 1 <= stock;
  }
  // Sản phẩm không có size: kiểm tra totalStock nếu có
  if (product.totalStock !== undefined) {
    return currentQuantity + 1 <= product.totalStock;
  }
  return true; // Không giới hạn nếu không có stock info
}
```

### 🟢 4.9. Responsive: một số layout bị vỡ trên mobile

**File**: `web/style.css`

**Vấn đề**: 
- `.wide-promo-copy h2` có `font-size: 80px` (inline style trong HTML) → tràn trên mobile
- `.hero-copy h2` cũng `font-size: 80px` (inline style) → tương tự
- `.detail-grid` column `minmax(330px, 0.9fr)` có thể gây overflow trên màn hình nhỏ

**Cách sửa**:
- Xóa tất cả inline style `font-size` trong `index.html` → chuyển vào CSS với `clamp()`
- Thêm `overflow-wrap: break-word` cho các heading text dài
- Test lại breakpoints 320px, 375px, 414px

### 🟢 4.10. Thiếu lazy loading cho images

**File**: `web/index.html`

**Vấn đề**: Chỉ product cards rendered bởi JS có `loading="lazy"`. Các ảnh khác (hero, feature, album, detail) load ngay → chậm trang.

**Cách sửa**:
- Thêm `loading="lazy"` cho tất cả `<img>` trừ hero slide đầu tiên (above the fold)
- Thêm `decoding="async"` cho ảnh below the fold

### 🟢 4.11. Wishlist chỉ là toggle CSS, không lưu

**File**: `web/script.js` (dòng 189-196)

**Vấn đề**: Click nút yêu thích chỉ toggle class, refresh là mất.

**Cách sửa**:
- Lưu wishlist vào `localStorage`
- Khôi phục state khi load trang
- Tùy chọn nâng cao: lưu vào DB nếu đã đăng nhập

### 🔵 4.12. Accessibility (a11y) thiếu sót

**Vấn đề**:
- Thiếu `role` attributes ở một số interactive elements
- Color contrast ratio có thể chưa đạt WCAG AA cho text nhỏ
- Thiếu focus visible styles cho keyboard navigation

**Cách sửa**:
- Thêm `:focus-visible` styles cho tất cả interactive elements
- Kiểm tra color contrast với tool (ví dụ: `--muted: #667085` trên nền trắng)
- Thêm `aria-live="polite"` cho cart count, toast notifications

---

## 5. Database & Performance

### 🟡 5.1. `readProducts()` không có cache

**File**: `routes/products.js` → `readProducts()` (dòng 311-314)

**Vấn đề**: Mỗi lần render product list đều query DB. Với việc `handleProductsRoute` gọi `readProducts()` nhiều lần trong 1 request (vd: sau create/update, trả cả `products` list), gây query thừa.

**Cách sửa**:
- Thêm in-memory cache đơn giản:
```js
let productsCache = null;
let productsCacheTime = 0;
const CACHE_TTL = 30000; // 30s

async function readProducts() {
  if (productsCache && Date.now() - productsCacheTime < CACHE_TTL) {
    return productsCache;
  }
  const [rows] = await db.execute('SELECT * FROM products ORDER BY id');
  productsCache = rows.map(rowToProduct);
  productsCacheTime = Date.now();
  return productsCache;
}

function invalidateProductsCache() {
  productsCache = null;
}
```
- Gọi `invalidateProductsCache()` sau mỗi create/update/delete

### 🟡 5.2. Thiếu DB index cho các trường thường query

**File**: `config/db.js`

**Vấn đề**: Bảng `products` không có index ngoài PK. Khi data lớn, filter theo category hoặc section sẽ chậm.

**Cách sửa**: Thêm vào `initDatabase()`:
```sql
ALTER TABLE products ADD INDEX IF NOT EXISTS idx_products_category (category);
ALTER TABLE products ADD INDEX IF NOT EXISTS idx_products_section (section);
ALTER TABLE orders ADD INDEX IF NOT EXISTS idx_orders_status (status);
ALTER TABLE orders ADD INDEX IF NOT EXISTS idx_orders_provider (provider);
```

### 🟢 5.3. Static files không có cache headers

**File**: `server.js` → `serveFile()` (dòng 487-501)

**Vấn đề**: Mọi static file đều response 200 mà không có `Cache-Control` hay `ETag` → browser luôn download lại.

**Cách sửa**:
```js
function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const isAsset = /\.(jpg|jpeg|png|webp|avif|svg|ico|woff2?)$/i.test(ext);
  
  fs.stat(filePath, (err, stats) => {
    if (err) { /* handle error */ return; }
    
    const etag = `"${stats.size}-${stats.mtimeMs}"`;
    const cacheControl = isAsset ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate';
    
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    
    fs.readFile(filePath, (err, content) => {
      // ... response with Cache-Control, ETag headers
    });
  });
}
```

### 🟢 5.4. Không có connection pool health check

**File**: `config/db.js`

**Vấn đề**: Pool MySQL có thể mất kết nối (network issue, DB restart) mà server không biết.

**Cách sửa**: Thêm periodic ping:
```js
setInterval(async () => {
  try {
    await pool.execute('SELECT 1');
  } catch (err) {
    console.error('DB health check failed:', err.message);
  }
}, 60000); // Mỗi 60s
```

---

## 6. DevOps & Triển Khai

### 🟡 6.1. Thiếu `nodemon` cho development

**File**: `package.json`

**Vấn đề**: Script `dev` chỉ là `node server.js` — phải restart thủ công khi thay đổi code.

**Cách sửa**:
```json
"scripts": {
  "dev": "nodemon server.js",
  "start": "node server.js"
},
"devDependencies": {
  "nodemon": "^3.1.0"
}
```

### 🟡 6.2. Thiếu health check endpoint hoàn chỉnh

**File**: `server.js` (dòng 82-89)

**Vấn đề**: `/api/health` chỉ trả status nhưng KHÔNG kiểm tra DB connection.

**Cách sửa**:
```js
if (req.method === 'GET' && (requestUrl.pathname === '/api/health' || requestUrl.pathname === '/health')) {
  let dbOk = false;
  try {
    await db.execute('SELECT 1');
    dbOk = true;
  } catch {}
  
  const healthy = dbOk;
  sendJson(res, healthy ? 200 : 503, {
    ok: healthy,
    service: 'shop-anh-thuan',
    database: dbOk ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    time: new Date().toISOString()
  });
  return;
}
```

### 🟡 6.3. Thiếu graceful shutdown

**File**: `server.js`

**Vấn đề**: Không handle `SIGTERM`/`SIGINT` → connections bị drop đột ngột khi restart.

**Cách sửa**: Thêm trước `startServer()`:
```js
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await db.end();
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after timeout
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 🟢 6.4. Thiếu `.nvmrc` hoặc `.node-version`

**Vấn đề**: `package.json` yêu cầu `node >= 18` nhưng không có file lock version.

**Cách sửa**: Tạo file `.nvmrc`:
```
20
```

### 🟢 6.5. Thiếu Docker support

**Cách sửa**: Tạo `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Tạo `docker-compose.yml` cho dev:
```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - db
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
volumes:
  mysql_data:
```

---

## 7. Tính Năng Mới

### 🟡 7.1. Tìm kiếm nâng cao

**Hiện tại**: Search chỉ filter theo tên + displayCategory client-side.

**Cải thiện**:
- Thêm API endpoint `GET /api/products/search?q=xxx&category=xxx&minPrice=0&maxPrice=999999&sort=price_asc`
- Frontend: thêm filter bar (khoảng giá, danh mục, sắp xếp)
- Backend: dùng SQL `LIKE` hoặc `FULLTEXT` index

### 🟡 7.2. Quản lý đơn hàng cho Admin

**Hiện tại**: Admin chỉ xem được lịch sử bán hàng, không thể cập nhật trạng thái đơn.

**Cải thiện**:
- Thêm API `PUT /api/orders/:id/status` (Admin only)
- Trạng thái flow: `CREATED → PENDING → PAID → PROCESSING → SHIPPING → DELIVERED → COMPLETED`
- Cho COD: `COD_PENDING → SHIPPING → DELIVERED → COMPLETED`
- Frontend: thêm dropdown đổi status trong bảng admin orders

### 🟢 7.3. Upload ảnh sản phẩm

**Hiện tại**: Admin chỉ nhập URL ảnh → phụ thuộc link ngoài.

**Cải thiện**:
- Thêm endpoint `POST /api/upload` (Admin only, multipart/form-data)
- Lưu file vào `web/assets/uploads/`
- Giới hạn: 5MB, chỉ jpg/png/webp
- Trả về URL tương đối để dùng trong product

### 🟢 7.4. Email notification cho đơn hàng

**Cải thiện**:
- Tích hợp nodemailer hoặc API service (Mailgun, SendGrid)
- Gửi email xác nhận khi tạo đơn COD thành công
- Gửi email khi payment gateway confirm (MoMo/ZaloPay IPN)

### 🟢 7.5. Thống kê doanh thu cho Admin

**Cải thiện**:
- API `GET /api/admin/stats`:
  ```json
  {
    "totalOrders": 150,
    "totalRevenue": 45000000,
    "ordersByStatus": { "PAID": 100, "COD_PENDING": 30, "FAILED": 20 },
    "topProducts": [...],
    "revenueByDay": [...]
  }
  ```
- Frontend: dashboard card hiển thị tổng doanh thu, số đơn, chart đơn giản

### 🔵 7.6. Multi-language support

**Cải thiện**:
- Tạo file `web/i18n/vi.json`, `web/i18n/en.json`
- Tất cả text trong frontend dùng key → lookup từ language file
- Toggle ngôn ngữ ở header

### 🔵 7.7. Dark mode

**Cải thiện**:
- Thêm CSS variables cho dark theme
- Toggle button ở header
- Lưu preference vào `localStorage`
- Respect `prefers-color-scheme` media query

---

## 8. Chất Lượng Code

### 🟡 8.1. Không có test

**Vấn đề**: Không có bất kỳ unit test, integration test, hay E2E test nào.

**Cách sửa**:
- Thêm `vitest` hoặc `jest` cho unit tests
- Ưu tiên test:
  1. `routes/auth.js`: hashPassword, verifyPassword, normalizeUsers
  2. `routes/products.js`: normalizeProduct, normalizeStock, normalizeCategory
  3. `server.js`: createOrderFromCart, normalizeAmount
  4. `middleware/adminMiddleware.js`: isAdminRequest
- Thêm script:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### 🟡 8.2. Không có ESLint/Prettier

**Cách sửa**:
- Thêm `.eslintrc.json`:
```json
{
  "env": { "node": true, "browser": true, "es2022": true },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off",
    "semi": ["error", "always"],
    "quotes": ["error", "single"]
  }
}
```
- Thêm `.prettierrc`:
```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "printWidth": 120
}
```
- Thêm scripts: `"lint": "eslint .", "format": "prettier --write ."`

### 🟡 8.3. `backup.js` nằm ở root — không rõ mục đích

**File**: `backup.js` (8310 bytes)

**Vấn đề**: File `backup.js` nằm ở root, đã bị gitignore. Không rõ là backup của gì, có thể chứa code cũ.

**Cách sửa**: Kiểm tra nội dung → nếu không cần thiết, xóa. Nếu cần, chuyển vào thư mục `scripts/` hoặc `tools/`.

### 🟢 8.4. Nhiều đoạn code trùng lặp (DRY violation)

**Vấn đề**:
- `escapeHtml()` được định nghĩa ở CẢ `server.js` (dòng 1111) VÀ `web/script.js` (dòng 1194)
- `parseJson()` được định nghĩa ở CẢ `server.js` (dòng 1072) VÀ `routes/products.js` (dòng 360)
- `requiresProductSize()` / `requiresSize()` logic trùng nhau giữa server và client
- `getProductSizes()` trùng giữa server và client

**Cách sửa**:
- Backend: Extract shared functions vào `utils/helpers.js`, import ở cả `server.js` và `routes/*.js`
- Frontend: Không thể share code với backend (khác runtime), nhưng đảm bảo logic giống nhau

### 🟢 8.5. Frontend `script.js` quá lớn (1206 dòng)

**Vấn đề**: Tất cả logic frontend trong 1 file → khó maintain.

**Cách sửa** (nếu không dùng build tool):
- Tách thành modules bằng ES Module `<script type="module">`:
  ```
  web/js/app.js          → init, event binding
  web/js/auth.js         → login, register, profile
  web/js/cart.js         → cart operations
  web/js/products.js     → product rendering, search
  web/js/admin.js        → admin panel
  web/js/utils.js        → helpers (escapeHtml, currency, etc.)
  ```

### 🟢 8.6. Bootstrap loaded từ local folder với path lạ

**File**: `web/index.html` (dòng 16, 669)

**Vấn đề**: Path `../bootstrap-5.3.8-dist/bootstrap-5.3.8-dist/css/bootstrap.min.css` — folder lồng 2 lần. Và Bootstrap dist folder (khá nặng) nằm trong repo.

**Cách sửa**:
- Dùng CDN thay vì local:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
```
- Hoặc sửa folder structure: flatten `bootstrap-5.3.8-dist/bootstrap-5.3.8-dist/` thành `bootstrap-5.3.8-dist/`
- Thêm `bootstrap-5.3.8-dist/` vào `.gitignore`

### 🔵 8.7. JSDoc comments

**Vấn đề**: Không có documentation cho hàm nào.

**Cách sửa**: Thêm JSDoc cho tất cả public functions:
```js
/**
 * Tạo đơn hàng từ danh sách items trong giỏ hàng.
 * @param {Array<{productId: number, quantity: number, size?: string}>} items
 * @returns {Promise<{ok: boolean, amount?: number, items?: Array, message?: string}>}
 */
async function createOrderFromCart(items) { ... }
```

---

## Checklist Tổng Hợp Theo Thứ Tự Ưu Tiên

### 🔴 Phải làm ngay (Critical)
- [ ] 1.1 — Cảnh báo mật khẩu mặc định
- [ ] 1.2 — Rate limiting cho auth API
- [ ] 1.3 — Fix CORS policy
- [ ] 1.4 — Thêm security headers
- [ ] 3.1 — Input validation cho payment routes
- [ ] 3.2 — Yêu cầu auth cho payment
- [ ] 4.1 — Fix product detail luôn hiển thị sản phẩm cố định
- [ ] 4.2 — Fix nút "Thêm" trên HTML cards

### 🟡 Nên làm sớm (High)
- [ ] 1.5 — Session lưu vào DB
- [ ] 1.6 — Validate độ mạnh mật khẩu
- [ ] 2.1 — Tách server.js thành modules
- [ ] 2.2 — Xóa hardcoded product cards
- [ ] 2.3 — Đổi tên thư mục `accesst` → `assets`
- [ ] 3.3 — Simple router thay if/else chain
- [ ] 3.4 — Dùng dotenv thay loadEnvFile
- [ ] 3.5 — API versioning
- [ ] 3.6 — Nhất quán auth routes
- [ ] 4.3 — Loading skeleton UI
- [ ] 4.4 — Toast notification thay alert()
- [ ] 4.5 — Sửa hero banner text
- [ ] 4.6 — Sửa top strip text
- [ ] 4.7 — Feedback khi thêm giỏ hàng
- [ ] 4.8 — Fix tồn kho cho accessory
- [ ] 5.1 — Cache products
- [ ] 5.2 — Thêm DB indexes
- [ ] 6.1 — Thêm nodemon
- [ ] 6.2 — Health check hoàn chỉnh
- [ ] 6.3 — Graceful shutdown
- [ ] 7.1 — Tìm kiếm nâng cao
- [ ] 7.2 — Quản lý trạng thái đơn hàng
- [ ] 8.1 — Viết unit tests
- [ ] 8.2 — ESLint + Prettier

### 🟢 Cải thiện dần (Medium)
- [ ] 2.4 — Refactor thư mục
- [ ] 3.7 — Pagination
- [ ] 3.8 — Structured logging
- [ ] 4.9 — Fix responsive breakpoints
- [ ] 4.10 — Lazy loading images
- [ ] 4.11 — Persist wishlist
- [ ] 5.3 — Static file caching
- [ ] 5.4 — DB health check
- [ ] 6.4 — .nvmrc
- [ ] 6.5 — Docker
- [ ] 7.3 — Upload ảnh
- [ ] 7.4 — Email notification
- [ ] 7.5 — Admin dashboard
- [ ] 8.3 — Xử lý backup.js
- [ ] 8.4 — DRY refactor
- [ ] 8.5 — Tách frontend modules
- [ ] 8.6 — Fix Bootstrap loading
- [ ] 8.7 — JSDoc

### 🔵 Nice-to-have (Low)
- [ ] 4.12 — Accessibility
- [ ] 7.6 — Multi-language
- [ ] 7.7 — Dark mode

---

> [!TIP]
> **Cách sử dụng tài liệu này**: Copy nội dung vào prompt cho coding agent. Agent nên thực hiện từng mục theo thứ tự ưu tiên (Critical → High → Medium → Low). Mỗi mục đã có đủ context về file, dòng code và hướng sửa.

> [!WARNING]
> Trước khi thực hiện bất kỳ thay đổi nào, hãy:
> 1. Backup database hiện tại
> 2. Commit code hiện tại vào git
> 3. Tạo branch mới cho mỗi nhóm thay đổi
> 4. Test kỹ sau mỗi thay đổi
