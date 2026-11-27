# CLB Karate TH Bình Thuận — website quản lý võ sinh

## A. Chuẩn bị Supabase
1. Vào project Supabase > SQL Editor > New query.
2. Mở `supabase/setup.sql`, thay `EMAIL_QUAN_TRI` bằng email của tài khoản đã tạo trong Authentication > Users.
3. Chạy toàn bộ SQL. SQL tạo bảng võ sinh, buổi tập, điểm danh, hồ sơ và chính sách RLS.
4. Project URL cần dùng là `https://rbxknlsorlhusfgbxcfg.supabase.co` (bỏ `/rest/v1/` ở cuối).

## B. Cấu hình
1. Sao chép `.env.example` thành `.env`.
2. Điền Project URL và Publishable key vào `.env`.
3. Không đưa Secret key/service_role vào ứng dụng hoặc GitHub.

## C. Chạy thử trên máy tính
Cài Node.js LTS, mở terminal tại thư mục dự án:
```bash
npm install
npm run dev
```

## D. Đưa lên Vercel
1. Tạo repository GitHub mới và tải toàn bộ file trong thư mục dự án lên. Không tải file `.env`.
2. Vào Vercel > Add New > Project > Import Git Repository.
3. Chọn repository. Framework Preset: Vite; Build Command `npm run build`; Output Directory `dist`.
4. Trong Settings > Environment Variables, thêm:
   - `VITE_SUPABASE_URL` = `https://rbxknlsorlhusfgbxcfg.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = giá trị publishable key của bạn
5. Chọn Production, Preview, Development rồi Save. Nhấn Deploy.

## E. Tài khoản và phân quyền
- Đăng nhập dùng email/mật khẩu Supabase Auth mà bạn đã tạo.
- Sau khi chạy SQL, tài khoản email ở dòng `EMAIL_QUAN_TRI` sẽ có vai trò admin.
- Tạo tài khoản huấn luyện viên trong Supabase > Authentication > Users; sau đó thêm hồ sơ vào `public.profiles` với `id` là UUID tài khoản, `role` là `coach`.
- Không bật đăng ký công khai nếu CLB muốn tự cấp tài khoản.

## Chức năng
Đăng nhập, thêm/sửa/xóa võ sinh, tìm kiếm/lọc, điểm danh theo ngày, thống kê, xuất CSV, in danh sách. Giao diện tương thích điện thoại và máy tính.
