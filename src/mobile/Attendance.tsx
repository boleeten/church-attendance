import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { currentSunday, fmtKo, fmtKoFull } from "../lib/date";
import { toast } from "../lib/remote";
import { classSummary, groupTeachers, roster, teacherDuty, teacherSummary, yearSundays } from "../lib/stats";
import { addNote, saveSession, setStudentMark, setTeacherMark, updateNote, useData, useMe } from "../lib/store";
import { REASONS, type Student } from "../lib/types";
import { Avatar, Badge, Button, Icon, Note, Sheet, Toggle } from "../ui";
import { AppBar, ClassPicker, HEAD_TABS, Phone, TEACHER_TABS, useMyClass } from "./Shell";

export function NoteSheet({ student, date, onClose }: { student: Student; date: string; onClose: () => void }) {
  const d = useData();
  const u = useMe();
  const mark = d.studentMarks[`${date}|${student.id}`];
  const existing = d.notes.find((n) => n.studentId === student.id && n.date === date && n.authorId === u?.id);
  const [content, setContent] = useState(existing?.content ?? "");
  const [reason, setReason] = useState<string | null>(existing?.reason ?? null);
  const absent = mark === "A";
  const canSave = content.trim().length > 0 || (absent && reason !== null);
  return (
    <Sheet onClose={onClose}>
      <div className="row g12">
        <Avatar name={student.name} photo={student.photo} />
        <div className="col g2 grow">
          <strong className="t-lg b">{student.name}</strong>
          <span className="muted">{fmtKo(date)} 주일</span>
        </div>
        <Badge tone={mark === "P" ? "success" : mark === "A" ? "error" : "neutral"}>{mark === "P" ? "출석" : mark === "A" ? "결석" : "미확인"}</Badge>
      </div>
      <label className="label" htmlFor="note-content">심방노트</label>
      <textarea id="note-content" className="area" placeholder="학생의 근황, 통화 내용, 기도 제목 등을 적어 주세요." value={content} onChange={(e) => setContent(e.target.value)} />
      <p className="row g6 t-xs muted"><Icon name="lock" size={14} />심방노트는 담당 교사와 관리자만 볼 수 있습니다.</p>
      {absent && (
        <>
          <span className="label">결석 사유 (결석인 경우)</span>
          <div className="row wrap g8">
            {REASONS.map((r) => (
              <button key={r} type="button" className={`chip ${reason === r ? "on" : ""}`} aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{r}</button>
            ))}
          </div>
        </>
      )}
      <div className="row g8">
        <Button variant="outline" size="l" onClick={onClose}>취소</Button>
        <Button
          size="l"
          className="grow"
          disabled={!canSave}
          onClick={() => {
            const rsn = absent ? reason : null;
            if (existing) updateNote(existing.id, rsn, content);
            else addNote(student.id, date, rsn, content);
            toast("심방노트를 저장했습니다.");
            onClose();
          }}
        >
          저장
        </Button>
      </div>
    </Sheet>
  );
}

function DateBar({ date, dates, onChange }: { date: string; dates: string[]; onChange: (d: string) => void }) {
  const i = dates.indexOf(date);
  const cur = currentSunday();
  return (
    <div className="datebar">
      <button type="button" className="icon-btn" aria-label="이전 주일" disabled={i <= 0} onClick={() => onChange(dates[i - 1])}><Icon name="left" size={16} /></button>
      <div className="col center g2">
        <strong className="t-lg b">{fmtKoFull(date)}</strong>
        <span className="t-xs muted">{date === cur ? "이번 주 주일" : "지난 주일 · 소급 입력"}</span>
      </div>
      <button type="button" className="icon-btn" aria-label="다음 주일" disabled={i < 0 || i >= dates.length - 1} onClick={() => onChange(dates[i + 1])}><Icon name="right" size={16} /></button>
    </div>
  );
}

export function AttendanceCheck({ mode }: { mode: "student" | "teacher" }) {
  const d = useData();
  const u = useMe()!;
  const nav = useNavigate();
  const { cls } = useMyClass();
  const [params, setParams] = useSearchParams();
  const dates = yearSundays(d);
  const date = dates.includes(params.get("date") ?? "") ? params.get("date")! : currentSunday();
  const [noteFor, setNoteFor] = useState<Student | null>(null);
  const isStudent = mode === "student";
  const group = u.group ?? 1;
  const base = isStudent ? "/t" : "/h";

  if (isStudent && !cls)
    return (
      <Phone tabs={TEACHER_TABS}>
        <AppBar title="출석체크" />
        <div className="mbody"><p className="empty">배정된 담당 반이 없습니다. 관리자에게 문의해 주세요.</p></div>
      </Phone>
    );

  const sum = isStudent ? classSummary(d, date, cls!.id) : teacherSummary(d, date, group);
  const target = isStudent ? `class:${cls!.id}` : `group:${group}`;
  const unit = isStudent ? "전체" : "전체";
  const finish = (completed: boolean) => {
    saveSession(date, target, completed);
    toast(completed ? "출석을 완료했습니다." : "임시저장했습니다.");
    if (completed) nav(base);
  };

  return (
    <Phone tabs={isStudent ? TEACHER_TABS : HEAD_TABS}>
      <AppBar title={isStudent ? "출석체크" : "교사 출석체크"} right={isStudent ? <ClassPicker /> : <Badge tone="info">{group}부 소속 교사</Badge>} />
      <DateBar date={date} dates={dates} onChange={(v) => setParams({ date: v }, { replace: true })} />
      <div className="mbody" style={{ paddingTop: 0 }}>
        <div className="card stat4">
          <div><strong>{sum.total}</strong><span>{unit}</span></div>
          <div><strong className="c-success">{sum.p}</strong><span>출석</span></div>
          <div><strong className="c-error">{sum.a}</strong><span>결석</span></div>
          <div><strong className="c-neutral">{sum.u}</strong><span>미확인</span></div>
        </div>
        {sum.completed && <Note icon="check">이 주일 출석은 완료된 상태입니다. 수정하면 변경 이력에 기록됩니다.</Note>}
        <div className="card list">
          {isStudent
            ? roster(d, cls!.id).map((s) => {
                const hasNote = d.notes.some((n) => n.studentId === s.id && n.date === date);
                return (
                  <div key={s.id} className="col g16" style={{ padding: 16 }}>
                    <div className="row g16">
                      <Avatar name={s.name} photo={s.photo} />
                      <strong className="t-base sb grow">{s.name}</strong>
                      <button type="button" className="link" onClick={() => setNoteFor(s)}>
                        {hasNote ? "심방노트 수정" : "심방노트 작성"}
                        <Icon name="right" size={12} stroke={2.2} />
                      </button>
                    </div>
                    <Toggle value={d.studentMarks[`${date}|${s.id}`]} onChange={(m) => setStudentMark(date, s.id, m)} />
                  </div>
                );
              })
            : groupTeachers(d, group).map((t) => (
                <div key={t.id} className="row g12" style={{ padding: "12px 16px" }}>
                  <Avatar name={t.name} />
                  <div className="col g2 grow">
                    <strong className="t-base sb">{t.name}</strong>
                    <span className="t-xs muted">{teacherDuty(d, t)}</span>
                  </div>
                  <Toggle fixed value={d.teacherMarks[`${date}|${t.id}`]} onChange={(m) => setTeacherMark(date, t.id, m)} />
                </div>
              ))}
          {sum.total === 0 && <p className="empty">{isStudent ? "이 반에 등록된 학생이 없습니다." : "소속 교사가 없습니다."}</p>}
        </div>
      </div>
      <div className="bottom-actions">
        <span className="t-xs muted">{sum.u > 0 ? `체크하지 않은 ${sum.u}명은 미확인으로 남습니다` : sum.completed ? "수정한 내용은 바로 반영됩니다" : "모두 확인했습니다. 출석을 완료해 주세요"}</span>
        <div className="row g8" style={{ width: "100%" }}>
          <Button variant="outline" size="l" onClick={() => finish(false)} disabled={sum.completed}>임시저장</Button>
          <Button size="l" className="grow" disabled={sum.total === 0} onClick={() => finish(true)}>{sum.completed ? "수정 완료" : "출석 완료"}</Button>
        </div>
      </div>
      {noteFor && <NoteSheet student={noteFor} date={date} onClose={() => setNoteFor(null)} />}
    </Phone>
  );
}
