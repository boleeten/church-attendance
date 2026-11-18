-- 2026-11-18 담당 교사도 학생의 성별·연락처를 채울 수 있게 한다
-- 교사가 바꿀 수 있는 것: 사진, 생년월일, 성별, 학생 연락처, 보호자 연락처, 보호자 관계
-- 교사가 바꿀 수 없는 것: 이름, 소속 반, 상태 (관리자만)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.

create or replace function public.guard_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  new.name := old.name; new.class_id := old.class_id; new.status := old.status;
  return new;
end $$;

drop trigger if exists guard_student on public.students;
create trigger guard_student before update on public.students for each row execute function public.guard_student();

-- 확인용: 아래 결과에 'gender' 가 없으면 완료
select case when prosrc like '%new.gender%' then '아직 이전 버전 (gender 잠김)' else '완료: 교사가 성별·연락처 수정 가능' end as result
from pg_proc where proname = 'guard_student';
