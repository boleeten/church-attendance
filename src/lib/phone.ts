/** 전화번호 입력: 숫자만 남기고(한글·영문·기호 제거) 자동으로 하이픈을 넣는다. 예) 01012345678 → 010-1234-5678 */
export function formatPhone(raw: string): string {
  const n = raw.replace(/\D/g, "").slice(0, 11);
  if (n.startsWith("02")) {
    if (n.length <= 2) return n;
    if (n.length <= 5) return `${n.slice(0, 2)}-${n.slice(2)}`;
    if (n.length <= 9) return `${n.slice(0, 2)}-${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
    return `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6, 10)}`;
  }
  if (n.length <= 3) return n;
  if (n.length <= 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
  if (n.length <= 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
}
