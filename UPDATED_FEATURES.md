# Danh Sách Tính Năng Cập Nhật

Nguồn tổng hợp: `IMPROVEMENT_GUIDE.md`

File này tóm tắt các tính năng, cải tiến và hạng mục nâng cấp được đề xuất cho dự án Shop Anh Thuan. Các mục được nhóm theo khu vực ảnh hưởng để dễ theo dõi khi triển khai.

## 1. Bảo Mật Và Xác Thực

### Critical
- Cảnh báo khi hệ thống vẫn dùng mật khẩu admin mặc định.
- Thêm rate limiting cho API đăng nhập và đăng ký để giảm rủi ro brute-force.
- Siết CORS policy, chỉ cho phép các domain hợp lệ gọi API.
- Thêm security headers kiểu Helmet cho response API và static file.

### High
- Lưu session token vào database thay vì memory để không mất session khi server restart.
- Thêm validation độ mạnh mật khẩu khi đăng ký tài khoản.

## 2. Kiến Trúc Và Cấu Trúc Code

### Critical
- Tách `server.js` đang quá lớn thành các module nhỏ hơn như routes, services, middleware, utils và config.

### High
- Xóa product cards hardcoded trong HTML, chỉ render sản phẩm từ API.
- Chuẩn hóa thư mục asset, dùng `web/assets` thay cho tên thư mục sai.

### Medium
- Sắp xếp lại cấu trúc thư mục dự án theo module rõ ràng hơn.

## 3. Backend API

### Critical
- Validate input cho các payment routes trước khi tạo đơn hàng hoặc gọi cổng thanh toán.
- Bắt buộc đăng nhập trước khi tạo thanh toán MoMo/ZaloPay.

### High
- Thay chuỗi `if/else` route API bằng simple router hoặc route map.
- Dùng `dotenv` thống nhất thay cho hàm load env tự viết.
- Thêm API versioning dạng `/api/v1`.
- Chuẩn hóa route xác thực, dùng `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`.

### Medium
- Thêm pagination cho danh sách sản phẩm và đơn hàng.
- Thêm structured logging có timestamp, log level và metadata.

## 4. Frontend UI/UX

### Critical
- Sửa product detail để hiển thị đúng sản phẩm được người dùng chọn.
- Sửa nút "Thêm" trên product cards ban đầu bằng cách bỏ cards hardcoded và render từ JS/API.

### High
- Thêm loading state hoặc skeleton UI khi chờ API sản phẩm.
- Thêm toast notification thay cho `alert()`.
- Cập nhật hero banner text chuyên nghiệp hơn.
- Cập nhật top strip text phù hợp với website thương mại.
- Thêm feedback khi thêm sản phẩm vào giỏ hàng.
- Kiểm tra tồn kho cho sản phẩm accessory hoặc sản phẩm không có size.

### Medium
- Sửa responsive layout trên mobile, đặc biệt các heading quá lớn và detail grid.
- Thêm lazy loading cho ảnh below-the-fold.
- Lưu wishlist vào `localStorage` để không mất khi refresh.

### Low
- Bổ sung accessibility: focus visible, aria-live và kiểm tra color contrast.

## 5. Database Và Performance

### High
- Thêm cache ngắn hạn cho `readProducts()`.
- Thêm index cho các trường database thường query như category, section, status và provider.

### Medium
- Thêm cache headers và ETag cho static files.
- Thêm health check định kỳ cho MySQL connection pool.

## 6. DevOps Và Triển Khai

### High
- Thêm `nodemon` cho môi trường development.
- Nâng cấp health check endpoint để kiểm tra cả database.
- Thêm graceful shutdown cho `SIGTERM` và `SIGINT`.

### Medium
- Thêm `.nvmrc` hoặc `.node-version` để khóa phiên bản Node.
- Bổ sung Dockerfile và docker-compose cho môi trường chạy bằng Docker.

## 7. Tính Năng Mới

### High
- Thêm tìm kiếm nâng cao với filter theo từ khóa, danh mục, khoảng giá và sắp xếp.
- Thêm quản lý trạng thái đơn hàng cho admin.

### Medium
- Thêm upload ảnh sản phẩm cho admin.
- Thêm email notification cho đơn hàng và thanh toán.
- Thêm dashboard thống kê doanh thu cho admin.

### Low
- Thêm hỗ trợ đa ngôn ngữ.
- Thêm dark mode.

## 8. Chất Lượng Code

### High
- Thêm unit test/integration test cho auth, products, order và middleware.
- Thêm ESLint và Prettier để chuẩn hóa code style.

### Medium
- Kiểm tra và xử lý file `backup.js` nếu còn tồn tại.
- Refactor các đoạn code trùng lặp như `escapeHtml`, `parseJson`, size/stock helpers.
- Tách `web/script.js` thành các ES modules nhỏ hơn.
- Chuẩn hóa cách load Bootstrap.

### Low
- Bổ sung JSDoc cho các public functions.

## Đề Xuất Thứ Tự Triển Khai

1. Xử lý toàn bộ nhóm Critical trước vì ảnh hưởng trực tiếp đến bảo mật, thanh toán và trải nghiệm chính.
2. Triển khai nhóm High theo từng mảng: bảo mật, backend, frontend, database, DevOps.
3. Sau khi hệ thống ổn định, tiếp tục nhóm Medium để cải thiện hiệu năng, maintainability và tính năng admin.
4. Nhóm Low nên triển khai sau cùng hoặc theo nhu cầu sản phẩm.
