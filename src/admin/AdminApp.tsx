import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { currentSunday, fmtDot } from "../lib/date";
import { activeStudents, pctText, studentsSummary, yearSundays } from "../lib/stats";
import type { Data } from "../lib/types";
import { logout, useData, useMe } from "../lib/store";
import { entryOptions, setTeacherGroup } from "../mobile/Shell";
import { Avatar, Icon, Modal } from "../ui";
import { PasswordForm } from "../mobile/Auth";
import { Classes, Dashboard, Students, Teachers } from "./Manage";
import { Notes, Stats, StudentAttendance, TeacherAttendance } from "./Records";
import { Accounts, NotifySettings, Sheets, YearSettings } from "./Settings";

const DateCtx = createContext<{ date: string; setDate: (d: string) => void }>({ date: currentSunday(), setDate: () => {} });
export const useAdminDate = () => useContext(DateCtx);

const MENU = [
  ["", "home", "대시보드"],
  ["students", "users", "학생 관리"],
  ["classes", "grid", "그룹·반 관리"],
  ["teachers", "badge", "교사·계정 관리"],
  ["attendance", "calendar", "학생 출결현황"],
  ["stats", "chart", "학생 출석 통계"],
  ["notes", "note", "심방노트 관리"],
  ["sheets", "cloud", "Google Sheets"],
  ["notify", "bell", "알림 설정"],
  ["year", "gear", "학년도·운영 설정"],
  ["teacher-attendance", "user", "교사 출결현황"],
  ["accounts", "shield", "관리자 계정 관리"],
] as const;

let openSidebar: (() => void) | null = null;

export function Page({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const d = useData();
  const u = useMe()!;
  const { date, setDate } = useAdminDate();
  const role = u.roles.includes("owner") ? "계정 총괄" : u.roles.includes("super") ? "최고 관리자" : "일반 관리자";
  return (
    <div className="amain">
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label="메뉴 열기" onClick={() => openSidebar?.()}><Icon name="menu" /></button>
        <div className="col g2 grow">
          <h1 className="ellipsis">{title}</h1>
          <span className="t-xs muted sub ellipsis">{sub}</span>
        </div>
        <WeekPicker date={date} setDate={setDate} />
        <Link to="/admin/notify" className="icon-btn top-bell" aria-label="알림 설정">
          <Icon name="bell" size={20} />
        </Link>
        <UserMenu name={u.name} role={role} />
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

/** 그 주의 입력 상태: 모든 반 완료면 출석률, 일부만 입력했으면 완료한 반 수 */
function weekStatus(d: Data, dt: string): { text: string; tone: "done" | "doing" | "none" } {
  const total = d.classes.length;
  const done = d.classes.filter((c) => d.sessions[`${dt}|class:${c.id}`]?.completed).length;
  const started = d.classes.filter((c) => d.sessions[`${dt}|class:${c.id}`]).length;
  const rate = pctText(studentsSummary(d, dt, activeStudents(d)).rate);
  if (total && done === total) return { text: `출석 ${rate} · 완료`, tone: "done" };
  if (started) return { text: `입력 중 ${done}/${total}반`, tone: "doing" };
  return { text: "미입력", tone: "none" };
}

/** 기준 주일 선택: ‹ › 로 한 주씩, '이번 주'로 복귀, 가운데 날짜를 누르면 월별 주일 목록 */
function WeekPicker({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const d = useData();
  const weeks = [...yearSundays(d)].reverse(); // 최근 주일이 먼저
  const thisWeek = weeks[0] ?? currentSunday();
  const idx = Math.max(0, weeks.indexOf(date));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    list.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "center" });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const go = (i: number) => {
    if (weeks[i]) setDate(weeks[i]);
  };
  const md = (dt: string) => {
    const [, m, dd] = dt.split("-").map(Number);
    return { m, dd };
  };
  let month = "";
  return (
    <div className="week-picker" ref={box}>
      <button type="button" className="wp-now" disabled={date === thisWeek} onClick={() => setDate(thisWeek)}>이번 주</button>
      <button type="button" className="wp-btn" aria-label="이전 주일" disabled={idx >= weeks.length - 1} onClick={() => go(idx + 1)}><Icon name="left" size={16} /></button>
      <button type="button" className="wp-btn wp-date" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="calendarPlain" size={16} />
        <span className="num wp-long">{fmtDot(date)} 주일</span>
        <span className="num wp-short">{Number(date.slice(5, 7))}.{Number(date.slice(8, 10))} 주일</span>
        {date === thisWeek && <span className="wp-tag">이번 주</span>}
      </button>
      <button type="button" className="wp-btn" aria-label="다음 주일" disabled={idx === 0} onClick={() => go(idx - 1)}><Icon name="right" size={16} /></button>
      {open && (
        <div className="wp-pop" role="listbox" aria-label="기준 주일 선택" ref={list}>
          {weeks.map((dt) => {
            const { m, dd } = md(dt);
            const head = dt.slice(0, 7) !== month;
            month = dt.slice(0, 7);
            const st = weekStatus(d, dt);
            return (
              <div key={dt}>
                {head && <div className="wp-month">{dt.slice(0, 4)}년 {m}월</div>}
                <button type="button" role="option" aria-selected={dt === date} className={`wp-item ${dt === date ? "on" : ""}`} onClick={() => { setDate(dt); setOpen(false); }}>
                  <span className={`wp-dot ${st.tone}`} />
                  <span>{m}월 {dd}일 주일</span>
                  {dt === thisWeek && <span className="wp-tag">이번 주</span>}
                  <span className="wp-st">{st.text}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 오른쪽 위 이름 영역: 누르면 비밀번호 변경·로그아웃 메뉴 */
function UserMenu({ name, role }: { name: string; role: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="user-menu" ref={box}>
      <button type="button" className="row g8 who" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar name={name} size={36} />
        <span className="col who-text">
          <strong className="sb">{name}</strong>
          <span className="t-xs muted">{role}</span>
        </span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="col g2 user-pop-head"><strong className="sb">{name}</strong><span className="t-xs muted">{role}</span></div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setPw(true); }}><Icon name="lock" size={18} />비밀번호 변경</button>
          <button type="button" role="menuitem" onClick={() => { logout(); nav("/login", { replace: true }); }}><Icon name="logout" size={18} />로그아웃</button>
        </div>
      )}
      {pw && (
        <Modal title="비밀번호 변경" onClose={() => setPw(false)}>
          <PasswordForm onDone={() => setPw(false)} />
        </Modal>
      )}
    </div>
  );
}

export default function AdminApp() {
  const u = useMe()!;
  const [date, setDate] = useState(currentSunday());
  const [open, setOpen] = useState(false);
  openSidebar = () => setOpen(true);
  const others = entryOptions(u).filter((o) => o.path !== "/admin");
  return (
    <DateCtx.Provider value={{ date, setDate }}>
      <div className="admin">
        {open && <div className="backdrop" style={{ zIndex: 39 }} onClick={() => setOpen(false)} />}
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <div className="brand">
            <span className="logo"><img src="/brand-flower.svg" alt="" width={43.4} height={43.4} /></span>
            <div className="col">
              <strong className="b">주님의교회 초등부</strong>
              <span className="t-xs" style={{ opacity: 0.7 }}>출석관리 Admin</span>
            </div>
          </div>
          <nav className="col g4" aria-label="관리자 메뉴">
            {MENU.filter(([to]) => to !== "accounts" || u.roles.includes("super")).map(([to, icon, label]) => (
              <NavLink key={to} to={`/admin/${to}`} end={to === ""} onClick={() => setOpen(false)}>
                <Icon name={icon} />
                {label}
              </NavLink>
            ))}
          </nav>
          {others.length > 0 && (
            <div className="col g4" style={{ marginTop: "auto", paddingTop: 16 }}>
              {others.map((o) => <Link key={o.path + (o.group ?? "")} to={o.path} onClick={() => o.group && setTeacherGroup(o.group)}><Icon name="refresh" />{o.title}</Link>)}
            </div>
          )}
        </aside>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="classes" element={<Classes />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="stats" element={<Stats />} />
          <Route path="notes" element={<Notes />} />
          <Route path="sheets" element={<Sheets />} />
          <Route path="notify" element={<NotifySettings />} />
          <Route path="year" element={<YearSettings />} />
          <Route path="teacher-attendance" element={<TeacherAttendance />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </div>
    </DateCtx.Provider>
  );
}
