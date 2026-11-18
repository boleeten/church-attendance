-- 2026-11-18 교사별 메세지 내용 글자 제한을 2,000자 → 5,000자로 늘린다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;
alter table public.teacher_messages drop constraint if exists teacher_messages_body_check;
alter table public.teacher_messages add constraint teacher_messages_body_check check (char_length(body) <= 5000);
commit;

-- 확인용: 결과에 '<= 5000' 이 보이면 완료
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.teacher_messages'::regclass and conname = 'teacher_messages_body_check';
