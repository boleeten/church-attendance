-- 2026-11-18 교사별 메세지 전달
-- 관리자가 교사 개인(또는 여러 명)에게 제목·내용·사진·링크를 보내고, 교사별 읽음 여부를 확인한다.
-- 사진은 비공개 저장소(message-images)에 장당 500KB 이하로만 올라가며, 메세지를 지우면 사진도 함께 지운다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;

-- 1) 메세지 본문 (여러 명에게 보내도 1건)
create table if not exists public.teacher_messages (
  id text primary key,
  title text not null check (char_length(title) between 1 and 50),
  body text not null default '' check (char_length(body) <= 5000),
  images text[] not null default '{}',          -- 저장소 경로: {메세지id}/{번호}.jpg
  links jsonb not null default '[]',            -- [{ "url": "https://…", "label": "…" }]
  sender_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2) 받는 사람과 읽음 기록 (교사마다 1줄)
create table if not exists public.teacher_message_recipients (
  message_id text not null references public.teacher_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  primary key (message_id, user_id)
);
create index if not exists tmr_user_idx on public.teacher_message_recipients (user_id);

alter table public.teacher_messages enable row level security;
alter table public.teacher_message_recipients enable row level security;

-- 받는 사람인지 확인 (정책 안에서 서로 참조하며 무한 반복되지 않도록 함수로 분리)
create or replace function public.receives_message(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_message_recipients r join profiles p on p.id = r.user_id where r.message_id = mid and r.user_id = auth.uid() and p.active);
$$;

-- 메세지: 관리자는 전부, 교사는 자기에게 온 것만 읽는다. 보내기·삭제는 관리자만.
drop policy if exists tmsg_read on public.teacher_messages;
create policy tmsg_read on public.teacher_messages for select to authenticated using (is_admin() or receives_message(id));
drop policy if exists tmsg_insert on public.teacher_messages;
create policy tmsg_insert on public.teacher_messages for insert to authenticated with check (is_admin());
drop policy if exists tmsg_delete on public.teacher_messages;
create policy tmsg_delete on public.teacher_messages for delete to authenticated using (is_admin());

-- 받는 사람: 관리자는 전부, 교사는 본인 줄만 읽는다. 교사는 본인 줄의 '읽은 시각'만 바꿀 수 있다.
drop policy if exists tmr_read on public.teacher_message_recipients;
create policy tmr_read on public.teacher_message_recipients for select to authenticated using (is_admin() or (user_id = auth.uid() and is_member()));
drop policy if exists tmr_insert on public.teacher_message_recipients;
create policy tmr_insert on public.teacher_message_recipients for insert to authenticated with check (is_admin());
drop policy if exists tmr_delete on public.teacher_message_recipients;
create policy tmr_delete on public.teacher_message_recipients for delete to authenticated using (is_admin());
drop policy if exists tmr_update on public.teacher_message_recipients;
create policy tmr_update on public.teacher_message_recipients for update to authenticated
  using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member());
revoke update on public.teacher_message_recipients from authenticated;
grant update (read_at) on public.teacher_message_recipients to authenticated;

-- 3) 사진 저장소: 비공개, 장당 500KB, 사진 형식만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-images', 'message-images', false, 512000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 512000, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists msgimg_read on storage.objects;
create policy msgimg_read on storage.objects for select to authenticated
  using (bucket_id = 'message-images' and (is_admin() or receives_message((storage.foldername(name))[1])));
drop policy if exists msgimg_insert on storage.objects;
create policy msgimg_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'message-images' and is_admin());
drop policy if exists msgimg_delete on storage.objects;
create policy msgimg_delete on storage.objects for delete to authenticated
  using (bucket_id = 'message-images' and is_admin());

commit;

-- 확인용: 표 2개(teacher_messages, teacher_message_recipients)와 저장소 1개(message-images, 512000)가 보이면 완료
select 'table' as kind, tablename as name, null::bigint as size_limit from pg_tables where schemaname = 'public' and tablename like 'teacher_message%'
union all
select 'bucket', id, file_size_limit from storage.buckets where id = 'message-images';
