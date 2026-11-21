import { useRef, useState } from "react";
import { fmtDot } from "../lib/date";
import { toast } from "../lib/remote";
import { parseCSV, yearSundays } from "../lib/stats";
import { importStudentMarks, useData } from "../lib/store";
import type { Data, Mark, Student } from "../lib/types";
import { Badge, Button, Icon, Modal, Note } from "../ui";

type Row = { date: string; studentId: string; mark: Mark };
type Preview = {
  fileName: string;
  dates: string[];
  wrongDates: string[];
  rows: Row[]; // 새로 넣을 기록 (덮어쓰기 꺼짐 기준)
  overwrite: Row[]; // 앱 기록과 다른 값 (덮어쓰기 켜면 추가)
  same: number;
  matched: number;
  unmatched: string[];
  ambiguous: string[];
};

/** 엑셀이 저장한 CSV 는 UTF-8 이거나(‘CSV UTF-8’) 한글 윈도우 인코딩(EUC-KR)이다 */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

const P_RE = /^(출석|출|o|○|◯|●|v|✓|✔|1|p)$/i;
const A_RE = /^(결석|결|x|×|✕|0|a)$/i;
const markOf = (v: string): Mark | null => (P_RE.test(v) ? "P" : A_RE.test(v) ? "A" : null);

/** 머리글 칸이 주일 날짜면 YYYY-MM-DD 로. 예) 1/5, 01-05, 1.5, 2026-01-05, 1월 5일 */
function headerDate(h: string, year: number): string | null {
  const t = h.replace(/\s/g, "");
  // 엑셀이 날짜로 바꿔 저장한 모양도 받는다: 01월 05일, 2026-01-05, 26-01-05, 2026년 1월 5일
  const m = t.match(/^(?:(\d{4}|\d{2})[-./년])?(\d{1,2})[-./월](\d{1,2})[.일]?$/);
  if (!m) return null;
  const y = m[1] ? (m[1].length === 2 ? 2000 + +m[1] : +m[1]) : year;
  return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

const digits = (v?: string) => (v ?? "").replace(/[^0-9]/g, "");

function buildPreview(d: Data, table: string[][], fileName: string): Preview | string {
  const hi = table.findIndex((r) => r.some((c) => c.replace(/\s/g, "") === "이름"));
  if (hi < 0) return "첫 줄에 '이름' 칸이 있는 양식이 아닙니다. 학생 출석 통계 → 연간 → 학생별 출결 Excel 다운로드로 받은 파일을 써 주세요.";
  const head = table[hi].map((h) => h.replace(/\s/g, ""));
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const ci = { name: col(/^이름$/), g: col(/^(그룹|부)$/), gr: col(/^학년$/), no: col(/^반$/) };
  const sundays = new Set(yearSundays(d));
  const dateCols: { i: number; date: string }[] = [];
  const wrongDates: string[] = [];
  head.forEach((h, i) => {
    const iso = headerDate(h, d.settings.year);
    if (!iso) return;
    if (sundays.has(iso)) { if (!dateCols.some((x) => x.date === iso)) dateCols.push({ i, date: iso }); }
    else wrongDates.push(h);
  });
  if (!dateCols.length) return "날짜 칸(예: 1/5)을 찾지 못했습니다. 다운로드한 양식의 머리글을 바꾸지 말고 올려 주세요.";

  const rows: Row[] = [];
  const overwrite: Row[] = [];
  let same = 0;
  let matched = 0;
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  for (const r of table.slice(hi + 1)) {
    const name = (r[ci.name] ?? "").trim();
    if (!name) continue;
    // 이름이 같은 학생이 여럿이면 그룹·학년·반으로 고른다 (졸업·장결 학생도 찾는다)
    let cands: Student[] = d.students.filter((s) => s.name.replace(/\s/g, "") === name.replace(/\s/g, ""));
    if (cands.length > 1) {
      const g = digits(r[ci.g]), gr = digits(r[ci.gr]), no = digits(r[ci.no]);
      const nf = /새친구/.test(`${r[ci.gr] ?? ""}${r[ci.no] ?? ""}`);
      const byClass = cands.filter((s) => {
        const c = d.classes.find((x) => x.id === s.classId);
        if (!c) return false;
        return String(c.group) === g && (nf ? c.grade === 0 : String(c.grade) === gr && String(c.no) === no);
      });
      if (byClass.length) cands = byClass;
    }
    if (cands.length === 0) { unmatched.push(name); continue; }
    if (cands.length > 1) { ambiguous.push(name); continue; }
    const s = cands[0];
    matched++;
    for (const { i, date } of dateCols) {
      const mark = markOf((r[i] ?? "").trim());
      if (!mark) continue; // 빈칸·미확인은 건너뛴다
      const cur = d.studentMarks[`${date}|${s.id}`];
      if (!cur) rows.push({ date, studentId: s.id, mark });
      else if (cur === mark) same++;
      else overwrite.push({ date, studentId: s.id, mark });
    }
  }
  return { fileName, dates: [...new Set(dateCols.map((x) => x.date))].sort(), wrongDates, rows, overwrite, same, matched, unmatched, ambiguous };
}

/** 학생 출석 통계 → 지난 출결 엑셀 올리기 */
export function ImportMarksButton() {
  const d = useData();
  const file = useRef<HTMLInputElement>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const read = async (f: File) => {
    if (/\.xlsx?$/i.test(f.name)) return toast("엑셀 파일(.xlsx)은 바로 읽을 수 없습니다. 엑셀에서 '다른 이름으로 저장' → 'CSV UTF-8(쉼표로 분리)'로 저장해 올려 주세요.", "error");
    const r = buildPreview(d, parseCSV(await readText(f)), f.name);
    if (typeof r === "string") return toast(r, "error");
    setForce(false);
    setPv(r);
  };
  const apply = async () => {
    if (!pv) return;
    const list = force ? [...pv.rows, ...pv.overwrite] : pv.rows;
    setBusy(true);
    const err = await importStudentMarks(list, pv.fileName);
    setBusy(false);
    if (err) return toast(err, "error");
    toast(`출석 기록 ${list.length}건을 앱에 반영했습니다.`);
    setPv(null);
  };
  const p = (list: Row[]) => list.filter((x) => x.mark === "P").length;
  const total = pv ? (force ? pv.rows.length + pv.overwrite.length : pv.rows.length) : 0;
  return (
    <>
      <Button variant="secondary" onClick={() => file.current?.click()}><Icon name="plus" size={16} />지난 출결 엑셀 올리기</Button>
      <input ref={file} type="file" accept=".csv,text/csv,.xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
      {pv && (
        <Modal
          title="지난 출결 가져오기 미리보기"
          onClose={() => !busy && setPv(null)}
          footer={<><Button variant="outline" disabled={busy} onClick={() => setPv(null)}>취소</Button><Button disabled={busy || !total} onClick={apply}>{busy ? "저장 중…" : `${total}건 반영하기`}</Button></>}
        >
          <div className="col g12">
            <div className="card list">
              <div className="menu-row"><span className="grow sb">파일</span><span className="muted ellipsis">{pv.fileName}</span></div>
              <div className="menu-row"><span className="grow sb">주일</span><span>{pv.dates.length}주 ({fmtDot(pv.dates[0])} ~ {fmtDot(pv.dates[pv.dates.length - 1])})</span></div>
              <div className="menu-row"><span className="grow sb">찾은 학생</span><span>{pv.matched}명</span></div>
              <div className="menu-row"><span className="grow sb">새로 넣을 기록</span><span><Badge tone="success">출석 {p(pv.rows)}</Badge> <Badge tone="error">결석 {pv.rows.length - p(pv.rows)}</Badge></span></div>
              {pv.same > 0 && <div className="menu-row"><span className="grow sb">앱과 같은 기록</span><span className="muted">{pv.same}건 (그대로 둠)</span></div>}
            </div>
            {pv.overwrite.length > 0 && (
              <label className="row g8 card pad" style={{ alignItems: "flex-start" }}>
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} style={{ marginTop: 3 }} />
                <span className="col g4">
                  <strong className="sb">앱 기록과 다른 {pv.overwrite.length}건을 엑셀 내용으로 바꾸기</strong>
                  <span className="t-xs muted">체크하지 않으면 앱에서 이미 체크한 출결은 그대로 둡니다.</span>
                </span>
              </label>
            )}
            {(pv.unmatched.length > 0 || pv.ambiguous.length > 0) && (
              <Note warm icon="warning">
                {pv.unmatched.length > 0 && <>앱에 없는 이름 {pv.unmatched.length}명: <b>{pv.unmatched.join(", ")}</b>. 학생 관리에서 먼저 등록하거나 엑셀의 이름을 앱과 똑같이 고쳐 주세요.<br /></>}
                {pv.ambiguous.length > 0 && <>같은 이름이 여럿이라 고르지 못한 학생: <b>{pv.ambiguous.join(", ")}</b>. 그룹·학년·반 칸을 확인해 주세요.</>}
                <br />이 학생들의 기록은 빼고 반영합니다.
              </Note>
            )}
            {pv.wrongDates.length > 0 && <Note icon="info">주일이 아니거나 올해가 아닌 날짜 칸은 건너뜁니다: {pv.wrongDates.join(", ")}</Note>}
            <Note icon="info">칸에 <b>출석·O·1</b>은 출석, <b>결석·X·0</b>은 결석으로 넣고, 빈칸과 '미확인'은 건너뜁니다. 기록이 들어간 주일의 반 출석부는 '완료'로 표시됩니다.</Note>
          </div>
        </Modal>
      )}
    </>
  );
}

