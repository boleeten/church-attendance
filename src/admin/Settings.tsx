import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDot, fmtRelDay, fmtStamp, fmtTime12, ym } from "../lib/date";
import { remote, remoteEnabled, toast } from "../lib/remote";
import { activeStudents, allStaff, classSummary, download, homeroomName, pctText, personRate, teacherDuty, yearSundays } from "../lib/stats";
import { audit, canManageAccount, canResetPassword, classLabel, exportBackup, importBackup, promoteGrades, resetPassword, sendStudentReminders, sendTeacherReminders, setUserActive, updateSettings, upsertUser, useData, useMe } from "../lib/store";
import type { Data, Mark, Role, User } from "../lib/types";
import { Avatar, Badge, Button, Icon, Modal, Note, Switch } from "../ui";
import { Page, useAdminDate } from "./AdminApp";
import { classOf, Kpi, SelectBox, TempPasswordModal } from "./Manage";

const markText = (m: Mark | undefined) => (m === "P" ? "출석" : m === "A" ? "결석" : "미확인");

// ───────── A08 Google Sheets 관리 ─────────
type SheetDef = { name: string; rows: (d: Data) => (string | number | null | undefined)[][] };

function monthlyRates(marks: Record<string, Mark>, id: string, dates: string[]) {
  return Array.from({ length: 12 }, (_, i) => pctText(personRate(marks, id, dates.filter((x) => ym(x).m === i + 1)).rate));
}
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

const SHARED: SheetDef[] = [
  { name: "전체 학생 명부", rows: (d) => [["이름", "그룹", "학년", "반", "담임교사", "상태"], ...d.students.map((s) => { const c = classOf(d, s); return [s.name, c ? `${c.group}부` : "", c?.grade, c?.no, homeroomName(d, s.classId), s.status]; })] },
  { name: "학생 주일 출석 원본", rows: (d) => [["주일", "학생", "반", "출석 상태"], ...yearSundays(d).flatMap((dt) => activeStudents(d).map((s) => { const c = classOf(d, s); return [dt, s.name, c ? classLabel(c) : "", markText(d.studentMarks[`${dt}|${s.id}`])]; }))] },
  { name: "반별 출석현황", rows: (d) => [["주일", "반", "전체", "출석", "결석", "미확인", "출석률", "완료"], ...yearSundays(d).flatMap((dt) => d.classes.map((c) => { const s = classSummary(d, dt, c.id); return [dt, classLabel(c), s.total, s.p, s.a, s.u, pctText(s.rate), s.completed ? "완료" : "미완료"]; }))] },
  { name: "학생 월간·연간 통계", rows: (d) => { const dates = yearSundays(d); return [["학생", "반", ...MONTHS, "연간"], ...activeStudents(d).map((s) => { const c = classOf(d, s); return [s.name, c ? classLabel(c) : "", ...monthlyRates(d.studentMarks, s.id, dates), pctText(personRate(d.studentMarks, s.id, dates).rate)]; })]; } },
  { name: "전체 교사 명부", rows: (d) => [["이름", "아이디", "소속", "담당"], ...allStaff(d).map((u) => [u.name, u.loginId, `${u.group}부`, teacherDuty(d, u, false)])] },
  { name: "교사 주일 출석 원본", rows: (d) => [["주일", "교사", "소속", "출석 상태"], ...yearSundays(d).flatMap((dt) => allStaff(d).map((u) => [dt, u.name, `${u.group}부`, markText(d.teacherMarks[`${dt}|${u.id}`])]))] },
  { name: "교사 월간·연간 통계", rows: (d) => { const dates = yearSundays(d); return [["교사", "소속", ...MONTHS, "연간"], ...allStaff(d).map((u) => [u.name, `${u.group}부`, ...monthlyRates(d.teacherMarks, u.id, dates), pctText(personRate(d.teacherMarks, u.id, dates).rate)])]; } },
];
const PRIVATE: SheetDef[] = [
  { name: "학생·보호자 연락처", rows: (d) => [["이름", "반", "학생 연락처", "보호자 연락처", "보호자 관계"], ...d.students.map((s) => { const c = classOf(d, s); return [s.name, c ? classLabel(c) : "", s.phone, s.guardianPhone, s.guardianRel]; })] },
  { name: "심방노트", rows: (d) => [["주일", "학생", "반", "결석 사유", "내용", "작성자", "작성 시각", "답변", "답변자", "답변 시각"], ...d.notes.map((n) => { const s = d.students.find((x) => x.id === n.studentId); const c = s ? classOf(d, s) : undefined; return [n.date, s?.name, c ? classLabel(c) : "", n.reason ?? "", n.content, d.users.find((u) => u.id === n.authorId)?.name, fmtStamp(n.createdAt), n.reply ?? "", d.users.find((u) => u.id === n.replyBy)?.name ?? "", n.replyAt ? fmtStamp(n.replyAt) : ""]; })] },
];

/** 구글 시트 링크나 ID에서 파일 ID만 뽑는다 */
const sheetIdOf = (v: string) => v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1] ?? (/^[a-zA-Z0-9_-]{20,}$/.test(v.trim()) ? v.trim() : null);
const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

function SheetFileField({ label, desc, value, onSave }: { label: string; desc: string; value: string | null | undefined; onSave: (id: string | null) => void }) {
  const [text, setText] = useState(value ? sheetUrl(value) : "");
  const id = sheetIdOf(text);
  const dirty = (id ?? null) !== (value ?? null);
  return (
    <div className="field">
      <label>{label}</label>
      <span className="t-xs muted">{desc}</span>
      <div className="row g8">
        <div className="input m grow"><Icon name="table" size={16} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label={label} /></div>
        <Button variant={dirty ? "primary" : "outline"} disabled={!dirty || (!!text.trim() && !id)} onClick={() => { onSave(id); toast(id ? `${label} 파일을 지정했습니다.` : `${label} 파일 지정을 해제했습니다.`); }}>저장</Button>
        {value && <a className="btn outline m" href={sheetUrl(value)} target="_blank" rel="noreferrer">열기</a>}
      </div>
      {!!text.trim() && !id && <span className="t-xs c-error">구글 시트 주소 형식이 아닙니다.</span>}
    </div>
  );
}

export function Sheets() {
  const d = useData();
  const s = d.settings;
  const y = s.year;
  const [busy, setBusy] = useState(false);
  const [sa, setSa] = useState<{ configured: boolean; email: string | null; problem?: string | null } | null>(null);
  useEffect(() => {
    if (!remoteEnabled) return;
    void remote.api<{ configured: boolean; email: string | null; problem?: string | null }>("sheets-sync", "GET").then((r) => setSa(typeof r === "string" ? { configured: false, email: null, problem: `서버 확인 실패: ${r}` } : r));
  }, []);
  const ready = remoteEnabled && !!sa?.configured && !!s.sheetSharedId;
  const payload = (defs: SheetDef[]) => defs.map((def) => ({ title: def.name, rows: def.rows(d) }));
  const sync = async () => {
    if (!remoteEnabled) return toast("데모 모드에서는 구글 시트로 보내지 않습니다.");
    if (!ready) return toast(!sa?.configured ? "서버에 Google 서비스 계정 키가 아직 설정되지 않았습니다." : "먼저 동기화할 구글 시트를 지정해 주세요.", "error");
    setBusy(true);
    const jobs: [string, SheetDef[]][] = [["shared", SHARED]];
    if (s.sheetPrivateId) jobs.push(["private", PRIVATE]);
    let err: string | null = null;
    for (const [target, defs] of jobs) {
      const r = await remote.api<{ ok: boolean }>("sheets-sync", "POST", { target, sheets: payload(defs) });
      if (typeof r === "string") { err = r; break; }
    }
    setBusy(false);
    const at = new Date().toISOString();
    if (err) {
      updateSettings({ sheetLastFail: at, sheetSyncCount: s.sheetSyncCount + 1, sheetFailCount: s.sheetFailCount + 1 });
      return toast(err, "error");
    }
    updateSettings({ sheetLastSuccess: at, sheetSyncCount: s.sheetSyncCount + 1 });
    toast(s.sheetPrivateId ? "구글 시트 2개 파일에 동기화했습니다." : "교사 공유용 출석대장에 동기화했습니다. 연락처·심방노트는 관리자 전용 파일을 지정해야 보냅니다.");
  };
  const group = (title: string, badge: boolean, defs: SheetDef[], fileId: string | null | undefined) => (
    <>
      <tr className="group">
        <td colSpan={2}><span className="row g8">{title}{badge && <Badge tone="warning">관리자 전용</Badge>}</span></td>
        <td className="muted t-xs" style={{ fontWeight: 400 }}>{fileId ? <a className="link" href={sheetUrl(fileId)} target="_blank" rel="noreferrer">파일 열기</a> : "파일 지정 안 됨"}</td>
      </tr>
      {defs.map((def, i) => (
        <tr key={def.name}>
          <td>{i + 1}. {def.name}</td>
          <td className="num">{(def.rows(d).length - 1).toLocaleString()}</td>
          <td className="muted">{fileId ? fmtRelDay(s.sheetLastSuccess) : "-"}</td>
        </tr>
      ))}
    </>
  );
  return (
    <Page title="Google Sheets" sub="교사 공유용 출석대장과 관리자 전용 파일의 동기화·공유 권한을 관리합니다">
      <section className="panel" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
        <span className="kpi" style={{ padding: 0, boxShadow: "none" }}><span className="ico warm" style={{ width: 56, height: 56, borderRadius: 28 }}><Icon name="cloud" size={28} /></span></span>
        <div className="col g4 grow">
          <div className="row g8"><strong className="t-lg b">{y} 초등부 Google Sheets</strong>{ready ? <Badge tone="success">연결됨</Badge> : <Badge tone="warning">연결 필요</Badge>}</div>
          <span className="muted">교사 공유용 출석대장{s.sheetPrivateId ? " · 관리자 전용 관리자료" : ""} · 마지막 동기화 {fmtRelDay(s.sheetLastSuccess)}</span>
        </div>
        <Button disabled={busy} onClick={sync}>{busy ? "동기화 중…" : "수동 동기화"}</Button>
      </section>
      <section className="panel">
        <h2>동기화할 파일</h2>
        <SheetFileField label="교사 공유용 출석대장" desc="학생·교사 명부와 출석 기록 7개 시트가 들어갑니다. 연락처와 심방노트는 들어가지 않습니다." value={s.sheetSharedId} onSave={(id) => updateSettings({ sheetSharedId: id })} />
        <SheetFileField label="관리자 전용 관리자료" desc="학생·보호자 연락처와 심방노트가 들어갑니다. 지정하지 않으면 이 두 시트는 보내지 않습니다." value={s.sheetPrivateId} onSave={(id) => updateSettings({ sheetPrivateId: id })} />
        {remoteEnabled && (sa?.email ? (
          <Note icon="info">각 구글 시트의 <b>공유</b>에서 <b className="num">{sa.email}</b> 을(를) <b>편집자</b>로 추가해야 앱이 시트에 쓸 수 있습니다.</Note>
        ) : (
          <Note warm icon="warning">{sa === null ? "서버 설정을 확인하는 중입니다…" : sa.problem ?? "서버에 Google 서비스 계정 키(GOOGLE_SERVICE_ACCOUNT_JSON)가 아직 설정되지 않았습니다."} 설정이 끝나면 여기에 시트를 공유할 이메일이 표시됩니다.</Note>
        ))}
        <Note warm icon="lock">학생 이름·출석이 들어가는 파일입니다. 구글 시트 공유 설정을 <b>"링크가 있는 모든 사용자"가 아니라 "제한됨"</b>으로 두고 필요한 사람만 추가하세요. 관리자 전용 파일은 교사에게 공유하지 마세요.</Note>
      </section>
      <div className="grid cols-3">
        <Kpi label="마지막 동기화 성공" value={fmtRelDay(s.sheetLastSuccess)} sub={`시트 ${SHARED.length + (s.sheetPrivateId ? PRIVATE.length : 0)}개`} icon="cloud" tone="success" />
        <Kpi label="마지막 동기화 실패" value={fmtRelDay(s.sheetLastFail)} sub="실패하면 오류 내용을 알려 드립니다" icon="warning" tone="error" />
        <Kpi label="누적 동기화" value={`${s.sheetSyncCount}회`} sub={`성공 ${s.sheetSyncCount - s.sheetFailCount} · 실패 ${s.sheetFailCount}`} icon="refresh" />
      </div>
      <section className="panel">
        <div className="row between"><h2>시트 구성</h2><span className="muted">시트 {SHARED.length + PRIVATE.length}개</span></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>시트</th><th>행 수</th><th>마지막 동기화</th></tr></thead>
            <tbody>
              {group(`교사 공유용 · ${y} 초등부 출석대장`, false, SHARED, s.sheetSharedId)}
              {group(`관리자 전용 · ${y} 초등부 관리자료`, true, PRIVATE, s.sheetPrivateId)}
            </tbody>
          </table>
        </div>
        <Note>앱 데이터베이스가 원본입니다. 동기화할 때마다 각 시트 내용을 지우고 새로 쓰므로, 시트에서 직접 고친 내용은 사라지고 앱에도 반영되지 않습니다. 시트 탭 이름은 바꾸지 마세요.</Note>
      </section>
    </Page>
  );
}

// ───────── A09 알림 설정 ─────────
export function NotifySettings() {
  const d = useData();
  const { date } = useAdminDate();
  const s = d.settings;
  const [st, setSt] = useState(s.studentNotifyTime);
  const [tt, setTt] = useState(s.teacherNotifyTime);
  const logs = d.notifLogs.filter((l) => l.at.slice(0, 10) >= date).slice(0, 30);
  const noPush = d.users.filter((u) => (u.roles.includes("teacher") || u.roles.includes("head")) && u.active && !u.pushAllowed);
  const card = (title: string, on: boolean, setOn: (v: boolean) => void, time: string, setTime: (v: string) => void, target: string, pvTitle: string, pvBody: string, save: () => void, resend: () => void) => (
    <section className="panel">
      <div className="row between"><h2>{title}</h2><Switch on={on} onChange={setOn} label={`${title} 사용`} /></div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>발송 요일</label><div className="input m"><input value="매주 일요일" readOnly aria-label="발송 요일" /></div></div>
        <div className="field"><label>발송 시간</label><div className="input m"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="발송 시간" /></div></div>
      </div>
      <div className="field"><label>발송 대상</label><p className="muted">{target}</p></div>
      <div className="card pad col g4" style={{ background: "var(--canvas)" }}>
        <span className="t-xs muted">미리보기</span>
        <strong className="sb">{pvTitle}</strong>
        <span>{pvBody}</span>
      </div>
      <div className="row g8" style={{ justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={resend}>지금 수동 재발송</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </section>
  );
  return (
    <Page title="알림 설정" sub="출석 미완료 푸시 알림의 발송 시간과 결과를 관리합니다">
      <Note warm icon="warning">예약 발송과 기기 푸시는 서버 스케줄러·웹 푸시 키 설정 후 동작합니다. 지금은 수동 재발송으로 앱 안의 알림 목록에 알림을 보낼 수 있습니다.</Note>
      <div className="grid cols-2">
        {card("학생 출석 미완료 알림 (담당 교사)", s.studentNotifyOn, (v) => updateSettings({ studentNotifyOn: v }), st, setSt, "해당 주일 출석이 완료되지 않은 반의 담당 교사", "주일 출석체크 안내", "1부 4학년 1반의 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.", () => { updateSettings({ studentNotifyTime: st }); toast(`발송 시간을 ${fmtTime12(st)}로 저장했습니다.`); }, () => toast(`${fmtDot(date)} 미완료 반 담임 ${sendStudentReminders(date)}명에게 알림을 보냈습니다.`))}
        {card("교사 출석 미완료 알림 (부장교사)", s.teacherNotifyOn, (v) => updateSettings({ teacherNotifyOn: v }), tt, setTt, "교사 출석부가 완료되지 않은 부서의 부장교사", "교사 출석체크 안내", "2부 교사 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.", () => { updateSettings({ teacherNotifyTime: tt }); toast(`발송 시간을 ${fmtTime12(tt)}로 저장했습니다.`); }, () => toast(`부장교사 ${sendTeacherReminders(date)}명에게 알림을 보냈습니다.`))}
      </div>
      <div className="grid split">
        <section className="panel">
          <div className="row between"><h2>알림 발송 결과</h2><span className="muted">{fmtDot(date)} 이후</span></div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>발송 시각</th><th>유형</th><th>수신자</th><th>대상</th><th>결과</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="num">{fmtStamp(l.at)}</td>
                    <td><Badge tone={l.mode === "자동" ? "info" : "neutral"}>{l.mode}</Badge></td>
                    <td className="sb">{d.users.find((u) => u.id === l.userId)?.name ?? "-"}</td>
                    <td>{l.target}</td>
                    <td><Badge tone={l.result === "성공" ? "success" : l.result === "실패" ? "error" : "warning"}>{l.result}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.length && <p className="empty">이 기간에 발송된 알림이 없습니다.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="row between"><h2>알림 권한 미설정 교사</h2><Badge tone="warning">{noPush.length}명</Badge></div>
          {noPush.map((u) => (
            <div key={u.id} className="row g10"><Avatar name={u.name} size={32} /><div className="col g2 grow"><strong className="sb">{u.name}</strong><span className="t-xs muted">{u.group}부 · {teacherDuty(d, u)}</span></div><Badge>미허용</Badge></div>
          ))}
          <Note>푸시가 전달되지 않는 교사도 앱 홈의 종 아이콘(빨간 점)과 알림 목록에서 같은 내용을 확인할 수 있습니다.</Note>
        </section>
      </div>
    </Page>
  );
}

// ───────── A10 학년도·운영 설정 ─────────
export function YearSettings() {
  const d = useData();
  const file = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const dates = yearSundays(d);
  const lower = activeStudents(d).filter((s) => (classOf(d, s)?.grade ?? 6) < 6).length;
  const types = [...new Set(d.audits.map((a) => a.type))];
  const name = (id: string) => d.users.find((u) => u.id === id)?.name ?? "시스템";
  const logs = d.audits.filter((a) => (!type || a.type === type) && (!q.trim() || a.target.includes(q.trim()) || name(a.actorId).includes(q.trim()))).slice(0, 100);
  const action = (icon: string, title: string, desc: string, btn: React.ReactNode) => (
    <div className="class-card"><span className="kpi" style={{ padding: 0, boxShadow: "none" }}><span className="ico"><Icon name={icon} size={18} /></span></span><strong className="b">{title}</strong><span className="t-xs muted grow" style={{ lineHeight: 1.4 }}>{desc}</span>{btn}</div>
  );
  return (
    <Page title="학년도·운영 설정" sub="학년도 전환, 진급 처리, 기록 보존을 관리합니다">
      <section className="panel">
        <span className="muted">현재 학년도</span>
        <div className="row g12 wrap"><strong className="t-3xl b">{d.settings.year}학년도</strong><Badge tone="success">운영 중</Badge><span className="muted">{d.settings.year}.01.01 ~ {d.settings.year}.12.31 · 주일 {dates.length} / 52주 진행</span></div>
        <h2 className="mt8">{d.settings.year + 1}학년도 전환 절차</h2>
        <div className="steps">
          {["새 학년도 생성", "진급 처리", "반 재배정", "전환 완료"].map((t, i, all) => <span key={t}><b>{i + 1}</b>{t}{i < all.length - 1 && <Icon name="right" size={14} />}</span>)}
        </div>
        <Note>진급은 되돌리기 어려우므로 실행 전에 반드시 백업 파일을 내려받아 두세요. 출석 기록과 심방노트는 처리 후에도 보존됩니다. 6학년 학생은 학생 관리에서 직접 정리해 주세요.</Note>
        <div className="grid cols-3" style={{ gap: 16 }}>
          {action("chart", "학생 진급 처리", `4·5학년 ${lower}명을 다음 학년의 같은 번호 반으로 진급시킵니다.`, <Button variant="outline" size="s" disabled={!lower} onClick={() => window.confirm(`4·5학년 ${lower}명을 진급 처리할까요? 되돌리려면 백업 복구가 필요합니다.`) && toast(`${promoteGrades()}명을 진급 처리했습니다.`)}>진급 처리</Button>)}
          {action("grid", "학생 반 재배정", "새 학년도 반 편성에 맞춰 학생과 교사를 배정합니다.", <Link to="/admin/classes" className="btn outline s">반 재배정</Link>)}
          {action("download", "백업 및 복구", `마지막 백업 ${fmtRelDay(d.settings.lastBackup)}. 전체 데이터를 파일로 내려받거나 복구합니다.`, <div className="row g6"><Button variant="outline" size="s" onClick={() => download(`출석관리_백업_${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), "application/json")}>백업 받기</Button><Button variant="outline" size="s" disabled={remoteEnabled} onClick={() => file.current?.click()}>복구</Button></div>)}
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || !window.confirm("현재 데이터를 백업 파일의 내용으로 덮어쓸까요?")) return; const err = importBackup(await f.text()); toast(err ?? "백업 파일로 복구했습니다.", err ? "error" : "info"); }} />
      </section>
      <section className="panel">
        <div className="row between wrap g8">
          <h2>변경 이력 (감사 로그)</h2>
          <div className="filters">
            <div className="input m" style={{ minWidth: 200 }}><Icon name="search" size={18} /><input placeholder="수정자, 대상 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="감사 로그 검색" /></div>
            <SelectBox label="유형" value={type} onChange={setType}><option value="">유형: 전체</option>{types.map((t) => <option key={t}>{t}</option>)}</SelectBox>
          </div>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>시각</th><th>수정자</th><th style={{ width: 140 }}>유형</th><th>대상</th><th>변경 전</th><th>변경 후</th></tr></thead>
            <tbody>
              {logs.map((a) => (
                <tr key={a.id}><td className="num muted">{fmtStamp(a.at)}</td><td className="sb">{name(a.actorId)}</td><td><Badge tone="info">{a.type}</Badge></td><td>{a.target}</td><td className="muted">{a.before}</td><td>{a.after}</td></tr>
              ))}
            </tbody>
          </table>
          {!logs.length && <p className="empty">조건에 맞는 변경 이력이 없습니다.</p>}
        </div>
        <span className="t-xs muted">최근 100건까지 표시합니다.</span>
      </section>
    </Page>
  );
}

// ───────── A12 관리자 계정 관리 ─────────
/** 계정 총괄만 보는 패널: 교사 계정 삭제 권한을 줄 사람을 고른다 */
function DeletePermissionPanel() {
  const d = useData();
  const allowed = d.settings.accountDeleters ?? [];
  const people = d.users
    .filter((u) => u.active && !u.roles.includes("owner") && u.roles.some((r) => r === "super" || r === "admin" || r === "head"))
    .sort((a, b) => Number(b.roles.includes("super")) - Number(a.roles.includes("super")) || a.name.localeCompare(b.name, "ko"));
  const toggle = (u: User, on: boolean) => {
    const next = on ? [...allowed, u.id] : allowed.filter((x) => x !== u.id);
    updateSettings({ accountDeleters: next });
    audit("삭제 권한 변경", `${u.name} (${u.loginId})`, on ? "없음" : "계정 삭제", on ? "계정 삭제" : "없음");
    toast(on ? `${u.name}에게 계정 삭제 권한을 주었습니다.` : `${u.name}의 계정 삭제 권한을 해제했습니다.`);
  };
  const roleText = (u: User) => [u.roles.includes("super") ? "최고 관리자" : u.roles.includes("admin") ? "일반 관리자" : null, u.roles.includes("head") ? "부장교사" : null].filter(Boolean).join(" · ");
  return (
    <section className="panel">
      <div className="row between"><h2>계정 삭제 권한</h2><Badge tone="info">{allowed.filter((id) => d.users.some((u) => u.id === id)).length}명 지정</Badge></div>
      <div className="col g8">
        {people.map((u) => {
          const on = allowed.includes(u.id);
          const noAdmin = !u.roles.some((r) => r === "super" || r === "admin");
          return (
            <label key={u.id} className="row g10" style={{ padding: "6px 0" }}>
              <span className="chk"><input type="checkbox" checked={on} onChange={(e) => toggle(u, e.target.checked)} /></span>
              <Avatar name={u.name} size={28} />
              <span className="col g2 grow"><strong className="sb">{u.name} {u.title && <span className="muted t-xs">{u.title}</span>}</strong><span className="t-xs muted">{roleText(u)}{noAdmin ? " · 관리자 화면 권한이 없어 삭제 버튼을 볼 수 없습니다" : ""}</span></span>
              {on && <Badge tone="warning">삭제 가능</Badge>}
            </label>
          );
        })}
        {!people.length && <p className="empty">지정할 수 있는 관리자·부장교사가 없습니다.</p>}
      </div>
      <Note icon="lock">계정 총괄은 항상 삭제할 수 있습니다. 담당 반이 배정된 교사는 삭제할 수 없고(먼저 배정 해제), 출석·심방 기록이 있는 계정은 기록을 작성자 이름과 함께 남기고 계정만 삭제합니다. 최고 관리자 계정은 최고 관리자만 삭제할 수 있습니다.</Note>
    </section>
  );
}

export function Accounts() {
  const d = useData();
  const me = useMe()!;
  const [temp, setTemp] = useState<{ id: string; pw: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [scope, setScope] = useState("학생·교사 데이터, 출결 운영");
  const supers = d.users.filter((u) => u.roles.includes("super")).sort((a, b) => Number(b.roles.includes("owner")) - Number(a.roles.includes("owner")));
  const admins = d.users.filter((u) => u.roles.includes("admin") && !u.roles.includes("super"));
  const candidates = d.users.filter((u) => !u.roles.includes("admin") && !u.roles.includes("super") && u.active);
  const isSuper = me.roles.includes("super");
  const history = d.audits.filter((a) => ["비밀번호 초기화", "권한 변경", "계정 등록", "계정 활성화", "계정 비활성화", "계정 삭제", "삭제 권한 변경"].includes(a.type)).slice(0, 30);
  const doReset = async (u: User) => {
    if (!window.confirm(`${u.name}(${u.loginId}) 계정의 비밀번호를 초기화할까요?`)) return;
    const r = await resetPassword(u.id);
    if (typeof r === "string") toast(r, "error");
    else setTemp({ id: u.loginId, pw: r.tempPassword });
  };
  const setRoles = async (u: User, roles: Role[], extra: Partial<User> = {}) => {
    const r = await upsertUser({ ...u, ...extra, roles });
    if (typeof r === "string") toast(r, "error");
  };
  return (
    <Page title="관리자 계정 관리" sub="최고 관리자·일반 관리자 계정과 권한을 관리합니다">
      <Note warm icon="shield">최고 관리자 계정의 생성·정보 수정·권한 변경·비활성화는 목사님(계정 총괄)만 할 수 있습니다. 다른 최고 관리자는 비밀번호 초기화만 가능하며, 목사님 계정은 초기화할 수 없습니다.</Note>
      <section className="panel">
        <div className="row between"><h2>최고 관리자</h2><Badge tone="info">{supers.length}명</Badge></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>직분</th><th>아이디</th><th>권한</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {supers.map((u) => (
                <tr key={u.id}>
                  <td><span className="row g8"><Avatar name={u.name} size={28} /><strong className="sb">{u.name}</strong>{u.id === me.id && <Badge tone="info">나</Badge>}</span></td>
                  <td>{u.title ?? "-"}</td><td className="muted">{u.loginId}</td>
                  <td><span className="row g6">{u.roles.includes("owner") && <Badge tone="warning">계정 총괄</Badge>}<Badge tone="warning">최고 관리자</Badge>{u.roles.includes("head") && <Badge tone="info">부장교사</Badge>}</span></td>
                  <td><Badge tone={u.active ? "success" : "neutral"}>{u.active ? "활성" : "비활성"}</Badge></td>
                  <td>
                    {u.roles.includes("owner") ? <span className="muted t-xs">초기화 불가</span> : u.id === me.id ? <span className="muted t-xs">내 정보에서 변경</span> : (
                      <span className="row g6">
                        <Button variant="danger" size="s" disabled={!canResetPassword(me, u)} onClick={() => doReset(u)}>비밀번호 초기화</Button>
                        {canManageAccount(me, u) && <Button variant="outline" size="s" onClick={() => { const e = setUserActive(u.id, !u.active); if (e) toast(e, "error"); }}>{u.active ? "비활성화" : "활성화"}</Button>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {me.roles.includes("owner") && <DeletePermissionPanel />}
      <section className="panel">
        <div className="row between"><h2>일반 관리자</h2><Button size="s" disabled={!isSuper} onClick={() => { setPick(""); setAdding(true); }}><Icon name="plus" size={14} />일반 관리자 등록</Button></div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>아이디</th><th>권한 범위</th><th>상태</th><th>관리</th></tr></thead>
            <tbody>
              {admins.map((u) => (
                <tr key={u.id}>
                  <td><span className="row g8"><Avatar name={u.name} size={28} /><strong className="sb">{u.name}</strong></span></td>
                  <td className="muted">{u.loginId}</td><td>{u.adminScope ?? "학생·교사 데이터, 출결 운영"}</td>
                  <td><Badge tone={u.active ? "success" : "neutral"}>{u.active ? "활성" : "비활성"}</Badge></td>
                  <td><span className="row g6">
                    <Button variant="danger" size="s" disabled={!canResetPassword(me, u)} onClick={() => doReset(u)}>비밀번호 초기화</Button>
                    <Button variant="outline" size="s" disabled={!canManageAccount(me, u)} onClick={() => { const e = setUserActive(u.id, !u.active); if (e) toast(e, "error"); }}>{u.active ? "비활성화" : "활성화"}</Button>
                    <Button variant="outline" size="s" disabled={!canManageAccount(me, u)} onClick={() => window.confirm(`${u.name}의 일반 관리자 권한을 해제할까요?`) && setRoles(u, u.roles.filter((r) => r !== "admin"))}>권한 해제</Button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!admins.length && <p className="empty">등록된 일반 관리자가 없습니다.</p>}
        </div>
      </section>
      <section className="panel">
        <h2>관리자 계정 변경 이력</h2>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>시각</th><th>수행자</th><th>유형</th><th>대상</th><th>내용</th></tr></thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id}><td className="num muted">{fmtStamp(a.at)}</td><td className="sb">{d.users.find((u) => u.id === a.actorId)?.name ?? "시스템"}</td><td><Badge tone="info">{a.type}</Badge></td><td>{a.target}</td><td>{a.after}</td></tr>
              ))}
            </tbody>
          </table>
          {!history.length && <p className="empty">변경 이력이 없습니다.</p>}
        </div>
      </section>
      {adding && (
        <Modal title="일반 관리자 등록" onClose={() => setAdding(false)} footer={<><Button variant="outline" onClick={() => setAdding(false)}>취소</Button><Button disabled={!pick} onClick={() => { const u = d.users.find((x) => x.id === pick)!; setRoles(u, [...u.roles, "admin"], { adminScope: scope }); toast(`${u.name}을(를) 일반 관리자로 등록했습니다.`); setAdding(false); }}>등록</Button></>}>
          <div className="field"><label>대상 계정</label>
            <SelectBox label="대상 계정" value={pick} onChange={setPick}><option value="">계정 선택</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.loginId})</option>)}</SelectBox>
          </div>
          <div className="field"><label>권한 범위</label>
            <SelectBox label="권한 범위" value={scope} onChange={setScope}><option>학생·교사 데이터, 출결 운영</option><option>학생 데이터 조회</option></SelectBox>
          </div>
          <Note>일반 관리자는 학생·교사 데이터와 출결을 운영할 수 있지만, 관리자 계정을 추가하거나 변경할 수 없습니다. 새 계정이 필요하면 먼저 교사·계정 관리에서 교사로 등록해 주세요.</Note>
        </Modal>
      )}
      {temp && <TempPasswordModal loginId={temp.id} password={temp.pw} onClose={() => setTemp(null)} />}
    </Page>
  );
}
