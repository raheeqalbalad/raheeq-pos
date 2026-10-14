-- رحيق البلد POS — التحديث ٢: دخول المالك بالإيميل من بعيد
-- بينلصق مرة وحدة بـ SQL Editor (بعد schema.sql). ما فيه بيانات ولا إيميلات.
--
-- owner: المالك من تلفونه أو اللابتوب. بيقرأ كل إشي، وتعديلاته (المنيو والأسعار والإعدادات بس)
-- ما بتنكتب على البيانات مباشرة: بتنحط كـ «طلب تعديل» بجدول remote_edits، والتابلت بيطبّقها عنده
-- (هو المصدر الوحيد) وبيرجع يرفعها. البيع والشيفتات وغيرها ما بتتعدّل من بعيد أبدًا.

-- دور جديد
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('cafe', 'owner', 'partner'));

-- المالك بيقرأ كل السجلات
drop policy if exists records_read on public.records;
create policy records_read on public.records
  for select to authenticated
  using (
    (select public.my_role()) in ('cafe', 'owner')
    or ((select public.my_role()) = 'partner' and public.partner_can_read(tbl))
  );

-- طلبات التعديل من بعيد
create table if not exists public.remote_edits (
  id bigint generated always as identity primary key,
  tbl text not null check (tbl in ('categories', 'items', 'optionLists', 'settings')),
  rec_id text not null,
  data jsonb,
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists remote_edits_pending on public.remote_edits (id) where applied_at is null;

alter table public.remote_edits enable row level security;

-- المالك بيضيف طلبات باسمه بس
drop policy if exists remote_edits_insert on public.remote_edits;
create policy remote_edits_insert on public.remote_edits
  for insert to authenticated
  with check ((select public.my_role()) = 'owner' and created_by = (select auth.uid()) and applied_at is null);

-- المالك بيشوف طلباته (عشان يعرف إذا وصلت التابلت)، والتابلت بيشوف الكل
drop policy if exists remote_edits_read on public.remote_edits;
create policy remote_edits_read on public.remote_edits
  for select to authenticated
  using ((select public.my_role()) = 'cafe' or ((select public.my_role()) = 'owner' and created_by = (select auth.uid())));

-- التابلت بس بيعلّم إنه طبّقها
drop policy if exists remote_edits_update on public.remote_edits;
create policy remote_edits_update on public.remote_edits
  for update to authenticated
  using ((select public.my_role()) = 'cafe') with check ((select public.my_role()) = 'cafe');

revoke all on public.remote_edits from anon;
grant select, insert, update on public.remote_edits to authenticated;
