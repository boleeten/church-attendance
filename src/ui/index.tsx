import { useEffect, useState, type ReactNode } from "react";
import type { Mark } from "../lib/types";

// ── 아이콘 (24px 격자, 선 아이콘) ──
const PATHS: Record<string, string> = {
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  eye: "M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12s-3.500 6.500-9.500 6.500S2.500 12 2.500 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M4 4l16 16M9.900 5.800A9.600 9.600 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a17 17 0 0 1-3 3.700M6.300 7.300A16.500 16.500 0 0 0 2.500 12s3.500 6.500 9.500 6.500a9.300 9.300 0 0 0 4.200-1M9.900 9.900a3 3 0 0 0 4.200 4.200",
  calendarPlain: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
  calendar: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.100 6.500 5.500M16 4.300a3.500 3.500 0 0 1 0 6.400M18.500 14.900c1.700.900 2.800 2.700 3 5.100",
  chart: "M4 20h16M7 20v-7M12 20V5M17 20v-10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.500 20.500c.8-3.700 3.800-6 7.500-6s6.700 2.300 7.500 6",
  userCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12.500a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.200 18.500c1-2.300 3.200-3.500 5.800-3.500s4.800 1.200 5.800 3.500",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.500 2h-15zM10 20.500a2.200 2.200 0 0 0 4 0",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  phone: "M6 3.500h3l1.500 4.500-2 1.500a11 11 0 0 0 6 6l1.500-2 4.500 1.500v3a1.500 1.500 0 0 1-1.500 1.500C10 20.500 3.500 14 3.500 5A1.500 1.500 0 0 1 5 3.500z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  check: "M5 12.500l4.500 4.500L19 7.500",
  x: "M6 6l12 12M18 6L6 18",
  trash: "M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12.500a1 1 0 0 0 1 .9h7.400a1 1 0 0 0 1-.9L17.500 7M10 11v5.500M14 11v5.500",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.600 5.600l12.800 12.800",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.500 12.200l2.400 2.400 4.600-4.800",
  lock: "M6 10.500h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.500a1 1 0 0 1 1-1zM8.500 10.500V7.500a3.500 3.500 0 0 1 7 0v3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.500M12 7.600v.3",
  warning: "M12 4l9 15.500H3zM12 10v4.500M12 16.800v.3",
  logout: "M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9",
  download: "M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 20h14",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4",
  cloud: "M7 18.500a4.500 4.500 0 0 1-.6-9 6 6 0 0 1 11.600 1.500 3.800 3.800 0 0 1-.5 7.500zM9.500 13.500l2 2 3.500-3.500",
  shield: "M12 3l8 3v6c0 4.500-3.200 7.800-8 9-4.800-1.200-8-4.500-8-9V6zM9 12l2.200 2.200L15.500 10",
  gear: "M12 15.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7zM12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800",
  note: "M6 3.500h9l4 4V20a.5.5 0 0 1-.5.5h-12.500a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM9 9h6M9 13h6M9 17h4",
  table: "M4 5h16v14H4zM4 10h16M10 10v9",
  refresh: "M19 12a7 7 0 1 1-2.100-5M19 4.500V8h-3.500",
  camera: "M4 8h3l1.500-2.500h7L17 8h3v11H4zM12 16.500a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  menu: "M4 6.500h16M4 12h16M4 17.500h16",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  badge: "M5 4h14v16H5zM12 12a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5zM8 17c.7-1.700 2.200-2.500 4-2.500s3.300.8 4 2.500",
};

export function Icon({ name, size = 20, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

// ── 기본 요소 ──
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "danger"; size?: "l" | "m" | "s"; block?: boolean };
export function Button({ variant = "primary", size = "m", block, className = "", ...rest }: BtnProps) {
  return <button type="button" {...rest} className={`btn ${variant} ${size} ${block ? "block" : ""} ${className}`} />;
}

/** 눈 아이콘으로 입력한 비밀번호를 보이거나 숨길 수 있는 입력란 */
export function PasswordInput({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input">
      <Icon name="lock" size={18} />
      <input {...rest} type={show ? "text" : "password"} aria-label={label} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="eye" aria-label={show ? `${label} 숨기기` : `${label} 보기`} aria-pressed={show} onClick={() => setShow(!show)}>
        <Icon name={show ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "success" | "error" | "neutral" | "warning" | "info"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Avatar({ name, photo, size = 44 }: { name: string; photo?: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {photo ? <img src={photo} alt="" /> : name.slice(0, 1)}
    </span>
  );
}

export function MarkDot({ mark, future }: { mark: Mark | undefined; future?: boolean }) {
  if (future) return <span className="mark" />;
  if (mark === "P") return <span className="mark p" title="출석"><Icon name="check" size={13} stroke={2.4} /></span>;
  if (mark === "A") return <span className="mark a" title="결석"><Icon name="x" size={13} stroke={2.4} /></span>;
  return <span className="mark u" title="미확인">–</span>;
}

export function Toggle({ value, onChange, fixed }: { value: Mark | undefined; onChange: (m: Mark | null) => void; fixed?: boolean }) {
  return (
    <div className={`toggle ${fixed ? "fixed" : ""}`}>
      <button type="button" className={value === "P" ? "p" : ""} aria-pressed={value === "P"} onClick={() => onChange(value === "P" ? null : "P")}>출석</button>
      <button type="button" className={value === "A" ? "a" : ""} aria-pressed={value === "A"} onClick={() => onChange(value === "A" ? null : "A")}>결석</button>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
  );
}

export function Note({ children, icon = "info", warm }: { children: ReactNode; icon?: string; warm?: boolean }) {
  return (
    <div className={`note t-xs ${warm ? "warm" : ""}`}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

// ── 시트·모달 ──
function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        {children}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="backdrop mid" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="t-lg b">{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
        {footer && <div className="row g8" style={{ justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; kind: string };
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), d.kind === "error" ? 5000 : 2600);
    };
    window.addEventListener("ca-toast", h);
    return () => window.removeEventListener("ca-toast", h);
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
      ))}
    </div>
  );
}
