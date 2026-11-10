import { useSyncExternalStore } from "react";
import { buildSeed, TEMP_PASSWORD } from "./seed";
import { remote, remoteEnabled } from "./remote";
import type { AppNotification, AssignKind, ClassRoom, Data, Mark, Note, Role, Student, User } from "./types";

const DATA_KEY = "ca-demo-v2";
const SESSION_KEY = "ca-session";

let data: Data = load();
let userId: string | null = localStorage.getItem(SESSION_KEY);
let version = 0;
const listeners = new Set<() => void>();

function load(): Data {
  if (remoteEnabled) return emptyData();
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Data;
      if (d.version === 1) return d;
    }
  } catch {
    /* 손상된 저장값은 무시하고 새로 만든다 */
  }
  const d = buildSeed();
  persist(d);
  return d;
}

function emptyData(): Data {
  const s = buildSeed();
  return { ...s, users: [], classes: [], assignments: [], students: [], studentMarks: {}, teacherMarks: {}, sessions: {}, notes: [], notifications: [], notifLogs: [], audits: [] };
}

function persist(d: Data) {
  if (remoteEnabled) return;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(d));
  } catch {
    /* 저장 공간이 부족해도 화면은 계속 동작한다 */
  }
}

function emit() {
  version++;
  persist(data);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 데이터가 바뀔 때마다 다시 그리는 훅 */
export function useData(): Data {
  useSyncExternalStore(subscribe, () => version);
  return data;
}

export function useMe(): User | null {
  useSyncExternalStore(subscribe, () => version);
  return data.users.find((u) => u.id === userId) ?? null;
}

export const getData = () => data;
export const me = () => data.users.find((u) => u.id === userId) ?? null;
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

// ───────── 인증 ─────────
export async function login(loginId: string, password: string): Promise<string | null> {
  if (remoteEnabled) {
    const res = await remote.signIn(loginId.trim(), password);
    if (typeof res === "string") return res;
    data = res.data;
    userId = res.userId;
    localStorage.setItem(SESSION_KEY, userId);
    emit();
    return null;
  }
  const u = data.users.find((x) => x.loginId === loginId.trim());
  if (!u || u.password !== password) return "아이디 또는 비밀번호가 올바르지 않습니다.";
  if (!u.active) return "비활성화된 계정입니다. 관리자에게 문의해 주세요.";
  userId = u.id;
  localStorage.setItem(SESSION_KEY, u.id);
  emit();
  return null;
}

/** Supabase 모드에서 새로고침 후 세션 복구 */
export async function restoreSession(): Promise<void> {
  if (!remoteEnabled) return;
  const res = await remote.restore();
  if (res) {
    data = res.data;
    userId = res.userId;
  } else {
    userId = null;
    localStorage.removeItem(SESSION_KEY);
  }
  emit();
}

export function logout() {
  userId = null;
  localStorage.removeItem(SESSION_KEY);
  if (remoteEnabled) void remote.signOut();
  emit();
}

export function passwordRules(pw: string, confirm: string, current: string) {
  return [
    { label: "8자 이상", ok: pw.length >= 8 },
    { label: "영문과 숫자 포함", ok: /[A-Za-z]/.test(pw) && /\d/.test(pw) },
    { label: "현재 비밀번호와 다르게 설정", ok: pw.length > 0 && pw !== current },
    { label: "새 비밀번호 확인 일치", ok: pw.length > 0 && pw === confirm },
  ];
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  const u = me();
  if (!u) return "로그인이 필요합니다.";
  if (remoteEnabled) {
    const err = await remote.changePassword(u, current, next);
    if (err) return err;
  } else if (u.password !== current) return "현재 비밀번호가 올바르지 않습니다.";
  u.password = remoteEnabled ? "" : next;
  u.mustChangePassword = false;
  remote.upsert("profiles", stripPw(u));
  audit("비밀번호 변경", u.loginId, "-", "본인 변경");
  emit();
  return null;
}

const stripPw = (u: User) => ({ ...u, password: undefined });

// ───────── 감사 로그 ─────────
export function audit(type: string, target: string, before: string, after: string) {
  const row = { id: uid(), at: now(), actorId: userId ?? "system", type, target, before, after };
  data.audits.unshift(row);
  remote.upsert("audit_logs", row);
}

// ───────── 출석 ─────────
const markLabel = (m: Mark | undefined) => (m === "P" ? "출석" : m === "A" ? "결석" : "미확인");

export function setStudentMark(date: string, studentId: string, mark: Mark | null) {
  const key = `${date}|${studentId}`;
  const before = data.studentMarks[key];
  if (before === (mark ?? undefined)) return;
  if (mark) data.studentMarks[key] = mark;
  else delete data.studentMarks[key];
  if (mark) remote.upsert("student_marks", { date, studentId, mark });
  else remote.remove("student_marks", { date, studentId });
  const s = data.students.find((x) => x.id === studentId);
  audit("학생 출석", `${s?.name ?? studentId} · ${date.slice(5).replace("-", "/")} 출석부`, markLabel(before), markLabel(mark ?? undefined));
  emit();
}

export function setTeacherMark(date: string, teacherId: string, mark: Mark | null) {
  const key = `${date}|${teacherId}`;
  const before = data.teacherMarks[key];
  if (before === (mark ?? undefined)) return;
  if (mark) data.teacherMarks[key] = mark;
  else delete data.teacherMarks[key];
  if (mark) remote.upsert("teacher_marks", { date, teacherId, mark });
  else remote.remove("teacher_marks", { date, teacherId });
  const t = data.users.find((x) => x.id === teacherId);
  audit("교사 출석", `${t?.name ?? teacherId} · ${date.slice(5).replace("-", "/")} 출석부`, markLabel(before), markLabel(mark ?? undefined));
  emit();
}

/** target: `class:${id}` 또는 `group:${n}` */
export function saveSession(date: string, target: string, completed: boolean) {
  const row = { completed, savedAt: now(), savedBy: userId ?? "system" };
  data.sessions[`${date}|${target}`] = row;
  remote.upsert("sessions", { date, target, ...row });
  emit();
}

// ───────── 심방노트 ─────────
export function addNote(studentId: string, date: string, reason: string | null, content: string) {
  const note: Note = { id: uid(), studentId, date, reason, content: content.trim(), authorId: userId ?? "system", createdAt: now() };
  data.notes.unshift(note);
  remote.upsert("visit_notes", note);
  emit();
}

export function updateNote(id: string, reason: string | null, content: string) {
  const n = data.notes.find((x) => x.id === id);
  if (!n) return;
  n.reason = reason;
  n.content = content.trim();
  remote.upsert("visit_notes", n);
  emit();
}

// ───────── 알림 ─────────
export function markRead(id: string) {
  const n = data.notifications.find((x) => x.id === id);
  if (!n || n.read) return;
  n.read = true;
  remote.upsert("notifications", n);
  emit();
}

export function markAllRead() {
  const mine = data.notifications.filter((n) => n.userId === userId && !n.read);
  mine.forEach((n) => {
    n.read = true;
    remote.upsert("notifications", n);
  });
  if (mine.length) emit();
}

function pushNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">, mode: "자동" | "수동", target: string) {
  const row: AppNotification = { ...n, id: uid(), createdAt: now(), read: false };
  data.notifications.unshift(row);
  remote.upsert("notifications", row);
  const user = data.users.find((u) => u.id === n.userId);
  const log = { id: uid(), at: now(), mode, userId: n.userId, target, result: (user?.pushAllowed ? "성공" : "권한 미허용") as "성공" | "권한 미허용" };
  data.notifLogs.unshift(log);
  remote.upsert("notification_logs", log);
}

export const classLabel = (c: ClassRoom) => `${c.group}부 ${c.grade}학년 ${c.no}반`;
export const classShort = (c: ClassRoom) => `${c.grade}-${c.no}반`;

/** 해당 주일 출석이 미완료인 반의 담당 교사에게 앱 알림을 보낸다. classId를 주면 그 반만. */
export function sendStudentReminders(date: string, classId?: string): number {
  let count = 0;
  for (const c of data.classes) {
    if (classId && c.id !== classId) continue;
    if (data.sessions[`${date}|class:${c.id}`]?.completed) continue;
    for (const a of data.assignments.filter((x) => x.classId === c.id && x.kind === "담임")) {
      pushNotification(
        { userId: a.userId, kind: "student", title: "주일 출석체크 안내 (재발송)", body: `${classLabel(c)}의 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.`, date },
        "수동",
        classLabel(c),
      );
      count++;
    }
  }
  if (count) emit();
  return count;
}

export function sendTeacherReminders(date: string): number {
  let count = 0;
  for (const g of [1, 2] as const) {
    if (data.sessions[`${date}|group:${g}`]?.completed) continue;
    for (const h of data.users.filter((u) => u.roles.includes("head") && u.group === g && u.active)) {
      pushNotification({ userId: h.id, kind: "teacher", title: "교사 출석체크 안내 (재발송)", body: `${g}부 교사 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.`, date }, "수동", `${g}부 교사`);
      count++;
    }
  }
  if (count) emit();
  return count;
}

// ───────── 학생 ─────────
export function upsertStudent(s: Omit<Student, "id"> & { id?: string }) {
  const cls = (id: string) => {
    const c = data.classes.find((x) => x.id === id);
    return c ? classLabel(c) : "-";
  };
  if (s.id) {
    const cur = data.students.find((x) => x.id === s.id)!;
    if (cur.classId !== s.classId) audit("반 이동", s.name, cls(cur.classId), cls(s.classId));
    if (cur.status !== s.status) audit("재적 상태", s.name, cur.status, s.status);
    Object.assign(cur, s);
    remote.upsert("students", cur);
  } else {
    const row: Student = { ...s, id: "s" + uid() };
    data.students.push(row);
    remote.upsert("students", row);
    audit("학생 등록", s.name, "-", cls(s.classId));
  }
  emit();
}

export function classCount(classId: string) {
  return data.students.filter((s) => s.classId === classId && s.status === "재적").length;
}

export function moveStudents(ids: string[], classId: string): string | null {
  const c = data.classes.find((x) => x.id === classId);
  if (!c) return "반을 선택해 주세요.";
  const moving = data.students.filter((s) => ids.includes(s.id) && s.classId !== classId);
  if (classCount(classId) + moving.filter((s) => s.status === "재적").length > c.capacity) return `${classLabel(c)}의 정원(${c.capacity}명)을 초과합니다.`;
  for (const s of moving) {
    const from = data.classes.find((x) => x.id === s.classId);
    audit("반 이동", s.name, from ? classLabel(from) : "-", classLabel(c));
    s.classId = classId;
    remote.upsert("students", s);
  }
  emit();
  return null;
}

export function setStudentPhoto(id: string, photo: string) {
  const s = data.students.find((x) => x.id === id);
  if (!s) return;
  s.photo = photo;
  remote.upsert("students", s);
  emit();
}

// ───────── 반·교사 ─────────
export function addClass(group: 1 | 2, grade: number): string | null {
  const nos = data.classes.filter((c) => c.group === group && c.grade === grade).map((c) => c.no);
  const no = Math.max(0, ...nos) + 1;
  const row: ClassRoom = { id: `g${group}-${grade}-${no}`, group, grade, no, capacity: 10 };
  data.classes.push(row);
  data.classes.sort((a, b) => a.group - b.group || a.grade - b.grade || a.no - b.no);
  remote.upsert("classes", row);
  audit("반 추가", classLabel(row), "-", "정원 10명");
  emit();
  return null;
}

export function setAssignment(classId: string, kind: AssignKind, userIds: string[]) {
  const c = data.classes.find((x) => x.id === classId)!;
  const name = (ids: string[]) => ids.map((i) => data.users.find((u) => u.id === i)?.name).join(", ") || "미배정";
  const before = data.assignments.filter((a) => a.classId === classId && a.kind === kind).map((a) => a.userId);
  data.assignments = data.assignments.filter((a) => !(a.classId === classId && a.kind === kind));
  remote.remove("teacher_assignments", { classId, kind });
  for (const userId of userIds) {
    const row = { userId, classId, kind };
    data.assignments.push(row);
    remote.upsert("teacher_assignments", row);
  }
  audit("교사 배정", `${classLabel(c)} ${kind}`, name(before), name(userIds));
  emit();
}

export function upsertUser(u: Partial<User> & { name: string; loginId: string; roles: Role[]; group: 1 | 2 | null }): string | { tempPassword: string } | null {
  if (u.id) {
    const cur = data.users.find((x) => x.id === u.id)!;
    if (data.users.some((x) => x.loginId === u.loginId && x.id !== u.id)) return "이미 사용 중인 아이디입니다.";
    const before = cur.roles.join(",");
    Object.assign(cur, u);
    if (before !== cur.roles.join(",")) audit("권한 변경", cur.name, before, cur.roles.join(","));
    remote.upsert("profiles", stripPw(cur));
    emit();
    return null;
  }
  if (remoteEnabled) return "실제 DB 모드에서는 계정 생성이 서버 함수(Edge Function)를 통해 이뤄져야 합니다. README의 안내를 확인해 주세요.";
  if (data.users.some((x) => x.loginId === u.loginId)) return "이미 사용 중인 아이디입니다.";
  const row: User = { id: "u_" + uid(), password: TEMP_PASSWORD, active: true, mustChangePassword: true, pushAllowed: false, ...u } as User;
  data.users.push(row);
  audit("계정 등록", `${row.name} (${row.loginId})`, "-", "임시 비밀번호 발급");
  emit();
  return { tempPassword: TEMP_PASSWORD };
}

/** 권한 규칙: 목사님 계정은 누구도 초기화할 수 없고, 최고 관리자 계정은 최고 관리자만 초기화할 수 있다. */
export function canResetPassword(actor: User, target: User): boolean {
  if (target.roles.includes("owner")) return false;
  if (target.id === actor.id) return false;
  if (target.roles.includes("super")) return actor.roles.includes("super");
  return actor.roles.includes("super") || actor.roles.includes("admin");
}

/** 최고 관리자 계정의 정보·권한·활성 상태는 목사님만 바꿀 수 있다. */
export function canManageAccount(actor: User, target: User): boolean {
  if (target.roles.includes("owner")) return false;
  if (target.roles.includes("super")) return actor.roles.includes("owner");
  if (target.roles.includes("admin")) return actor.roles.includes("super");
  return actor.roles.includes("super") || actor.roles.includes("admin");
}

export function resetPassword(targetId: string): string | { tempPassword: string } {
  const actor = me();
  const t = data.users.find((x) => x.id === targetId);
  if (!actor || !t) return "대상을 찾을 수 없습니다.";
  if (!canResetPassword(actor, t)) return "이 계정의 비밀번호를 초기화할 권한이 없습니다.";
  if (remoteEnabled) return "실제 DB 모드에서는 비밀번호 초기화가 서버 함수(Edge Function)를 통해 이뤄져야 합니다. README의 안내를 확인해 주세요.";
  const temp = "tmp" + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);
  t.password = temp;
  t.mustChangePassword = true;
  audit("비밀번호 초기화", t.loginId, "-", "임시 비밀번호 발급");
  emit();
  return { tempPassword: temp };
}

export function setUserActive(targetId: string, active: boolean): string | null {
  const actor = me();
  const t = data.users.find((x) => x.id === targetId);
  if (!actor || !t) return "대상을 찾을 수 없습니다.";
  if (!canManageAccount(actor, t)) return "이 계정을 변경할 권한이 없습니다.";
  t.active = active;
  remote.upsert("profiles", stripPw(t));
  audit(active ? "계정 활성화" : "계정 비활성화", `${t.name} (${t.loginId})`, active ? "비활성" : "활성", active ? "활성" : "비활성");
  emit();
  return null;
}

export function setPushAllowed(allowed: boolean) {
  const u = me();
  if (!u || u.pushAllowed === allowed) return;
  u.pushAllowed = allowed;
  remote.upsert("profiles", stripPw(u));
  emit();
}

// ───────── 설정·운영 ─────────
export function updateSettings(patch: Partial<Data["settings"]>) {
  Object.assign(data.settings, patch);
  remote.upsert("settings", { id: 1, data: data.settings });
  emit();
}

export function graduateSixth(): number {
  const ids = new Set(data.classes.filter((c) => c.grade === 6).map((c) => c.id));
  const list = data.students.filter((s) => ids.has(s.classId) && s.status === "재적");
  list.forEach((s) => {
    s.status = "졸업";
    remote.upsert("students", s);
  });
  audit("졸업 처리", `6학년 ${list.length}명`, "재적", "졸업");
  emit();
  return list.length;
}

export function promoteGrades(): number {
  let n = 0;
  for (const s of data.students) {
    if (s.status !== "재적") continue;
    const c = data.classes.find((x) => x.id === s.classId);
    if (!c || c.grade >= 6) continue;
    const next = data.classes.find((x) => x.group === c.group && x.grade === c.grade + 1 && x.no === c.no) ?? data.classes.find((x) => x.group === c.group && x.grade === c.grade + 1);
    if (!next) continue;
    s.classId = next.id;
    remote.upsert("students", s);
    n++;
  }
  audit("진급 처리", `4·5학년 ${n}명`, "현재 학년", "다음 학년");
  emit();
  return n;
}

export function exportBackup(): string {
  updateSettings({ lastBackup: now() });
  return JSON.stringify(data);
}

export function importBackup(json: string): string | null {
  if (remoteEnabled) return "실제 DB 모드에서는 Supabase 대시보드의 백업 기능을 사용해 주세요.";
  try {
    const d = JSON.parse(json) as Data;
    if (d.version !== 1 || !Array.isArray(d.students)) return "출석관리 백업 파일이 아닙니다.";
    data = d;
    audit("백업 복구", "전체 데이터", "-", "복구 완료");
    emit();
    return null;
  } catch {
    return "파일을 읽을 수 없습니다.";
  }
}

export function resetDemo() {
  data = buildSeed();
  userId = null;
  localStorage.removeItem(SESSION_KEY);
  emit();
}
