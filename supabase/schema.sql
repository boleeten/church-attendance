-- 주님의교회 초등부 출석관리 — Supabase 스키마와 권한 정책(RLS)
-- 사용법: Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행한다.
-- 여러 번 실행해도 된다. 로컬 Postgres(PGlite)에서 문법과 역할별 권한을 시험했고, 실제 Supabase 프로젝트 적용은 README의 점검 항목을 확인할 것.

-- ───────── 테이블 ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique,            -- 로그인 아이디. Auth 이메일은 `${login_id}@attendance.local`
  name text not null,
  roles text[] not null default '{teacher}', -- teacher | head | admin | super | owner
  "group" int check ("group" in (1, 2)),
  title text,
  active boolean not null default true,
  must_change_password boolean not null default true,
  push_allowed boolean not null default false,
  admin_scope text
);

create table if not exists public.classes (
  id text primary key,                       -- 예: g1-4-1
  "group" int not null check ("group" in (1, 2)),
  grade int not null check (grade between 4 and 6),
  no int not null,
  capacity int not null default 10,
  unique ("group", grade, no)
);

create table if not exists public.teacher_assignments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  class_id text not null references public.classes (id) on delete cascade,
  kind text not null check (kind in ('담임', '보조')),
  primary key (user_id, class_id, kind)
);

create table if not exists public.students (
  id text primary key,
  name text not null,
  gender text check (gender in ('남', '여')),
  class_id text not null references public.classes (id),
  status text not null default '등록' check (status in ('등록', '장결자', '교회이동', '졸업')),
  phone text not null default '',
  guardian_phone text not null default '',
  guardian_rel text not null default '모',
  photo text  -- 잘라서 줄인 192×192 이미지(data URL). 원본은 저장하지 않는다
);
-- 사진 용량 제한(약 18KB 이하): 무료 한도(DB 500MB) 안에서 관리하기 위한 장치
alter table public.students drop constraint if exists students_photo_size;
alter table public.students add constraint students_photo_size check (photo is null or (photo like 'data:image/%' and length(photo) <= 24000));

-- 같은 주일·같은 학생의 출석은 한 줄만 존재한다(중복 방지). 줄이 없으면 미확인.
create table if not exists public.student_marks (
  date date not null,
  student_id text not null references public.students (id) on delete cascade,
  mark text not null check (mark in ('P', 'A')),
  primary key (date, student_id)
);

create table if not exists public.teacher_marks (
  date date not null,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  mark text not null check (mark in ('P', 'A')),
  primary key (date, teacher_id)
);

-- 출석부 완료 상태. target 은 `class:<반 id>` 또는 `group:<1|2>`
create table if not exists public.sessions (
  date date not null,
  target text not null,
  completed boolean not null default false,
  saved_at timestamptz not null default now(),
  saved_by uuid references public.profiles (id),
  primary key (date, target)
);

create table if not exists public.visit_notes (
  id text primary key,
  student_id text not null references public.students (id) on delete cascade,
  date date not null,
  reason text,
  content text not null default '',
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
-- 최고 관리자의 심방 답변 (이미 만든 DB에도 다시 실행하면 열이 추가된다)
alter table public.visit_notes add column if not exists reply text;
alter table public.visit_notes add column if not exists reply_by uuid references public.profiles (id);
alter table public.visit_notes add column if not exists reply_at timestamptz;

create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  date date not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);
alter table public.notifications add column if not exists link text;

create table if not exists public.notification_logs (
  id text primary key,
  at timestamptz not null default now(),
  mode text not null,
  user_id uuid references public.profiles (id) on delete set null,
  target text not null,
  result text not null
);

create table if not exists public.audit_logs (
  id text primary key,
  at timestamptz not null default now(),
  actor_id text not null,
  type text not null,
  target text not null,
  before text not null default '',
  after text not null default ''
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.push_subscriptions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  primary key (user_id, endpoint)
);

-- ───────── 권한 확인 함수 ─────────
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and r = any (roles));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and roles && array['admin', 'super']);
$$;

create or replace function public.my_group() returns int
language sql stable security definer set search_path = public as $$
  select "group" from profiles where id = auth.uid();
$$;

create or replace function public.teaches(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_assignments where user_id = auth.uid() and class_id = cid);
$$;

create or replace function public.teaches_student(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s join teacher_assignments a on a.class_id = s.class_id where s.id = sid and a.user_id = auth.uid());
$$;

-- ───────── 계정 보호 트리거 ─────────
-- 본인은 알림 허용·비밀번호 변경 플래그만 바꿀 수 있고, 최고 관리자 계정은 목사님(owner)만 바꿀 수 있다.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- 서비스 키(서버)는 통과
  if 'owner' = any (old.roles) and auth.uid() <> old.id then
    raise exception '목사님 계정은 변경할 수 없습니다.';
  end if;
  if 'super' = any (old.roles) and auth.uid() <> old.id and not has_role('owner') then
    raise exception '최고 관리자 계정은 목사님만 변경할 수 있습니다.';
  end if;
  if new.roles is distinct from old.roles and (new.roles && array['super', 'owner'] or old.roles && array['super', 'owner']) and not has_role('owner') then
    raise exception '최고 관리자 권한은 목사님만 부여하거나 해제할 수 있습니다.';
  end if;
  if not is_admin() or (new.roles is distinct from old.roles and not has_role('super')) then
    new.roles := old.roles;
  end if;
  if not is_admin() then
    new.login_id := old.login_id; new.name := old.name; new."group" := old."group";
    new.title := old.title; new.active := old.active; new.admin_scope := old.admin_scope;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- 담당 교사는 학생의 사진만 바꿀 수 있다. 연락처·반·상태는 관리자만.
create or replace function public.guard_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  new.name := old.name; new.gender := old.gender; new.class_id := old.class_id; new.status := old.status;
  new.phone := old.phone; new.guardian_phone := old.guardian_phone; new.guardian_rel := old.guardian_rel;
  return new;
end $$;

drop trigger if exists guard_student on public.students;
create trigger guard_student before update on public.students for each row execute function public.guard_student();

-- 심방 답변은 최고 관리자만 쓰고 고친다. 노트 본문·사유는 작성자(또는 관리자)만 바꾼다.
create or replace function public.guard_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not has_role('super') then new.reply := null; new.reply_by := null; new.reply_at := null; end if;
    return new;
  end if;
  if not has_role('super') then
    new.reply := old.reply; new.reply_by := old.reply_by; new.reply_at := old.reply_at;
  elsif new.reply is distinct from old.reply then
    new.reply_by := case when new.reply is null then null else auth.uid() end;
    new.reply_at := case when new.reply is null then null else now() end;
  end if;
  if old.author_id <> auth.uid() and not is_admin() then
    new.content := old.content; new.reason := old.reason;
  end if;
  new.author_id := old.author_id; new.student_id := old.student_id;
  return new;
end $$;

drop trigger if exists guard_note on public.visit_notes;
create trigger guard_note before insert or update on public.visit_notes for each row execute function public.guard_note();

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.students enable row level security;
alter table public.student_marks enable row level security;
alter table public.teacher_marks enable row level security;
alter table public.sessions enable row level security;
alter table public.visit_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.push_subscriptions enable row level security;

-- 이름·담당 표시를 위해 로그인한 사용자는 프로필·반·배정을 읽을 수 있다.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select to authenticated using (true);
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists assign_read on public.teacher_assignments;
create policy assign_read on public.teacher_assignments for select to authenticated using (true);
drop policy if exists assign_write on public.teacher_assignments;
create policy assign_write on public.teacher_assignments for all to authenticated using (is_admin()) with check (is_admin());

-- 일반 교사는 담당 반 학생만 볼 수 있다.
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated using (is_admin() or teaches(class_id));
drop policy if exists students_insert on public.students;
create policy students_insert on public.students for insert to authenticated with check (is_admin());
drop policy if exists students_update on public.students;
create policy students_update on public.students for update to authenticated using (is_admin() or teaches(class_id)) with check (is_admin() or teaches(class_id));
drop policy if exists students_delete on public.students;
create policy students_delete on public.students for delete to authenticated using (is_admin());

drop policy if exists smarks_all on public.student_marks;
create policy smarks_all on public.student_marks for all to authenticated
  using (is_admin() or teaches_student(student_id)) with check (is_admin() or teaches_student(student_id));

-- 부장교사는 자기 부서 교사만, 교사는 본인 기록만 읽는다.
drop policy if exists tmarks_read on public.teacher_marks;
create policy tmarks_read on public.teacher_marks for select to authenticated
  using (is_admin() or teacher_id = auth.uid() or (has_role('head') and (select "group" from public.profiles p where p.id = teacher_id) = my_group()));
drop policy if exists tmarks_write on public.teacher_marks;
create policy tmarks_write on public.teacher_marks for all to authenticated
  using (is_admin() or (has_role('head') and teacher_id <> auth.uid() and (select "group" from public.profiles p where p.id = teacher_id) = my_group()))
  with check (is_admin() or (has_role('head') and teacher_id <> auth.uid() and (select "group" from public.profiles p where p.id = teacher_id) = my_group()));

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select to authenticated using (true);
drop policy if exists sessions_write on public.sessions;
create policy sessions_write on public.sessions for all to authenticated
  using (is_admin() or (target like 'class:%' and teaches(substr(target, 7))) or (has_role('head') and target = 'group:' || my_group()))
  with check (is_admin() or (target like 'class:%' and teaches(substr(target, 7))) or (has_role('head') and target = 'group:' || my_group()));

drop policy if exists notes_read on public.visit_notes;
create policy notes_read on public.visit_notes for select to authenticated using (is_admin() or teaches_student(student_id));
drop policy if exists notes_insert on public.visit_notes;
create policy notes_insert on public.visit_notes for insert to authenticated with check (author_id = auth.uid() and (is_admin() or teaches_student(student_id)));
drop policy if exists notes_update on public.visit_notes;
create policy notes_update on public.visit_notes for update to authenticated using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());

drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated with check (is_admin());

drop policy if exists nlogs_all on public.notification_logs;
create policy nlogs_all on public.notification_logs for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (is_admin());
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated with check (actor_id = auth.uid()::text);
drop policy if exists audit_update on public.audit_logs;
create policy audit_update on public.audit_logs for update to authenticated using (false);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── 기본 반 편성 (1부 12개 반, 2부 9개 반) ─────────
insert into public.classes (id, "group", grade, no)
select 'g' || g || '-' || gr || '-' || n, g, gr, n
from (values (1), (2)) as groups (g), generate_series(4, 6) as gr, generate_series(1, 4) as n
where n <= case when g = 1 then 4 else 3 end
on conflict do nothing;

-- 학생 상태에 '졸업' 추가 (이미 만든 DB에도 적용되도록 제약을 다시 만든다. 여러 번 실행해도 된다)
alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check check (status in ('등록', '장결자', '교회이동', '졸업'));

-- 학생 성별 추가 (이미 만든 DB에도 적용. 여러 번 실행해도 된다)
alter table public.students add column if not exists gender text;
alter table public.students drop constraint if exists students_gender_check;
alter table public.students add constraint students_gender_check check (gender is null or gender in ('남', '여'));
