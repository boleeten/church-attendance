// 메세지 사진: 장당 500KB 이하로 맞춘다. 큰 사진은 크기와 화질을 줄여 JPEG로 바꾼다.
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

/** 500KB 이하 사진(Blob)을 돌려준다. 줄여도 넘으면 오류 문구를 돌려준다 */
export async function fitImage(file: File, maxBytes = IMAGE_MAX_BYTES): Promise<Blob | string> {
  if (!file.type.startsWith("image/")) return `${file.name}: 사진 파일만 올릴 수 있습니다.`;
  if (file.size <= maxBytes && OK_TYPES.includes(file.type)) return file;
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return `${file.name}: 이 형식의 사진은 읽을 수 없습니다. JPG·PNG로 바꿔 올려 주세요.`;
  }
  let side = Math.min(1600, Math.max(img.naturalWidth, img.naturalHeight));
  for (let round = 0; round < 6; round++) {
    const k = side / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; // 투명한 PNG가 검게 나오지 않도록
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const b = await toBlob(c, q);
      if (b && b.size <= maxBytes) return b;
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

export const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))}KB`;
