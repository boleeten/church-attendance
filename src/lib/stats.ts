import { currentSunday, sundaysOfYear } from "./date";
import type { ClassRoom, Data, Mark, Student, User } from "./types";

export const pct = (p: number, a: number): number | null => (p + a === 0 ? null : Math.round((p / (p + a)) * 100));
export const pctText = (v: number | null) => (v === null ? "-" : `${v}%`);

/** 올해 1월 첫 주일부터 이번 주일까지 */
export const yearSundays = (d: Data) => sundaysOfYear(d.settings.year, currentSunday());

export const roster = (d: Data, classId: string): Student[] => d.students.filter((s) => s.classId === classId && s.status === "등록").sort((a, b) => a.name.localeCompare(b.name, "ko"));

export const activeStudents = (d: Data) => d.students.filter((s) => s.status === "등록");

export interface Summary {
  total: number;
  p: number;
  a: number;
  u: number;
  completed: boolean;
  started: boolean;
  rate: number | null;
}

function summarize(marks: (Mark | undefined)[], completed: boolean, started: boolean): Summary {
  const p = marks.filter((m) => m === "P").length;
  const a = marks.filter((m) => m === "A").length;
  return { total: marks.length, p, a, u: marks.length - p - a, completed, started, rate: pct(p, a) };
}

export function classSummary(d: Data, date: string, classId: string): Summary {
  const s = d.sessions[`${date}|class:${classId}`];
  return summarize(
    roster(d, classId).map((x) => d.studentMarks[`${date}|${x.id}`]),
    !!s?.completed,
    !!s,
  );
}

export function studentsSummary(d: Data, date: string, list: Student[]): Summary {
  return summarize(
    list.map((x) => d.studentMarks[`${date}|${x.id}`]),
    false,
    true,
  );
}

/** 부장교사가 체크하는 소속 교사 (부장교사 본인 제외) */
export const groupTeachers = (d: Data, g: 1 | 2): User[] =>
  d.users.filter((u) => u.roles.includes("teacher") && u.group === g && u.active).sort((a, b) => teacherOrder(d, a) - teacherOrder(d, b) || a.name.localeCompare(b.name, "ko"));

function teacherOrder(d: Data, u: User): number {
  const as = d.assignments.filter((a) => a.userId === u.id);
  if (!as.length) return 9999;
  const idx = Math.min(...as.map((a) => d.classes.findIndex((c) => c.id === a.classId)));
  return idx + (as.some((a) => a.kind === "담임") ? 0 : 1000);
}

/** 관리자 화면의 전체 교사 (부장교사 포함) */
export const allStaff = (d: Data, g?: 1 | 2): User[] => d.users.filter((u) => (u.roles.includes("teacher") || u.roles.includes("head")) && u.active && u.group !== null && (!g || u.group === g));

export function teacherSummary(d: Data, date: string, g: 1 | 2): Summary {
  const s = d.sessions[`${date}|group:${g}`];
  return summarize(
    groupTeachers(d, g).map((t) => d.teacherMarks[`${date}|${t.id}`]),
    !!s?.completed,
    !!s,
  );
}

export function personRate(marks: Record<string, Mark>, id: string, dates: string[]) {
  let p = 0;
  let a = 0;
  for (const dt of dates) {
    const m = marks[`${dt}|${id}`];
    if (m === "P") p++;
    else if (m === "A") a++;
  }
  return { p, a, rate: pct(p, a) };
}

/** 최근 주일부터 거슬러 올라가며 연속 결석 횟수를 센다. 미확인 주일은 건너뛴다. */
export function consecutiveAbsences(marks: Record<string, Mark>, id: string, dates: string[]): { count: number; lastPresent: string | null } {
  let count = 0;
  let lastPresent: string | null = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    const m = marks[`${dates[i]}|${id}`];
    if (m === "A" && lastPresent === null) count++;
    else if (m === "P") {
      lastPresent = dates[i];
      break;
    }
  }
  return { count, lastPresent };
}

export const myClasses = (d: Data, userId: string): ClassRoom[] => d.classes.filter((c) => d.assignments.some((a) => a.userId === userId && a.classId === c.id));

export function teacherDuty(d: Data, u: User, short = true): string {
  const as = d.assignments.filter((a) => a.userId === u.id);
  const head = u.roles.includes("head") ? "부장교사" : "";
  if (!as.length) return head || "미배정";
  const kinds = [...new Set(as.map((a) => a.kind))];
  const names = as.map((a) => {
    const c = d.classes.find((x) => x.id === a.classId)!;
    if (c.grade === 0) return "새친구반";
    return short || as.length > 1 ? `${c.grade}-${c.no}반` : `${c.grade}학년 ${c.no}반`;
  });
  return `${head ? `${head} · ` : ""}${names.join(" · ")} ${kinds.join("·")}`;
}

export const homeroomName = (d: Data, classId: string): string => {
  const a = d.assignments.find((x) => x.classId === classId && x.kind === "담임");
  return d.users.find((u) => u.id === a?.userId)?.name ?? "미배정";
};

export function download(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([type.startsWith("text/csv") ? "﻿" + text : text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Excel에서 바로 열리는 CSV(UTF-8 BOM) 문자열 */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function parseCSV(text: string): string[][] {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

/** 생년월일이 m월(1~12)인 학생을 날짜순으로. today가 생일이면 isToday */
export function monthBirthdays(list: Student[], m: number, today: string): { s: Student; day: number; isToday: boolean }[] {
  const mm = String(m).padStart(2, "0");
  return list
    .filter((s) => s.birthDate?.slice(5, 7) === mm)
    .map((s) => ({ s, day: +s.birthDate!.slice(8, 10), isToday: s.birthDate!.slice(5) === today.slice(5) }))
    .sort((a, b) => a.day - b.day || a.s.name.localeCompare(b.s.name, "ko"));
}

/** 새친구반에서 몇 주 연속 출석하면 반 배정 대상이 되는지 */
export const NEW_FRIEND_WEEKS = 3;

/** 최근부터 거꾸로 센 연속 출석 주 수. 마지막 주일(오늘)이 아직 체크 전이면 그 주는 건너뛴다. */
export function consecutivePresent(marks: Record<string, Mark>, id: string, dates: string[]): number {
  let n = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const m = marks[`${dates[i]}|${id}`];
    if (m === "P") n++;
    else if (!m && i === dates.length - 1) continue;
    else break;
  }
  return n;
}

/** 새친구반에서 3주 연속 출석해 반 배정이 필요한 학생 */
export function newFriendsReady(d: Data): { s: Student; weeks: number }[] {
  const dates = yearSundays(d);
  const nf = new Set(d.classes.filter((c) => c.grade === 0).map((c) => c.id));
  return d.students
    .filter((s) => s.status === "등록" && nf.has(s.classId))
    .map((s) => ({ s, weeks: consecutivePresent(d.studentMarks, s.id, dates) }))
    .filter((x) => x.weeks >= NEW_FRIEND_WEEKS)
    .sort((a, b) => a.s.classId.localeCompare(b.s.classId) || a.s.name.localeCompare(b.s.name, "ko"));
}
