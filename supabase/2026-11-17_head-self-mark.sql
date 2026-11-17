-- 2026-11-17 부장교사가 교사 출석부에서 본인 출석도 체크할 수 있게 한다.
-- 지금까지는 부장교사가 자기 부서 교사만 체크할 수 있었고, 본인 기록은 관리자만 입력할 수 있었다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;

drop policy if exists tmarks_write on public.teacher_marks;
create policy tmarks_write on public.teacher_marks for all to authenticated
  using (is_admin() or (has_role('head') and (select "group" from public.profiles p where p.id = teacher_id) = my_group()))
  with check (is_admin() or (has_role('head') and (select "group" from public.profiles p where p.id = teacher_id) = my_group()));

commit;

-- 확인용: with_check 에 'teacher_id <> auth.uid()' 가 없으면 적용 완료
select policyname, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'teacher_marks' and policyname = 'tmarks_write';
