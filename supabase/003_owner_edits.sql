-- رحيق البلد POS — التحديث ٣: المالك بيعدّل المصاريف والطلبات المسكّرة والطاولات من بعيد
-- بينلصق مرة وحدة بـ SQL Editor (بعد 002_owner_remote.sql). ما فيه بيانات ولا إيميلات.
--
-- التعديلات هاي ما بتنكتب على البيانات مباشرة: بتنحط كـ «أمر» بجدول remote_edits (tbl = '_op')،
-- والتابلت بيطبّقها بنفس الطريقة اللي بيعدّل فيها المالك عليه (مع سجل التعديلات)، وبيرجع يرفعها.
-- الصلاحيات نفسها: المالك بس بيضيف أوامر، والتابلت بس بيعلّم إنه طبّقها.

alter table public.remote_edits drop constraint if exists remote_edits_tbl_check;
alter table public.remote_edits add constraint remote_edits_tbl_check
  check (tbl in ('categories', 'items', 'optionLists', 'settings', '_op'));

-- إذا التابلت ما قدر يطبّق أمر (مثلًا الصنف انشال من قبل)، بيكتب السبب هون، والمالك بيشوفه
alter table public.remote_edits add column if not exists error text;
