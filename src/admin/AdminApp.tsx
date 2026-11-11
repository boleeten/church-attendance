import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { currentSunday, fmtDot } from "../lib/date";
import { yearSundays } from "../lib/stats";
import { logout, useData, useMe } from "../lib/store";
import { entryOptions } from "../mobile/Shell";
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
        <label className="date-select">
          <Icon name="calendarPlain" size={16} />
          <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="기준 주일 선택">
            {[...yearSundays(d)].reverse().map((dt) => (
              <option key={dt} value={dt}>{fmtDot(dt)} 주일</option>
            ))}
          </select>
          <Icon name="down" size={14} />
        </label>
        <Link to="/admin/notify" className="icon-btn top-bell" aria-label="알림 설정">
          <Icon name="bell" size={20} />
        </Link>
        <UserMenu name={u.name} role={role} />
      </header>
      <main className="content">{children}</main>
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
            <span className="logo"><Icon name="check" stroke={2.6} /></span>
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
              {others.map((o) => <Link key={o.path} to={o.path}><Icon name="refresh" />{o.title}</Link>)}
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
