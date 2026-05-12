# Shop Anh Thuan

Website shop Node.js co frontend tinh, API dang nhap/dang ky, ho so tai khoan, gio hang theo size, quan tri san pham va thanh toan MoMo/ZaloPay/COD.

## Chay local

```bash
npm install
npm start
```

Mo trinh duyet:

```txt
http://localhost:3000
```

Kiem tra cu phap:

```bash
npm run check
```

Tai khoan test trong data hien tai:

```txt
Admin: admin / 123456
User: user1 / 123456
User: user2 / 123456
```

Mat khau trong `data/DATA.txt` da duoc migrate sang `passwordHash`. Neu tao data moi, dat `DEFAULT_ADMIN_PASSWORD` va `DEFAULT_USER_PASSWORD` trong `.env` truoc khi chay server lan dau.

## Tinh nang

- Dang ky, dang nhap, dang xuat bang session token server cap.
- Ho so tai khoan gom ho ten, so dien thoai va dia chi giao hang.
- San pham giay/quan ao bat buoc chon size truoc khi them vao gio.
- Kiem tra ton kho theo size khi them gio hang va khi tao don hang.
- Admin them/sua/xoa san pham bang token dang nhap, khong dung header role tu client.
- Thanh toan MoMo, ZaloPay va thanh toan khi nhan hang (COD).
- Server tinh lai don hang tu `products.json`, khong tin gia/amount do client gui len.

## Cau truc can upload len hosting

Upload cac file va thu muc nay len server Node.js:

```txt
server.js
package.json
routes/
middleware/
data/
web/
bootstrap-5.3.8-dist/
.env
```

Khong bat buoc upload:

```txt
backup.js
CODEX_CLI_PROJECT_GUIDE.md
Tai lieu xay dung web.txt
ZaloPay-APIs-Integration-Document.pdf
.env.example
```

## Bien moi truong

Tao file `.env` tren server dua theo `.env.example`.

Nen sua khi deploy:

```txt
PORT=3000
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-domain.com
SESSION_MAX_AGE_MS=43200000
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=mat-khau-admin-moi
DEFAULT_USER_USERNAME=user1
DEFAULT_USER_PASSWORD=mat-khau-user-moi
```

Neu dung thanh toan online, cap nhat them cac URL callback/return ve dung domain:

```txt
MOMO_RETURN_URL=https://your-domain.com/api/payments/momo/return
MOMO_IPN_URL=https://your-domain.com/api/payments/momo/ipn
ZALOPAY_CALLBACK_URL=https://your-domain.com/api/payments/zalopay/callback
ZALOPAY_RETURN_URL=https://your-domain.com/api/payments/zalopay/return
```

## Len domain

Hosting can ho tro Node.js. Cau hinh:

```txt
Start command: npm start
Health check: /api/health
Public folder: khong can, server.js da serve static
```

Sau khi tro domain/proxy ve port app, truy cap:

```txt
https://your-domain.com
```

Server van ho tro duong dan cu:

```txt
https://your-domain.com/web/
```

## API chinh

```txt
GET    /api/health
POST   /register
POST   /login
POST   /logout
GET    /api/auth/me
PUT    /api/auth/me

GET    /api/products
GET    /api/products/:id
POST   /api/products        Admin token
PUT    /api/products/:id    Admin token
DELETE /api/products/:id    Admin token

POST   /api/payments/momo
POST   /api/payments/momo/ipn
GET    /api/payments/momo/return
POST   /api/payments/zalopay
POST   /api/payments/zalopay/callback
GET    /api/payments/zalopay/return
POST   /api/payments/zalopay/status
POST   /api/payments/cod   Dang nhap + du ho so giao hang

GET    /api/orders          Admin token
```

## Auth token

Sau khi login/register thanh cong, response tra ve `token`. Cac API can dang nhap gui header:

```txt
Authorization: Bearer <token>
```

Khong dung cac header `role`, `x-role`, `x-user-role` de phan quyen.

## COD

De dat COD:

1. Dang nhap.
2. Cap nhat ho so tai khoan day du: ho ten, so dien thoai, dia chi.
3. Them san pham vao gio hang, chon size neu san pham co size.
4. Bam `Thanh toan khi nhan hang (COD)`.

Server se tao don voi trang thai `COD_PENDING`.
