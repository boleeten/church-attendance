import { useEffect, useState, type ReactNode } from "react";
import { linkText, useImageUrls } from "../lib/messages";
import type { TeacherMessage } from "../lib/types";
import { Icon } from ".";

// 본문 속 주소(https://…, www.…)를 눌러서 열 수 있는 링크로 바꾼다
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAIL = /[.,;:!?)\]}'"」』>…]+$/;

export function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    const tail = raw.match(TRAIL)?.[0] ?? "";
    // 괄호로 감싼 주소의 닫는 괄호는 떼고, 주소 안의 괄호 짝은 남긴다
    if (tail) raw = raw.slice(0, raw.length - tail.length);
    if (!raw) continue;
    const href = raw.startsWith("www.") ? `https://${raw}` : raw;
    let ok = true;
    try {
      const u = new URL(href);
      ok = u.protocol === "https:" || u.protocol === "http:";
    } catch {
      ok = false;
    }
    if (!ok) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(<a key={start} href={href} target="_blank" rel="noopener noreferrer" className="msg-autolink">{raw}</a>);
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function ImageViewer({ list, index, title, onClose }: { list: string[]; index: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(index);
  const many = list.length > 1;
  const go = (n: number) => setI((x) => (x + n + list.length) % list.length);
  useEffect(() => {
    // 관리자 상세(모달) 위에서 열리므로 ESC·화살표는 이 사진 레이어만 처리한다
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
      else if (many && e.key === "ArrowRight") go(1);
      else if (many && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h, true); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, many]);
  return (
    <div className="img-viewer" role="dialog" aria-modal="true" aria-label={`${title} 사진 크게 보기`} onClick={onClose}>
      <div className="img-viewer-bar" onClick={(e) => e.stopPropagation()}>
        <strong className="ellipsis grow">{title}</strong>
        {many && <span className="img-viewer-count">{i + 1} / {list.length}</span>}
        <button type="button" className="img-viewer-btn" aria-label="닫기" autoFocus onClick={onClose}><Icon name="x" size={22} /></button>
      </div>
      <div className="img-viewer-stage">
        <img src={list[i]} alt={`첨부 사진 ${i + 1}`} onClick={(e) => e.stopPropagation()} />
      </div>
      {many && (
        <>
          <button type="button" className="img-viewer-btn img-viewer-prev" aria-label="이전 사진" onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon name="left" size={24} /></button>
          <button type="button" className="img-viewer-btn img-viewer-next" aria-label="다음 사진" onClick={(e) => { e.stopPropagation(); go(1); }}><Icon name="right" size={24} /></button>
        </>
      )}
    </div>
  );
}

/** 메세지 본문·사진·링크 미리보기 (관리자 상세 / 교사 상세 공용) */
export function MessageBody({ m }: { m: TeacherMessage }) {
  const urls = useImageUrls(m.images);
  const [zoom, setZoom] = useState<number | null>(null);
  const ready = m.images.map((p) => urls[p]).filter(Boolean);
  return (
    <div className="col g16">
      {m.body && <p className="msg-text"><Linkified text={m.body} /></p>}
      {m.images.length > 0 && (
        <div className={`msg-images ${m.images.length === 1 ? "one" : "view"}`}>
          {m.images.map((p, i) => (
            <button key={p} type="button" className="msg-img" aria-label={`사진 ${i + 1} 크게 보기`} onClick={() => urls[p] && setZoom(ready.indexOf(urls[p]))}>
              {urls[p] ? <img src={urls[p]} alt={`첨부 사진 ${i + 1}`} loading="lazy" /> : <span className="muted t-xs">불러오는 중…</span>}
            </button>
          ))}
        </div>
      )}
      {m.links.length > 0 && (
        <div className="col g8">
          {m.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="msg-link">
              <Icon name="link" size={18} />
              <span className="col grow" style={{ minWidth: 0 }}>
                <strong className="sb ellipsis">{linkText(l)}</strong>
                <span className="t-xs muted ellipsis">{l.url}</span>
              </span>
              <Icon name="right" size={16} />
            </a>
          ))}
        </div>
      )}
      {zoom !== null && zoom >= 0 && <ImageViewer list={ready} index={zoom} title={m.title} onClose={() => setZoom(null)} />}
    </div>
  );
}
