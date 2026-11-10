import { createContext, useContext, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { currentSunday, fmtDot } from "../lib/date";
import { yearSundays } from "../lib/stats";
import { logout, useData, useMe } from "../lib/store";
import { homePath } from "../mobile/Shell";
import { Avatar, Icon } from "../ui";
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
        <select className="sel sb" value={date} onChange={(e) => setDate(e.target.value)} aria-label="기준 주일 선택">
          {[...yearSundays(d)].reverse().map((dt) => (
            <option key={dt} value={dt}>{fmtDot(dt)} 주일</option>
          ))}
        </select>
        <div className="row g8 who">
          <Avatar name={u.name} size={36} />
          <div className="col">
            <strong className="sb">{u.name}</strong>
            <span className="t-xs muted">{role}</span>
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export default function AdminApp() {
  const u = useMe()!;
  const nav = useNavigate();
  const [date, setDate] = useState(currentSunday());
  const [open, setOpen] = useState(false);
  openSidebar = () => setOpen(true);
  const home = homePath(u);
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
          <div className="col g4" style={{ marginTop: "auto", paddingTop: 16 }}>
            {home !== "/admin" && <Link to={home}><Icon name="refresh" />{home === "/h" ? "부장교사 화면" : "교사 화면"}</Link>}
            <a href="/login" onClick={(e) => { e.preventDefault(); logout(); nav("/login", { replace: true }); }}><Icon name="logout" />로그아웃</a>
          </div>
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
