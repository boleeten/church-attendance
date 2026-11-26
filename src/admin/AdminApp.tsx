import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEPT_TITLE } from "../config/dept";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { currentSunday, fmtDot } from "../lib/date";
import { activeStudents, pctText, studentsSummary, yearSundays } from "../lib/stats";
import type { Data } from "../lib/types";
import { logout, setPushAllowed, useData, useMe } from "../lib/store";
import { enablePush, isIOS, isStandalone, pushPermission, sendTestNotification } from "../lib/push";
import { toast } from "../lib/remote";
import { entryOptions, setTeacherGroup } from "../mobile/Shell";
import { Avatar, Badge, Button, Icon, Modal, Note } from "../ui";
import { PasswordForm } from "../mobile/Auth";
import { useEdgeSwipe } from "./useEdgeSwipe";
import { Classes, Dashboard, Students, Teachers } from "./Manage";
import { Notes, StudentAttendance, TeacherAttendance } from "./Records";
import { Messages } from "./Messages";
import { Accounts, NotifySettings, Sheets, YearSettings } from "./Settings";

const DateCtx = createContext<{ date: string; setDate: (d: string) => void }>({ date: currentSunday(), setDate: () => {} });
export const useAdminDate = () => useContext(DateCtx);

const MENU = [
  ["", "home", "대시보드"],
  ["students", "users", "학생 관리"],
  ["classes", "grid", "그룹·반 관리"],
  ["teachers", "badge", "교사·계정 관리"],
  ["attendance", "calendar", "학생 출결현황"],
  ["notes", "note", "심방노트 관리"],
  ["sheets", "cloud", "Google Sheets"],
  ["notify", "bell", "알림 설정"],
  ["year", "gear", "학년도·운영 설정"],
  ["teacher-attendance", "user", "교사 출결현황"],
  ["messages", "mail", "교사별 메세지 전달"],
  ["accounts", "shield", "관리자 계정 관리"],
] as const;

let openSidebar: (() => void) | null = null;

export function Page({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const d = useData();
  const u = useMe()!;
  const { date, setDate } = useAdminDate();
  const role = u.roles.includes("owner") ? "계정 총괄" : u.roles.includes("super") ? "최고 관리자" : "일반 관리자";
  // 모바일: 처음에는 헤더 아래 날짜 바를 보여 주고, 날짜 바가 스크롤로 헤더 뒤로 사라지면 헤더 안에 날짜 선택을 합쳐 보여 준다.
  const bar = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: "-72px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="amain">
      <header className={`topbar ${compact ? "compact" : ""}`}>
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
      <main className="content">
        <div ref={bar} className="week-bar-wrap"><WeekPicker date={date} setDate={setDate} variant="bar" /></div>
        {children}
      </main>
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
function WeekPicker({ date, setDate, variant = "header" }: { date: string; setDate: (d: string) => void; variant?: "header" | "bar" }) {
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
  const pop = open && (
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
  );
  if (variant === "bar") {
    const [y, m, dd] = date.split("-").map(Number);
    const ago = Math.round((Date.parse(thisWeek) - Date.parse(date)) / (7 * 864e5));
    return (
      <div className="week-picker week-bar" ref={box}>
        <button type="button" className="wb-arrow" aria-label="이전 주일" disabled={idx >= weeks.length - 1} onClick={() => go(idx + 1)}><Icon name="left" size={16} /></button>
        <button type="button" className="wb-date" aria-haspopup="listbox" aria-expanded={open} aria-label="기준 주일 선택" onClick={() => setOpen(!open)}>
          <strong className="num">{y}년 {m}월 {dd}일 (일)</strong>
          <span>{ago <= 0 ? "이번 주 주일" : `${ago}주 전 주일`}</span>
        </button>
        <button type="button" className="wb-arrow" aria-label="다음 주일" disabled={idx === 0} onClick={() => go(idx - 1)}><Icon name="right" size={16} /></button>
        {pop}
      </div>
    );
  }
  return (
    <div className="week-picker" ref={box}>
      <button type="button" className="wp-date" aria-haspopup="listbox" aria-expanded={open} aria-label="기준 주일 선택" onClick={() => setOpen(!open)}>
        <span className="num wp-long">{date.replaceAll("-", ".")}</span>
        <span className="num wp-short">{date.slice(5).replace("-", ".")}</span>
        <Icon name="down" size={14} />
      </button>
      <div className="wp-arrows">
        <button type="button" aria-label="이전 주일" disabled={idx >= weeks.length - 1} onClick={() => go(idx + 1)}><Icon name="left" size={14} /></button>
        <button type="button" aria-label="다음 주일" disabled={idx === 0} onClick={() => go(idx - 1)}><Icon name="right" size={14} /></button>
      </div>
      <button type="button" className="wp-now" disabled={date === thisWeek} onClick={() => setDate(thisWeek)}>이번주</button>
      {pop}
    </div>
  );
}

/** 관리자용 '내 정보': 교사 앱의 내 정보 탭과 같은 기능(알림·앱 설치·비밀번호·버전) */
function AdminMyInfo({ onClose, onPassword }: { onClose: () => void; onPassword: () => void }) {
  const u = useMe()!;
  const [, refresh] = useState(0);
  const [install, setInstall] = useState(false);
  const perm = pushPermission();
  const pushOn = Boolean(u.pushAllowed) && perm === "granted";
  const askPush = async () => {
    const r = await enablePush(u.id);
    setPushAllowed(r.ok);
    toast(r.message, r.ok ? "info" : "error");
    refresh((x) => x + 1);
  };
  const testPush = async () => {
    const r = await sendTestNotification("/admin");
    toast(r.message, r.ok ? "info" : "error");
  };
  const role = [u.roles.includes("super") ? "최고 관리자" : "일반 관리자", u.roles.includes("head") ? `${u.group ?? ""}부 부장교사` : null].filter(Boolean).join(" · ");
  return (
    <Modal title="내 정보" onClose={onClose}>
      <div className="col g16">
        <div className="row g12">
          <Avatar name={u.name} size={52} />
          <div className="col g4">
            <strong className="t-lg b">{u.name}</strong>
            <span className="t-xs muted">아이디 {u.loginId}</span>
            <div className="row g6"><Badge tone="warning">{role}</Badge></div>
          </div>
        </div>
        <div className="card list">
          <button type="button" className="menu-row" onClick={onPassword}><Icon name="lock" /><span className="grow sb">비밀번호 변경</span><Icon name="right" size={16} /></button>
          <button type="button" className="menu-row" onClick={askPush}><Icon name="bell" /><span className="grow sb">푸시 알림</span><Badge tone={pushOn ? "success" : "neutral"}>{pushOn ? "허용됨" : "미허용"}</Badge></button>
          {pushOn && <button type="button" className="menu-row" onClick={testPush}><Icon name="check" /><span className="grow sb">테스트 알림 받아 보기</span><Icon name="right" size={16} /></button>}
          <button type="button" className="menu-row" onClick={() => setInstall(!install)} aria-expanded={install}><Icon name="download" /><span className="grow sb">홈 화면에 앱 설치</span><Icon name={install ? "down" : "right"} size={16} /></button>
          {install && (
            <ol className="col g8 t-sm" style={{ margin: 0, padding: "0 16px 16px 40px", lineHeight: 1.5 }}>
              <li><b>아이폰(Safari)</b>: 아래 공유 버튼 → "홈 화면에 추가"</li>
              <li><b>안드로이드(Chrome)</b>: 오른쪽 위 ⋮ 메뉴 → "홈 화면에 추가" 또는 "앱 설치"</li>
              <li>홈 화면의 아이콘으로 앱을 연 뒤, 여기서 푸시 알림을 허용해 주세요.</li>
            </ol>
          )}
          <div className="menu-row"><Icon name="info" /><span className="grow sb">앱 버전</span><span className="muted">1.0.0</span></div>
        </div>
        <Note icon="bell">알림을 허용하면 이 기기로 <b>교사가 새 심방노트를 쓸 때</b>와 <b>주일 오후 출석 미완료 현황</b>을 받습니다.{isIOS() && !isStandalone() ? " 아이폰은 홈 화면에 설치한 앱에서 알림을 허용해야 합니다." : ""}</Note>
        <Button variant="outline" block onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}

/** 오른쪽 위 이름 영역: 누르면 내 정보·비밀번호 변경·로그아웃 메뉴 */
function UserMenu({ name, role }: { name: string; role: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const [info, setInfo] = useState(false);
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
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setInfo(true); }}><Icon name="user" size={18} />내 정보 · 알림 설정</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setPw(true); }}><Icon name="lock" size={18} />비밀번호 변경</button>
          <button type="button" role="menuitem" onClick={() => { logout(); nav("/login", { replace: true }); }}><Icon name="logout" size={18} />로그아웃</button>
        </div>
      )}
      {info && <AdminMyInfo onClose={() => setInfo(false)} onPassword={() => { setInfo(false); setPw(true); }} />}
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
  const panel = useRef<HTMLElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const dragging = useEdgeSwipe(open, setOpen, panel, shade);
  const others = entryOptions(u).filter((o) => o.path !== "/admin");
  return (
    <DateCtx.Provider value={{ date, setDate }}>
      <div className="admin">
        {(open || dragging) && <div ref={shade} className="backdrop" style={{ zIndex: 39 }} onClick={() => setOpen(false)} />}
        <aside ref={panel} className={`sidebar ${open ? "open" : ""}`}>
          <Link to="/admin" className="brand" title="대시보드로 이동" onClick={() => setOpen(false)}>
            <span className="logo"><img src="/brand-flower.svg" alt="" width={43.4} height={43.4} /></span>
            <div className="col">
              <strong className="b">{DEPT_TITLE}</strong>
              <span className="t-xs" style={{ opacity: 0.7 }}>출석관리 Admin</span>
            </div>
          </Link>
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
          <Route path="notes" element={<Notes />} />
          <Route path="sheets" element={<Sheets />} />
          <Route path="notify" element={<NotifySettings />} />
          <Route path="year" element={<YearSettings />} />
          <Route path="teacher-attendance" element={<TeacherAttendance />} />
          <Route path="messages" element={<Messages />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </div>
    </DateCtx.Provider>
  );
}
