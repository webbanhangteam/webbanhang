# Shop Anh Thuận

Website bán hàng sử dụng Node.js, MySQL và frontend tĩnh. Dự án hỗ trợ tài khoản người dùng, quản lý sản phẩm, giỏ hàng theo size, tồn kho, đơn hàng và thanh toán qua COD, MoMo hoặc ZaloPay.

## Tính năng

- Đăng ký, đăng nhập và đăng xuất bằng session token.
- Cập nhật họ tên, số điện thoại và địa chỉ giao hàng.
- Hiển thị sản phẩm từ MySQL, có cache trong 30 giây.
- Sản phẩm có size hoặc tồn kho tổng (`totalStock`).
- Giá khuyến mãi theo `salePercent`.
- Admin có thể thêm, sửa và xóa sản phẩm.
- Kiểm tra giá và tồn kho trực tiếp từ database khi tạo đơn.
- Thanh toán COD, MoMo và ZaloPay.
- Người dùng xem lịch sử mua hàng; admin xem toàn bộ đơn hàng.
- Rate limit cho API đăng nhập và đăng ký.
- CORS, security headers, `ETag` và cache cho tài nguyên tĩnh.
- Health check kiểm tra cả ứng dụng và kết nối database.
- Graceful shutdown khi nhận `SIGTERM` hoặc `SIGINT`.

## Công nghệ

- Node.js 18 trở lên
- Native Node.js HTTP server
- MySQL 8
- `mysql2`
- `dotenv`
- Tailwind CSS 4
- Bootstrap 5 qua CDN
- Vitest
- ESLint và Prettier
- Docker và Docker Compose

## Cấu trúc dự án

```text
.
├── public/
│   ├── content/
│   │   └── content.json
│   ├── css/
│   │   ├── style.css
│   │   └── tailwind.css
│   ├── image/
│   │   ├── products/
│   │   └── logo.png
│   ├── js/
│   │   └── script.js
│   └── index.html
├── src/
│   ├── config/
│   │   └── db.js
│   ├── data/
│   │   └── products.json
│   ├── middleware/
│   │   ├── adminMiddleware.js
│   │   └── rateLimiter.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── products.js
│   └── server.js
├── tests/
│   └── auth.test.mjs
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── ecosystem.config.cjs
├── input.css
├── package.json
├── Procfile
├── tailwind.config.js
└── testdb.js
```

## Chạy local

### Yêu cầu

- Node.js 18 trở lên
- npm
- MySQL 8 đang hoạt động

### Cài đặt

```bash
npm install
```

Tạo `.env` từ file mẫu:

```bash
cp .env.example .env
```

Trên PowerShell:

```powershell
Copy-Item .env.example .env
```

Cập nhật thông tin MySQL trong `.env`, sau đó chạy:

```bash
npm run dev
```

Hoặc chạy chế độ production:

```bash
npm start
```

Mở `http://localhost:3000`.

Khi khởi động, ứng dụng sẽ:

1. Tạo database nếu chưa tồn tại.
2. Tạo các bảng cần thiết.
3. Seed sản phẩm từ `src/data/products.json` nếu bảng `products` đang trống.
4. Tạo tài khoản mặc định nếu bảng `users` đang trống và các biến `DEFAULT_*_PASSWORD` đã được cấu hình.

Nếu PowerShell chặn `npm.ps1`, có thể dùng `npm.cmd`, ví dụ:

```powershell
npm.cmd run dev
```

## Biến môi trường

Các biến chính:

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

PUBLIC_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
MAX_BODY_SIZE=1048576
SESSION_MAX_AGE_MS=43200000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=webbanhang
DB_CONNECTION_LIMIT=10
```

`ALLOWED_ORIGINS` nhận nhiều origin, phân tách bằng dấu phẩy:

```env
ALLOWED_ORIGINS=https://shop.example.com,https://admin.example.com
```

### Tài khoản seed tùy chọn

Các tài khoản này chỉ được tạo khi bảng `users` đang trống:

```env
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=replace-with-a-strong-password

DEFAULT_USER_USERNAME=user1
DEFAULT_USER_PASSWORD=StrongPass1
```

Không dùng `change-this-admin-password` trong production.

### MoMo sandbox

```env
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
MOMO_RETURN_URL=https://your-domain.com/api/payments/momo/return
MOMO_IPN_URL=https://your-domain.com/api/payments/momo/ipn
```

### ZaloPay sandbox

```env
ZALOPAY_APP_ID=
ZALOPAY_KEY1=
ZALOPAY_KEY2=
ZALOPAY_CREATE_URL=https://sb-openapi.zalopay.vn/v2/create
ZALOPAY_QUERY_URL=https://sb-openapi.zalopay.vn/v2/query
ZALOPAY_CALLBACK_URL=https://your-domain.com/api/payments/zalopay/callback
ZALOPAY_RETURN_URL=https://your-domain.com/api/payments/zalopay/return
```

## Lệnh npm

| Lệnh | Chức năng |
|---|---|
| `npm start` | Chạy `node src/server.js` |
| `npm run dev` | Chạy server bằng Nodemon |
| `npm run tailwind:build` | Build `public/css/tailwind.css` |
| `npm run tailwind:watch` | Theo dõi và build Tailwind khi phát triển |
| `npm run check` | Build Tailwind và kiểm tra cú pháp JavaScript |
| `npm test` | Chạy test bằng Vitest |
| `npm run test:watch` | Chạy Vitest ở chế độ watch |
| `npm run lint` | Kiểm tra mã nguồn bằng ESLint |
| `npm run format` | Format dự án bằng Prettier |

Kiểm tra kết nối MySQL riêng:

```bash
node testdb.js
```

## API

API nhận body dạng JSON. Các route `/api/v1/...` được tự động ánh xạ sang `/api/...`.

### Xác thực

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
PUT  /api/auth/me
```

Mật khẩu đăng ký phải có ít nhất 8 ký tự, một chữ hoa và một chữ số.

Sau khi đăng nhập hoặc đăng ký, gửi token qua một trong hai header:

```http
Authorization: Bearer <token>
```

hoặc:

```http
X-Session-Token: <token>
```

Session hiện được lưu trong bộ nhớ và sẽ mất khi server khởi động lại.

### Sản phẩm

```text
GET    /api/products
GET    /api/products/:id
POST   /api/products       Admin
PUT    /api/products/:id   Admin
DELETE /api/products/:id   Admin
```

### Đơn hàng

```text
GET /api/orders/me   Người dùng đã đăng nhập
GET /api/orders      Admin
```

### Thanh toán

```text
POST /api/payments/cod

POST /api/payments/momo
POST /api/payments/momo/ipn
GET  /api/payments/momo/return

POST /api/payments/zalopay
POST /api/payments/zalopay/callback
GET  /api/payments/zalopay/return
POST /api/payments/zalopay/status
```

Các API tạo đơn COD, MoMo và ZaloPay yêu cầu:

- Token đăng nhập hợp lệ.
- Hồ sơ có đủ họ tên, số điện thoại và địa chỉ.
- Body có mảng `items`.

Ví dụ:

```json
{
  "items": [
    {
      "productId": 5,
      "size": "M",
      "quantity": 2
    }
  ]
}
```

Server tự đọc giá sản phẩm, giá sale và tồn kho từ database; không tin giá hoặc tổng tiền do client gửi.

### Health check

```text
GET /api/health
GET /health
```

Endpoint trả HTTP `200` khi database hoạt động và `503` khi mất kết nối.

## Database

Ứng dụng quản lý schema trong `src/config/db.js` và sử dụng các bảng:

| Bảng | Mục đích |
|---|---|
| `users` | Tài khoản, role và hồ sơ giao hàng |
| `products` | Sản phẩm, giá sale, size và tồn kho |
| `orders` | Thông tin đơn hàng và trạng thái thanh toán |
| `order_items` | Các sản phẩm thuộc từng đơn hàng |

COD trừ tồn kho ngay khi tạo đơn thành công. MoMo và ZaloPay chỉ trừ tồn kho sau khi IPN hoặc callback xác nhận thanh toán thành công. Cột `stock_applied` ngăn một đơn hàng bị trừ tồn kho nhiều lần.

## Docker

Trong `.env`, đặt host database theo tên service Compose:

```env
DB_HOST=db
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=webbanhang
```

Sau đó chạy:

```bash
docker compose up --build
```

Ứng dụng được mở tại `http://localhost:3000`. Dữ liệu MySQL được lưu trong volume `mysql_data`.

## Triển khai

Cấu hình cơ bản:

```text
Start command: npm start
Health check: /api/health
Port: biến môi trường PORT
Public directory: public/
```

Checklist production:

1. Chạy Node.js 18 trở lên và MySQL 8.
2. Cài dependency bằng `npm ci --omit=dev`.
3. Thiết lập `PUBLIC_BASE_URL` bằng domain HTTPS thực tế.
4. Chỉ định chính xác `ALLOWED_ORIGINS`.
5. Dùng mật khẩu admin mạnh.
6. Cấu hình callback/IPN MoMo và ZaloPay bằng URL public.
7. Không commit file `.env`.
8. Chạy `npm run check`, `npm test` và `npm run lint` trước khi triển khai.

Có thể chạy bằng PM2 với:

```bash
pm2 start ecosystem.config.cjs
```

## Lưu ý phát triển

- Quyền admin chỉ được xác định từ session của tài khoản có role `Admin`.
- Không gửi hoặc tin cậy các header role do client tự đặt.
- `public/css/tailwind.css` là file được sinh từ `input.css`.
- Các đề xuất nâng cấp tiếp theo nằm trong `UPDATED_FEATURES.md`.
