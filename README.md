# Shop Anh Thuan

Website shop Node.js co frontend tinh, API dang nhap/dang ky, gio hang theo size, quan tri san pham va API thanh toan MoMo/ZaloPay.

## Chay local

```bash
npm install
npm start
```

Mo trinh duyet:

```txt
http://localhost:3000
```

Tai khoan test:

```txt
Admin: admin / 123456
User: user1 / 123456
```

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

Bat buoc nen sua:

```txt
PORT=3000
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-domain.com
```

Neu dung thanh toan, cap nhat them cac URL callback/return ve dung domain:

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
GET  /api/health
POST /register
POST /login
GET  /api/products
POST /api/products        role Admin
PUT  /api/products/:id    role Admin
DELETE /api/products/:id  role Admin
```
