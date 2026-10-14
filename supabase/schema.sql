-- رحيق البلد POS — قاعدة البيانات على Supabase
-- بتنلصق مرة وحدة بـ SQL Editor. ما فيها أي بيانات ولا إيميلات ولا مفاتيح.
--
-- الفكرة:
--   - التابلت هو المصدر: بيحفظ محليًا أول، وبيرفع نسخة من كل سجل لجدول records.
--   - كل سجل = (اسم الجدول المحلي، رقمه، بياناته كـ JSON). الحذف = deleted = true.
--   - members: مين إله دخول. cafe = حساب التابلت (بيقرأ وبيكتب)، partner = الشريك (بيقرأ التقارير بس).
--   - public_menu: المنيو العام لصفحة الـ QR (أسماء وأسعار بس). هاد الجدول الوحيد اللي بينقرأ بدون حساب.
--   - RLS على كل الجداول. اللي مش بجدول members ما بيقدر يقرأ ولا يكتب إشي (حتى لو عمل حساب).

-- ===== الجداول =====

create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('cafe', 'partner')),
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  tbl text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tbl, id)
);

create index if not exists records_updated_at on public.records (updated_at);

create table if not exists public.public_menu (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at بيتحدّث لحاله مع كل تعديل (الشريك بيسحب بس اللي تغيّر)
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

drop trigger if exists public_menu_touch on public.public_menu;
create trigger public_menu_touch before insert or update on public.public_menu
  for each row execute function public.touch_updated_at();

-- دور الحساب الحالي (cafe / partner / فاضي)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = auth.uid()
$$;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- الجداول اللي الشريك بيشوفها (للتقارير). الزباين والمخزون لا.
create or replace function public.partner_can_read(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t = any (array[
    'categories', 'items', 'optionLists', 'cafeTables', 'users', 'settings',
    'orders', 'orderLines', 'payments', 'paymentCorrections', 'shifts', 'expenses', 'auditLog'
  ])
$$;

-- ===== RLS =====

alter table public.members enable row level security;
alter table public.records enable row level security;
alter table public.public_menu enable row level security;

-- members: كل واحد بيشوف دوره بس. الإضافة والتعديل من الـ SQL Editor بس (ما في policy للكتابة).
drop policy if exists members_read_own on public.members;
create policy members_read_own on public.members
  for select to authenticated using (user_id = (select auth.uid()));

-- records: التابلت بيقرأ وبيكتب كل إشي، والشريك بيقرأ جداول التقارير بس.
drop policy if exists records_read on public.records;
create policy records_read on public.records
  for select to authenticated
  using ((select public.my_role()) = 'cafe' or ((select public.my_role()) = 'partner' and public.partner_can_read(tbl)));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert to authenticated with check ((select public.my_role()) = 'cafe');

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update to authenticated
  using ((select public.my_role()) = 'cafe') with check ((select public.my_role()) = 'cafe');

-- public_menu: أي حدا بيقرأه (صفحة المنيو للزباين)، والتابلت بس بيكتبه.
drop policy if exists public_menu_read on public.public_menu;
create policy public_menu_read on public.public_menu
  for select to anon, authenticated using (true);

drop policy if exists public_menu_insert on public.public_menu;
create policy public_menu_insert on public.public_menu
  for insert to authenticated with check ((select public.my_role()) = 'cafe');

drop policy if exists public_menu_update on public.public_menu;
create policy public_menu_update on public.public_menu
  for update to authenticated
  using ((select public.my_role()) = 'cafe') with check ((select public.my_role()) = 'cafe');

-- طبقة زيادة: الزائر بدون حساب ما إله أي صلاحية على غير المنيو
revoke all on public.members, public.records from anon;
revoke insert, update, delete on public.public_menu from anon;
grant select on public.public_menu to anon;
grant select on public.members to authenticated;
grant select, insert, update on public.records, public.public_menu to authenticated;
