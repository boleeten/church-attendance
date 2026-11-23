-- 2026-11-23 심방노트 대화 (목사님 답변 ↔ 교사 답글)
-- · 심방노트 하나 아래에 목사님(최고 관리자)과 교사의 글이 시간순으로 이어진다.
-- · 쓸 수 있는 사람: 최고 관리자, 그 학생 반을 맡은 교사. 볼 수 있는 사람: 관리자 전체, 그 학생 반 교사.
-- · 각자 자기가 쓴 글만 고치거나 지울 수 있다.
-- · 지금까지의 답변(visit_notes.reply)은 대화의 첫 글로 옮기고 원래 칸은 비운다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;

create table if not exists public.note_comments (
  id text primary key,
  note_id text not null references public.visit_notes (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists note_comments_note_idx on public.note_comments (note_id, created_at);
alter table public.note_comments enable row level security;

-- 그 심방노트를 볼 수 있는 사람인지 (관리자 또는 그 학생 반 교사)
create or replace function public.sees_note(nid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from visit_notes n where n.id = nid and teaches_student(n.student_id));
$$;

drop policy if exists ncom_read on public.note_comments;
create policy ncom_read on public.note_comments for select to authenticated using (sees_note(note_id));
drop policy if exists ncom_insert on public.note_comments;
create policy ncom_insert on public.note_comments for insert to authenticated
  with check (author_id = auth.uid() and is_member() and (has_role('super') or exists (select 1 from visit_notes n where n.id = note_id and teaches_student(n.student_id))));
drop policy if exists ncom_update on public.note_comments;
create policy ncom_update on public.note_comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists ncom_delete on public.note_comments;
create policy ncom_delete on public.note_comments for delete to authenticated using (author_id = auth.uid());

-- 지금까지의 답변을 대화 첫 글로 옮긴다 (이미 옮긴 것은 건너뜀)
insert into public.note_comments (id, note_id, author_id, body, created_at)
select 'r-' || n.id, n.id, n.reply_by, n.reply, coalesce(n.reply_at, n.created_at)
from public.visit_notes n
where n.reply is not null and n.reply_by is not null
on conflict (id) do nothing;
update public.visit_notes set reply = null, reply_by = null, reply_at = null
where reply is not null and exists (select 1 from public.note_comments c where c.id = 'r-' || visit_notes.id);

commit;

-- 확인용: 표가 있고, 옮긴 답변 수가 보이면 완료
select count(*) as "대화 글 수", count(*) filter (where id like 'r-%') as "옮긴 기존 답변" from public.note_comments;
