-- Chạy một lần trong Supabase SQL Editor.
-- Chỉ thêm bảng cài đặt mức học phí; không xóa/sửa hóa đơn hay lịch sử thanh toán hiện có.
create table if not exists public.tuition_settings (
  id integer primary key check (id = 1),
  monthly_fee integer not null default 300000 check (monthly_fee > 0),
  updated_at timestamptz not null default now()
);

insert into public.tuition_settings (id, monthly_fee)
values (1, 300000)
on conflict (id) do nothing;

alter table public.tuition_settings enable row level security;
drop policy if exists tuition_settings_staff on public.tuition_settings;
create policy tuition_settings_staff
on public.tuition_settings
for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid()))
with check (exists (select 1 from public.profiles where id = auth.uid()));
