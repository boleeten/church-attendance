import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { currentSunday, fmtDot, fmtMD, fmtRelDay, fmtStamp, fmtTime12 } from "../lib/date";
import { toast } from "../lib/remote";
import { activeStudents, classSummary, consecutiveAbsences, download, groupTeachers, homeroomName, parseCSV, pctText, personRate, roster, studentsSummary, teacherDuty, teacherSummary, toCSV, yearSundays, type Summary } from "../lib/stats";
import { deleteStudent, deleteStudents, graduateStudents, longClassId, longGroupOf, longLabel, accountClasses, accountRecords, addClass, assignmentViolations, sameGroupClass, canDeleteAccounts, deleteAccount, deleteClass, canManageAccount, getData, canResetPassword, classCount, classLabel, classShort, moveStudents, resetPassword, sendStudentReminders, setAssignment, setUserActive, upsertStudent, upsertUser, useData, useMe } from "../lib/store";
import type { ClassRoom, Data, Gender, Role, Student, StudentStatus, User } from "../lib/types";
import { Avatar, Badge, Button, Icon, MarkDot, Modal, Note, PhotoAvatar, Progress, Seg } from "../ui";
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
        <strong className="sb">출석률 {pctText(sum.rate)}</strong>
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
          {([1, 2] as const).map((g) => <GroupBar key={g} title={`${g}부`} sum={studentsSummary(d, date, groupStudents(d, g))} provisional={false} />)}
        </section>
        <section className="panel">
          <div className="row between"><h2>교사 출석현황</h2><Badge tone="success">실시간</Badge></div>
          {([1, 2] as const).map((g) => <GroupBar key={g} title={`${g}부`} sum={teacherSummary(d, date, g)} provisional={false} />)}
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
const STATUSES: StudentStatus[] = ["등록", "장결자", "교회이동", "졸업"];
const statusTone = (s: StudentStatus) => (s === "등록" ? "success" : s === "장결자" ? "warning" : "neutral");

function StudentForm({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const d = useData();
  const [f, setF] = useState<Omit<Student, "id">>(student ?? { name: "", classId: d.classes[0]?.id ?? "", gender: null, status: "등록", phone: "", guardianPhone: "", guardianRel: "모" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string | null) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.name.trim()) return setErr("이름을 입력해 주세요.");
    const c = d.classes.find((x) => x.id === f.classId);
    if (!c && f.status === "장결자") return setErr("장결자는 복귀할 반을 선택해 주세요.");
    const joining = f.status === "등록" && (!student || student.classId !== f.classId || student.status !== "등록");
    if (c && joining && classCount(c.id) >= c.capacity) return setErr(`${classLabel(c)}은 정원(${c.capacity}명)이 찼습니다. 다른 반을 선택해 주세요.`);
    upsertStudent({ ...f, name: f.name.trim(), id: student?.id });
    toast(student ? "학생 정보를 수정했습니다." : "학생을 등록했습니다.");
    onClose();
  };
  const inp = (label: string, k: "name" | "phone" | "guardianPhone" | "guardianRel", ph: string) => (
    <div className="field"><label>{label}</label><div className="input m"><input value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} aria-label={label} /></div></div>
  );
  return (
    <Modal title={student ? "학생 정보 수정" : "학생 등록"} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>취소</Button><Button onClick={save}>저장</Button></>}>
      <div className="grid cols-2" style={{ gap: 12 }}>
        {inp("이름", "name", "학생 이름")}
        <div className="field"><label>성별</label>
          <div className="row g8" role="radiogroup" aria-label="성별">
            {(["남", "여"] as Gender[]).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={f.gender === g} className={`chip ${f.gender === g ? "on" : ""}`} style={{ minWidth: 64 }} onClick={() => set("gender", f.gender === g ? null : g)}>{g}</button>
            ))}
          </div>
        </div>
        <div className="field"><label>{f.status === "장결자" ? "원래 반 (복귀할 반)" : "반"}</label>
          <SelectBox label="반" value={f.classId} onChange={(v) => set("classId", v)}>
            <option value="">반 미배정</option>
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
        <PhotoAvatar name={student.name} photo={student.photo} size={64} />
        <div className="col g6 grow">
          <strong className="t-lg b">{student.name}</strong>
          <div className="row g6 wrap">
            {student.gender && <Badge>{student.gender}</Badge>}
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


export function Students() {
  const d = useData();
  const { date } = useAdminDate();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [grade, setGrade] = useState(params.get("grade") ?? "");
  const [classId, setClassId] = useState(params.get("class") ?? "");
  // 기본은 '등록'. 장결자반 바로가기는 '장결자', 주소에 status를 주면 그 값(빈 값이면 졸업 제외 전체)
  const defaultStatus = params.get("status") ?? (longGroupOf(params.get("class") ?? "") ? "장결자" : "등록");
  const [status, setStatus] = useState(defaultStatus);
  const [mark, setMark] = useState("");
  const [streakOnly, setStreakOnly] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Student | null | "new">(null);
  const [detail, setDetail] = useState<Student | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dates = useMemo(() => yearSundays(d), [d]);
  const me = useMe();
  const canDeleteStudent = !!me && (me.roles.includes("admin") || me.roles.includes("super"));
  const removeStudent = async (s: Student) => {
    const marks = Object.keys(d.studentMarks).filter((k) => k.endsWith(`|${s.id}`)).length;
    const notes = d.notes.filter((n) => n.studentId === s.id).length;
    const extra = marks || notes ? `\n출석 기록 ${marks}건, 심방노트 ${notes}건도 함께 지워집니다.` : "";
    if (!window.confirm(`${s.name} 학생을 삭제할까요?${extra}\n삭제하면 되돌릴 수 없습니다.\n(기록을 남기려면 삭제 대신 상태를 '교회이동'으로 바꿔 주세요.)`)) return;
    const err = await deleteStudent(s.id);
    if (err) return toast(err, "error");
    setSel((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
    toast(`${s.name} 학생을 삭제했습니다.`);
  };
  const removeSelected = async () => {
    const ids = [...sel];
    const marks = Object.keys(d.studentMarks).filter((k) => sel.has(k.slice(k.indexOf("|") + 1))).length;
    const notes = d.notes.filter((n) => sel.has(n.studentId)).length;
    const extra = marks || notes ? `\n출석 기록 ${marks}건, 심방노트 ${notes}건도 함께 지워집니다.` : "";
    if (!window.confirm(`선택한 학생 ${ids.length}명을 삭제할까요?${extra}\n삭제하면 되돌릴 수 없습니다.`)) return;
    const err = await deleteStudents(ids);
    if (err) return toast(err, "error");
    setSel(new Set());
    toast(`${ids.length}명을 삭제했습니다.`);
  };

  const rows = useMemo(() => {
    const term = q.trim().replace(/-/g, "");
    return d.students
      .map((s) => ({ s, c: classOf(d, s), teacher: homeroomName(d, s.classId) }))
      .filter(({ s, c, teacher }) => {
        if (term && !(s.name.includes(term) || s.phone.replace(/-/g, "").includes(term) || s.guardianPhone.replace(/-/g, "").includes(term) || teacher.includes(term))) return false;
        if (group && String(c?.group) !== group) return false;
        if (grade && String(c?.grade) !== grade) return false;
        const lg = longGroupOf(classId);
        if (lg && (s.status !== "장결자" || c?.group !== lg)) return false;
        if (classId === "none" ? !!c : classId && !lg && (s.classId !== classId || s.status === "장결자")) return false;
        if (status ? s.status !== status : s.status === "졸업") return false; // 졸업생은 상태 필터에서 '졸업'을 골랐을 때만 보인다
        const m = d.studentMarks[`${date}|${s.id}`];
        if (mark && (mark === "U" ? !!m : m !== mark)) return false;
        if (streakOnly && consecutiveAbsences(d.studentMarks, s.id, dates).count < 2) return false;
        return true;
      })
      .sort((a, b) => (a.c && b.c ? d.classes.indexOf(a.c) - d.classes.indexOf(b.c) : 0) || a.s.name.localeCompare(b.s.name, "ko"));
  }, [d, q, group, grade, classId, status, mark, streakOnly, date, dates]);

  const view = rows;
  const reset = () => { setQ(""); setGroup(""); setGrade(""); setClassId(""); setStatus("등록"); setMark(""); setStreakOnly(false); };
  const upd = (f: (v: string) => void) => (v: string) => f(v);
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };

  const fmtAt = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
  /** 선택한 학생의 명부 + 지금까지의 심방노트 전체 (졸업 전 보관용). 노트 1건이 1줄, 노트가 없으면 학생 1줄 */
  const exportWithNotes = () => {
    const picked = d.students.filter((s) => sel.has(s.id)).map((s) => ({ s, c: classOf(d, s) })).sort((a, b) => (a.c && b.c ? d.classes.indexOf(a.c) - d.classes.indexOf(b.c) : 0) || a.s.name.localeCompare(b.s.name, "ko"));
    const uname = (id?: string | null) => d.users.find((u) => u.id === id)?.name ?? "";
    const lines = picked.flatMap(({ s, c }) => {
      const info = [s.name, s.gender ?? "", c ? `${c.group}부` : "", c?.grade, c?.no, homeroomName(d, s.classId), s.phone, s.guardianPhone, s.guardianRel, s.status, pctText(personRate(d.studentMarks, s.id, dates).rate)];
      const notes = d.notes.filter((n) => n.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      return notes.length ? notes.map((n) => [...info, notes.length, n.date, n.reason ?? "", n.content, uname(n.authorId), n.reply ?? "", uname(n.replyBy), fmtAt(n.replyAt)]) : [[...info, 0, "", "", "", "", "", "", ""]];
    });
    download(`학생_심방노트_${date}.csv`, toCSV([["이름", "성별", "그룹", "학년", "반", "담임교사", "학생 연락처", "보호자 연락처", "보호자 관계", "상태", "출석률", "심방노트 수", "심방 주일", "결석 사유", "심방노트 내용", "작성 교사", "심방 답변", "답변자", "답변일"], ...lines]));
    toast(`${picked.length}명의 명부와 심방노트를 내려받았습니다.`);
  };
  const graduate = async () => {
    const picked = d.students.filter((s) => sel.has(s.id));
    if (!window.confirm(`선택한 ${picked.length}명을 졸업 처리할까요?\n\n· 학생 관리 목록, 출석부, 통계에서 보이지 않게 됩니다.\n· 출석 기록과 심방노트는 지워지지 않습니다.\n· 상태 필터에서 '졸업'을 고르면 다시 볼 수 있습니다.\n\n먼저 '선택 학생 Excel (심방노트 포함)'으로 내려받아 두셨나요?`)) return;
    const err = await graduateStudents([...sel]);
    if (err) return toast(err, "error");
    toast(`${picked.length}명을 졸업 처리했습니다.`);
    setSel(new Set());
  };
  const allSelected = rows.length > 0 && rows.every(({ s }) => sel.has(s.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map(({ s }) => s.id)));

  const exportCsv = () =>
    download(`학생명부_${date}.csv`, toCSV([["이름", "성별", "그룹", "학년", "반", "담임교사", "학생 연락처", "보호자 연락처", "보호자 관계", "상태", "출석률"], ...rows.map(({ s, c, teacher }) => [s.name, s.gender ?? "", c ? `${c.group}부` : "", c?.grade, c?.no, teacher, s.phone, s.guardianPhone, s.guardianRel, s.status, pctText(personRate(d.studentMarks, s.id, dates).rate)])]));

  const importCsv = async (file: File) => {
    const all = parseCSV(await file.text());
    // 새 양식은 둘째 칸이 '성별'. 성별 칸이 없는 예전 양식도 받는다
    const hasGender = /성별/.test(all[0]?.[1] ?? "");
    const lines = all.slice(1).map((r) => (hasGender ? r : [r[0], "", ...r.slice(1)]));
    // 이름만 있으면 등록한다. 그룹·학년·반이 비었거나 맞는 반이 없거나 정원이 찼으면 '반 미배정'으로 등록
    let ok = 0;
    const unassigned: string[] = [];
    const clean = (v?: string) => (v ?? "").trim();
    for (const [rawName, sex, g, gr, no, phone, guardian, rel] of lines) {
      const name = clean(rawName);
      if (!name) continue;
      const gender: Gender | null = /^\s*(남|남자|M)\s*$/i.test(sex ?? "") ? "남" : /^\s*(여|여자|F)\s*$/i.test(sex ?? "") ? "여" : null;
      const num = (v?: string) => clean(v).replace(/[^0-9]/g, "");
      const c = d.classes.find((x) => String(x.group) === num(g) && String(x.grade) === num(gr) && String(x.no) === num(no));
      const fits = !!c && classCount(c.id) < c.capacity;
      if (!fits) unassigned.push(name);
      upsertStudent({ name, gender, classId: fits ? c!.id : "", status: "등록", phone: clean(phone), guardianPhone: clean(guardian), guardianRel: clean(rel) });
      ok++;
    }
    if (!ok) return toast("등록할 학생이 없습니다. 첫 칸에 학생 이름이 있는지 확인해 주세요.", "error");
    toast(`${ok}명 등록${unassigned.length ? ` · 그중 ${unassigned.length}명은 반 미배정(반 정보 없음·정원 초과): ${unassigned.slice(0, 3).join(", ")}${unassigned.length > 3 ? " 등" : ""} — 반 필터 '미배정'에서 확인 후 반을 지정해 주세요.` : ""}`);
    if (unassigned.length) { setClassId("none"); setStatus("등록"); }
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
          <SelectBox label="반" value={classId} onChange={upd(setClassId)}><option value="">반: 전체</option>{d.classes.filter((c) => (!group || String(c.group) === group) && (!grade || String(c.grade) === grade)).map((c) => <option key={c.id} value={c.id}>반: {classLabel(c)}</option>)}{([1, 2] as const).filter((g) => !group || String(g) === group).map((g) => <option key={g} value={longClassId(g)}>반: {longLabel(g)}</option>)}<option value="none">반: 미배정</option></SelectBox>
          <SelectBox label="상태" value={status} onChange={upd(setStatus)}><option value="">상태: 전체</option>{STATUSES.map((s) => <option key={s} value={s}>상태: {s}</option>)}</SelectBox>
          <SelectBox label="출석 상태" value={mark} onChange={upd(setMark)}><option value="">출석 상태: 전체</option><option value="P">출석 상태: 출석</option><option value="A">출석 상태: 결석</option><option value="U">출석 상태: 미확인</option></SelectBox>
          <label className="chk"><input type="checkbox" checked={streakOnly} onChange={(e) => setStreakOnly(e.target.checked)} />연속 결석만</label>
          <span className="spacer" />
          <button type="button" className="filter-reset" onClick={reset}>필터 초기화</button>
        </div>
      </section>
      <section className="panel">
        <div className="row between wrap g8">
          <h2>검색 결과 {rows.length}명{sel.size > 0 && <span className="muted sb"> · {sel.size}명 선택됨</span>}</h2>
          <div className="row g8 wrap">
            <Button variant="outline" size="s" disabled={!sel.size} onClick={() => { setMoveTo(""); setMoving(true); }}>선택 학생 반 이동</Button>
            <Button variant="outline" size="s" disabled={!sel.size} onClick={exportWithNotes}><Icon name="download" size={14} />선택 학생 Excel (심방노트 포함)</Button>
            <Button variant="outline" size="s" className="btn-del" disabled={!sel.size} onClick={() => void graduate()}>선택 학생 졸업 처리</Button>
            {canDeleteStudent && <Button variant="outline" size="s" className="btn-del" disabled={!sel.size} onClick={() => void removeSelected()}><Icon name="trash" size={14} />선택 학생 삭제</Button>}
            <Button variant="outline" size="s" onClick={exportCsv}><Icon name="download" size={14} />Excel 다운로드</Button>
            <Button variant="secondary" size="s" onClick={() => fileRef.current?.click()}>Excel/CSV 일괄 등록</Button>
            <Button variant="outline" size="s" className="btn-line" onClick={() => download("학생_일괄등록_양식.csv", toCSV([["이름", "성별", "그룹", "학년", "반", "학생 연락처", "보호자 연락처", "보호자 관계"], ["홍길동", "남", "1부", 4, 2, "010-0000-0000", "010-0000-0000", "모"], ["김하늘", "여", "2부", 5, 1, "010-0000-0000", "010-0000-0000", "부"]]))}><Icon name="download" size={14} />양식 받기</Button>
            <Button size="s" onClick={() => setEdit("new")}><Icon name="plus" size={14} />학생 등록</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
          </div>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="검색 결과 전체 선택" title="검색 결과 전체 선택" /></th><th>학생</th><th>성별</th><th>그룹</th><th>학년</th><th>반</th><th>담임교사</th><th>학생 연락처</th><th>보호자 연락처</th><th>상태</th><th>출석률</th><th>관리</th></tr></thead>
            <tbody>
              {view.map(({ s, c, teacher }) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.name} 선택`} /></td>
                  <td><span className="row g8"><PhotoAvatar name={s.name} photo={s.photo} size={40} /><strong className="sb">{s.name}</strong></span></td>
                  <td>{s.gender ?? "-"}</td>
                  <td>{c ? `${c.group}부` : "-"}</td><td>{c ? `${c.grade}학년` : "-"}</td><td>{s.status === "장결자" ? <span className="col"><span className="sb c-warning">장결자반</span>{c && <span className="t-xs muted">원래 {c.no}반</span>}</span> : c ? `${c.no}반` : <span className="sb c-warning">미배정</span>}</td>
                  <td>{s.status === "장결자" ? "-" : teacher}</td>
                  <td className="num">{s.phone || "-"}</td><td className="num">{s.guardianPhone || "-"}</td>
                  <td><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                  <td className="sb num">{pctText(personRate(d.studentMarks, s.id, dates).rate)}</td>
                  <td><span className="row g6"><Button variant="outline" size="s" onClick={() => setDetail(s)}>상세</Button><Button variant="secondary" size="s" onClick={() => setEdit(s)}>수정</Button>{canDeleteStudent && <RowMenu label={`${s.name} 더보기`} items={[{ icon: "trash", label: "삭제", danger: true, onSelect: () => void removeStudent(s) }]} />}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="empty">조건에 맞는 학생이 없습니다.</p>}
        </div>
      </section>
      {edit && <StudentForm student={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {detail && <StudentDetailModal student={detail} onClose={() => setDetail(null)} />}
      {moving && (
        <Modal title={`선택 학생 ${sel.size}명 반 이동`} onClose={() => setMoving(false)} footer={<><Button variant="outline" onClick={() => setMoving(false)}>취소</Button><Button disabled={!moveTo} onClick={() => { const e = moveStudents([...sel], moveTo); if (e) return toast(e, "error"); toast("반을 이동했습니다. 이전 출석 기록은 그대로 보존됩니다."); setSel(new Set()); setMoving(false); }}>이동</Button></>}>
          <SelectBox label="이동할 반" value={moveTo} onChange={setMoveTo}>
            <option value="">이동할 반 선택</option>
            {d.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)} ({classCount(c.id)}/{c.capacity})</option>)}
            {([1, 2] as const).map((g) => <option key={g} value={longClassId(g)}>{longLabel(g)} (교사 배정 없음)</option>)}
          </SelectBox>
          <Note>반을 옮겨도 이전 출석 기록과 심방노트는 보존됩니다. 정원(10명)을 넘는 이동은 할 수 없습니다. 장결자반으로 옮기면 상태가 '장결자'가 되고, 장결자반에서 일반 반으로 옮기면 '등록'으로 돌아옵니다.</Note>
        </Modal>
      )}
    </Page>
  );
}

// ───────── A03 그룹·반 관리 ─────────
function AssignModal({ cls, onClose }: { cls: ClassRoom; onClose: () => void }) {
  const d = useData();
  // 같은 부 교사를 먼저, 다른 부 교사도 고를 수 있다 (한 교사가 1부·2부 반을 함께 맡는 경우)
  const all = d.users.filter((u) => (u.roles.includes("teacher") || u.roles.includes("head")) && u.active); // 부장교사도 반을 맡을 수 있다
  const same = all.filter((u) => u.group === cls.group);
  const otherPool = all.filter((u) => u.group !== cls.group);
  const cur = (k: "담임" | "보조") => d.assignments.filter((a) => a.classId === cls.id && a.kind === k).map((a) => a.userId);
  // 같은 부의 다른 반을 이미 맡은 교사는 고를 수 없다
  const busy = (id: string) => sameGroupClass(id, cls.id);
  const [main, setMain] = useState(cur("담임")[0] ?? "");
  const [subs, setSubs] = useState<string[]>(cur("보조"));
  return (
    <Modal title={`${classLabel(cls)} 교사 배정`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>취소</Button><Button onClick={() => { const e = setAssignment(cls.id, "담임", main ? [main] : []) ?? setAssignment(cls.id, "보조", subs.filter((x) => x !== main)); if (e) return toast(e, "error"); toast("교사 배정을 저장했습니다."); onClose(); }}>저장</Button></>}>
      {(["담임", "보조"] as const).map((kind) => {
        const isMain = kind === "담임";
        const picked = (id: string) => (isMain ? main === id : subs.includes(id));
        const toggle = (id: string) => {
          if (isMain) {
            setMain(main === id ? "" : id);
            setSubs(subs.filter((x) => x !== id)); // 담임으로 고르면 보조에서는 뺀다
          } else setSubs(subs.includes(id) ? subs.filter((x) => x !== id) : [...subs, id]);
        };
        const chip = (u: User) => {
          const on = picked(u.id);
          const b = busy(u.id);
          const otherGroup = u.group !== cls.group;
          return (
            <button key={u.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!!b && !on} title={b ? `${otherGroup ? "이 부의 " : ""}${classShort(b)}을(를) 이미 맡고 있습니다` : undefined} onClick={() => toggle(u.id)}>
              {u.name}{otherGroup ? ` · ${u.group}부` : ""}{b ? ` (${classShort(b)} 배정됨)` : ""}
            </button>
          );
        };
        const visible = (list: User[]) => list.filter((u) => (isMain ? true : u.id !== main));
        const pickedName = isMain ? (main ? d.users.find((u) => u.id === main)?.name : null) : null;
        return (
          <div key={kind} className="field">
            <label>{isMain ? "담임 (한 명)" : "보조 (여러 명 선택 가능)"}{isMain && <span className="muted" style={{ fontWeight: 400 }}> · {pickedName ?? "미배정"}</span>}</label>
            <div className="row wrap g8">{visible(same).map(chip)}</div>
            {otherPool.length > 0 && (
              <details className="col g8" open={visible(otherPool).some((u) => picked(u.id))}>
                <summary className="t-xs sb muted" style={{ cursor: "pointer" }}>다른 부 교사 ({otherPool.length}명)</summary>
                <div className="row wrap g8" style={{ marginTop: 8 }}>{visible(otherPool).map(chip)}</div>
              </details>
            )}
          </div>
        );
      })}
      <Note>배정 원칙: 한 교사는 같은 부에서 반을 하나만 맡을 수 있고(담임·보조 포함), 다른 부의 반은 하나 더 맡을 수 있습니다. 보조 교사도 배정된 반의 출석체크를 할 수 있습니다. 변경 내역은 감사 로그에 기록됩니다.</Note>
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
  const violations = assignmentViolations();
  const removeClass = (c: ClassRoom) => {
    const members = d.students.filter((s) => s.classId === c.id).length;
    if (members) return toast(`${classLabel(c)}에 학생 ${members}명이 있어 삭제할 수 없습니다. 먼저 '학생 이동'으로 다른 반에 옮겨 주세요.`, "error");
    const teachers = d.assignments.filter((a) => a.classId === c.id).length;
    if (!window.confirm(`${classLabel(c)}을(를) 삭제할까요?${teachers ? `\n배정된 교사 ${teachers}명의 담당이 해제됩니다.` : ""}\n삭제한 반은 되돌릴 수 없습니다.`)) return;
    const err = deleteClass(c.id);
    toast(err ?? `${classLabel(c)}을(를) 삭제했습니다.`, err ? "error" : "info");
  };
  return (
    <Page title="그룹·반 관리" sub="1부·2부 그룹과 학년별 반, 담당 교사를 관리합니다">
      <div className="row between wrap g12">
        <div className="row g16 wrap">
          <span className="grp-seg"><Seg value={g} options={[["1", `1부 · ${count(1)}개 반`], ["2", `2부 · ${count(2)}개 반`]] as const} onChange={setG} /></span>
          <span className="muted sb">{g}부 등록 {total}명 / 정원 {list.reduce((n, c) => n + c.capacity, 0)}명</span>
        </div>
        <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} />반 추가</Button>
      </div>
      {violations.length > 0 && <Note warm icon="warning">배정 원칙(같은 부에서는 한 반만)에 맞지 않는 교사가 있습니다: {violations.map((v) => `${v.user.name}(${v.group}부 ${v.classes.map(classShort).join("·")})`).join(", ")}. 해당 반의 '교사 배정'에서 한 반만 남겨 주세요.</Note>}
      {full.length > 0 && <Note warm icon="warning">{full.map(classShort).join(", ")}이 정원(10명)에 도달했습니다. 학생을 추가하려면 다른 반으로 배정하세요.</Note>}
      <div className={`grp-zone g${g}`}>
      <div className="grp-head"><span className="grp-mark">{g}부</span><strong className="t-lg b">{g}부 반 목록</strong><span className="muted t-xs">{count(group)}개 반 · 등록 {total}명</span></div>
      {[4, 5, 6].map((gr) => (
        <section key={gr} className="col g12">
          <h2 className="t-base b">{gr}학년</h2>
          <div className="grid cols-4 class-grid" style={{ gap: 16 }}>
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
                  <Progress value={(n / c.capacity) * 100} color={n >= c.capacity ? "var(--error)" : "var(--primary)"} />
                  <span className="t-xs muted">현재 {n}명 / 정원 {c.capacity}명</span>
                  <div className="row g8 class-actions">
                    <Button variant="outline" size="s" onClick={() => setAssign(c)}>교사 배정</Button>
                    <Link to={`/admin/students?class=${c.id}`} className="btn outline s">학생 이동</Link>
                    <span className="spacer" />
                    <button type="button" className="icon-btn bordered class-del" aria-label={`${classShort(c)} 삭제`} title="반 삭제" onClick={() => removeClass(c)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      </div>
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


// ───────── 교사 일괄 등록 (CSV) ─────────
type TeacherRow = { line: number; name: string; loginId: string; group: 1 | 2 | null; head: boolean; classId: string | null; kind: "담임" | "보조"; error: string | null };
const TEACHER_TEMPLATE = [
  ["이름", "아이디", "소속", "구분", "담당 반", "담당 구분"],
  // 담당 반은 '학년-반반'(예: 4-1반)으로 적는다. '4-1'만 적으면 Excel이 날짜(4월 1일)로 바꿔 버린다.
  ["홍길동", "hong_gd01", "1부", "교사", "4-1반", "담임"],
  ["김보조", "kim_bj02", "2부", "교사", "5-1반", "보조"],
  ["박부장", "park_bj03", "2부", "부장교사", "", ""],
];

function parseTeacherRows(d: Data, lines: string[][]): TeacherRow[] {
  const seenIds = new Set<string>();
  const homeroomTaken = new Map<string, string>(); // 반 → 담임 이름 (기존 + 파일 안)
  for (const a of d.assignments.filter((x) => x.kind === "담임")) homeroomTaken.set(a.classId, d.users.find((u) => u.id === a.userId)?.name ?? "기존 교사");
  return lines
    .map((cols, i) => ({ cols: cols.map((c) => (c ?? "").trim()), line: i + 2 }))
    .filter(({ cols }) => cols.some(Boolean))
    .map(({ cols: [name, id, g, role, cls, kindText], line }) => {
      const loginId = (id ?? "").toLowerCase();
      const gn = Number(String(g ?? "").replace(/[^0-9]/g, ""));
      const group = gn === 1 || gn === 2 ? gn : null;
      const head = /부장/.test(role ?? "");
      const kind: "담임" | "보조" = /보조/.test(kindText ?? "") ? "보조" : "담임";
      let classId: string | null = null;
      let error: string | null = null;
      // Excel이 '4-1'을 날짜로 바꿔 저장한 경우(2026-04-01, 4월 1일)도 학년-반으로 읽는다
      const dateLike = (cls ?? "").match(/^\d{4}[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/);
      if (dateLike) cls = `${Number(dateLike[1])}-${Number(dateLike[2])}반`;
      const nums = (cls ?? "").match(/\d+/g);
      if (!name) error = "이름이 없습니다";
      else if (!/^[a-z0-9_]{4,20}$/.test(loginId)) error = "아이디는 영문 소문자·숫자·밑줄 4~20자";
      else if (seenIds.has(loginId)) error = "파일 안에서 아이디가 중복됩니다";
      else if (d.users.some((u) => u.loginId === loginId)) error = "이미 사용 중인 아이디입니다";
      else if (!group) error = "소속은 1부 또는 2부로 적어 주세요";
      else if (cls && !head) {
        // "4-1반"이면 소속 부의 반, "2부 4-1반"처럼 부를 적으면 그 부의 반
        const gm = (cls ?? "").match(/([12])\s*부/);
        const cg = gm ? Number(gm[1]) : group;
        const rest = gm ? (cls ?? "").replace(gm[0], "").match(/\d+/g) : nums;
        const c = rest && rest.length >= 2 ? d.classes.find((x) => x.group === cg && x.grade === Number(rest[0]) && x.no === Number(rest[1])) : undefined;
        if (!c) error = `${cg}부에 '${cls}' 반이 없습니다`;
        else if (kind === "담임" && homeroomTaken.has(c.id)) error = `${classShort(c)}에 이미 담임(${homeroomTaken.get(c.id)})이 있습니다. '보조'로 적어 주세요`;
        else {
          classId = c.id;
          if (kind === "담임") homeroomTaken.set(c.id, name);
        }
      }
      seenIds.add(loginId);
      return { line, name: name ?? "", loginId, group, head, classId, kind, error };
    });
}

function TeacherImportModal({ rows, onClose }: { rows: TeacherRow[]; onClose: () => void }) {
  const d = useData();
  const ok = rows.filter((r) => !r.error);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<{ created: { name: string; loginId: string; pw: string }[]; failed: { name: string; reason: string }[] } | null>(null);
  const run = async () => {
    setBusy(true);
    const created: { name: string; loginId: string; pw: string }[] = [];
    const failed: { name: string; reason: string }[] = [];
    for (const r of ok) {
      const res = await upsertUser({ name: r.name, loginId: r.loginId, group: r.group, roles: [r.head ? "head" : "teacher"] });
      if (typeof res === "string" || !res) failed.push({ name: r.name, reason: typeof res === "string" ? res : "알 수 없는 오류" });
      else {
        created.push({ name: r.name, loginId: r.loginId, pw: res.tempPassword });
        const u = getData().users.find((x) => x.loginId === r.loginId);
        if (u && r.classId) {
          const cur = getData().assignments.filter((a) => a.classId === r.classId && a.kind === r.kind).map((a) => a.userId);
          setAssignment(r.classId, r.kind, r.kind === "담임" ? [u.id] : [...cur, u.id]);
        }
      }
      setDone((n) => n + 1);
    }
    setBusy(false);
    setResult({ created, failed });
  };
  const samePw = result && result.created.length > 0 && result.created.every((c) => c.pw === result.created[0].pw) ? result.created[0].pw : null;
  if (result)
    return (
      <Modal title="교사 일괄 등록 결과" onClose={onClose} wide footer={<>
        {result.created.length > 0 && <Button variant="outline" onClick={() => download(`교사_계정_${new Date().toISOString().slice(0, 10)}.csv`, toCSV([["이름", "아이디", "임시 비밀번호"], ...result.created.map((c) => [c.name, c.loginId, c.pw])]))}><Icon name="download" size={14} />계정 목록 받기</Button>}
        <Button onClick={onClose}>확인</Button>
      </>}>
        <div className="row g8"><Badge tone="success">등록 {result.created.length}명</Badge>{result.failed.length > 0 && <Badge tone="error">실패 {result.failed.length}명</Badge>}</div>
        {samePw && <div className="card pad row between"><span className="muted">임시 비밀번호 (모든 계정 공통)</span><strong className="t-lg b num">{samePw}</strong></div>}
        {result.failed.length > 0 && <ul className="col g4 t-xs c-error" style={{ margin: 0, paddingLeft: 18 }}>{result.failed.map((f) => <li key={f.name}>{f.name}: {f.reason}</li>)}</ul>}
        <Note>각 교사는 첫 로그인 때 비밀번호를 바꿔야 합니다. {samePw ? "" : "계정마다 임시 비밀번호가 다르니 '계정 목록 받기'로 받아 전달해 주세요. "}담당 반을 적은 교사는 그 반에 바로 배정했습니다.</Note>
      </Modal>
    );
  return (
    <Modal title="교사 일괄 등록" onClose={() => !busy && onClose()} wide footer={<>
      <Button variant="outline" disabled={busy} onClick={onClose}>취소</Button>
      <Button disabled={busy || !ok.length} onClick={run}>{busy ? `등록 중… ${done}/${ok.length}` : `${ok.length}명 등록`}</Button>
    </>}>
      <div className="row g8"><Badge tone="success">등록 가능 {ok.length}명</Badge>{rows.length - ok.length > 0 && <Badge tone="error">확인 필요 {rows.length - ok.length}명 (등록 안 함)</Badge>}</div>
      <div className="tablewrap" style={{ maxHeight: 360, overflow: "auto" }}>
        <table className="tbl">
          <thead><tr><th>줄</th><th>이름</th><th>아이디</th><th>소속</th><th>구분</th><th>담당 반</th><th>확인</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = r.classId ? d.classes.find((x) => x.id === r.classId) : undefined;
              return (
                <tr key={r.line}>
                  <td className="muted num">{r.line}</td>
                  <td className="sb">{r.name || "-"}</td>
                  <td className="muted">{r.loginId || "-"}</td>
                  <td>{r.group ? `${r.group}부` : "-"}</td>
                  <td>{r.head ? "부장교사" : "교사"}</td>
                  <td>{c ? `${classShort(c)} ${r.kind}` : "-"}</td>
                  <td>{r.error ? <span className="t-xs c-error">{r.error}</span> : <Badge tone="success">OK</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>'확인 필요' 줄은 등록하지 않습니다. 파일을 고쳐 다시 올리면 됩니다. 새 계정은 첫 로그인 때 비밀번호를 바꿔야 하며, 관리자 권한은 등록 후 '관리자 계정 관리'에서 따로 줍니다.</Note>
    </Modal>
  );
}

type RowMenuItem = { icon: string; label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };
/** 자주 쓰지 않는 동작을 담는 ⋯ 더보기 메뉴. 표가 가로 스크롤 영역 안에 있어 잘리지 않도록 화면 기준(fixed)으로 띄운다. */
function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") { setPos(null); btn.current?.focus(); } return; }
      if (e.type === "mousedown" && (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    pop.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const h = items.length * 40 + 12;
    const top = r.bottom + 6 + h > window.innerHeight ? r.top - 6 - h : r.bottom + 6;
    setPos({ top, right: window.innerWidth - r.right });
  };
  return (
    <>
      <button ref={btn} type="button" className="more-btn" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}><Icon name="more" size={20} stroke={2.6} /></button>
      {pos && (
        <div ref={pop} className="user-pop row-pop" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? "danger" : ""} disabled={it.disabled} onClick={() => { setPos(null); it.onSelect(); }}><Icon name={it.icon} size={18} />{it.label}</button>
          ))}
        </div>
      )}
    </>
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
  const [importRows, setImportRows] = useState<TeacherRow[] | null>(null);
  const canDelete = canDeleteAccounts(me);
  const doDelete = async (u: User) => {
    const cls = accountClasses(u.id);
    if (cls.length) return toast(`${u.name} 교사는 담당 반(${cls.join(", ")})이 있어 삭제할 수 없습니다. 그룹·반 관리에서 배정을 해제한 뒤 삭제해 주세요.`, "error");
    const keep = accountRecords(u.id).length > 0;
    if (!window.confirm(`${u.name}(${u.loginId}) 계정을 삭제할까요?\n${keep ? "로그인 계정은 없어지고, 지난 출석·심방노트 기록은 작성자 이름과 함께 남습니다." : "로그인 계정이 완전히 지워집니다."}\n되돌릴 수 없습니다.`)) return;
    const err = await deleteAccount(u.id);
    toast(err ?? `${u.name} 계정을 삭제했습니다.`, err ? "error" : "info");
  };
  const teacherFile = useRef<HTMLInputElement>(null);
  const readTeacherCsv = async (f: File) => {
    if (!/\.csv$/i.test(f.name)) return toast("CSV 파일만 올릴 수 있습니다. Excel에서 '다른 이름으로 저장 → CSV UTF-8'로 저장해 주세요.", "error");
    const rows = parseTeacherRows(d, parseCSV(await f.text()).slice(1));
    if (!rows.length) return toast("등록할 교사가 없습니다. 양식의 둘째 줄부터 적어 주세요.", "error");
    setImportRows(rows);
  };
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
          <Button variant="secondary" onClick={() => teacherFile.current?.click()}>Excel/CSV 일괄 등록</Button>
          <Button variant="outline" className="btn-line" onClick={() => download("교사_일괄등록_양식.csv", toCSV(TEACHER_TEMPLATE))}><Icon name="download" size={16} />양식 받기</Button>
          <Button onClick={() => setEdit("new")}><Icon name="plus" size={16} />교사 등록</Button>
          <input ref={teacherFile} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readTeacherCsv(f); e.target.value = ""; }} />
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
                  <td>{u.roles.includes("head") && !d.assignments.some((a) => a.userId === u.id) ? "-" : teacherDuty(d, u, false).replace(/^부장교사 · /, "")}</td>
                  <td><span className="row g6">
                    <Badge tone="info">{u.roles.includes("head") ? "부장교사" : "교사"}</Badge>
                    {u.roles.includes("super") ? <Badge tone="warning">최고 관리자</Badge> : u.roles.includes("admin") ? <Badge tone="warning">일반 관리자</Badge> : null}
                  </span></td>
                  <td><Badge tone={u.active ? "success" : "neutral"}>{u.active ? "활성" : "비활성"}</Badge>{u.mustChangePassword && <span className="t-xs muted"> 임시 비밀번호</span>}</td>
                  <td><span className="row g6">
                    <Button variant="outline" size="s" disabled={!canManageAccount(me, u)} onClick={() => setEdit(u)}>수정</Button>
                    <Button variant="danger" size="s" disabled={!canResetPassword(me, u)} onClick={() => doReset(u)}>비밀번호 초기화</Button>
                    <RowMenu label={`${u.name} 더보기`} items={[
                      { icon: u.active ? "ban" : "checkCircle", label: u.active ? "비활성화" : "활성화", disabled: !canManageAccount(me, u), onSelect: () => { const e = setUserActive(u.id, !u.active); if (e) toast(e, "error"); } },
                      ...(canDelete ? [{ icon: "trash", label: "삭제", danger: true, disabled: u.roles.includes("owner") || u.id === me.id, onSelect: () => void doDelete(u) }] : []),
                    ]} />
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
      {importRows && <TeacherImportModal rows={importRows} onClose={() => setImportRows(null)} />}
    </Page>
  );
}

