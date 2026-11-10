import { useMemo, useState } from "react";
import { fmtDot, fmtMD, fmtStamp, sundaysOfMonth, ym } from "../lib/date";
import { toast } from "../lib/remote";
import { activeStudents, allStaff, classSummary, consecutiveAbsences, download, homeroomName, pct, pctText, personRate, roster, studentsSummary, teacherDuty, toCSV, yearSundays } from "../lib/stats";
import { classLabel, classShort, saveSession, setStudentMark, setTeacherMark, useData } from "../lib/store";
import { REASONS, type ClassRoom, type Data, type Mark, type Note as VisitNote, type Student, type User } from "../lib/types";
import { Avatar, Badge, Button, Icon, MarkDot, Modal, Note, Progress, Seg, Toggle } from "../ui";
import { Page, useAdminDate } from "./AdminApp";
import { classOf, GroupBar, groupStudents, incompleteClasses, Kpi, SelectBox, StudentDetailModal } from "./Manage";

const markText = (m: Mark | undefined) => (m === "P" ? "출석" : m === "A" ? "결석" : "미확인");

function rateOver(marks: Record<string, Mark>, ids: string[], dates: string[]): number | null {
  let p = 0;
  let a = 0;
  for (const dt of dates)
    for (const id of ids) {
      const m = marks[`${dt}|${id}`];
      if (m === "P") p++;
      else if (m === "A") a++;
    }
  return pct(p, a);
}

// ───────── A05 학생 전체 출결현황 ─────────
function ClassSheetModal({ cls, date, onClose }: { cls: ClassRoom; date: string; onClose: () => void }) {
  const d = useData();
  const sum = classSummary(d, date, cls.id);
  const finish = (done: boolean) => {
    saveSession(date, `class:${cls.id}`, done);
    toast(done ? "출석부를 완료 처리했습니다." : "임시저장했습니다.");
    onClose();
  };
  return (
    <Modal title={`${classLabel(cls)} · ${fmtDot(date)} 출석부`} onClose={onClose} footer={<><Button variant="outline" onClick={() => finish(false)}>임시저장</Button><Button disabled={sum.u > 0} onClick={() => finish(true)}>출석 완료</Button></>}>
      <div className="row g16 sb"><span>전체 {sum.total}</span><span className="c-success">출석 {sum.p}</span><span className="c-error">결석 {sum.a}</span><span className="c-neutral">미확인 {sum.u}</span></div>
      <div className="col g8">
        {roster(d, cls.id).map((s) => (
          <div key={s.id} className="row g12">
            <Avatar name={s.name} photo={s.photo} size={32} />
            <strong className="sb grow">{s.name}</strong>
            <Toggle fixed value={d.studentMarks[`${date}|${s.id}`]} onChange={(m) => setStudentMark(date, s.id, m)} />
          </div>
        ))}
      </div>
      <Note>관리자가 수정한 내용은 변경 이력(감사 로그)에 수정자와 함께 기록됩니다.</Note>
    </Modal>
  );
}

export function StudentAttendance() {
  const d = useData();
  const { date } = useAdminDate();
  const [tab, setTab] = useState<"class" | "student">("class");
  const [group, setGroup] = useState("");
  const [grade, setGrade] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [streakOnly, setStreakOnly] = useState(false);
  const [sheet, setSheet] = useState<ClassRoom | null>(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const dates = useMemo(() => yearSundays(d).filter((x) => x <= date), [d, date]);
  const students = activeStudents(d);
  const all = studentsSummary(d, date, students);
  const pending = incompleteClasses(d, date);
  const streaks = useMemo(() => new Map(students.map((s) => [s.id, consecutiveAbsences(d.studentMarks, s.id, dates).count])), [d, dates, students]);
  const classes = d.classes.filter((c) => (!group || String(c.group) === group) && (!grade || String(c.grade) === grade) && (!pendingOnly || !d.sessions[`${date}|class:${c.id}`]?.completed));
  const classIds = new Set(classes.map((c) => c.id));
  const rows = students.filter((s) => classIds.has(s.classId) && (!streakOnly || (streaks.get(s.id) ?? 0) >= 2)).sort((a, b) => a.classId.localeCompare(b.classId) || a.name.localeCompare(b.name, "ko"));
  const cols = dates.slice(-5);
  const exportCsv = () =>
    tab === "class"
      ? download(`반별_출석현황_${date}.csv`, toCSV([["반", "담임", "전체", "출석", "결석", "미확인", "출석률", "상태"], ...classes.map((c) => { const s = classSummary(d, date, c.id); return [classLabel(c), homeroomName(d, c.id), s.total, s.p, s.a, s.u, pctText(s.rate), s.completed ? "완료" : "미완료"]; })]))
      : download(`학생별_출석현황_${date}.csv`, toCSV([["학생", "반", ...cols.map(fmtMD), "연간 출석률"], ...rows.map((s) => { const c = classOf(d, s); return [s.name, c ? classLabel(c) : "", ...cols.map((dt) => markText(d.studentMarks[`${dt}|${s.id}`])), pctText(personRate(d.studentMarks, s.id, dates).rate)]; })]));
  return (
    <Page title="학생 출결현황" sub="주일별 전체 학생 출석 현황을 확인하고 수정합니다">
      <div className="grid cols-4">
        <Kpi label="출석 대상" value={`${all.total}명`} sub={`${d.classes.length}개 반`} icon="users" />
        <Kpi label="출석" value={`${all.p}명`} sub={`출석률 ${pctText(all.rate)}${pending.length ? " (잠정)" : ""}`} icon="check" tone="success" />
        <Kpi label="결석" value={`${all.a}명`} sub={`연속 결석 ${[...streaks.values()].filter((n) => n >= 2).length}명 포함`} icon="x" tone="error" />
        <Kpi label="미확인" value={`${all.u}명`} sub={`미완료 ${pending.length}개 반`} icon="info" tone="warm" />
      </div>
      <div className="grid cols-2">
        {([1, 2] as const).map((g) => {
          const total = d.classes.filter((c) => c.group === g).length;
          const left = incompleteClasses(d, date, g).length;
          return (
            <section key={g} className="panel">
              <div className="row between"><h2>{g}부</h2><Badge tone={left ? "warning" : "success"}>{total}개 반 중 {total - left}개 완료</Badge></div>
              <GroupBar title={`${g}부`} sum={studentsSummary(d, date, groupStudents(d, g))} provisional={left > 0} />
            </section>
          );
        })}
      </div>
      <section className="panel">
        <div className="row between wrap g8">
          <div className="filters">
            <Seg value={tab} options={[["class", "반별 현황"], ["student", "학생별 현황표"]] as const} onChange={setTab} />
            <SelectBox label="그룹" value={group} onChange={setGroup}><option value="">그룹: 전체</option><option value="1">1부</option><option value="2">2부</option></SelectBox>
            <SelectBox label="학년" value={grade} onChange={setGrade}><option value="">학년: 전체</option>{[4, 5, 6].map((g) => <option key={g} value={g}>{g}학년</option>)}</SelectBox>
            <label className="row g6 sb"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />미완료 반만</label>
            {tab === "student" && <label className="row g6 sb"><input type="checkbox" checked={streakOnly} onChange={(e) => setStreakOnly(e.target.checked)} />연속 결석 학생</label>}
          </div>
          <Button variant="outline" size="s" onClick={exportCsv}><Icon name="download" size={14} />Excel 다운로드</Button>
        </div>
        <div className="tablewrap">
          {tab === "class" ? (
            <table className="tbl">
              <thead><tr><th>반</th><th>담임</th><th>전체</th><th>출석</th><th>결석</th><th>미확인</th><th style={{ width: 200 }}>출석률</th><th>상태</th><th>관리</th></tr></thead>
              <tbody>
                {classes.map((c) => {
                  const s = classSummary(d, date, c.id);
                  return (
                    <tr key={c.id}>
                      <td className="sb">{classLabel(c)}</td><td>{homeroomName(d, c.id)}</td><td>{s.total}명</td>
                      <td className="c-success sb">{s.p}</td><td className="c-error sb">{s.a}</td><td className="c-neutral sb">{s.u}</td>
                      <td><div className="row g8"><div className="grow"><Progress value={s.rate ?? 0} /></div><span className="sb num" style={{ width: 84 }}>{pctText(s.rate)}{!s.completed && s.rate !== null ? " (잠정)" : ""}</span></div></td>
                      <td><Badge tone={s.completed ? "success" : "warning"}>{s.completed ? "완료" : "미완료"}</Badge></td>
                      <td><Button variant="outline" size="s" onClick={() => setSheet(c)}>출석부 수정</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="tbl">
              <thead><tr><th>학생</th><th>반</th>{cols.map((dt) => <th key={dt} className="c">{fmtMD(dt)}</th>)}<th>연속 결석</th><th>연간 출석률</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => {
                  const c = classOf(d, s);
                  const st = streaks.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td className="sb">{s.name}</td><td>{c ? classLabel(c) : "-"}</td>
                      {cols.map((dt) => <td key={dt} className="c"><MarkDot mark={d.studentMarks[`${dt}|${s.id}`]} /></td>)}
                      <td>{st >= 2 ? <Badge tone="error">{st}주 연속</Badge> : <span className="muted">-</span>}</td>
                      <td className="sb num">{pctText(personRate(d.studentMarks, s.id, dates).rate)}</td>
                      <td><Button variant="outline" size="s" onClick={() => setDetail(s)}>상세</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {(tab === "class" ? classes.length : rows.length) === 0 && <p className="empty">조건에 맞는 항목이 없습니다.</p>}
        </div>
      </section>
      {sheet && <ClassSheetModal cls={sheet} date={date} onClose={() => setSheet(null)} />}
      {detail && <StudentDetailModal student={detail} onClose={() => setDetail(null)} />}
    </Page>
  );
}

// ───────── A06 학생 출석 통계 ─────────
export function Stats() {
  const d = useData();
  const { date } = useAdminDate();
  const [tab, setTab] = useState<"week" | "month" | "year">("month");
  const [detail, setDetail] = useState<Student | null>(null);
  const { y, m } = ym(date);
  const all = useMemo(() => yearSundays(d).filter((x) => x <= date), [d, date]);
  const range = tab === "week" ? [date] : tab === "month" ? all.filter((x) => ym(x).m === m) : all;
  const students = activeStudents(d);
  const ids = (list: Student[]) => list.map((s) => s.id);
  const sessionDone = (dt: string) => d.classes.every((c) => d.sessions[`${dt}|class:${c.id}`]?.completed);
  const trend =
    tab === "year"
      ? [...new Set(all.map((x) => ym(x).m))].map((mo) => ({ label: `${mo}월`, rate: rateOver(d.studentMarks, ids(students), all.filter((x) => ym(x).m === mo)), cur: mo === m, done: all.filter((x) => ym(x).m === mo).every(sessionDone) }))
      : (tab === "month" ? range : all.slice(-8)).map((dt) => ({ label: fmtMD(dt), rate: rateOver(d.studentMarks, ids(students), [dt]), cur: dt === date, done: sessionDone(dt) }));
  const groupRate = (g: 1 | 2) => rateOver(d.studentMarks, ids(groupStudents(d, g)), range);
  const gradeRate = (gr: number) => rateOver(d.studentMarks, ids(students.filter((s) => classOf(d, s)?.grade === gr)), range);
  const classRates = d.classes.map((c) => ({ c, rate: rateOver(d.studentMarks, ids(roster(d, c.id)), range) })).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  const streaks = students.map((s) => ({ s, ...consecutiveAbsences(d.studentMarks, s.id, all) })).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count);
  const title = tab === "week" ? fmtDot(date) : tab === "month" ? `${y}년 ${m}월` : `${y}학년도`;
  const exportCsv = () => download(`출석통계_${tab}_${date}.csv`, toCSV([["구분", "항목", "출석률"], ...trend.map((t) => ["추세", t.label, pctText(t.rate)]), ...([1, 2] as const).map((g) => ["그룹", `${g}부`, pctText(groupRate(g))]), ...[4, 5, 6].map((g) => ["학년", `${g}학년`, pctText(gradeRate(g))]), ...classRates.map(({ c, rate }) => ["반", classLabel(c), pctText(rate)])]));
  return (
    <Page title="학생 출석 통계" sub="주간·월간·연간 출석 통계와 추세를 확인합니다">
      <div className="row between wrap g12">
        <div className="row g16 wrap">
          <Seg value={tab} options={[["week", "주간"], ["month", "월간"], ["year", "연간"]] as const} onChange={setTab} />
          <strong className="t-lg b">{title}</strong>
        </div>
        <Button variant="outline" onClick={exportCsv}><Icon name="download" size={16} />Excel 다운로드</Button>
      </div>
      <div className="grid split">
        <section className="panel">
          <div className="row between">
            <h2>출석률 추세</h2>
            <div className="legend"><span><i style={{ background: "var(--primary)" }} />확정</span><span><i style={{ background: "var(--secondary)" }} />선택한 기간</span></div>
          </div>
          <div className="chart">
            {trend.map((t) => (
              <div key={t.label}>
                <strong className="t-xs sb">{pctText(t.rate)}</strong>
                <span className={`barv ${t.cur ? "cur" : ""}`} style={{ height: `${Math.max(4, (t.rate ?? 0) * 0.75)}%`, opacity: t.done ? 1 : 0.7 }} />
                <span className="t-xs muted">{t.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>1부 · 2부 비교</h2>
          <div className="grid cols-2" style={{ gap: 12 }}>
            {([1, 2] as const).map((g) => (
              <div key={g} className="col g4">
                <span className="muted">{g}부</span>
                <strong className="t-3xl b" style={{ color: g === 1 ? "var(--primary)" : "var(--secondary)" }}>{pctText(groupRate(g))}</strong>
                <span className="t-xs muted">{groupStudents(d, g).length}명 · {d.classes.filter((c) => c.group === g).length}개 반</span>
              </div>
            ))}
          </div>
          {([1, 2] as const).map((g) => <Progress key={g} value={groupRate(g) ?? 0} color={g === 1 ? "var(--primary)" : "var(--secondary)"} />)}
        </section>
      </div>
      <div className="grid cols-2">
        <section className="panel">
          <h2>학년별 출석률</h2>
          {[4, 5, 6].map((g) => (
            <div key={g} className="hbar"><span className="sb">{g}학년</span><Progress value={gradeRate(g) ?? 0} /><strong className="sb num">{pctText(gradeRate(g))}</strong></div>
          ))}
        </section>
        <section className="panel">
          <div className="row between"><h2>반별 출석률</h2><span className="t-xs muted">낮은 순 6개 반</span></div>
          {classRates.slice(0, 6).map(({ c, rate }) => (
            <div key={c.id} className="hbar"><span className="sb">{c.group}부 {classShort(c)}</span><Progress value={rate ?? 0} color={(rate ?? 100) < 85 ? "var(--secondary)" : undefined} /><strong className="sb num">{pctText(rate)}</strong></div>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="row between"><h2>연속 결석 학생 현황</h2><Badge tone="error">{streaks.length}명</Badge></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>학생</th><th>반</th><th>담임</th><th>연속 결석</th><th>마지막 출석</th><th>출석률</th><th>심방노트</th><th /></tr></thead>
            <tbody>
              {streaks.map(({ s, count, lastPresent }) => {
                const c = classOf(d, s);
                const noted = d.notes.some((n) => n.studentId === s.id && all.slice(-count).includes(n.date));
                return (
                  <tr key={s.id}>
                    <td><span className="row g8"><Avatar name={s.name} photo={s.photo} size={28} /><strong className="sb">{s.name}</strong></span></td>
                    <td>{c ? classLabel(c) : "-"}</td><td>{homeroomName(d, s.classId)}</td>
                    <td><Badge tone="error">{count}주 연속</Badge></td>
                    <td>{lastPresent ? fmtMD(lastPresent) : "-"}</td>
                    <td className="sb num">{pctText(personRate(d.studentMarks, s.id, all).rate)}</td>
                    <td><Badge tone={noted ? "success" : "neutral"}>{noted ? "작성됨" : "미작성"}</Badge></td>
                    <td><Button variant="outline" size="s" onClick={() => setDetail(s)}>상세</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!streaks.length && <p className="empty">2주 이상 연속으로 결석한 학생이 없습니다.</p>}
        </div>
      </section>
      {detail && <StudentDetailModal student={detail} onClose={() => setDetail(null)} />}
    </Page>
  );
}

// ───────── A07 심방노트 관리 ─────────
export function Notes() {
  const d = useData();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState("");
  const [from, setFrom] = useState(`${d.settings.year}-01-01`);
  const [to, setTo] = useState(`${d.settings.year}-12-31`);
  const [view, setView] = useState<VisitNote | null>(null);
  const info = (n: VisitNote) => {
    const s = d.students.find((x) => x.id === n.studentId);
    const c = s ? classOf(d, s) : undefined;
    return { s, c, by: d.users.find((u) => u.id === n.authorId)?.name ?? "-" };
  };
  const rows = d.notes
    .map((n) => ({ n, ...info(n) }))
    .filter(({ n, s, c }) => (!q.trim() || s?.name.includes(q.trim())) && (!group || String(c?.group) === group) && (!reason || (reason === "없음" ? !n.reason : n.reason === reason)) && (!author || n.authorId === author) && n.date >= from && n.date <= to);
  const authors = [...new Set(d.notes.map((n) => n.authorId))].map((id) => d.users.find((u) => u.id === id)).filter(Boolean) as User[];
  const exportCsv = () => download(`심방노트_${from}_${to}.csv`, toCSV([["주일", "학생", "반", "결석 사유", "내용", "작성자", "작성 시각"], ...rows.map(({ n, s, c, by }) => [n.date, s?.name, c ? classLabel(c) : "", n.reason ?? "", n.content, by, fmtStamp(n.createdAt)])]));
  return (
    <Page title="심방노트 관리" sub="결석 사유와 심방 이력을 검색·조회합니다">
      <section className="panel">
        <div className="filters">
          <div className="input m" style={{ minWidth: 200 }}><Icon name="search" size={18} /><input placeholder="학생 이름으로 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="학생 이름 검색" /></div>
          <label className="row g6 sb">기간 <input className="sel" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" /> ~ <input className="sel" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일" /></label>
          <SelectBox label="그룹" value={group} onChange={setGroup}><option value="">그룹: 전체</option><option value="1">1부</option><option value="2">2부</option></SelectBox>
          <SelectBox label="결석 사유" value={reason} onChange={setReason}><option value="">결석 사유: 전체</option>{REASONS.map((r) => <option key={r}>{r}</option>)}<option value="없음">사유 없음 (일반 노트)</option></SelectBox>
          <SelectBox label="작성자" value={author} onChange={setAuthor}><option value="">작성자: 전체</option>{authors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectBox>
        </div>
      </section>
      <section className="panel">
        <div className="row between"><h2>심방노트 {rows.length}건</h2><Button variant="outline" size="s" onClick={exportCsv}><Icon name="download" size={14} />Excel 다운로드</Button></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>주일</th><th>학생</th><th>결석 사유</th><th>내용</th><th>작성자</th><th>작성 시각</th><th /></tr></thead>
            <tbody>
              {rows.map(({ n, s, c, by }) => (
                <tr key={n.id}>
                  <td className="num">{fmtMD(n.date)}</td>
                  <td><div className="col g2"><strong className="sb">{s?.name ?? "-"}</strong><span className="t-xs muted">{c ? classLabel(c) : ""}</span></div></td>
                  <td>{n.reason ? <Badge tone="error">{n.reason}</Badge> : <span className="muted">-</span>}</td>
                  <td className="wraptext">{n.content || "(내용 없음)"}</td>
                  <td>{by}</td><td className="muted num">{fmtStamp(n.createdAt)}</td>
                  <td><Button variant="outline" size="s" onClick={() => setView(n)}>보기</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="empty">조건에 맞는 심방노트가 없습니다.</p>}
        </div>
        <Note icon="lock">심방노트와 연락처는 민감 정보입니다. 일반 교사는 담당 학생만 조회할 수 있으며, Google Sheets에서는 교사 공유용 출석대장이 아닌 관리자 전용 파일에만 동기화됩니다.</Note>
      </section>
      {view && (() => {
        const { s, c, by } = info(view);
        return (
          <Modal title="심방노트" onClose={() => setView(null)}>
            <div className="row g12"><Avatar name={s?.name ?? "?"} photo={s?.photo} /><div className="col g2 grow"><strong className="t-lg b">{s?.name}</strong><span className="muted">{c ? classLabel(c) : ""} · {fmtDot(view.date)}</span></div>{view.reason && <Badge tone="error">{view.reason}</Badge>}</div>
            <p className="card pad" style={{ lineHeight: 1.6, background: "var(--canvas)" }}>{view.content || "(내용 없음)"}</p>
            <span className="t-xs muted">{by} · {fmtStamp(view.createdAt)}</span>
          </Modal>
        );
      })()}
    </Page>
  );
}

// ───────── A11 교사 전체 출결현황 ─────────
function staffSummary(d: Data, date: string, list: User[]) {
  const marks = list.map((u) => d.teacherMarks[`${date}|${u.id}`]);
  const p = marks.filter((x) => x === "P").length;
  const a = marks.filter((x) => x === "A").length;
  return { total: list.length, p, a, u: list.length - p - a, rate: pct(p, a) };
}

export function TeacherAttendance() {
  const d = useData();
  const { date } = useAdminDate();
  const [tab, setTab] = useState<"week" | "month" | "year">("month");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<User | null>(null);
  const { y, m } = ym(date);
  const all = useMemo(() => yearSundays(d).filter((x) => x <= date), [d, date]);
  const monthDates = sundaysOfMonth(y, m).filter((x) => x <= date);
  const cols = tab === "week" ? [date] : tab === "month" ? monthDates : [];
  const staff = allStaff(d);
  const sum = staffSummary(d, date, staff);
  const pendingGroups = ([1, 2] as const).filter((g) => !d.sessions[`${date}|group:${g}`]?.completed);
  const rows = staff
    .filter((u) => (!q.trim() || u.name.includes(q.trim())) && (!group || String(u.group) === group))
    .filter((u) => { const mk = d.teacherMarks[`${date}|${u.id}`]; return !status || (status === "U" ? !mk : mk === status); })
    .sort((a, b) => (a.group ?? 9) - (b.group ?? 9) || Number(b.roles.includes("head")) - Number(a.roles.includes("head")) || a.name.localeCompare(b.name, "ko"));
  const exportCsv = () => download(`교사_출결현황_${date}.csv`, toCSV([["교사", "소속", "담당", ...cols.map(fmtMD), `${m}월 출석`, "연간 출석률"], ...rows.map((u) => { const mo = personRate(d.teacherMarks, u.id, monthDates); return [u.name, `${u.group}부`, teacherDuty(d, u, false), ...cols.map((dt) => markText(d.teacherMarks[`${dt}|${u.id}`])), `${mo.p}/${mo.p + mo.a}`, pctText(personRate(d.teacherMarks, u.id, all).rate)]; })]));
  return (
    <Page title="교사 출결현황" sub="1부·2부 교사의 주일 출석 현황을 확인합니다">
      <div className="grid cols-4">
        <Kpi label="전체 교사" value={`${sum.total}명`} sub={`1부 ${staff.filter((u) => u.group === 1).length}명 · 2부 ${staff.filter((u) => u.group === 2).length}명 (부장교사 포함)`} icon="badge" />
        <Kpi label="출석" value={`${sum.p}명`} sub={`출석률 ${pctText(sum.rate)}${pendingGroups.length ? " (잠정)" : ""}`} icon="check" tone="success" />
        <Kpi label="결석" value={`${sum.a}명`} sub={`${fmtDot(date)} 기준`} icon="x" tone="error" />
        <Kpi label="미확인" value={`${sum.u}명`} sub={pendingGroups.length ? `${pendingGroups.join("·")}부 교사 출석 미완료` : "모든 부서 완료"} icon="info" tone="warm" />
      </div>
      <section className="panel">
        <div className="row between wrap g8">
          <div className="filters">
            <Seg value={tab} options={[["week", "주간"], ["month", "월간"], ["year", "연간"]] as const} onChange={setTab} />
            <div className="input m" style={{ minWidth: 180 }}><Icon name="search" size={18} /><input placeholder="교사 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="교사 이름 검색" /></div>
            <SelectBox label="그룹" value={group} onChange={setGroup}><option value="">그룹: 전체</option><option value="1">1부</option><option value="2">2부</option></SelectBox>
            <SelectBox label="상태" value={status} onChange={setStatus}><option value="">상태: 전체</option><option value="P">출석</option><option value="A">결석</option><option value="U">미확인</option></SelectBox>
          </div>
          <Button variant="outline" size="s" onClick={exportCsv}><Icon name="download" size={14} />Excel 다운로드</Button>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>교사</th><th>소속</th><th>담당</th>{cols.map((dt) => <th key={dt} className="c">{fmtMD(dt)}</th>)}<th>{m}월 출석</th><th style={{ width: 180 }}>연간 출석률</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => {
                const mo = personRate(d.teacherMarks, u.id, monthDates);
                const yr = personRate(d.teacherMarks, u.id, all);
                return (
                  <tr key={u.id}>
                    <td><span className="row g8"><Avatar name={u.name} size={28} /><strong className="sb">{u.name}</strong></span></td>
                    <td>{u.group}부</td><td>{teacherDuty(d, u, false)}</td>
                    {cols.map((dt) => <td key={dt} className="c"><MarkDot mark={d.teacherMarks[`${dt}|${u.id}`]} /></td>)}
                    <td className="sb num">{mo.p} / {mo.p + mo.a}</td>
                    <td><div className="row g8"><div className="grow"><Progress value={yr.rate ?? 0} /></div><span className="sb num" style={{ width: 40 }}>{pctText(yr.rate)}</span></div></td>
                    <td><Button variant="outline" size="s" onClick={() => setEdit(u)}>기록 수정</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="empty">조건에 맞는 교사가 없습니다.</p>}
        </div>
        <Note>부장교사 본인의 출석은 관리자가 이 화면에서 입력합니다. 교사 출석과 학생 출석은 서로 독립적으로 집계됩니다.</Note>
      </section>
      {edit && (
        <Modal title={`${edit.name} · ${m}월 출석 기록`} onClose={() => setEdit(null)} footer={<Button onClick={() => setEdit(null)}>닫기</Button>}>
          <div className="col g10">
            {monthDates.map((dt) => (
              <div key={dt} className="row between"><strong className="sb">{fmtDot(dt)}</strong><Toggle fixed value={d.teacherMarks[`${dt}|${edit.id}`]} onChange={(mk) => setTeacherMark(dt, edit.id, mk)} /></div>
            ))}
          </div>
          <Note>수정 즉시 저장되며 변경 이력에 기록됩니다.</Note>
        </Modal>
      )}
    </Page>
  );
}
