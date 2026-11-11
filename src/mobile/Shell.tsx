import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getData, useData, useMe } from "../lib/store";
import { myClasses } from "../lib/stats";
import type { ClassRoom, User } from "../lib/types";
import { Icon } from "../ui";

export const TEACHER_TABS = [
  ["/t", "home", "홈"],
  ["/t/check", "calendar", "출석"],
  ["/t/students", "users", "학생"],
  ["/t/history", "chart", "이력"],
  ["/t/me", "userCircle", "내 정보"],
] as const;

export const HEAD_TABS = [
  ["/h", "home", "부서 홈"],
  ["/h/check", "calendar", "교사 출석"],
  ["/h/history", "chart", "출석 이력"],
  ["/h/me", "userCircle", "내 정보"],
] as const;

export function Phone({ children, tabs }: { children: ReactNode; tabs?: readonly (readonly [string, string, string])[] }) {
  useEffect(() => {
    document.body.classList.add("is-mobile-app");
    return () => document.body.classList.remove("is-mobile-app");
  }, []);
  return (
    <div className="phone">
      <div className="col grow">{children}</div>
      {tabs && (
        <nav className="tabbar" aria-label="주 메뉴">
          {tabs.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/t" || to === "/h"}>
              <Icon name={icon} size={24} />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export function AppBar({ title, right, back }: { title: string; right?: ReactNode; back?: boolean }) {
  const nav = useNavigate();
  return (
    <header className={`appbar ${back ? "sub" : ""}`}>
      {back && (
        <button type="button" className="icon-btn" style={{ background: "none" }} aria-label="뒤로" onClick={() => nav(-1)}>
          <Icon name="left" />
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

/** 관리자 전용 주소(lord-admin.vercel.app)로 들어왔는지 */
export const onAdminHost = () => window.location.hostname.startsWith("lord-admin.");

/** 로그인한 사용자가 첫 화면으로 가야 할 경로 */
export function homePath(u: User): string {
  if (onAdminHost() && isAdmin(u)) return "/admin";
  if (u.roles.includes("teacher") && myClasses(getData(), u.id).length) return "/t";
  if (u.roles.includes("head")) return "/h";
  if (u.roles.includes("admin") || u.roles.includes("super")) return "/admin";
  return "/t";
}

export const isAdmin = (u: User) => u.roles.includes("admin") || u.roles.includes("super");

/** 교사가 반을 맡은 부(1부·2부). 두 부에 모두 반이 있으면 [1, 2] */
export function teacherGroups(userId: string): (1 | 2)[] {
  return [...new Set(myClasses(getData(), userId).map((c) => c.group))].sort() as (1 | 2)[];
}

const GROUP_KEY = "ca-group";
/** 교사 화면에서 지금 보고 있는 부 (두 부를 맡은 교사만 의미가 있다) */
export function currentTeacherGroup(userId: string): 1 | 2 | null {
  const groups = teacherGroups(userId);
  const saved = Number(localStorage.getItem(GROUP_KEY));
  return groups.includes(saved as 1 | 2) ? (saved as 1 | 2) : (groups[0] ?? null);
}
export function setTeacherGroup(g: 1 | 2) {
  localStorage.setItem(GROUP_KEY, String(g));
  localStorage.removeItem("ca-class"); // 그 부의 첫 반부터 보이게
}

export type EntryOption = { path: string; title: string; desc: string; icon: string; group?: 1 | 2 };

/** 이 사용자가 들어갈 수 있는 화면들. 2개 이상이면 로그인 후 고르게 한다. 두 부에 반이 있는 교사는 부마다 따로 고른다. */
export function entryOptions(u: User): EntryOption[] {
  const out: EntryOption[] = [];
  const classes = myClasses(getData(), u.id);
  const groups = teacherGroups(u.id);
  if (u.roles.includes("teacher") && classes.length) {
    const desc = (list: ClassRoom[]) => `${list.map((c) => `${c.grade}-${c.no}반`).join(", ")} 학생 출석체크·심방노트`;
    if (groups.length > 1) for (const g of groups) out.push({ path: "/t", group: g, title: `${g}부 담당 반 출석관리`, desc: desc(classes.filter((c) => c.group === g)), icon: "users" });
    else out.push({ path: "/t", title: "담당 반 출석관리", desc: desc(classes), icon: "users" });
  }
  if (u.roles.includes("head")) out.push({ path: "/h", title: "교사 출결관리", desc: `${u.group ?? ""}부 교사 출석체크와 출석 이력`, icon: "calendar" });
  if (isAdmin(u)) out.push({ path: "/admin", title: "관리자 화면", desc: "학생·교사·출결 전체 관리", icon: "shield" });
  return out;
}

/** 로그인(또는 첫 비밀번호 변경) 직후 갈 곳: 들어갈 화면이 여러 개면 선택 화면 */
export const afterLoginPath = (u: User) => (entryOptions(u).length > 1 ? "/select" : homePath(u));

/** 담당 반이 여러 개인 교사를 위한 현재 반 선택. 두 부를 맡은 교사는 지금 고른 부의 반만 다룬다. */
export function useMyClass(): { cls: ClassRoom | null; classes: ClassRoom[]; setCls: (id: string) => void } {
  const d = useData();
  const u = useMe();
  const group = u ? currentTeacherGroup(u.id) : null;
  const classes = u ? myClasses(d, u.id).filter((c) => !group || c.group === group) : [];
  const [id, setId] = useState(() => localStorage.getItem("ca-class"));
  const cls = classes.find((c) => c.id === id) ?? classes[0] ?? null;
  return {
    cls,
    classes,
    setCls: (v) => {
      localStorage.setItem("ca-class", v);
      setId(v);
    },
  };
}

export function ClassPicker() {
  const { cls, classes, setCls } = useMyClass();
  if (!cls) return null;
  if (classes.length < 2) return <span className="badge info">{cls.group}부 {cls.grade}학년 {cls.no}반</span>;
  return (
    <select className="sel t-xs sb" style={{ height: 28 }} value={cls.id} onChange={(e) => { setCls(e.target.value); window.location.reload(); }} aria-label="담당 반 선택">
      {classes.map((c) => (
        <option key={c.id} value={c.id}>{c.group}부 {c.grade}학년 {c.no}반</option>
      ))}
    </select>
  );
}
