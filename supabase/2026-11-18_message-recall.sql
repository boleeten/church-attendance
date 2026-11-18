-- 2026-11-18 메세지 회수 / 삭제 분리
-- · 관리자 '회수': 메세지와 사진을 완전히 지운다 (교사 메세지함에서도 사라짐) — 기존 동작, SQL 변경 없음
-- · 관리자 '삭제': 관리자 목록에서만 숨긴다 (hidden_at). 교사는 계속 볼 수 있다
-- · 교사 '삭제': 자기 메세지함에서만 지운다 (deleted_at). 관리자의 읽음 기록은 남는다
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;

alter table public.teacher_messages add column if not exists hidden_at timestamptz;
alter table public.teacher_message_recipients add column if not exists deleted_at timestamptz;

-- 관리자는 메세지를 숨김 처리(수정)할 수 있다
drop policy if exists tmsg_update on public.teacher_messages;
create policy tmsg_update on public.teacher_messages for update to authenticated using (is_admin()) with check (is_admin());

-- 교사는 본인 줄의 '읽은 시각'과 '지운 시각'만 바꿀 수 있다
revoke update on public.teacher_message_recipients from authenticated;
grant update (read_at, deleted_at) on public.teacher_message_recipients to authenticated;

-- 교사가 지운 메세지는 본문·사진도 더 이상 열 수 없게 한다
create or replace function public.receives_message(mid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_message_recipients r join profiles p on p.id = r.user_id where r.message_id = mid and r.user_id = auth.uid() and r.deleted_at is null and p.active);
$$;

commit;

-- 확인용: hidden_at, deleted_at 두 줄이 보이면 완료
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name in ('hidden_at', 'deleted_at') and table_name like 'teacher_message%';
