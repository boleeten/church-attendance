import { useState } from "react";
import { linkText, useImageUrls } from "../lib/messages";
import type { TeacherMessage } from "../lib/types";
import { Icon } from ".";

/** 메세지 본문·사진·링크 미리보기 (관리자 상세 / 교사 상세 공용) */
export function MessageBody({ m }: { m: TeacherMessage }) {
  const urls = useImageUrls(m.images);
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <div className="col g16">
      {m.body && <p className="msg-text">{m.body}</p>}
      {m.images.length > 0 && (
        <div className={`msg-images ${m.images.length === 1 ? "one" : "view"}`}>
          {m.images.map((p, i) => (
            <button key={p} type="button" className="msg-img" aria-label={`사진 ${i + 1} 크게 보기`} onClick={() => urls[p] && setZoom(urls[p])}>
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
      {zoom && (
        <div className="backdrop mid" style={{ zIndex: 60 }} onClick={() => setZoom(null)}>
          <div className="photo-view" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={(e) => e.stopPropagation()}>
            <img src={zoom} alt="첨부 사진" />
            <div className="row between">
              <strong className="t-lg b">{m.title}</strong>
              <button type="button" className="icon-btn" aria-label="닫기" autoFocus onClick={() => setZoom(null)}><Icon name="x" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

