import { useSyncExternalStore } from "react";
import { buildSeed, TEMP_PASSWORD } from "./seed";
import { remote, remoteEnabled } from "./remote";
import { fmtDot } from "./date";
import type { AppNotification, AssignKind, ClassRoom, Data, Mark, Note, Role, Student, User } from "./types";

const DATA_KEY = "ca-demo-v4";
const SESSION_KEY = "ca-session";

let data: Data = load();
let userId: string | null = localStorage.getItem(SESSION_KEY);
let version = 0;
const listeners = new Set<() => void>();

/** 알림은 1개월이 지나면 목록에서 뺀다. (DB에서는 매주 서버 작업이 지운다: api/push-reminders.js) */
export function notifCutoff(): number {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}
function pruneNotifications(d: Data): Data {
  const cut = notifCutoff();
  d.notifications = d.notifications.filter((n) => new Date(n.createdAt).getTime() >= cut);
  return d;
}

function load(): Data {
  if (remoteEnabled) return emptyData();
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Data;
      if (d.version === 1) return pruneNotifications(d);
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

// 데모 모드: 같은 브라우저의 다른 탭(예: 관리자 탭)에서 바꾼 내용을 바로 받아온다.
// 이것이 없으면 열려 있던 탭이 옛 데이터를 들고 있다가 다음 저장 때 다른 탭의 변경(답변 등)을 덮어쓴다.
if (!remoteEnabled && typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== DATA_KEY || !e.newValue) return;
    try {
      data = JSON.parse(e.newValue) as Data;
      version++;
      listeners.forEach((l) => l());
    } catch {
      /* 손상된 값은 무시 */
    }
  });

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
    data = pruneNotifications(res.data);
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
    data = pruneNotifications(res.data);
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
  remote.update("profiles", { id: u.id }, stripPw(u));
  audit("비밀번호 변경", u.loginId, "-", "본인 변경");
  emit();
  return null;
}

const stripPw = (u: User) => ({ ...u, password: undefined });

// ───────── 감사 로그 ─────────
export function audit(type: string, target: string, before: string, after: string) {
  const row = { id: uid(), at: now(), actorId: userId ?? "system", type, target, before, after };
  data.audits.unshift(row);
  remote.insert("audit_logs", row);
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

/** 최고 관리자가 심방노트에 답변을 달거나 고친다. 빈 값이면 답변을 지운다. 작성 교사에게 앱 알림이 간다. */
export function replyNote(id: string, text: string | null): string | null {
  const me = data.users.find((u) => u.id === userId);
  if (!me?.roles.includes("super")) return "심방 답변은 최고 관리자만 작성할 수 있습니다.";
  const n = data.notes.find((x) => x.id === id);
  if (!n) return "심방노트를 찾을 수 없습니다.";
  const body = text?.trim() || null;
  const edited = !!n.reply;
  n.reply = body;
  n.replyBy = body ? me.id : null;
  n.replyAt = body ? now() : null;
  remote.update("visit_notes", { id: n.id }, { reply: n.reply, replyBy: n.replyBy, replyAt: n.replyAt });
  const author = data.users.find((u) => u.id === n.authorId);
  const s = data.students.find((x) => x.id === n.studentId);
  if (body && author && author.active && author.id !== me.id) {
    const row: AppNotification = {
      id: uid(),
      userId: author.id,
      kind: "reply",
      title: edited ? "심방 답변이 수정되었습니다" : "심방노트에 답변이 왔습니다",
      body: `[${s?.name ?? "학생"}] ${me.title ?? me.name}: ${body.length > 60 ? body.slice(0, 60) + "…" : body}`,
      date: n.date,
      createdAt: now(),
      read: false,
      link: `/t/students/${n.studentId}#note-${n.id}`,
    };
    data.notifications.unshift(row);
    remote.insert("notifications", row);
    // 노트를 쓴 교사의 휴대폰으로도 푸시 (알림을 허용한 기기만). 실패해도 앱 안 알림 목록에는 남는다.
    if (remoteEnabled) void remote.api("push-reminders", "POST", { reply: n.id, text: body, edited });
  }
  audit(body ? (edited ? "심방 답변 수정" : "심방 답변") : "심방 답변 삭제", `${s?.name ?? "-"} · ${fmtDot(n.date)} 심방노트`, edited ? "답변 있음" : "-", body ? "답변 등록" : "삭제");
  emit();
  return null;
}

// ───────── 알림 ─────────
export function markRead(id: string) {
  const n = data.notifications.find((x) => x.id === id);
  if (!n || n.read) return;
  n.read = true;
  remote.update("notifications", { id: n.id }, { read: true });
  emit();
}

export function markAllRead() {
  const mine = data.notifications.filter((n) => n.userId === userId && !n.read);
  mine.forEach((n) => {
    n.read = true;
    remote.update("notifications", { id: n.id }, { read: true });
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
  if (count) {
    void remote.pushReminders({ date, classId });
    emit();
  }
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
  if (count) {
    void remote.pushReminders({ date, classId: "-", teachers: true }); // "-": 학생 반은 건너뛰고 부장교사에게만
    emit();
  }
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
    if (cur.status !== s.status) audit("학생 상태", s.name, cur.status, s.status);
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
  return data.students.filter((s) => s.classId === classId && s.status === "등록").length;
}

export function moveStudents(ids: string[], classId: string): string | null {
  const c = data.classes.find((x) => x.id === classId);
  if (!c) return "반을 선택해 주세요.";
  const moving = data.students.filter((s) => ids.includes(s.id) && s.classId !== classId);
  if (classCount(classId) + moving.filter((s) => s.status === "등록").length > c.capacity) return `${classLabel(c)}의 정원(${c.capacity}명)을 초과합니다.`;
  for (const s of moving) {
    const from = data.classes.find((x) => x.id === s.classId);
    audit("반 이동", s.name, from ? classLabel(from) : "-", classLabel(c));
    s.classId = classId;
    remote.upsert("students", s);
  }
  emit();
  return null;
}

/** 사진은 잘라서 줄인 작은 이미지(약 12KB 이하)만 받는다. 학생당 1장이며 바꾸면 이전 사진은 덮어쓴다. */
export const PHOTO_LIMIT_CHARS = 24000;

export function setStudentPhoto(id: string, photo: string | null): string | null {
  const s = data.students.find((x) => x.id === id);
  if (!s) return "학생을 찾을 수 없습니다.";
  if (photo && (!photo.startsWith("data:image/") || photo.length > PHOTO_LIMIT_CHARS)) return "사진 용량이 너무 큽니다. 다시 시도해 주세요.";
  s.photo = photo ?? undefined;
  remote.update("students", { id: s.id }, { photo });
  emit();
  return null;
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

/** 반 삭제. 이 반에 소속된 학생(장결자·교회이동 포함)이 있으면 지우지 않는다. 담당 교사 배정과 출석부 완료 기록도 함께 지운다. */
export function deleteClass(classId: string): string | null {
  const c = data.classes.find((x) => x.id === classId);
  if (!c) return "반을 찾을 수 없습니다.";
  const members = data.students.filter((s) => s.classId === classId);
  if (members.length) return `${classLabel(c)}에 학생 ${members.length}명이 있어 삭제할 수 없습니다. 먼저 학생을 다른 반으로 이동해 주세요.`;
  const teachers = data.assignments.filter((a) => a.classId === classId).map((a) => data.users.find((u) => u.id === a.userId)?.name).filter(Boolean);
  data.assignments = data.assignments.filter((a) => a.classId !== classId);
  for (const key of Object.keys(data.sessions)) if (key.endsWith(`|class:${classId}`)) delete data.sessions[key];
  data.classes = data.classes.filter((x) => x.id !== classId);
  remote.remove("teacher_assignments", { classId });
  remote.remove("sessions", { target: `class:${classId}` });
  remote.remove("classes", { id: classId });
  audit("반 삭제", classLabel(c), teachers.length ? `배정 교사: ${teachers.join(", ")}` : "배정 교사 없음", "삭제");
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

export async function upsertUser(u: Partial<User> & { name: string; loginId: string; roles: Role[]; group: 1 | 2 | null }): Promise<string | { tempPassword: string } | null> {
  if (u.id) {
    const cur = data.users.find((x) => x.id === u.id)!;
    if (data.users.some((x) => x.loginId === u.loginId && x.id !== u.id)) return "이미 사용 중인 아이디입니다.";
    const before = cur.roles.join(",");
    Object.assign(cur, u);
    if (before !== cur.roles.join(",")) audit("권한 변경", cur.name, before, cur.roles.join(","));
    remote.update("profiles", { id: cur.id }, stripPw(cur));
    emit();
    return null;
  }
  if (data.users.some((x) => x.loginId === u.loginId)) return "이미 사용 중인 아이디입니다.";
  if (remoteEnabled) {
    const r = await remote.adminUsers<{ user: Record<string, unknown>; tempPassword: string }>({ action: "create", loginId: u.loginId, name: u.name, group: u.group, roles: u.roles });
    if (typeof r === "string") return r;
    const p = r.user;
    data.users.push({ id: String(p.id), loginId: String(p.login_id), name: String(p.name), roles: p.roles as Role[], group: (p.group as 1 | 2 | null) ?? null, password: "", active: true, mustChangePassword: true, pushAllowed: false });
    audit("계정 등록", `${u.name} (${u.loginId})`, "-", "임시 비밀번호 발급");
    emit();
    return { tempPassword: r.tempPassword };
  }
  const row: User = { password: TEMP_PASSWORD, active: true, mustChangePassword: true, pushAllowed: false, ...u, id: "u_" + uid() } as User;
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

/** 계정 삭제 권한: 계정 총괄(owner)이거나, 계정 총괄이 지정한 사람(관리자 계정 관리 → 계정 삭제 권한) */
export function canDeleteAccounts(actor: User): boolean {
  return actor.roles.includes("owner") || (data.settings.accountDeleters ?? []).includes(actor.id);
}

/** 이 계정에 남아 있는 기록. 하나라도 있으면 삭제 대신 비활성화해야 한다. */
export function accountRecords(userId: string): string[] {
  const out: string[] = [];
  if (!userId) return out;
  const marks = Object.keys(data.teacherMarks).filter((k) => k.endsWith(`|${userId}`)).length;
  if (marks) out.push(`교사 출석 기록 ${marks}건`);
  const notes = data.notes.filter((n) => n.authorId === userId || (!!n.replyBy && n.replyBy === userId)).length;
  if (notes) out.push(`심방노트·답변 ${notes}건`);
  const saved = Object.values(data.sessions).filter((x) => x.savedBy === userId).length;
  if (saved) out.push(`출석부 저장 ${saved}건`);
  return out;
}

/** 계정 완전 삭제. 기록이 없는 계정(시험·잘못 만든 계정)만 지울 수 있다. */
export async function deleteAccount(targetId: string): Promise<string | null> {
  const actor = me();
  const t = data.users.find((x) => x.id === targetId);
  if (!actor || !t) return "대상을 찾을 수 없습니다.";
  if (!canDeleteAccounts(actor)) return "계정 삭제 권한이 없습니다.";
  if (t.roles.includes("owner") || t.id === actor.id) return "이 계정은 삭제할 수 없습니다.";
  if (t.roles.includes("super") && !actor.roles.includes("super")) return "최고 관리자 계정은 최고 관리자만 삭제할 수 있습니다.";
  const recs = accountRecords(t.id);
  if (recs.length) return `${t.name} 계정에 기록(${recs.join(", ")})이 있어 삭제할 수 없습니다. 비활성화를 사용해 주세요.`;
  if (remoteEnabled) {
    const r = await remote.adminUsers<{ ok: boolean }>({ action: "delete", userId: t.id });
    if (typeof r === "string") return r;
  }
  data.users = data.users.filter((x) => x.id !== t.id);
  data.assignments = data.assignments.filter((a) => a.userId !== t.id);
  data.notifications = data.notifications.filter((n) => n.userId !== t.id);
  if (data.settings.accountDeleters?.includes(t.id)) data.settings.accountDeleters = data.settings.accountDeleters.filter((x) => x !== t.id);
  audit("계정 삭제", `${t.name} (${t.loginId})`, t.roles.join(","), "삭제");
  emit();
  return null;
}

export async function resetPassword(targetId: string): Promise<string | { tempPassword: string }> {
  const actor = me();
  const t = data.users.find((x) => x.id === targetId);
  if (!actor || !t) return "대상을 찾을 수 없습니다.";
  if (!canResetPassword(actor, t)) return "이 계정의 비밀번호를 초기화할 권한이 없습니다.";
  if (remoteEnabled) {
    const r = await remote.adminUsers<{ tempPassword: string }>({ action: "reset", userId: t.id });
    if (typeof r === "string") return r;
    t.mustChangePassword = true;
    audit("비밀번호 초기화", t.loginId, "-", "임시 비밀번호 발급");
    emit();
    return { tempPassword: r.tempPassword };
  }
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
  remote.update("profiles", { id: t.id }, stripPw(t));
  audit(active ? "계정 활성화" : "계정 비활성화", `${t.name} (${t.loginId})`, active ? "비활성" : "활성", active ? "활성" : "비활성");
  emit();
  return null;
}

export function setPushAllowed(allowed: boolean) {
  const u = me();
  if (!u || u.pushAllowed === allowed) return;
  u.pushAllowed = allowed;
  remote.update("profiles", { id: u.id }, stripPw(u));
  emit();
}

// ───────── 설정·운영 ─────────
export function updateSettings(patch: Partial<Data["settings"]>) {
  Object.assign(data.settings, patch);
  remote.upsert("settings", { id: 1, data: data.settings });
  emit();
}

export function promoteGrades(): number {
  let n = 0;
  for (const s of data.students) {
    if (s.status !== "등록") continue;
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
