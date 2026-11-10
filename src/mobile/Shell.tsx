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

/** 로그인한 사용자가 첫 화면으로 가야 할 경로 */
export function homePath(u: User): string {
  if (u.roles.includes("teacher") && myClasses(getData(), u.id).length) return "/t";
  if (u.roles.includes("head")) return "/h";
  if (u.roles.includes("admin") || u.roles.includes("super")) return "/admin";
  return "/t";
}

export const isAdmin = (u: User) => u.roles.includes("admin") || u.roles.includes("super");

/** 담당 반이 여러 개인 교사를 위한 현재 반 선택 */
export function useMyClass(): { cls: ClassRoom | null; classes: ClassRoom[]; setCls: (id: string) => void } {
  const d = useData();
  const u = useMe();
  const classes = u ? myClasses(d, u.id) : [];
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
