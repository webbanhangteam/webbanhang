# Hướng dẫn cho Codex CLI thực hiện dự án Web Bán Hàng

## Mục tiêu dự án
Nâng cấp giao diện dự án web bán hàng hiện tại bằng cách kết hợp:
- Bootstrap để dựng layout nhanh
- Tailwind CSS để custom UI hiện đại
- Giữ nguyên logic JavaScript hiện có
- Không phá vỡ cấu trúc file cũ

---

# Yêu cầu kỹ thuật

## Framework CSS
Sử dụng đồng thời:
- Bootstrap 5
- Tailwind CSS

## Nguyên tắc sử dụng

### Bootstrap dùng cho
- Grid system
- Navbar
- Modal
- Carousel
- Form layout
- Responsive container

### Tailwind dùng cho
- Product card
- Button custom
- Animation
- Hover effect
- Typography
- Shadow
- Border radius
- Spacing hiện đại

---

# Cấu trúc thư mục mong muốn

```txt
project/
│
├── assets/
│   ├── css/
│   │   ├── style.css
│   │   ├── tailwind.css
│   │   └── custom.css
│   │
│   ├── js/
│   └── images/
│
├── pages/
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── input.css
```

---

# Cài đặt Tailwind CSS

## Khởi tạo npm

```bash
npm init -y
```

## Cài Tailwind

```bash
npm install -D tailwindcss postcss autoprefixer
```

## Khởi tạo config

```bash
npx tailwindcss init -p
```

---

# Cấu hình Tailwind

## tailwind.config.js

```js
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./assets/js/**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

---

# Tạo input.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

# Build Tailwind

```bash
npx tailwindcss -i ./input.css -o ./assets/css/tailwind.css --watch
```

---

# Import CSS vào HTML

Đảm bảo Bootstrap được import trước:

```html
<link rel="stylesheet" href="assets/css/bootstrap.min.css">
<link rel="stylesheet" href="assets/css/tailwind.css">
<link rel="stylesheet" href="assets/css/style.css">
```

---

# Quy tắc code giao diện

## Không sửa logic JS cũ nếu không cần thiết

Chỉ nâng cấp:
- UI
- UX
- Responsive
- Animation
- Typography

---

# Style guide giao diện

## Thiết kế mong muốn

Phong cách hiện đại:
- Bo góc lớn
- Shadow nhẹ
- Khoảng trắng rộng
- Hover animation mềm
- Card sản phẩm đẹp
- Responsive mobile-first

---

# Product Card chuẩn

Ví dụ:

```html
<div class="card border-0 shadow-sm rounded-4 overflow-hidden">
  <img
    src="assets/images/product.jpg"
    class="w-full h-64 object-cover"
  >

  <div class="p-4">
    <h2 class="text-xl font-bold mb-2">
      Nike Air Force
    </h2>

    <p class="text-gray-500 mb-4">
      Giày thời trang hiện đại
    </p>

    <button
      class="bg-black text-white px-5 py-2 rounded-xl hover:scale-105 transition duration-300"
    >
      Add To Cart
    </button>
  </div>
</div>
```

---

# Navbar

Navbar sử dụng Bootstrap:

```html
<nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm">
```

Không thay bằng Tailwind hoàn toàn.

---

# Responsive

## Yêu cầu
Website phải hoạt động tốt trên:
- Mobile
- Tablet
- Desktop

---

# Animation

Ưu tiên dùng Tailwind:

Ví dụ:

```html
hover:scale-105
transition-all
duration-300
```

---

# Không được làm

## Không:
- Xóa file cũ khi chưa cần
- Đổi tên class Bootstrap hệ thống
- Viết inline CSS quá nhiều
- Thêm thư viện không cần thiết
- Phá vỡ layout hiện có

---

# Tối ưu hiệu năng

## Yêu cầu
- Giảm CSS dư thừa
- Hạn chế dùng !important
- Tối ưu hình ảnh
- Dùng lazy loading cho ảnh sản phẩm

Ví dụ:

```html
<img loading="lazy">
```

---

# Dark mode (tùy chọn)

Nếu triển khai dark mode:
- Dùng class dark của Tailwind
- Không dùng plugin ngoài nếu không cần

---

# Coding convention

## HTML
- Indent 2 spaces
- Tên class rõ ràng
- Chia section hợp lý

## CSS
- Không viết CSS trùng lặp
- Ưu tiên utility class của Tailwind

## JavaScript
- Giữ nguyên chức năng cũ
- Không rewrite toàn bộ nếu không cần

---

# Mục tiêu cuối cùng

Sau khi hoàn thành:
- Website có giao diện hiện đại hơn
- Responsive tốt hơn
- UI đẹp hơn
- Dễ maintain
- Không làm hỏng chức năng cũ
- Kết hợp Bootstrap + Tailwind hợp lý

