/**
 * 교사 앱 홈 상단 날짜 다이얼 (Figma 199:2349 교사 홈, 113:896 부장 홈)
 * 주빛 앱 '오늘의 말씀' 다이얼과 같은 손맛:
 *  - 날짜를 좌우로 밀면 원통 다이얼처럼 돌아가고, 가운데 칸에 들어온 날짜가 선택됨
 *  - 가운데에서 멀어질수록 작고 흐리게 (24px → 20px, 불투명도 1 → 0.4), 옆으로 돌아가 보임
 *  - 양 끝은 점점 사라짐(마스크), 한 칸 넘어갈 때마다 짧은 진동 (안드로이드, 아이폰 iOS 18+)
 *  - 손가락보다 조금 빠르게 돌고, 휙 밀면 관성으로 여러 주를 넘어간 뒤 가장 가까운 날짜에 멈춤
 *  - 날짜를 눌러도 가운데로, 키보드 ←/→ 로도 이동
 */
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

const ITEM = 112; // 날짜 한 칸 폭 (글자 사이 간격 ≈ Figma 20px)
const ZONE = 180; // 가운데 선택 칸 폭: 이 안에서 크기·밝기가 바뀜
const SPEED = 1.6; // 손가락이 움직인 거리 × 1.6 만큼 돌아감
const FLING = 260; // 손을 뗄 때 속도(px/ms) × 이 값만큼 더 굴러감
const MIN_SCALE = 20 / 24;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * 한 칸 넘어갈 때 '톡' 진동
 *  - 안드로이드: navigator.vibrate
 *  - 아이폰(iOS 18+): 사파리는 vibrate 를 막아 두어서, 화면에 안 보이는 '스위치' 체크박스를 눌러
 *    시스템이 주는 짧은 진동을 빌려 씀 (공식 기능이 아니라 안 되는 기기에선 조용히 넘어감)
 */
const tick = () => {
  if (typeof navigator.vibrate === "function") { navigator.vibrate(6); return; }
  try {
    const lb = document.createElement("label");
    lb.setAttribute("aria-hidden", "true");
    lb.style.display = "none";
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.setAttribute("switch", "");
    lb.appendChild(sw);
    document.head.appendChild(lb);
    lb.click();
    lb.remove();
  } catch { /* 지원 안 하면 그냥 넘어감 */ }
};

export type DateDialHandle = { goTo: (date: string) => void };

/** dates: 보여 줄 날짜들 · selectable: 앞에서부터 고를 수 있는 개수 (뒤쪽 미래 주일은 보이기만 하고 고를 수 없음) */
type Props = { dates: string[]; selectable?: number; value: string; onChange: (date: string) => void; label: (date: string) => string };

export const DateDial = forwardRef<DateDialHandle, Props>(function DateDial({ dates, selectable = dates.length, value, onChange, label }, handle) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const offset = useRef(Math.max(0, dates.indexOf(value)) * ITEM); // 가운데에 온 위치 (px)
  const current = useRef(Math.max(0, dates.indexOf(value)));
  const anim = useRef(0);
  const touched = useRef(false); // 손가락으로 돌린 뒤에만 진동 (처음 열 때는 조용히)
  const drag = useRef<{ id: number; x: number; y: number; start: number; moved: boolean; locked: boolean; samples: { x: number; t: number }[] } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const last = Math.max(0, Math.min(selectable, dates.length) - 1); // 고를 수 있는 마지막 칸
  const max = last * ITEM;

  const paint = () => {
    const el = box.current;
    if (!el || !track.current) return;
    const w = el.clientWidth;
    track.current.style.transform = `translate3d(${w / 2 - ITEM / 2 - offset.current}px,0,0)`;
    // 화면에 보이는 근처만 다시 칠함
    const from = Math.max(0, Math.floor((offset.current - w) / ITEM));
    const to = Math.min(dates.length - 1, Math.ceil((offset.current + w) / ITEM));
    for (let i = from; i <= to; i++) {
      const it = items.current[i];
      if (!it) continue;
      const signed = i * ITEM - offset.current;
      const dist = Math.abs(signed);
      const t = Math.min(dist / (ZONE / 2), 1);
      const far = Math.min(Math.max((dist - ZONE / 2) / ITEM, 0), 1);
      // 원통 다이얼: 가운데에서 멀수록 옆으로 돌아가 보이고(최대 50°), 살짝 안쪽으로 모임
      const turn = Math.max(-1, Math.min(1, signed / (w / 2)));
      it.style.transform = `perspective(420px) translateX(${-turn * 14}px) rotateY(${turn * 50}deg) scale(${1 - (1 - MIN_SCALE) * t})`;
      it.style.opacity = String(1 - 0.6 * t - 0.2 * far);
      it.style.fontWeight = t < 0.5 ? "700" : "400";
    }
    const idx = Math.min(Math.max(Math.round(offset.current / ITEM), 0), last);
    if (idx !== current.current) {
      current.current = idx;
      if (touched.current) tick();
      onChangeRef.current(dates[idx]);
    }
  };

  const stop = () => cancelAnimationFrame(anim.current);
  const animateTo = (target: number) => {
    stop();
    const from = offset.current;
    const dist = Math.abs(target - from);
    if (dist < 0.5) { offset.current = target; paint(); return; }
    const dur = Math.min(520, 180 + dist * 0.35); // 가까우면 빨리, 멀어도 0.5초 안에
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      offset.current = from + (target - from) * easeOut(p);
      paint();
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  /** 날짜 사이에 멈춰 있으면 가장 가까운 날짜를 가운데로 */
  const snap = () => {
    const near = Math.min(Math.max(Math.round(offset.current / ITEM), 0), last) * ITEM;
    if (Math.abs(offset.current - near) > 0.5) animateTo(near);
  };
  const goIndex = (i: number) => animateTo(Math.min(Math.max(i, 0), last) * ITEM);

  useImperativeHandle(handle, () => ({ goTo: (date: string) => goIndex(dates.indexOf(date)) }));

  // 처음: 고른 날짜(보통 이번 주일)를 가운데에 바로 놓음
  useLayoutEffect(() => {
    const idx = Math.max(0, dates.indexOf(value));
    current.current = idx;
    offset.current = idx * ITEM;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length]);

  useEffect(() => {
    const onResize = () => { offset.current = current.current * ITEM; paint(); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates]);

  /* ── 손가락·마우스로 돌리기 ── */
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    touched.current = e.pointerType === "touch";
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: offset.current, moved: false, locked: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; } // 세로로 밀면 화면 스크롤
      g.locked = true;
      g.moved = true;
      box.current?.setPointerCapture(e.pointerId);
    }
    let next = g.start - dx * SPEED;
    // 양 끝에서는 고무줄처럼 조금만 끌림
    if (next < 0) next = next / 3;
    if (next > max) next = max + (next - max) / 3;
    offset.current = next;
    g.samples.push({ x: e.clientX, t: e.timeStamp });
    if (g.samples.length > 6) g.samples.shift();
    paint();
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    // 그냥 누른 것: 날짜 버튼 클릭으로 처리. 다만 굴러가던 중에 눌러 멈췄으면 가장 가까운 날짜로 맞춘다
    if (!g.moved) { snap(); return; }
    const s = g.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const v = b.t > a.t && e.timeStamp - b.t < 80 ? (b.x - a.x) / (b.t - a.t) : 0; // px/ms (손을 멈췄다 떼면 0)
    const projected = offset.current - v * SPEED * FLING;
    goIndex(Math.round(projected / ITEM));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); goIndex(current.current - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); goIndex(current.current + 1); }
  };

  return (
    <div
      ref={box}
      className="date-dial"
      role="listbox"
      aria-label="주일 선택 (좌우로 밀어서 이동)"
      aria-activedescendant={`dial-${value}`}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={() => { if (!drag.current) snap(); }}
    >
      <div ref={track} className="date-dial-track">
        {dates.map((iso, i) => (
          <button
            key={iso}
            id={`dial-${iso}`}
            ref={(el) => { items.current[i] = el; }}
            type="button"
            role="option"
            aria-selected={iso === value}
            tabIndex={-1}
            disabled={i > last}
            aria-disabled={i > last}
            className="date-dial-item"
            onClick={(e) => { if (e.detail === 0 || !drag.current) goIndex(i); }}
          >
            {label(iso)}
          </button>
        ))}
      </div>
    </div>
  );
});
