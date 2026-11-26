import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fmtDateTimeKo, todayISO } from "../lib/date";
import { inboxOf } from "../lib/messages";
import { deleteMyMessages, markMessageRead, useData, useMe } from "../lib/store";
import { toast } from "../lib/remote";
import { Badge, Button, Icon, Sheet } from "../ui";
import { MessageBody } from "../ui/MessageBody";
import { AppBar, HEAD_TABS, Phone, TEACHER_TABS } from "./Shell";

type Base = "/t" | "/h";
const LATER_KEY = "ca-msg-later";

function laterIds(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(LATER_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function setLater(ids: string[]) {
  try {
    sessionStorage.setItem(LATER_KEY, JSON.stringify(ids));
  } catch {
    /* 저장이 막혀 있으면 이번 화면에서만 닫는다 */
  }
}

const preview = (s: string) => s.replace(/\s+/g, " ").trim();
const dateOnly = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 첫 화면에 들어오면 안 읽은 메세지를 아래에서 올라오는 창으로 알려 준다 */
const ROLL_MS = 4000;

export function MessagePopup({ base }: { base: Base }) {
  const d = useData();
  const u = useMe()!;
  const nav = useNavigate();
  const unread = inboxOf(d, u.id).filter((m) => !m.readAt);
  const [hidden, setHidden] = useState<string[]>(laterIds);
  const show = unread.filter((m) => !hidden.includes(m.id));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = show.length;
  const cur = Math.min(i, Math.max(0, n - 1));
  const go = (step: number) => setI((x) => (Math.min(x, n - 1) + step + n) % n);
  // 여러 건이면 자동으로 넘긴다. 직접 넘기면 그때부터 다시 4초를 센다.
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = window.setTimeout(() => setI((x) => (Math.min(x, n - 1) + 1) % n), ROLL_MS);
    return () => window.clearTimeout(t);
  }, [n, paused, cur]);
  if (!n) return null;
  const later = () => {
    const ids = [...new Set([...hidden, ...unread.map((m) => m.id)])];
    setLater(ids);
    setHidden(ids);
  };
  const open = () => nav(`${base}/messages/${show[cur].id}`);
  return (
    <Sheet onClose={later}>
      <div className="row g8">
        <span className="icon-btn soft" style={{ background: "var(--soft)", color: "var(--primary)" }}><Icon name="mail" /></span>
        <div className="col g2 grow">
          <strong className="t-lg b">새 메세지가 {unread.length}건 있습니다</strong>
          <span className="t-xs muted">관리자가 보낸 메세지입니다</span>
        </div>
      </div>
      <div
        className="msg-roll"
        aria-roledescription="carousel"
        aria-label="새 메세지"
        onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          const dx = touchX.current === null ? 0 : e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setPaused(false);
        }}
      >
        <div className="msg-roll-track" style={{ transform: `translateX(-${cur * 100}%)` }}>
          {show.map((m, k) => (
            <button key={m.id} type="button" className="msg-pop-card" aria-roledescription="slide" aria-label={`${k + 1} / ${n}: ${m.title}`} aria-hidden={k !== cur} tabIndex={k === cur ? 0 : -1} onClick={() => nav(`${base}/messages/${m.id}`)}>
              <span className="row g6"><Badge tone="error">NEW</Badge><strong className="sb grow ellipsis">{m.title}</strong></span>
              <span className="msg-clamp">{m.body ? preview(m.body) : "내용 없이 사진·링크만 있는 메세지입니다."}</span>
              <span className="row g8 t-xs muted">
                {fmtDateTimeKo(m.createdAt)}
                {m.images.length > 0 && <span className="row g2"><Icon name="image" size={13} />{m.images.length}</span>}
                {m.links.length > 0 && <span className="row g2"><Icon name="link" size={13} />{m.links.length}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
      {n > 1 && (
        <div className="msg-roll-nav">
          <button type="button" className="msg-roll-btn" aria-label="이전 메세지" onClick={() => go(-1)}><Icon name="left" size={18} /></button>
          <span className="msg-roll-count" aria-live="polite"><strong>{cur + 1}</strong> / {n}</span>
          <button type="button" className="msg-roll-btn" aria-label="다음 메세지" onClick={() => go(1)}><Icon name="right" size={18} /></button>
        </div>
      )}
      <div className="row g8">
        <Button variant="outline" size="l" onClick={later}>나중에 보기</Button>
        <Button size="l" className="grow" onClick={open}>자세히 보기</Button>
      </div>
    </Sheet>
  );
}

/** 내 정보 › 내 메세지함 메뉴 줄 */
export function InboxMenuRow({ base }: { base: Base }) {
  const d = useData();
  const u = useMe()!;
  const un = inboxOf(d, u.id).filter((m) => !m.readAt).length;
  return (
    <Link to={`${base}/messages`} className="menu-row">
      <Icon name="mail" /><span className="grow sb">내 메세지함</span>
      {un > 0 && <Badge tone="error">새 메세지 {un}</Badge>}
      <Icon name="right" size={16} />
    </Link>
  );
}

const RANGES = [["all", "전체"], ["month", "이번 달"], ["3m", "최근 3개월"], ["custom", "직접 지정"]] as const;

export function Inbox({ base }: { base: Base }) {
  const d = useData();
  const u = useMe()!;
  const today = todayISO();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("all");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const all = inboxOf(d, u.id);
  const start = range === "month" ? `${today.slice(0, 7)}-01` : range === "3m" ? (() => { const x = new Date(); x.setMonth(x.getMonth() - 3); return x.toISOString().slice(0, 10); })() : range === "custom" ? from : "";
  const end = range === "custom" ? to : "9999-12-31";
  const list = all.filter((m) => {
    const day = dateOnly(m.createdAt).replaceAll(".", "-");
    return day >= start && day <= end && (!onlyUnread || !m.readAt);
  });
  const un = all.filter((m) => !m.readAt).length;
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const chosen = sel.filter((id) => list.some((m) => m.id === id));
  const allOn = list.length > 0 && list.every((m) => sel.includes(m.id));
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  const del = () => {
    if (!chosen.length) return;
    if (!window.confirm(`선택한 메세지 ${chosen.length}건을 내 메세지함에서 삭제할까요?\n삭제한 메세지는 다시 볼 수 없습니다.`)) return;
    const n = deleteMyMessages(chosen);
    toast(`메세지 ${n}건을 삭제했습니다.`);
    setSel([]);
    setEdit(false);
  };
  return (
    <Phone tabs={base === "/t" ? TEACHER_TABS : HEAD_TABS}>
      <AppBar back title="내 메세지함" right={all.length > 0 ? <button type="button" className="sb c-primary hit" onClick={() => { setEdit(!edit); setSel([]); }}>{edit ? "완료" : "편집"}</button> : un > 0 ? <Badge tone="error">안 읽음 {un}</Badge> : undefined} />
      <div className="mbody" style={{ gap: 12 }}>
        <div className="msg-filter">
          {RANGES.map(([v, l]) => (
            <button key={v} type="button" className={`chip ${range === v ? "on" : ""}`} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="row g8">
            <label className="col g4 grow t-xs muted">시작일<input className="msg-date" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
            <label className="col g4 grow t-xs muted">종료일<input className="msg-date" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          </div>
        )}
        <div className="row between">
          {edit ? <label className="chk t-xs"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : list.map((m) => m.id))} />전체 선택</label> : <span className="t-xs muted">{list.length}건{un > 0 ? ` · 안 읽음 ${un}` : ""}</span>}
          <label className="chk t-xs"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />안 읽은 메세지만</label>
        </div>
        {list.length > 0 ? (
          <div className="card list">
            {list.map((m) => {
              const inner = (
                <>
                <span className="icon-btn" style={{ width: 40, height: 40, borderRadius: 20, flex: "none", background: m.readAt ? "var(--soft)" : "var(--error-soft)", color: m.readAt ? "var(--muted)" : "var(--error)" }}><Icon name="mail" /></span>
                <span className="col g4 grow" style={{ minWidth: 0 }}>
                  <span className="row g6">
                    <strong className={`grow ellipsis ${m.readAt ? "sb" : "b"}`}>{m.title}</strong>
                    {!m.readAt && <i className="msg-dot" aria-label="안 읽음" />}
                  </span>
                  {m.body && <span className={`msg-clamp ${m.readAt ? "muted" : ""}`}>{preview(m.body)}</span>}
                  <span className="row g8 t-xs muted">
                    {dateOnly(m.createdAt)}
                    {m.images.length > 0 && <span className="row g2"><Icon name="image" size={13} />{m.images.length}</span>}
                    {m.links.length > 0 && <span className="row g2"><Icon name="link" size={13} />{m.links.length}</span>}
                  </span>
                </span>
                </>
              );
              return edit ? (
                <label key={m.id} className={`msg-row msg-row-edit ${sel.includes(m.id) ? "on" : ""}`}>
                  <span className="chk"><input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} aria-label={`${m.title} 선택`} /></span>
                  {inner}
                </label>
              ) : (
                <Link key={m.id} to={`${base}/messages/${m.id}`} className="msg-row">{inner}</Link>
              );
            })}
          </div>
        ) : (
          <p className="empty">{all.length ? "이 기간에 받은 메세지가 없습니다." : "받은 메세지가 없습니다."}</p>
        )}
      </div>
      {edit && (
        <div className="bottom-actions">
          <Button variant="danger" size="l" block disabled={!chosen.length} onClick={del}><Icon name="trash" size={18} />{chosen.length ? `선택한 ${chosen.length}건 삭제` : "삭제할 메세지를 선택하세요"}</Button>
        </div>
      )}
    </Phone>
  );
}

export function MessageDetail({ base }: { base: Base }) {
  const d = useData();
  const u = useMe()!;
  const { id } = useParams();
  const m = inboxOf(d, u.id).find((x) => x.id === id);
  useEffect(() => {
    if (m && !m.readAt) markMessageRead(m.id);
  }, [m]);
  const sender = m?.senderId ? d.users.find((x) => x.id === m.senderId) : null;
  const nav = useNavigate();
  const del = () => {
    if (!m || !window.confirm("이 메세지를 내 메세지함에서 삭제할까요?\n삭제한 메세지는 다시 볼 수 없습니다.")) return;
    deleteMyMessages([m.id]);
    toast("메세지를 삭제했습니다.");
    nav(`${base}/messages`, { replace: true });
  };
  return (
    <Phone>
      <AppBar back title="메세지" right={m ? <button type="button" className="icon-btn" aria-label="메세지 삭제" onClick={del}><Icon name="trash" /></button> : undefined} />
      <div className="mbody" style={{ gap: 16 }}>
        {m ? (
          <article className="card pad col g16">
            <div className="col g6">
              <h1 className="t-xl b" style={{ lineHeight: 1.35 }}>{m.title}</h1>
              <span className="t-xs muted">{fmtDateTimeKo(m.createdAt)} · {sender ? `${sender.name}${sender.title && !/팀장 [AB]$/.test(sender.title) ? ` ${sender.title}` : ""}` : "관리자"}</span>
            </div>
            <hr className="msg-hr" />
            <MessageBody m={m} />
          </article>
        ) : (
          <p className="empty">삭제되었거나 볼 수 없는 메세지입니다.</p>
        )}
        <Link to={`${base}/messages`} className="btn outline l block">메세지함으로</Link>
      </div>
    </Phone>
  );
}
