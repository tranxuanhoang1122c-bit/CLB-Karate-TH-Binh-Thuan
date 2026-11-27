-- Chạy một lần trong Supabase > SQL Editor sau khi sao lưu dữ liệu.
-- Giữ nguyên mã cũ nếu đã có; chỉ cho phép hồ sơ mới không cần mã.
alter table public.students alter column code drop not null;

-- Không xóa cột code để dữ liệu cũ và các tích hợp hiện tại không bị mất.
