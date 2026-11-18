// 메세지 사진: 올리는 모든 사진을 자동으로 줄인다.
// 긴 변 1600px 이하, JPEG 화질 80%로 다시 저장하고, 그래도 500KB가 넘으면 화질·크기를 더 낮춘다.
// 다시 저장한 결과가 원본보다 크면(이미 충분히 작은 사진) 원본을 그대로 쓴다.
export const IMAGE_MAX_BYTES = 500 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했습니다.")); };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));

const MAX_SIDE = 1600;

/** 압축한 사진(500KB 이하)을 돌려준다. 줄여도 넘으면 오류 문구를 돌려준다 */
export async function fitImage(file: File, maxBytes = IMAGE_MAX_BYTES): Promise<Blob | string> {
  if (!file.type.startsWith("image/")) return `${file.name}: 사진 파일만 올릴 수 있습니다.`;
  const keepOriginal = (b: Blob) => (OK_TYPES.includes(file.type) && file.size <= maxBytes && file.size <= b.size ? file : b);
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return `${file.name}: 이 형식의 사진은 읽을 수 없습니다. JPG·PNG로 바꿔 올려 주세요.`;
  }
  let side = Math.min(MAX_SIDE, Math.max(img.naturalWidth, img.naturalHeight));
  for (let round = 0; round < 6; round++) {
    const k = side / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; // 투명한 PNG가 검게 나오지 않도록
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const b = await toBlob(c, q);
      if (b && b.size <= maxBytes) return keepOriginal(b);
    }
    side = Math.round(side * 0.75);
  }
  return `${file.name}: 500KB 이하로 줄이지 못했습니다. 더 작은 사진을 올려 주세요.`;
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);
