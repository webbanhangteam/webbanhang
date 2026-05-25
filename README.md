# Shop Anh Thuan

Shop Anh Thuan la website ban hang chay bang Node.js, frontend tinh va MySQL. Du an gom trang mua hang, gio hang theo size, dang ky/dang nhap, ho so giao hang, quan tri san pham, lich su don hang va thanh toan qua MoMo, ZaloPay hoac COD.

## Noi Dung

- [Tinh nang chinh](#tinh-nang-chinh)
- [Cong nghe su dung](#cong-nghe-su-dung)
- [Cau truc du an](#cau-truc-du-an)
- [Chay local](#chay-local)
- [Bien moi truong](#bien-moi-truong)
- [Lenh npm](#lenh-npm)
- [API chinh](#api-chinh)
- [Database](#database)
- [Thanh toan](#thanh-toan)
- [Docker](#docker)
- [Trien khai](#trien-khai)
- [Ghi chu phat trien](#ghi-chu-phat-trien)

## Tinh Nang Chinh

- Dang ky, dang nhap, dang xuat bang session token.
- Cap nhat ho so tai khoan: ho ten, so dien thoai va dia chi giao hang.
- Danh sach san pham lay tu MySQL, co cache ngan han de giam query lap lai.
- Gio hang ho tro san pham co size va san pham khong co size.
- Kiem tra ton kho theo size hoac `totalStock` truoc khi tao don.
- Admin them, sua, xoa san pham bang token dang nhap.
- Thanh toan MoMo, ZaloPay va COD.
- COD tru ton kho ngay khi tao don thanh cong.
- MoMo/ZaloPay tru ton kho khi IPN/callback xac nhan thanh toan thanh cong.
- User xem lich su mua hang.
- Admin xem lich su ban hang.
- API co rate limiting cho login/register.
- Response co security headers va CORS policy theo `ALLOWED_ORIGINS`.
- Static assets co `Cache-Control` va `ETag`.
- Health check endpoint kiem tra ca database.
- Graceful shutdown cho `SIGTERM` va `SIGINT`.

## Cong Nghe Su Dung

- Node.js >= 18
- Native `http` server
- MySQL 8
- `mysql2`
- `dotenv`
- Tailwind CSS CLI
- Vitest
- ESLint
- Prettier
- Docker va Docker Compose

## Cau Truc Du An

```txt
.
|-- config/
|   `-- db.js
|-- data/
|   `-- products.json
|-- middleware/
|   |-- adminMiddleware.js
|   `-- rateLimiter.js
|-- routes/
|   |-- auth.js
|   `-- products.js
|-- tests/
|   `-- auth.test.mjs
|-- web/
|   |-- assets/
|   |-- index.html
|   |-- script.js
|   |-- style.css
|   `-- tailwind.css
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- server.js
`-- UPDATED_FEATURES.md
```

## Chay Local

1. Cai dependencies:

```bash
npm install
```

2. Tao file `.env` o thu muc goc:

```bash
cp .env.example .env
```

Neu khong co `.env.example`, tao `.env` theo mau trong phan [Bien moi truong](#bien-moi-truong).

3. Dam bao MySQL dang chay va thong tin ket noi trong `.env` dung.

4. Chay app:

```bash
npm run dev
```

Hoac chay production mode:

```bash
npm start
```

5. Mo trinh duyet:

```txt
http://localhost:3000
```

Server tu tao database va cac bang can thiet khi khoi dong. Neu bang `users` hoac `products` dang rong, app se seed du lieu mac dinh tu `data/products.json` hoac tu cau hinh mac dinh.

## Bien Moi Truong

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=webbanhang
DB_CONNECTION_LIMIT=10

SESSION_MAX_AGE_MS=43200000
MAX_BODY_SIZE=1048576

DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=change-this-admin-password
DEFAULT_USER_USERNAME=user1
DEFAULT_USER_PASSWORD=StrongPass1
```

Khi deploy, nen doi `DEFAULT_ADMIN_PASSWORD`. Server se canh bao neu van dung mat khau admin mac dinh.

Neu dung MoMo:

```env
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
MOMO_RETURN_URL=https://your-domain.com/api/payments/momo/return
MOMO_IPN_URL=https://your-domain.com/api/payments/momo/ipn
```

Neu dung ZaloPay:

```env
ZALOPAY_APP_ID=2554
ZALOPAY_KEY1=
ZALOPAY_KEY2=
ZALOPAY_CREATE_URL=https://sb-openapi.zalopay.vn/v2/create
ZALOPAY_QUERY_URL=https://sb-openapi.zalopay.vn/v2/query
ZALOPAY_CALLBACK_URL=https://your-domain.com/api/payments/zalopay/callback
ZALOPAY_RETURN_URL=https://your-domain.com/api/payments/zalopay/return
```

## Lenh Npm

```bash
npm start
```

Chay server bang `node server.js`.

```bash
npm run dev
```

Chay server bang `nodemon`.

```bash
npm run tailwind:build
```

Build `web/tailwind.css` tu `input.css`.

```bash
npm run tailwind:watch
```

Watch Tailwind khi phat trien UI.

```bash
npm run check
```

Build Tailwind va kiem tra cu phap cac file JS chinh.

```bash
npm test
```

Chay test bang Vitest.

```bash
npm run lint
npm run format
```

Kiem tra va format code.

## API Chinh

Tat ca API v1 co the goi bang prefix `/api/v1/...`. Server se map ve route hien tai `/api/...` de giu tuong thich.

### Health

```txt
GET /api/health
GET /health
```

### Auth

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
PUT  /api/auth/me
```

Register yeu cau password co it nhat 8 ky tu, 1 chu hoa va 1 so.

Sau khi login/register thanh cong, response tra ve `token`. Cac API can dang nhap gui token nhu sau:

```txt
Authorization: Bearer <token>
```

Hoac:

```txt
X-Session-Token: <token>
```

### Products

```txt
GET    /api/products
GET    /api/products/:id
POST   /api/products        Admin token
PUT    /api/products/:id    Admin token
DELETE /api/products/:id    Admin token
```

### Payments

```txt
POST /api/payments/momo
POST /api/payments/momo/ipn
GET  /api/payments/momo/return

POST /api/payments/zalopay
POST /api/payments/zalopay/callback
GET  /api/payments/zalopay/return
POST /api/payments/zalopay/status

POST /api/payments/cod
```

MoMo, ZaloPay va COD deu yeu cau user dang nhap truoc khi tao don.

### Orders

```txt
GET /api/orders/me    Dang nhap
GET /api/orders       Admin token
```

## Database

Database duoc cau hinh trong `config/db.js`. App tu tao database neu chua co, sau do tao cac bang:

```txt
users
products
orders
order_items
```

Bang `products` luu ten, danh muc, gia, anh, section, sizes, stock theo size va `total_stock` cho san pham khong co size.

Bang `orders` luu ma don, user, provider, status, amount, thong tin khach hang, payload cong thanh toan va co `stock_applied` de dam bao moi don chi tru ton kho mot lan.

Bang `order_items` luu tung san pham trong don hang.

Database co index cho mot so truong hay query:

```txt
products.category
products.section
orders.status
orders.provider
orders.user_id
order_items.order_id
order_items.product_id
```

## Thanh Toan

### COD

Quy trinh dat COD:

1. Dang nhap.
2. Cap nhat ho so giao hang day du.
3. Them san pham vao gio hang.
4. Goi `POST /api/payments/cod`.

Don COD tao thanh cong co status `COD_PENDING` va tru ton kho ngay.

### MoMo Va ZaloPay

Quy trinh thanh toan online:

1. Dang nhap.
2. Tao payment request.
3. Server tao local order voi status `CREATED`.
4. Neu cong thanh toan tao link thanh cong, order chuyen sang `PENDING`.
5. IPN/callback xac nhan thanh toan thanh cong se cap nhat status `PAID` va tru ton kho.
6. Neu thanh toan that bai, order chuyen sang `FAILED`.

Server tinh lai tong tien tu database, khong tin `amount` do client gui len.

## Docker

Chay bang Docker Compose:

```bash
docker compose up --build
```

App mo o:

```txt
http://localhost:3000
```

`docker-compose.yml` gom service `web` va `db` MySQL 8. File `.env` duoc dung cho ca app va database.

## Trien Khai

Hosting can ho tro Node.js va MySQL.

Cau hinh co ban:

```txt
Start command: npm start
Health check: /api/health
Port: lay tu bien moi truong PORT
Public folder: khong can, server.js tu serve static trong web/
```

Khi deploy:

1. Cai dependencies bang `npm ci --omit=dev`.
2. Tao `.env` production.
3. Dat `PUBLIC_BASE_URL` bang domain that.
4. Dat `ALLOWED_ORIGINS` bang domain frontend.
5. Doi `DEFAULT_ADMIN_PASSWORD`.
6. Cap nhat callback/return URL cua MoMo/ZaloPay ve domain production.
7. Chay `npm start`.

## Ghi Chu Phat Trien

- Khong phan quyen admin bang header `role`, `x-role` hay `x-user-role` tu client.
- Admin API phai dung token cua tai khoan co role `Admin`.
- Cac route `/register`, `/login`, `/logout` cu khong con la API chinh. Dung `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`.
- Danh sach de xuat nang cap nam trong `UPDATED_FEATURES.md`.
- Truoc khi thay doi logic thanh toan hoac ton kho, nen chay `npm run check` va `npm test`.
