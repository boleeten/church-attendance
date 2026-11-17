-- 2026-11-17 보안 강화: 관리자가 발급한 '등록된 교사'만 데이터를 읽을 수 있게 한다.
-- 공개 회원가입으로 만든 계정(프로필 없음)이나 비활성 계정은 로그인해도 아무것도 읽지 못한다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

begin;

-- 1) 등록된(활성) 교사인지 확인하는 함수
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

-- 2) 담당 반 확인도 활성 계정일 때만 인정 (비활성화된 교사는 배정이 남아 있어도 학생을 못 봄)
create or replace function public.teaches(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_assignments a join profiles p on p.id = a.user_id where a.user_id = auth.uid() and p.active and a.class_id = cid);
$$;

create or replace function public.teaches_student(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s join teacher_assignments a on a.class_id = s.class_id join profiles p on p.id = a.user_id where s.id = sid and a.user_id = auth.uid() and p.active);
$$;

-- 3) 지금까지 '로그인만 하면 누구나' 읽던 테이블을 등록된 교사 전용으로
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or is_member());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select to authenticated using (is_member());

drop policy if exists assign_read on public.teacher_assignments;
create policy assign_read on public.teacher_assignments for select to authenticated using (is_member());

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select to authenticated using (is_member());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (is_member());

-- 4) 활동 기록도 등록된 교사만 남길 수 있게
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated with check (actor_id = auth.uid()::text and is_member());

commit;

-- 확인용: 아래 결과에 6개 정책이 보이면 적용 완료
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in ('profiles_read', 'classes_read', 'assign_read', 'sessions_read', 'settings_read', 'audit_insert')
order by tablename;
