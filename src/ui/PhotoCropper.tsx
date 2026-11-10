// 프로필 사진 자르기. 원본 사진은 기기 밖으로 나가지 않고, 잘라서 줄인 작은 이미지만 저장한다.
import { useEffect, useRef, useState } from "react";
import { Button, Icon, Sheet } from "./index";

/** 저장 정책: 192×192 정사각형, 한 장당 약 12KB 이하 */
export const PHOTO_SIZE = 192;
export const PHOTO_MAX_CHARS = 16000; // base64 글자 수. 약 12KB
const VIEW = 280; // 화면에 보이는 자르기 영역(px)

function encode(canvas: HTMLCanvasElement): string {
  // WebP가 가장 작다. 지원하지 않는 브라우저는 PNG를 돌려주므로 그때는 JPEG로 바꾼다.
  const types = canvas.toDataURL("image/webp", 0.8).startsWith("data:image/webp") ? ["image/webp"] : ["image/jpeg"];
  let out = "";
  for (const type of types)
    for (let q = 0.82; q >= 0.3; q -= 0.08) {
      out = canvas.toDataURL(type, q);
      if (out.length <= PHOTO_MAX_CHARS) return out;
    }
  return out;
}

export const photoKB = (dataUrl: string) => Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));

export function PhotoCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = 영역을 딱 채우는 크기
  const [pos, setPos] = useState({ x: 0, y: 0 }); // 이미지 왼쪽 위의 위치(px)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    let cancelled = false; // 정리된 뒤 늦게 도착한 결과는 무시한다
    setError(false);
    el.onload = () => {
      if (cancelled) return;
      const s = VIEW / Math.min(el.naturalWidth, el.naturalHeight);
      setImg(el);
      setZoom(1);
      setPos({ x: (VIEW - el.naturalWidth * s) / 2, y: (VIEW - el.naturalHeight * s) / 2 });
    };
    el.onerror = () => !cancelled && setError(true);
    el.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  // 빈 곳이 보이지 않도록 이동 범위를 제한한다
  const clamp = (x: number, y: number, ww = w, hh = h) => ({ x: Math.min(0, Math.max(VIEW - ww, x)), y: Math.min(0, Math.max(VIEW - hh, y)) });

  const changeZoom = (next: number) => {
    if (!img) return;
    const z = Math.min(4, Math.max(1, next));
    const ns = base * z;
    // 화면 가운데를 기준으로 확대·축소
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    setZoom(z);
    setPos(clamp(VIEW / 2 - cx * ns, VIEW / 2 - cy * ns, img.naturalWidth * ns, img.naturalHeight * ns));
  };

  const save = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    onDone(encode(canvas));
  };

  return (
    <Sheet onClose={onCancel}>
      <h2 className="t-lg b">사진 위치 조정</h2>
      {error ? (
        <p className="c-error sb" role="alert">이 파일은 사진으로 열 수 없습니다. 다른 사진을 선택해 주세요.</p>
      ) : (
        <>
          <div
            className="cropper"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
            }}
            onPointerMove={(e) => drag.current && setPos(clamp(drag.current.x + e.clientX - drag.current.px, drag.current.y + e.clientY - drag.current.py))}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
          >
            {img && <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
            <span className="cropper-mask" />
          </div>
          <label className="row g10">
            <Icon name="search" size={16} />
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="확대" style={{ flex: 1 }} />
          </label>
          <p className="t-xs muted">사진을 끌어 위치를 맞추고, 막대로 확대하세요. 원 안에 보이는 부분만 작은 크기({PHOTO_SIZE}×{PHOTO_SIZE})로 줄여 저장하며, 원본 사진은 올라가지 않습니다.</p>
        </>
      )}
      <div className="row g8">
        <Button variant="outline" size="l" onClick={onCancel}>취소</Button>
        <Button size="l" className="grow" disabled={!img} onClick={save}>이 사진으로 저장</Button>
      </div>
    </Sheet>
  );
}
