import { useEffect, useRef, useState, type RefObject } from "react";

/** 왼쪽 가장자리에서 이만큼(px) 안에서 시작한 터치만 '메뉴 열기'로 본다 */
const EDGE = 24;
/** 이보다 짧게 움직이면 아직 방향을 정하지 않는다 (가볍게 스친 터치 무시) */
const SLOP = 8;
/** 이보다 빠르게(px/ms) 쓸면 절반을 넘지 않아도 열고 닫는다 */
const FLING = 0.5;
const MOBILE = "(max-width: 860px)";

/**
 * 모바일 관리자 화면: 왼쪽 가장자리에서 쓸어 메뉴를 열고, 열린 메뉴는 왼쪽으로 쓸어 닫는다.
 * 메뉴는 손가락을 따라 움직이고, 손을 떼면 절반 넘게 왔거나 빠르게 쓸었을 때만 열리거나 닫힌다.
 * 위아래 스크롤로 보이는 터치는 건드리지 않는다.
 * 반환값 dragging: 쓰는 중이면 true (배경 어둡게 깔기용)
 */
export function useEdgeSwipe(open: boolean, setOpen: (v: boolean) => void, panel: RefObject<HTMLElement | null>, shade: RefObject<HTMLElement | null>) {
  const [dragging, setDragging] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    let mode: "open" | "close" | null = null;
    let locked = false;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, width = 0;

    const paint = (offset: number) => {
      const p = panel.current;
      if (p) p.style.transform = `translateX(${offset}px)`;
      if (shade.current) shade.current.style.opacity = String(1 + offset / width);
    };
    const reset = () => {
      const p = panel.current;
      if (p) { p.style.transition = ""; p.style.transform = ""; }
      if (shade.current) shade.current.style.opacity = "";
    };

    const start = (e: TouchEvent) => {
      mode = null;
      locked = false;
      if (!mq.matches || e.touches.length !== 1 || !panel.current) return;
      const t = e.touches[0];
      if (!openRef.current && t.clientX <= EDGE) mode = "open";
      else if (openRef.current) mode = "close";
      else return;
      x0 = t.clientX; y0 = t.clientY; t0 = e.timeStamp; dx = 0;
      width = panel.current.offsetWidth || 210;
    };

    const move = (e: TouchEvent) => {
      if (!mode) return;
      const t = e.touches[0];
      dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!locked) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // 세로로 더 움직였거나, 반대 방향이면 메뉴 제스처가 아니다
        if (Math.abs(dy) > Math.abs(dx) || (mode === "open" ? dx < 0 : dx > 0)) { mode = null; return; }
        locked = true;
        if (panel.current) panel.current.style.transition = "none";
        setDragging(true);
      }
      e.preventDefault(); // 쓰는 동안 화면이 같이 스크롤되지 않게
      const offset = mode === "open" ? Math.min(0, Math.max(-width, dx - width)) : Math.min(0, Math.max(-width, dx));
      paint(offset);
    };

    const end = (e: TouchEvent) => {
      if (!mode) return;
      const was = mode;
      mode = null;
      if (!locked) return;
      locked = false;
      const v = dx / Math.max(1, e.timeStamp - t0);
      const next = was === "open" ? dx > width / 2 || v > FLING : !(-dx > width / 2 || v < -FLING);
      reset();
      setDragging(false);
      setOpen(next);
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      reset();
    };
  }, [panel, shade, setOpen]);

  return dragging;
}
