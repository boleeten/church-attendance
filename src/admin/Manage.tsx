import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { currentSunday, fmtDot, fmtMD, fmtRelDay, fmtStamp, fmtTime12 } from "../lib/date";
import { toast } from "../lib/remote";
import { activeStudents, classSummary, consecutiveAbsences, download, groupTeachers, homeroomName, parseCSV, pctText, personRate, roster, studentsSummary, teacherDuty, teacherSummary, toCSV, yearSundays, type Summary } from "../lib/stats";
import { addClass, canManageAccount, canResetPassword, classCount, classLabel, classShort, moveStudents, resetPassword, sendStudentReminders, setAssignment, setUserActive, upsertStudent, upsertUser, useData, useMe } from "../lib/store";
import type { ClassRoom, Data, Role, Student, StudentStatus, User } from "../lib/types";
import { Avatar, Badge, Button, Icon, MarkDot, Modal, Note, Progress, Seg } from "../ui";
import { Page, useAdminDate } from "./AdminApp";

// ───────── 공용 조각 ─────────
export function Kpi({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub: string; icon: string; tone?: "success" | "error" | "warm" }) {
  return (
    <div className="kpi">
      <div className="row between">
        <span className="muted">{label}</span>
        <span className={`ico ${tone ?? ""}`}><Icon name={icon} size={18} /></span>
      </div>
      <strong>{value}</strong>
      <span className="t-xs muted">{sub}</span>
    </div>
  );
}

export function GroupBar({ title, sum, provisional }: { title: string; sum: Summary; provisional: boolean }) {
  const w = (n: number) => `${sum.total ? (n / sum.total) * 100 : 0}%`;
  return (
    <div className="col g8">
      <div className="row between">
        <span><strong className="b">{title}</strong> <span className="muted t-xs">전체 {sum.total}명</span></span>
        <strong className="sb">출석률 {pctText(sum.rate)}{provisional ? " (잠정)" : ""}</strong>
      </div>
      <div className="stack">
        <i style={{ width: w(sum.p), background: "var(--success)" }} />
        <i style={{ width: w(sum.a), background: "var(--error)" }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--success)" }} />출석 {sum.p}</span>
        <span><i style={{ background: "var(--error)" }} />결석 {sum.a}</span>
        <span><i style={{ background: "var(--track)" }} />미확인 {sum.u}</span>
      </div>
    </div>
  );
}

export const groupStudents = (d: Data, g: 1 | 2) => {
  const ids = new Set(d.classes.filter((c) => c.group === g).map((c) => c.id));
  return activeStudents(d).filter((s) => ids.has(s.classId));
};
export const incompleteClasses = (d: Data, date: string, g?: 1 | 2) => d.classes.filter((c) => (!g || c.group === g) && !d.sessions[`${date}|class:${c.id}`]?.completed);
export const classOf = (d: Data, s: Student) => d.classes.find((c) => c.id === s.classId);
/** 필터 선택 상자: 높이 40, 테두리, 오른쪽 꺾쇠(14px) */
/** 필터 선택 상자: 높이 40, 테두리, 오른쪽 꺾쇠(14px). 폭은 선택된 글자에 맞춘다(디자인의 hug). */
function SelectBox({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLSelectElement>(null);
  const [text, setText] = useState("");
  useLayoutEffect(() => setText(ref.current?.selectedOptions[0]?.text ?? ""));
  return (
    <label className="selbox">
      <span className="selbox-text" aria-hidden="true">{text}</span>
      <Icon name="down" size={14} />
      <select ref={ref} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>{children}</select>
    </label>
  );
}
export { SelectBox };

// ───────── A01 통합 대시보드 ─────────
export function Dashboard() {
  const d = useData();
  const { date } = useAdminDate();
  const students = activeStudents(d);
  const staff = d.users.filter((u) => u.roles.includes("teacher") && u.group !== null);
  const pending = incompleteClasses(d, date);
  const teacherDone = ([1, 2] as const).filter((g) => d.sessions[`${date}|group:${g}`]?.completed);
  const dates = yearSundays(d).filter((x) => x <= date).slice(-6);
  const feed = Object.entries(d.sessions)
    .filter(([k]) => k.startsWith(date))
    .map(([k, v]) => ({ target: k.split("|")[1], ...v }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 5);
  const targetLabel = (t: string) => {
    if (t.startsWith("group:")) return `${t.slice(6)}부 교사 출석`;
    const c = d.classes.find((x) => x.id === t.slice(6));
    return c ? `${classLabel(c)} 출석` : "출석";
  };
  const logs = d.notifLogs.filter((l) => l.at.slice(0, 10) >= date);
  const noPush = staff.filter((u) => !u.pushAllowed && u.active);
  return (
    <Page title="통합 대시보드" sub={`${d.settings.year}학년도 · ${fmtDot(date)} 주일 기준`}>
      <div className="grid cols-4">
        <Kpi label="전체 학생" value={`${students.length}명`} sub={`1부 ${groupStudents(d, 1).length}명 · 2부 ${groupStudents(d, 2).length}명 (등록 기준)`} icon="users" />
        <Kpi label="전체 교사" value={`${staff.length}명`} sub={`1부 ${staff.filter((u) => u.group === 1).length}명 · 2부 ${staff.filter((u) => u.group === 2).length}명`} icon="badge" />
        <Kpi label="학생 출석 완료" value={`${d.classes.length - pending.length} / ${d.classes.length}반`} sub={pending.length ? `미완료 ${pending.length}개 반` : "모든 반 완료"} icon="calendar" tone={pending.length ? "warm" : "success"} />
        <Kpi label="교사 출석 완료" value={`${teacherDone.length} / 2부서`} sub={teacherDone.length === 2 ? "모든 부서 완료" : `${[1, 2].filter((g) => !teacherDone.includes(g as 1 | 2)).join("·")}부 교사 출석 미완료`} icon="user" tone={teacherDone.length === 2 ? "success" : "warm"} />
      </div>
      <div className="grid cols-2">
        <section className="panel">
          <div className="row between"><h2>학생 출석현황</h2><Badge tone="success">실시간</Badge></div>
          {([1, 2] as const).map((g) => <GroupBar key={g} title={`${g}부`} sum={studentsSummary(d, date, groupStudents(d, g))} provisional={incompleteClasses(d, date, g).length > 0} />)}
        </section>
        <section className="panel">
          <div className="row between"><h2>교사 출석현황</h2><Badge tone="success">실시간</Badge></div>
          {([1, 2] as const).map((g) => <GroupBar key={g} title={`${g}부`} sum={teacherSummary(d, date, g)} provisional={!d.sessions[`${date}|group:${g}`]?.completed} />)}
        </section>
      </div>
      <div className="grid split">
        <section className="panel">
          <div className="row between">
            <h2>학생 출석 미완료 반</h2>
            <Button variant="secondary" size="s" disabled={!pending.length} onClick={() => toast(`${sendStudentReminders(date)}명의 담임 교사에게 알림을 보냈습니다.`)}>전체 알림 재발송</Button>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>반</th><th>담임</th><th>미확인</th><th>마지막 입력</th><th /></tr></thead>
              <tbody>
                {pending.map((c) => {
                  const s = d.sessions[`${date}|class:${c.id}`];
                  return (
                    <tr key={c.id}>
                      <td className="sb">{classLabel(c)}</td>
                      <td>{homeroomName(d, c.id)}</td>
                      <td className="c-error sb">{classSummary(d, date, c.id).u}명</td>
                      <td className="muted">{s ? `임시저장 ${fmtRelDay(s.savedAt)}` : "입력 없음"}</td>
                      <td><Button variant="outline" size="s" onClick={() => toast(sendStudentReminders(date, c.id) ? `${classLabel(c)} 담임에게 알림을 보냈습니다.` : "배정된 담임 교사가 없습니다.")}>알림 보내기</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!pending.length && <p className="empty">모든 반이 출석을 완료했습니다.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="row between"><h2>실시간 등록 상태</h2><span className="t-xs muted">최근 5건</span></div>
          {feed.length === 0 && <p className="empty">이 주일에 입력된 출석부가 없습니다.</p>}
          {feed.map((f) => {
            const by = d.users.find((u) => u.id === f.savedBy);
            return (
              <div key={f.target} className="row g10">
                <Avatar name={by?.name ?? "?"} size={32} />
                <div className="col g2 grow">
                  <strong className="sb">{by?.name ?? "알 수 없음"}</strong>
                  <span className="t-xs muted">{targetLabel(f.target)} {f.completed ? "완료" : "임시저장"}</span>
                </div>
                <span className="t-xs muted">{fmtRelDay(f.savedAt)}</span>
              </div>
            );
          })}
        </section>
      </div>
      <div className="grid split">
        <section className="panel">
          <h2>최근 학생 출석률</h2>
          <div className="chart">
            {dates.map((dt) => {
              const r = studentsSummary(d, dt, students).rate ?? 0;
              return (
                <div key={dt}>
                  <strong className="t-xs sb">{r}%</strong>
                  <span className={`barv ${dt === date ? "cur" : ""}`} style={{ height: `${Math.max(4, r * 0.75)}%` }} />
                  <span className="t-xs muted">{fmtMD(dt)}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="row between"><h2>알림 발송 현황</h2><Link to="/admin/notify" className="btn outline s">설정</Link></div>
          <div className="row between"><span className="muted">자동 알림</span><strong className="sb">매주 일요일 {fmtTime12(d.settings.studentNotifyTime)}</strong></div>
          <div className="row between"><span className="muted">이 주일 발송</span><strong className="sb">{logs.filter((l) => l.result === "성공").length}건 성공 · {logs.filter((l) => l.result !== "성공").length}건 실패</strong></div>
          <Note>알림 권한 미설정 교사 {noPush.length}명 — 앱 안의 알림 목록(종 아이콘)으로 안내됩니다.</Note>
        </section>
      </div>
    </Page>
  );
}

// ───────── A02 학생 목록 및 관리 ─────────
const STATUSES: StudentStatus[] = ["등록", "장결자", "교회이동"];
const statusTone = (s: StudentStatus) => (s === "등록" ? "success" : s === "장결자" ? "warning" : "neutral");

function StudentForm({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const d = useData();
  const [f, setF] = useState<Omit<Student, "id">>(student ?? { name: "", classId: d.classes[0]?.id ?? "", status: "등록", phone: "", guardianPhone: "", guardianRel: "모" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.name.trim()) return setErr("이름을 입력해 주세요.");
    const c = d.classes.find((x) => x.id === f.classId);
    if (!c) return setErr("반을 선택해 주세요.");
    const joining = f.status === "등록" && (!student || student.classId !== f.classId || student.status !== "등록");
    if (joining && classCount(c.id) >= c.capacity) return setErr(`${classLabel(c)}은 정원(${c.capacity}명)이 찼습니다. 다른 반을 선택해 주세요.`);
    upsertStudent({ ...f, name: f.name.trim(), id: student?.id });
    toast(student ? "학생 정보를 수정했습니다." : "학생을 등록했습니다.");
    onClose();
  };
  const inp = (label: string, k: "name" | "phone" | "guardianPhone" | "guardianRel", ph: string) => (
    <div className="field"><label>{label}</label><div className="input m"><input value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} aria-label={label} /></div></div>
  );
  return (
    <Modal title={student ? "학생 정보 수정" : "학생 등록"} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>취소</Button><Button onClick={save}>저장</Button></>}>
      {inp("이름", "name", "학생 이름")}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>반</label>
          <SelectBox label="반" value={f.classId} onChange={(v) => set("classId", v)}>
            {d.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)} ({classCount(c.id)}/{c.capacity})</option>)}
          </SelectBox>
        </div>
        <div className="field"><label>상태</label>
          <SelectBox label="상태" value={f.status} onChange={(v) => set("status", v)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</SelectBox>
        </div>
        {inp("학생 연락처", "phone", "010-0000-0000")}
        {inp("보호자 연락처", "guardianPhone", "010-0000-0000")}
        {inp("보호자 관계", "guardianRel", "모 / 부 / 조모 등")}
      </div>
      {err && <p className="c-error t-xs sb" role="alert">{err}</p>}
    </Modal>
  );
}

export function StudentDetailModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const d = useData();
  const dates = yearSundays(d);
  const c = classOf(d, student);
  const year = personRate(d.studentMarks, student.id, dates);
  const streak = consecutiveAbsences(d.studentMarks, student.id, dates);
  const notes = d.notes.filter((n) => n.studentId === student.id);
  return (
    <Modal title="학생 상세" onClose={onClose} wide>
      <div className="row g16">
        <Avatar name={student.name} photo={student.photo} size={64} />
        <div className="col g6 grow">
          <strong className="t-lg b">{student.name}</strong>
          <div className="row g6 wrap">
            <Badge tone="info">{c ? classLabel(c) : "미배정"}</Badge>
            <Badge tone={statusTone(student.status)}>{student.status}</Badge>
            {streak.count >= 2 && <Badge tone="error">{streak.count}주 연속 결석</Badge>}
          </div>
        </div>
        <div className="col" style={{ textAlign: "right" }}>
          <span className="t-xs muted">{d.settings.year}년 출석률</span>
          <strong className="t-2xl b">{pctText(year.rate)}</strong>
          <span className="t-xs muted">{year.p} / {year.p + year.a}주</span>
        </div>
      </div>
      <div className="grid cols-3" style={{ gap: 12 }}>
        <div className="col g4"><span className="t-xs muted">담임교사</span><strong className="sb">{c ? homeroomName(d, c.id) : "-"}</strong></div>
        <div className="col g4"><span className="t-xs muted">학생 연락처</span><strong className="sb num">{student.phone || "-"}</strong></div>
        <div className="col g4"><span className="t-xs muted">보호자 ({student.guardianRel})</span><strong className="sb num">{student.guardianPhone || "-"}</strong></div>
      </div>
      <div className="row g12 wrap">
        {dates.slice(-10).map((dt) => (
          <div key={dt} className="col center g6"><span className="t-xs muted">{fmtMD(dt)}</span><MarkDot mark={d.studentMarks[`${dt}|${student.id}`]} /></div>
        ))}
      </div>
      <h3 className="t-base b">심방노트 {notes.length}건</h3>
      {notes.length === 0 && <p className="muted">작성된 심방노트가 없습니다.</p>}
      {notes.map((n) => (
        <div key={n.id} className="card pad col g6">
          <div className="row g8">{n.reason && <Badge tone="error">{n.reason}</Badge>}<span className="t-xs muted">{fmtDot(n.date)}</span></div>
          <p style={{ lineHeight: 1.5 }}>{n.content || "(내용 없음)"}</p>
          <span className="t-xs muted">{d.users.find((u) => u.id === n.authorId)?.name ?? "-"} · {fmtStamp(n.createdAt)}</span>
        </div>
      ))}
    </Modal>
  );
}

const PAGE = 12;

export function Students() {
  const d = useData();
  const { date } = useAdminDate();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [grade, setGrade] = useState("");
  const [classId, setClassId] = useState(params.get("class") ?? "");
  const [status, setStatus] = useState("");
  const [mark, setMark] = useState("");
  const [streakOnly, setStreakOnly] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Student | null | "new">(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dates = useMemo(() => yearSundays(d), [d]);

  const rows = useMemo(() => {
    const term = q.trim().replace(/-/g, "");
    return d.students
      .map((s) => ({ s, c: classOf(d, s), teacher: homeroomName(d, s.classId) }))
      .filter(({ s, c, teacher }) => {
        if (term && !(s.name.includes(term) || s.phone.replace(/-/g, "").includes(term) || s.guardianPhone.replace(/-/g, "").includes(term) || teacher.includes(term))) return false;
        if (group && String(c?.group) !== group) return false;
        if (grade && String(c?.grade) !== grade) return false;
        if (classId && s.classId !== classId) return false;
        if (teacherId && !d.assignments.some((a) => a.userId === teacherId && a.classId === s.classId)) return false;
        if (status && s.status !== status) return false;
        const m = d.studentMarks[`${date}|${s.id}`];
        if (mark && (mark === "U" ? !!m : m !== mark)) return false;
        if (streakOnly && consecutiveAbsences(d.studentMarks, s.id, dates).count < 2) return false;
        return true;
      })
      .sort((a, b) => (a.c && b.c ? d.classes.indexOf(a.c) - d.classes.indexOf(b.c) : 0) || a.s.name.localeCompare(b.s.name, "ko"));
  }, [d, q, group, grade, classId, teacherId, status, mark, streakOnly, date, dates]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const view = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = () => { setQ(""); setGroup(""); setGrade(""); setClassId(""); setStatus(""); setMark(""); setStreakOnly(false); setTeacherId(""); setPage(0); };
  const teacherOptions = d.users.filter((u) => d.assignments.some((a) => a.userId === u.id)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const upd = (f: (v: string) => void) => (v: string) => { f(v); setPage(0); };
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };

  const exportCsv = () =>
    download(`학생명부_${date}.csv`, toCSV([["이름", "그룹", "학년", "반", "담임교사", "학생 연락처", "보호자 연락처", "보호자 관계", "상태", "출석률"], ...rows.map(({ s, c, teacher }) => [s.name, c ? `${c.group}부` : "", c?.grade, c?.no, teacher, s.phone, s.guardianPhone, s.guardianRel, s.status, pctText(personRate(d.studentMarks, s.id, dates).rate)])]));

  const importCsv = async (file: File) => {
    const lines = parseCSV(await file.text()).slice(1);
    let ok = 0;
    const skipped: string[] = [];
    for (const [name, g, gr, no, phone, guardian, rel] of lines) {
      const c = d.classes.find((x) => String(x.group) === String(g).replace("부", "") && String(x.grade) === String(gr) && String(x.no) === String(no));
      if (!name || !c || classCount(c.id) >= c.capacity) { skipped.push(name || "(이름 없음)"); continue; }
      upsertStudent({ name, classId: c.id, status: "등록", phone: phone ?? "", guardianPhone: guardian ?? "", guardianRel: rel || "모" });
      ok++;
    }
    toast(`${ok}명 등록${skipped.length ? `, ${skipped.length}명 제외(반 없음·정원 초과): ${skipped.slice(0, 3).join(", ")}` : ""}`, skipped.length ? "error" : "info");
  };

  return (
    <Page title="학생 관리" sub="학생 등록·검색·반 이동·상태를 관리합니다">
      <section className="panel filter-panel">
        <div className="input m">
          <Icon name="search" size={16} />
          <input placeholder="이름, 학생·보호자 전화번호, 담당 교사로 검색" value={q} onChange={(e) => upd(setQ)(e.target.value)} aria-label="학생 검색" />
        </div>
        <div className="filter-row">
          <SelectBox label="그룹" value={group} onChange={upd(setGroup)}><option value="">그룹: 전체</option><option value="1">그룹: 1부</option><option value="2">그룹: 2부</option></SelectBox>
          <SelectBox label="학년" value={grade} onChange={upd(setGrade)}><option value="">학년: 전체</option>{[4, 5, 6].map((g) => <option key={g} value={g}>학년: {g}학년</option>)}</SelectBox>
          <SelectBox label="반" value={classId} onChange={upd(setClassId)}><option value="">반: 전체</option>{d.classes.filter((c) => (!group || String(c.group) === group) && (!grade || String(c.grade) === grade)).map((c) => <option key={c.id} value={c.id}>반: {classLabel(c)}</option>)}</SelectBox>
          <SelectBox label="담당 교사" value={teacherId} onChange={upd(setTeacherId)}><option value="">담당 교사: 전체</option>{teacherOptions.map((u) => <option key={u.id} value={u.id}>담당 교사: {u.name}</option>)}</SelectBox>
          <SelectBox label="상태" value={status} onChange={upd(setStatus)}><option value="">상태: 전체</option>{STATUSES.map((s) => <option key={s} value={s}>상태: {s}</option>)}</SelectBox>
          <SelectBox label="출석 상태" value={mark} onChange={upd(setMark)}><option value="">출석 상태: 전체</option><option value="P">출석 상태: 출석</option><option value="A">출석 상태: 결석</option><option value="U">출석 상태: 미확인</option></SelectBox>
          <label className="chk"><input type="checkbox" checked={streakOnly} onChange={(e) => { setStreakOnly(e.target.checked); setPage(0); }} />연속 결석만</label>
          <span className="spacer" />
          <button type="button" className="filter-reset" onClick={reset}>필터 초기화</button>
        </div>
      </section>
      <section className="panel">
        <div className="row between wrap g8">
          <h2>검색 결과 {rows.length}명{sel.size > 0 && <span className="muted sb"> · {sel.size}명 선택됨</span>}</h2>
          <div className="row g8 wrap">
            <Button variant="outline" size="s" disabled={!sel.size} onClick={() => { setMoveTo(""); setMoving(true); }}>선택 학생 반 이동</Button>
            <Button variant="outline" size="s" onClick={exportCsv}><Icon name="download" size={14} />Excel 다운로드</Button>
            <Button variant="secondary" size="s" onClick={() => fileRef.current?.click()}>Excel/CSV 일괄 등록</Button>
            <button type="button" className="link" onClick={() => download("학생_일괄등록_양식.csv", toCSV([["이름", "그룹", "학년", "반", "학생 연락처", "보호자 연락처", "보호자 관계"], ["홍길동", "1부", 4, 2, "010-0000-0000", "010-0000-0000", "모"]]))}>양식 받기</button>
            <Button size="s" onClick={() => setEdit("new")}><Icon name="plus" size={14} />학생 등록</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
          </div>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 36 }} /><th>학생</th><th>그룹</th><th>학년</th><th>반</th><th>담임교사</th><th>학생 연락처</th><th>보호자 연락처</th><th>상태</th><th>출석률</th><th>관리</th></tr></thead>
            <tbody>
              {view.map(({ s, c, teacher }) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.name} 선택`} /></td>
                  <td><span className="row g8"><Avatar name={s.name} photo={s.photo} size={28} /><strong className="sb">{s.name}</strong></span></td>
                  <td>{c ? `${c.group}부` : "-"}</td><td>{c ? `${c.grade}학년` : "-"}</td><td>{c ? `${c.no}반` : "-"}</td>
                  <td>{teacher}</td>
                  <td className="num">{s.phone || "-"}</td><td className="num">{s.guardianPhone || "-"}</td>
                  <td><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                  <td className="sb num">{pctText(personRate(d.studentMarks, s.id, dates).rate)}</td>
                  <td><span className="row g6"><Button variant="outline" size="s" onClick={() => setDetail(s)}>상세</Button><Button variant="secondary" size="s" onClick={() => setEdit(s)}>수정</Button></span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="empty">조건에 맞는 학생이 없습니다.</p>}
        </div>
        <div className="row center g8">
          <Button variant="outline" size="s" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="이전 페이지">‹</Button>
          <span className="sb num">{cur + 1} / {pages}</span>
          <Button variant="outline" size="s" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="다음 페이지">›</Button>
        </div>
      </section>
      {edit && <StudentForm student={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {detail && <StudentDetailModal student={detail} onClose={() => setDetail(null)} />}
      {moving && (
        <Modal title={`선택 학생 ${sel.size}명 반 이동`} onClose={() => setMoving(false)} footer={<><Button variant="outline" onClick={() => setMoving(false)}>취소</Button><Button disabled={!moveTo} onClick={() => { const e = moveStudents([...sel], moveTo); if (e) return toast(e, "error"); toast("반을 이동했습니다. 이전 출석 기록은 그대로 보존됩니다."); setSel(new Set()); setMoving(false); }}>이동</Button></>}>
          <SelectBox label="이동할 반" value={moveTo} onChange={setMoveTo}>
            <option value="">이동할 반 선택</option>
            {d.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)} ({classCount(c.id)}/{c.capacity})</option>)}
          </SelectBox>
          <Note>반을 옮겨도 이전 출석 기록과 심방노트는 보존됩니다. 정원(10명)을 넘는 이동은 할 수 없습니다.</Note>
        </Modal>
      )}
    </Page>
  );
}

// ───────── A03 그룹·반 관리 ─────────
function AssignModal({ cls, onClose }: { cls: ClassRoom; onClose: () => void }) {
  const d = useData();
  const pool = d.users.filter((u) => u.roles.includes("teacher") && u.group === cls.group && u.active);
  const cur = (k: "담임" | "보조") => d.assignments.filter((a) => a.classId === cls.id && a.kind === k).map((a) => a.userId);
  const [main, setMain] = useState(cur("담임")[0] ?? "");
  const [subs, setSubs] = useState<string[]>(cur("보조"));
  return (
    <Modal title={`${classLabel(cls)} 교사 배정`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>취소</Button><Button onClick={() => { setAssignment(cls.id, "담임", main ? [main] : []); setAssignment(cls.id, "보조", subs.filter((x) => x !== main)); toast("교사 배정을 저장했습니다."); onClose(); }}>저장</Button></>}>
      <div className="field"><label>담임</label>
        <SelectBox label="담임" value={main} onChange={setMain}><option value="">미배정</option>{pool.map((u) => <option key={u.id} value={u.id}>{u.name} ({teacherDuty(d, u)})</option>)}</SelectBox>
      </div>
      <div className="field"><label>보조 (여러 명 선택 가능)</label>
        <div className="row wrap g8">
          {pool.filter((u) => u.id !== main).map((u) => {
            const on = subs.includes(u.id);
            return <button key={u.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSubs(on ? subs.filter((x) => x !== u.id) : [...subs, u.id])}>{u.name}</button>;
          })}
        </div>
      </div>
      <Note>한 교사가 여러 반을 맡을 수 있습니다. 변경 내역은 감사 로그에 기록됩니다.</Note>
    </Modal>
  );
}

export function Classes() {
  const d = useData();
  const [g, setG] = useState<"1" | "2">("1");
  const [assign, setAssign] = useState<ClassRoom | null>(null);
  const [adding, setAdding] = useState(false);
  const [grade, setGrade] = useState("4");
  const group = Number(g) as 1 | 2;
  const list = d.classes.filter((c) => c.group === group);
  const total = groupStudents(d, group).length;
  const full = list.filter((c) => classCount(c.id) >= c.capacity);
  const names = (cid: string, k: "담임" | "보조") => d.assignments.filter((a) => a.classId === cid && a.kind === k).map((a) => d.users.find((u) => u.id === a.userId)?.name).filter(Boolean).join(", ") || "미배정";
  const count = (n: 1 | 2) => d.classes.filter((c) => c.group === n).length;
  return (
    <Page title="그룹·반 관리" sub="1부·2부 그룹과 학년별 반, 담당 교사를 관리합니다">
      <div className="row between wrap g12">
        <div className="row g16 wrap">
          <Seg value={g} options={[["1", `1부 · ${count(1)}개 반`], ["2", `2부 · ${count(2)}개 반`]] as const} onChange={setG} />
          <span className="muted sb">{g}부 등록 {total}명 / 정원 {list.reduce((n, c) => n + c.capacity, 0)}명</span>
        </div>
        <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} />반 추가</Button>
      </div>
      {full.length > 0 && <Note warm icon="warning">{full.map(classShort).join(", ")}이 정원(10명)에 도달했습니다. 학생을 추가하려면 다른 반으로 배정하세요.</Note>}
      {[4, 5, 6].map((gr) => (
        <section key={gr} className="col g12">
          <h2 className="t-base b">{gr}학년</h2>
          <div className="grid cols-4" style={{ gap: 16 }}>
            {list.filter((c) => c.grade === gr).map((c) => {
              const n = classCount(c.id);
              return (
                <div key={c.id} className="class-card">
                  <div className="row between">
                    <strong className="t-base b">{classShort(c)}</strong>
                    {n >= c.capacity ? <Badge tone="error">정원 마감</Badge> : n >= c.capacity - 1 ? <Badge tone="warning">정원 임박</Badge> : null}
                  </div>
                  <div className="row g8"><Badge tone="info">담임</Badge><span className="sb ellipsis">{names(c.id, "담임")}</span></div>
                  <div className="row g8"><Badge>보조</Badge><span className="ellipsis muted">{names(c.id, "보조")}</span></div>
                  <Progress value={(n / c.capacity) * 100} color={n >= c.capacity ? "var(--error)" : undefined} />
                  <span className="t-xs muted">현재 {n}명 / 정원 {c.capacity}명</span>
                  <div className="row g8">
                    <Button variant="outline" size="s" className="grow" onClick={() => setAssign(c)}>교사 배정</Button>
                    <Link to={`/admin/students?class=${c.id}`} className="btn secondary s grow">학생 이동</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {assign && <AssignModal cls={assign} onClose={() => setAssign(null)} />}
      {adding && (
        <Modal title={`${g}부 반 추가`} onClose={() => setAdding(false)} footer={<><Button variant="outline" onClick={() => setAdding(false)}>취소</Button><Button onClick={() => { addClass(group, Number(grade)); toast("반을 추가했습니다."); setAdding(false); }}>추가</Button></>}>
          <div className="field"><label>학년</label><SelectBox label="학년" value={grade} onChange={setGrade}>{[4, 5, 6].map((x) => <option key={x} value={x}>{x}학년</option>)}</SelectBox></div>
          <Note>새 반은 해당 학년의 다음 번호로 만들어지며 정원은 10명입니다.</Note>
        </Modal>
      )}
    </Page>
  );
}

// ───────── A04 교사 및 계정 관리 ─────────
export function TempPasswordModal({ loginId, password, onClose }: { loginId: string; password: string; onClose: () => void }) {
  return (
    <Modal title="임시 비밀번호 발급" onClose={onClose} footer={<Button onClick={onClose}>확인</Button>}>
      <p>아래 임시 비밀번호를 본인에게 직접 전달해 주세요. 이 창을 닫으면 다시 볼 수 없습니다.</p>
      <div className="card pad col g8">
        <div className="row between"><span className="muted">아이디</span><strong className="sb">{loginId}</strong></div>
        <div className="row between"><span className="muted">임시 비밀번호</span><strong className="t-lg b num">{password}</strong></div>
      </div>
      <Note>다음 로그인 시 비밀번호 변경이 필수이며, 발급 내역은 감사 로그에 기록됩니다.</Note>
    </Modal>
  );
}

function TeacherForm({ user, onClose, onTemp }: { user: User | null; onClose: () => void; onTemp: (id: string, pw: string) => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [loginId, setLoginId] = useState(user?.loginId ?? "");
  const [group, setGroup] = useState(String(user?.group ?? 1));
  const [head, setHead] = useState(user?.roles.includes("head") ?? false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || !/^[a-z0-9_]{4,20}$/.test(loginId)) return setErr("이름과 아이디(영문 소문자·숫자·밑줄 4~20자)를 확인해 주세요.");
    const keep = (user?.roles ?? []).filter((r) => r !== "teacher" && r !== "head");
    const roles: Role[] = [...keep, ...(head ? (["head"] as Role[]) : (["teacher"] as Role[]))];
    setBusy(true);
    const r = await upsertUser({ id: user?.id, name: name.trim(), loginId, group: Number(group) as 1 | 2, roles });
    setBusy(false);
    if (typeof r === "string") return setErr(r);
    toast(user ? "교사 정보를 수정했습니다." : "교사를 등록했습니다.");
    onClose();
    if (r) onTemp(loginId, r.tempPassword);
  };
  return (
    <Modal title={user ? "교사 정보 수정" : "교사 등록"} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>취소</Button><Button disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</Button></>}>
      <div className="field"><label>이름</label><div className="input m"><input value={name} onChange={(e) => setName(e.target.value)} aria-label="이름" /></div></div>
      <div className="field"><label>아이디</label><div className="input m"><input value={loginId} onChange={(e) => setLoginId(e.target.value.toLowerCase())} placeholder="teacher_hong01" aria-label="아이디" /></div></div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>소속</label><SelectBox label="소속" value={group} onChange={setGroup}><option value="1">1부</option><option value="2">2부</option></SelectBox></div>
        <div className="field"><label>구분</label><SelectBox label="구분" value={head ? "head" : "teacher"} onChange={(v) => setHead(v === "head")}><option value="teacher">교사</option><option value="head">부장교사</option></SelectBox></div>
      </div>
      {!user && <Note>등록하면 임시 비밀번호가 발급되고, 첫 로그인 때 비밀번호를 변경해야 합니다. 담당 반은 그룹·반 관리에서 배정합니다.</Note>}
      {err && <p className="c-error t-xs sb" role="alert">{err}</p>}
    </Modal>
  );
}

export function Teachers() {
  const d = useData();
  const me = useMe()!;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [role, setRole] = useState("");
  const [edit, setEdit] = useState<User | null | "new">(null);
  const [temp, setTemp] = useState<{ id: string; pw: string } | null>(null);
  const list = d.users
    .filter((u) => u.roles.includes("teacher") || u.roles.includes("head"))
    .filter((u) => (!q.trim() || u.name.includes(q.trim()) || u.loginId.includes(q.trim())) && (!group || String(u.group) === group) && (!role || u.roles.includes(role as Role)))
    .sort((a, b) => (a.group ?? 9) - (b.group ?? 9) || Number(b.roles.includes("head")) - Number(a.roles.includes("head")) || a.name.localeCompare(b.name, "ko"));
  const doReset = async (u: User) => {
    if (!window.confirm(`${u.name}(${u.loginId}) 계정의 비밀번호를 초기화할까요?`)) return;
    const r = await resetPassword(u.id);
    if (typeof r === "string") toast(r, "error");
    else setTemp({ id: u.loginId, pw: r.tempPassword });
  };
  return (
    <Page title="교사·계정 관리" sub="교사 등록, 담당 반 배정, 로그인 계정을 관리합니다">
      <section className="panel">
        <div className="row g8 wrap">
          <div className="input m grow" style={{ minWidth: 220 }}><Icon name="search" size={18} /><input placeholder="교사 이름, 아이디 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="교사 검색" /></div>
          <SelectBox label="그룹" value={group} onChange={setGroup}><option value="">그룹: 전체</option><option value="1">1부</option><option value="2">2부</option></SelectBox>
          <SelectBox label="역할" value={role} onChange={setRole}><option value="">역할: 전체</option><option value="teacher">교사</option><option value="head">부장교사</option><option value="admin">일반 관리자</option><option value="super">최고 관리자</option></SelectBox>
          <Button onClick={() => setEdit("new")}><Icon name="plus" size={16} />교사 등록</Button>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>교사</th><th>아이디</th><th>소속</th><th>담당 반</th><th>역할</th><th>계정</th><th>관리</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><span className="row g8"><Avatar name={u.name} size={28} /><strong className="sb">{u.name}</strong></span></td>
                  <td className="muted">{u.loginId}</td>
                  <td>{u.group}부</td>
                  <td>{u.roles.includes("head") ? "-" : teacherDuty(d, u, false)}</td>
                  <td><span className="row g6">
                    <Badge tone="info">{u.roles.includes("head") ? "부장교사" : "교사"}</Badge>
                    {u.roles.includes("super") ? <Badge tone="warning">최고 관리자</Badge> : u.roles.includes("admin") ? <Badge tone="warning">일반 관리자</Badge> : null}
                  </span></td>
                  <td><Badge tone={u.active ? "success" : "neutral"}>{u.active ? "활성" : "비활성"}</Badge>{u.mustChangePassword && <span className="t-xs muted"> 임시 비밀번호</span>}</td>
                  <td><span className="row g6">
                    <Button variant="outline" size="s" disabled={!canManageAccount(me, u)} onClick={() => setEdit(u)}>수정</Button>
                    <Button variant="danger" size="s" disabled={!canResetPassword(me, u)} onClick={() => doReset(u)}>비밀번호 초기화</Button>
                    <Button variant="outline" size="s" disabled={!canManageAccount(me, u)} onClick={() => { const e = setUserActive(u.id, !u.active); if (e) toast(e, "error"); }}>{u.active ? "비활성화" : "활성화"}</Button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="empty">조건에 맞는 교사가 없습니다.</p>}
        </div>
        <Note icon="lock">비밀번호를 초기화하면 임시 비밀번호가 발급되며, 다음 로그인 시 변경이 필수입니다. 모든 내역은 감사 로그에 기록됩니다. 최고 관리자 계정은 관리자 계정 관리 화면의 권한 규칙을 따릅니다.</Note>
      </section>
      {edit && <TeacherForm user={edit === "new" ? null : edit} onClose={() => setEdit(null)} onTemp={(id, pw) => setTemp({ id, pw })} />}
      {temp && <TempPasswordModal loginId={temp.id} password={temp.pw} onClose={() => setTemp(null)} />}
    </Page>
  );
}

