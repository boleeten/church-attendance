// 모든 날짜는 "YYYY-MM-DD" 문자열로 다루고, 계산은 UTC 기준으로 해서 시간대 영향을 없앤다.
const DAY = 86400000;

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parse(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function todayISO(): string {
  const n = new Date();
  return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

/** 오늘이 주일이면 오늘, 아니면 가장 최근에 지난 주일 */
export function currentSunday(from = todayISO()): string {
  const d = parse(from);
  return toISO(new Date(d.getTime() - d.getUTCDay() * DAY));
}

export function addWeeks(iso: string, n: number): string {
  return toISO(new Date(parse(iso).getTime() + n * 7 * DAY));
}

/** 해당 연도 1월 첫 주일부터 until(포함)까지의 주일 목록 (오름차순) */
export function sundaysOfYear(year: number, until: string): string[] {
  const first = new Date(Date.UTC(year, 0, 1));
  let d = new Date(first.getTime() + ((7 - first.getUTCDay()) % 7) * DAY);
  const out: string[] = [];
  while (d.getUTCFullYear() === year && toISO(d) <= until) {
    out.push(toISO(d));
    d = new Date(d.getTime() + 7 * DAY);
  }
  return out;
}

/** 해당 월의 모든 주일 (미래 포함) */
export function sundaysOfMonth(year: number, month: number): string[] {
  const out: string[] = [];
  let d = new Date(Date.UTC(year, month - 1, 1));
  d = new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * DAY);
  while (d.getUTCMonth() === month - 1) {
    out.push(toISO(d));
    d = new Date(d.getTime() + 7 * DAY);
  }
  return out;
}

export const ym = (iso: string) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) });

export const fmtMD = (iso: string) => `${ym(iso).m}/${ym(iso).d}`;
export const fmtKo = (iso: string) => `${ym(iso).m}월 ${ym(iso).d}일 (일)`;
export const fmtKoFull = (iso: string) => `${ym(iso).y}년 ${ym(iso).m}월 ${ym(iso).d}일 (일)`;
export const fmtDot = (iso: string) => `${ym(iso).y}.${String(ym(iso).m).padStart(2, "0")}.${String(ym(iso).d).padStart(2, "0")} (일)`;

const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** ISO 시각 → "11월 15일 (일) 오후 3:00" */
export function fmtDateTimeKo(isoTime: string): string {
  const d = new Date(isoTime);
  const h = d.getHours();
  const ap = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]}) ${ap} ${hh}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO 시각 → "11.15 12:40" */
export function fmtStamp(isoTime: string): string {
  const d = new Date(isoTime);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtRelDay(isoTime: string | null): string {
  if (!isoTime) return "-";
  const d = new Date(isoTime);
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === n.toDateString()) return `오늘 ${hm}`;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${hm}`;
}

export function fmtTime12(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}
