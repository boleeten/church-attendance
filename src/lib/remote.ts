// Supabase 연동. 환경 변수가 없으면 모든 함수가 아무 일도 하지 않고, 앱은 데모 모드로 동작한다.
// 로그인 아이디는 Supabase Auth의 이메일 `${아이디}@attendance.local` 로 매핑한다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSeed } from "./seed";
import type { Data, Mark, User } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const remoteEnabled = Boolean(url && key);
const sb: SupabaseClient | null = remoteEnabled ? createClient(url!, key!) : null;

const EMAIL_DOMAIN = "attendance.local";
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (o: Record<string, unknown>, f: (k: string) => string) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [f(k), v]));

export function toast(message: string, kind: "info" | "error" = "info") {
  window.dispatchEvent(new CustomEvent("ca-toast", { detail: { message, kind } }));
}

const fail = (table: string, message: string) => toast(`저장 실패 (${table}): ${message}`, "error");

async function fetchAll<T>(table: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb!.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []).map((r) => mapKeys(r, camel) as T));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadAll(): Promise<Data> {
  const base = buildSeed();
  const [profiles, classes, assignments, students, sMarks, tMarks, sessions, notes, notifications, notifLogs, audits, settings] = await Promise.all([
    fetchAll<User>("profiles"),
    fetchAll<Data["classes"][number]>("classes"),
    fetchAll<Data["assignments"][number]>("teacher_assignments"),
    fetchAll<Data["students"][number]>("students"),
    fetchAll<{ date: string; studentId: string; mark: Mark }>("student_marks"),
    fetchAll<{ date: string; teacherId: string; mark: Mark }>("teacher_marks"),
    fetchAll<{ date: string; target: string; completed: boolean; savedAt: string; savedBy: string }>("sessions"),
    fetchAll<Data["notes"][number]>("visit_notes"),
    fetchAll<Data["notifications"][number]>("notifications"),
    fetchAll<Data["notifLogs"][number]>("notification_logs"),
    fetchAll<Data["audits"][number]>("audit_logs"),
    fetchAll<{ id: number; data: Data["settings"] }>("settings"),
  ]);
  const desc = <T,>(list: T[], k: keyof T) => list.sort((a, b) => String(b[k]).localeCompare(String(a[k])));
  return {
    version: 1,
    users: profiles.map((p) => ({ ...p, password: "" })),
    classes: classes.sort((a, b) => a.group - b.group || a.grade - b.grade || a.no - b.no),
    assignments,
    students,
    studentMarks: Object.fromEntries(sMarks.map((m) => [`${m.date}|${m.studentId}`, m.mark])),
    teacherMarks: Object.fromEntries(tMarks.map((m) => [`${m.date}|${m.teacherId}`, m.mark])),
    sessions: Object.fromEntries(sessions.map((s) => [`${s.date}|${s.target}`, { completed: s.completed, savedAt: s.savedAt, savedBy: s.savedBy }])),
    notes: desc(notes, "createdAt"),
    notifications: desc(notifications, "createdAt"),
    notifLogs: desc(notifLogs, "at"),
    audits: desc(audits, "at"),
    settings: { ...base.settings, ...(settings[0]?.data ?? {}) },
  };
}

export const remote = {
  upsert(table: string, row: object) {
    if (!sb) return;
    sb.from(table)
      .upsert(mapKeys(row as Record<string, unknown>, snake))
      .then(({ error }) => error && fail(table, error.message));
  },
  /** 새 줄만 추가한다. 본인이 읽을 권한이 없는 테이블(감사 로그)은 upsert 대신 이것을 쓴다. */
  insert(table: string, row: object) {
    if (!sb) return;
    sb.from(table)
      .insert(mapKeys(row as Record<string, unknown>, snake))
      .then(({ error }) => error && fail(table, error.message));
  },
  /** 이미 있는 줄을 고친다. 추가 권한이 없는 사용자(교사의 프로필·알림·학생 사진)는 upsert 대신 이것을 쓴다. */
  update(table: string, match: Record<string, unknown>, row: object) {
    if (!sb) return;
    sb.from(table)
      .update(mapKeys(row as Record<string, unknown>, snake))
      .match(mapKeys(match, snake))
      .then(({ error }) => error && fail(table, error.message));
  },
  remove(table: string, match: Record<string, unknown>) {
    if (!sb) return;
    sb.from(table)
      .delete()
      .match(mapKeys(match, snake))
      .then(({ error }) => error && fail(table, error.message));
  },
  async signIn(loginId: string, password: string): Promise<string | { userId: string; data: Data }> {
    const { data, error } = await sb!.auth.signInWithPassword({ email: `${loginId}@${EMAIL_DOMAIN}`, password });
    if (error || !data.user) return "아이디 또는 비밀번호가 올바르지 않습니다.";
    try {
      const all = await loadAll();
      const profile = all.users.find((u) => u.id === data.user.id);
      if (!profile) return "계정 프로필이 없습니다. 관리자에게 문의해 주세요.";
      if (!profile.active) {
        await sb!.auth.signOut();
        return "비활성화된 계정입니다. 관리자에게 문의해 주세요.";
      }
      return { userId: data.user.id, data: all };
    } catch (e) {
      return `데이터를 불러오지 못했습니다. ${(e as Error).message}`;
    }
  },
  async restore(): Promise<{ userId: string; data: Data } | null> {
    const { data } = await sb!.auth.getSession();
    if (!data.session) return null;
    try {
      return { userId: data.session.user.id, data: await loadAll() };
    } catch (e) {
      toast(`데이터를 불러오지 못했습니다. ${(e as Error).message}`, "error");
      return null;
    }
  },
  /** 서버 함수로 기기 푸시를 보낸다. 앱 안 알림 목록 기록은 호출하는 쪽에서 이미 남긴다. */
  async pushReminders(payload: { date: string; classId?: string; teachers?: boolean }) {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    try {
      const r = await fetch("/api/push-reminders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
      if (!r.ok) toast("기기 푸시 발송에 실패했습니다. 앱 안의 알림 목록에는 표시됩니다.", "error");
    } catch {
      toast("기기 푸시 발송에 실패했습니다. 앱 안의 알림 목록에는 표시됩니다.", "error");
    }
  },
  async signOut() {
    await sb?.auth.signOut();
  },
  async changePassword(user: User, current: string, next: string): Promise<string | null> {
    const check = await sb!.auth.signInWithPassword({ email: `${user.loginId}@${EMAIL_DOMAIN}`, password: current });
    if (check.error) return "현재 비밀번호가 올바르지 않습니다.";
    const { error } = await sb!.auth.updateUser({ password: next });
    return error ? error.message : null;
  },
};
