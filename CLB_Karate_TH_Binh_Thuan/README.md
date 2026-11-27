# CLB Karate TH Bình Thuận — website quản lý võ sinh

## Bản cập nhật
- Đăng nhập bằng tên đăng nhập (username) và mật khẩu. Tên đăng nhập được ánh xạ nội bộ thành `username@karate.invalid` trong Supabase Auth. Trong giai đoạn chuyển đổi, ô đăng nhập vẫn chấp nhận email hiện tại để không khóa tài khoản cũ.
- Quản lý võ sinh và Điểm danh là hai màn hình riêng.
- Bỏ trường/cột mã võ sinh trên giao diện. Cột `code` cũ trong cơ sở dữ liệu vẫn được giữ để bảo toàn dữ liệu.
- Cấp đai có Nâu 0, Nâu 1, Nâu 2, Nâu 3.
- Trạng thái điểm danh có màu rõ ràng và có thống kê chuyên cần từ các lượt điểm danh đã lưu.

## A. Cập nhật cơ sở dữ liệu đang dùng
1. Vào Supabase > SQL Editor > New query.
2. Mở `supabase/update_existing.sql`, dán nội dung và chạy một lần.
3. Lệnh chỉ cho phép `code` để trống đối với hồ sơ mới; không xóa dữ liệu/cột cũ.

## B. Đăng nhập
- Tên đăng nhập mới như `admin`, `hlv01` được ánh xạ thành `admin@karate.invalid`, `hlv01@karate.invalid`.
- Tài khoản cũ bằng email vẫn đăng nhập được trong giai đoạn chuyển đổi.
- Để tạo tài khoản username: trong Supabase > Authentication > Users, tạo user có email `admin@karate.invalid` hoặc `hlv01@karate.invalid`, đặt mật khẩu và xác nhận tài khoản (nếu có lựa chọn Auto Confirm).
- Sau đó thêm hồ sơ tương ứng trong `public.profiles`, dùng UUID của user vừa tạo và role `admin` hoặc `coach`.
- Giữ tài khoản quản trị email cũ cho đến khi đã thử đăng nhập thành công bằng tài khoản username mới. Không bật đăng ký công khai.
- Tên miền `.invalid` không nhận email; không dùng chức năng gửi email/đặt lại mật khẩu cho các tài khoản bí danh này. Quản trị viên phải cấp và đặt lại mật khẩu trực tiếp trong Supabase.

Ví dụ SQL gán quyền sau khi tạo user (thay UUID bằng ID thực tế trong Authentication > Users):
```sql
insert into public.profiles(id,full_name,role)
values ('UUID-TAI-KHOAN','Quản trị CLB Karate TH Bình Thuận','admin')
on conflict (id) do update set full_name=excluded.full_name, role=excluded.role;
```

## C. Cấu hình và triển khai
Giữ nguyên Supabase Project URL, Publishable key và biến môi trường Vercel hiện có. Không đưa Secret key/service_role vào mã nguồn.
- GitHub: cập nhật các file trong thư mục dự án bằng phiên bản mới.
- Vercel: nếu đã kết nối GitHub, Vercel tự build lại sau commit. Không cần tạo project Vercel mới.

## Chức năng
Đăng nhập, quản lý hồ sơ võ sinh, lọc/tìm kiếm, điểm danh theo ngày/lớp, thống kê chuyên cần, xuất CSV và in hồ sơ.
