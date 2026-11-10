import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { currentSunday, fmtDateTimeKo, fmtDot, fmtKo, fmtMD, fmtStamp, sundaysOfMonth, ym } from "../lib/date";
import { enablePush, pushPermission, sendTestNotification } from "../lib/push";
import { toast } from "../lib/remote";
import { classSummary, consecutiveAbsences, groupTeachers, personRate, pctText, roster, teacherDuty, teacherSummary, yearSundays } from "../lib/stats";
import { logout, markAllRead, markRead, setPushAllowed, setStudentPhoto, useData, useMe } from "../lib/store";
import type { Student } from "../lib/types";
import { Avatar, Badge, Button, Icon, MarkDot, Note, Progress, Sheet } from "../ui";
import { PhotoCropper, photoKB } from "../ui/PhotoCropper";
import { NoteSheet } from "./Attendance";
import { PasswordForm } from "./Auth";
import { AppBar, ClassPicker, HEAD_TABS, isAdmin, Phone, TEACHER_TABS, useMyClass } from "./Shell";

function Bell({ base }: { base: string }) {
  const d = useData();
  const u = useMe()!;
  const unread = d.notifications.some((n) => n.userId === u.id && !n.read);
  return (
    <Link to={`${base}/notifications`} className="icon-btn bordered" aria-label={unread ? "알림, 읽지 않은 알림 있음" : "알림"}>
      <Icon name="bell" size={22} />
      {unread && <span className="dot" />}
    </Link>
  );
}

function Hero({ tone, label, date, sum, unit, cta, to }: { tone: "teacher" | "head"; label: string; date: string; sum: ReturnType<typeof classSummary>; unit: string; cta: string; to: string }) {
  const done = sum.total ? Math.round(((sum.p + sum.a) / sum.total) * 100) : 0;
  return (
    <section className={`hero ${tone}`}>
      <div className="row between">
        <div className="col g2">
          <span className="t-sm hero-label">{label}</span>
          <strong className="t-2xl b">{fmtKo(date)}</strong>
        </div>
        <Badge tone={sum.completed ? "success" : "warning"}>{sum.completed ? "출석 완료" : sum.started ? "출석 진행 중" : "출석 전"}</Badge>
      </div>
      <div className="stat4">
        <div><strong>{sum.total}</strong><span>{unit}</span></div>
        <div><strong className="c-success">{sum.p}</strong><span>출석</span></div>
        <div><strong className="c-error">{sum.a}</strong><span>결석</span></div>
        <div><strong className="c-neutral">{sum.u}</strong><span>미확인</span></div>
      </div>
      <div className="col g8">
        <div className="row between t-xs"><span>완료율</span><strong>{done}%</strong></div>
        <Progress value={done} />
      </div>
      <Link to={to} className="btn secondary l block">{cta}</Link>
    </section>
  );
}

export function TeacherHome() {
  const d = useData();
  const u = useMe()!;
  const { cls } = useMyClass();
  const date = currentSunday();
  if (!cls)
    return (
      <Phone tabs={TEACHER_TABS}>
        <AppBar title={`${u.name} 선생님`} right={<Bell base="/t" />} />
        <div className="mbody"><p className="empty">배정된 담당 반이 없습니다. 관리자에게 문의해 주세요.</p></div>
      </Phone>
    );
  const dates = yearSundays(d);
  const kind = d.assignments.find((a) => a.userId === u.id && a.classId === cls.id)?.kind ?? "담임";
  const streaks = roster(d, cls.id)
    .map((s) => ({ s, ...consecutiveAbsences(d.studentMarks, s.id, dates) }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count);
  return (
    <Phone tabs={TEACHER_TABS}>
      <header className="row between" style={{ padding: "12px 20px" }}>
        <div className="col g2">
          <span className="muted">{cls.group}부 · {cls.grade}학년 {cls.no}반 {kind}</span>
          <h1 className="t-2xl b">{u.name} 선생님</h1>
        </div>
        <Bell base="/t" />
      </header>
      <div className="mbody">
        <Hero tone="teacher" label="이번 주 주일" date={date} sum={classSummary(d, date, cls.id)} unit="전체" cta="출석체크 하기" to="/t/check" />
        <div className="row between">
          <h2 className="t-base b">최근 연속 결석 학생</h2>
          <strong className="c-error">{streaks.length}명</strong>
        </div>
        <div className="card pad col g16">
          {streaks.length === 0 && <p className="muted" style={{ textAlign: "center" }}>2주 이상 연속으로 결석한 학생이 없습니다.</p>}
          {streaks.map(({ s, count, lastPresent }) => (
            <div key={s.id} className="row g12">
              <Link to={`/t/students/${s.id}`} className="row g12 grow">
                <Avatar name={s.name} photo={s.photo} />
                <div className="col g2 grow">
                  <strong className="t-base sb">{s.name}</strong>
                  <span className="t-xs muted">{count}주 연속 결석 · 마지막 출석 {lastPresent ? fmtMD(lastPresent) : "기록 없음"}</span>
                </div>
              </Link>
              <a className="icon-btn soft" href={`tel:${s.guardianPhone}`} aria-label={`${s.name} 보호자에게 전화`}><Icon name="phone" /></a>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

export function HeadHome() {
  const d = useData();
  const u = useMe()!;
  const g = u.group ?? 1;
  const date = currentSunday();
  const pending = groupTeachers(d, g).filter((t) => !d.teacherMarks[`${date}|${t.id}`]);
  return (
    <Phone tabs={HEAD_TABS}>
      <header className="row between" style={{ padding: "12px 20px" }}>
        <div className="col g2">
          <span className="muted">{g}부 부장교사</span>
          <h1 className="t-2xl b">{u.name} 부장님</h1>
        </div>
        <Bell base="/h" />
      </header>
      <div className="mbody">
        <Hero tone="head" label={`${g}부 교사 출석 · 이번 주 주일`} date={date} sum={teacherSummary(d, date, g)} unit="전체 교사" cta="교사 출석체크 하기" to="/h/check" />
        <Note>부장교사 본인의 출석은 관리자가 입력합니다. {g}부 소속 교사만 체크할 수 있습니다.</Note>
        <div className="row between">
          <h2 className="t-base b">미확인 교사</h2>
          <strong className="muted">{pending.length}명</strong>
        </div>
        <div className="card pad col g16">
          {pending.length === 0 && <p className="muted" style={{ textAlign: "center" }}>모든 교사의 출석을 확인했습니다.</p>}
          {pending.map((t) => (
            <div key={t.id} className="row g12">
              <Avatar name={t.name} size={36} />
              <div className="col g2 grow">
                <strong className="sb">{t.name}</strong>
                <span className="t-xs muted">{g}부 {teacherDuty(d, t)}</span>
              </div>
              <Badge>미확인</Badge>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

export function Notifications({ base }: { base: "/t" | "/h" }) {
  const d = useData();
  const u = useMe()!;
  const nav = useNavigate();
  const mine = d.notifications.filter((n) => n.userId === u.id);
  const group = (label: string, list: typeof mine) =>
    list.length > 0 && (
      <>
        <span className="t-xs sb muted">{label}</span>
        <div className="card list">
          {list.map((n) => (
            <button
              key={n.id}
              type="button"
              className="row g12"
              style={{ padding: 16, alignItems: "flex-start", textAlign: "left", width: "100%" }}
              onClick={() => {
                markRead(n.id);
                nav(n.link ?? `${base}/check?date=${n.date}`);
              }}
            >
              <span className="icon-btn" style={{ width: 40, height: 40, borderRadius: 20, background: n.read ? "var(--soft)" : n.kind === "reply" ? "var(--soft)" : "var(--error-soft)", color: n.read ? "var(--text)" : n.kind === "reply" ? "var(--primary)" : "var(--error)" }}>
                <Icon name={n.kind === "reply" ? "note" : "bell"} />
              </span>
              <span className="col g4 grow">
                <span className="row g6">
                  <strong className="sb grow">{n.title}</strong>
                  {!n.read && <i style={{ width: 8, height: 8, borderRadius: 4, background: "var(--error)" }} aria-label="안 읽음" />}
                </span>
                <span className={n.read ? "muted" : ""} style={{ lineHeight: 1.4 }}>{n.body}</span>
                <span className="t-xs muted">{fmtDateTimeKo(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  return (
    <Phone>
      <AppBar back title="알림" right={<button type="button" className="sb c-primary" onClick={markAllRead}>모두 읽음</button>} />
      <div className="mbody" style={{ gap: 12 }}>
        {mine.length === 0 && <p className="empty">받은 알림이 없습니다.</p>}
        {group("새 알림", mine.filter((n) => !n.read))}
        {group("지난 알림", mine.filter((n) => n.read))}
        <p className="row g6 t-xs muted"><Icon name="info" size={14} />출석 알림은 해당 주일 {base === "/h" ? "교사 " : ""}출석체크 화면으로, 심방 답변 알림은 그 학생의 심방노트로 이동합니다.</p>
      </div>
    </Phone>
  );
}

export function StudentList() {
  const d = useData();
  const { cls } = useMyClass();
  const [q, setQ] = useState("");
  const date = currentSunday();
  const list = cls ? roster(d, cls.id).filter((s) => s.name.includes(q.trim())) : [];
  return (
    <Phone tabs={TEACHER_TABS}>
      <AppBar title="우리 반 학생" right={<span className="muted sb">{cls ? roster(d, cls.id).length : 0}명</span>} />
      <div className="mbody">
        <div className="input">
          <Icon name="search" size={18} />
          <input placeholder="이름으로 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="학생 이름 검색" />
        </div>
        <div className="card list">
          {list.length === 0 && <p className="empty">{q ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."}</p>}
          {list.map((s) => {
            const m = d.studentMarks[`${date}|${s.id}`];
            return (
              <div key={s.id} className="row g10" style={{ padding: "12px 16px" }}>
                <Link to={`/t/students/${s.id}`} className="row g12 grow">
                  <Avatar name={s.name} photo={s.photo} />
                  <div className="col g4 grow">
                    <strong className="t-base sb">{s.name}</strong>
                    <span className="row g6 t-xs muted">최근 <Badge tone={m === "P" ? "success" : m === "A" ? "error" : "neutral"}>{m === "P" ? "출석" : m === "A" ? "결석" : "미확인"}</Badge></span>
                  </div>
                </Link>
                {s.phone && (
                  <a className="col center g2 t-xs muted" href={`tel:${s.phone}`} aria-label={`${s.name} 학생에게 전화`}>
                    <span className="icon-btn soft" style={{ width: 36, height: 36 }}><Icon name="phone" size={18} /></span>학생
                  </a>
                )}
                <a className="col center g2 t-xs muted" href={`tel:${s.guardianPhone}`} aria-label={`${s.name} 보호자에게 전화`}>
                  <span className="icon-btn warm" style={{ width: 36, height: 36 }}><Icon name="phone" size={18} /></span>보호자
                </a>
                <Link to={`/t/students/${s.id}`} aria-label={`${s.name} 상세`} className="muted"><Icon name="right" size={18} /></Link>
              </div>
            );
          })}
        </div>
      </div>
    </Phone>
  );
}

export function StudentDetail() {
  const d = useData();
  const { id } = useParams();
  const file = useRef<HTMLInputElement>(null);
  const [noteFor, setNoteFor] = useState<Student | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const s = d.students.find((x) => x.id === id);
  const u = useMe()!;
  const allowed = s && (isAdmin(u) || d.assignments.some((a) => a.userId === u.id && a.classId === s.classId));
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash.startsWith("#note-")) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => window.clearTimeout(t);
  }, [hash]);
  if (!s || !allowed)
    return (
      <Phone>
        <AppBar back title="학생 상세" />
        <p className="empty">담당 반 학생만 조회할 수 있습니다.</p>
      </Phone>
    );
  const cls = d.classes.find((c) => c.id === s.classId)!;
  const dates = yearSundays(d);
  const cur = currentSunday();
  const { y, m } = ym(cur);
  const monthDates = sundaysOfMonth(y, m).filter((x) => x <= cur);
  const month = personRate(d.studentMarks, s.id, monthDates);
  const year = personRate(d.studentMarks, s.id, dates);
  const streak = consecutiveAbsences(d.studentMarks, s.id, dates);
  const notes = d.notes.filter((n) => n.studentId === s.id);
  const contact = (label: string, num: string) => (
    <div className="row between" style={{ padding: 16 }}>
      <div className="col g4">
        <span className="t-xs muted">{label}</span>
        <strong className="t-base sb num">{num || "등록된 번호 없음"}</strong>
      </div>
      {num && <a className="btn secondary s" href={`tel:${num}`}>전화 걸기</a>}
    </div>
  );
  return (
    <Phone>
      <AppBar back title="학생 상세" />
      <div className="mbody">
        <div className="col center g8">
          <Avatar name={s.name} photo={s.photo} size={88} />
          <strong className="t-xl b">{s.name}</strong>
          <div className="row g6">
            <Badge tone="info">{cls.group}부 · {cls.grade}학년 {cls.no}반</Badge>
            <Badge tone={s.status === "등록" ? "success" : s.status === "장결자" ? "warning" : "neutral"}>{s.status}</Badge>
          </div>
          <div className="row g8">
            <Button variant="outline" size="s" onClick={() => file.current?.click()}><Icon name="camera" size={14} />{s.photo ? "사진 변경" : "사진 등록"}</Button>
            {s.photo && <Button variant="outline" size="s" onClick={() => window.confirm("등록된 사진을 삭제할까요?") && (setStudentPhoto(s.id, null), toast("사진을 삭제했습니다."))}>삭제</Button>}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.type.startsWith("image/")) return toast("사진 파일만 등록할 수 있습니다.", "error");
              setCropFile(f);
            }}
          />
        </div>
        <div className="card list">
          {contact("학생", s.phone)}
          {contact(`보호자 (${s.guardianRel})`, s.guardianPhone)}
          <p className="row g6 t-xs muted" style={{ padding: "12px 16px" }}><Icon name="lock" size={14} />연락처·소속 반은 관리자만 변경할 수 있습니다.</p>
        </div>
        <div className="row g12">
          <div className="card pad col g4 grow">
            <span className="t-xs muted">{m}월 출석률</span>
            <strong className={`t-2xl b ${month.rate !== null && month.rate < 50 ? "c-error" : ""}`}>{pctText(month.rate)}</strong>
            <span className="t-xs muted">{month.p} / {month.p + month.a}주</span>
          </div>
          <div className="card pad col g4 grow">
            <span className="t-xs muted">{y}년 출석률</span>
            <strong className="t-2xl b">{pctText(year.rate)}</strong>
            <span className="t-xs muted">{year.p} / {year.p + year.a}주</span>
          </div>
        </div>
        <div className="row between">
          <h2 className="t-base b">최근 출석 기록</h2>
          {streak.count >= 2 && <strong className="t-xs c-error">{streak.count}주 연속 결석</strong>}
        </div>
        <div className="card pad row between">
          {dates.slice(-6).map((dt) => (
            <div key={dt} className="col center g8">
              <span className="t-xs muted">{fmtMD(dt)}</span>
              <MarkDot mark={d.studentMarks[`${dt}|${s.id}`]} />
            </div>
          ))}
        </div>
        <div className="row between">
          <h2 className="t-base b">심방노트</h2>
          <Button variant="secondary" size="s" onClick={() => setNoteFor(s)}>노트 작성</Button>
        </div>
        {notes.length === 0 && <p className="card pad muted" style={{ textAlign: "center" }}>작성된 심방노트가 없습니다.</p>}
        {notes.map((n) => {
          const by = n.replyBy ? d.users.find((x) => x.id === n.replyBy) : undefined;
          return (
            <div key={n.id} id={`note-${n.id}`} className={`card pad col g8 ${hash === `#note-${n.id}` ? "flash" : ""}`}>
              <div className="row g8">
                {n.reason && <Badge tone="error">{n.reason}</Badge>}
                <span className="t-xs muted grow">{fmtDot(n.date)}</span>
                {n.reply && <Badge tone="info">답변 완료</Badge>}
              </div>
              <p style={{ lineHeight: 1.5 }}>{n.content || "(내용 없음)"}</p>
              <span className="t-xs muted">{d.users.find((x) => x.id === n.authorId)?.name ?? "-"} · {fmtStamp(n.createdAt)}</span>
              {n.reply && (
                <div className="reply">
                  <span className="row g6 t-xs sb c-primary"><Icon name="note" size={14} />{by ? `${by.title ?? ""} ${by.name}`.trim() : "관리자"}의 답변</span>
                  <p style={{ lineHeight: 1.5 }}>{n.reply}</p>
                  {n.replyAt && <span className="t-xs muted">{fmtStamp(n.replyAt)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {noteFor && <NoteSheet student={noteFor} date={cur} onClose={() => setNoteFor(null)} />}
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(photo) => {
            const err = setStudentPhoto(s.id, photo);
            toast(err ?? `사진을 저장했습니다. (약 ${photoKB(photo)}KB)`, err ? "error" : "info");
            setCropFile(null);
          }}
        />
      )}
    </Phone>
  );
}

export function MyInfo({ base }: { base: "/t" | "/h" }) {
  const d = useData();
  const u = useMe()!;
  const nav = useNavigate();
  const [sheet, setSheet] = useState<"pw" | "install" | null>(null);
  const perm = pushPermission();
  const pushOn = u.pushAllowed && perm === "granted";
  const askPush = async () => {
    const r = await enablePush(u.id);
    setPushAllowed(r.ok);
    toast(r.message, r.ok ? "info" : "error");
  };
  const testPush = async () => {
    const ok = await sendTestNotification(`${base}/check`);
    toast(ok ? "테스트 알림을 보냈습니다. 화면 위쪽이나 알림 센터를 확인해 주세요." : "먼저 푸시 알림을 허용해 주세요.", ok ? "info" : "error");
  };
  const other = base === "/t" && u.roles.includes("head") ? "/h" : base === "/h" && u.roles.includes("teacher") && d.assignments.some((a) => a.userId === u.id) ? "/t" : null;
  return (
    <Phone tabs={base === "/t" ? TEACHER_TABS : HEAD_TABS}>
      <AppBar title="내 정보" />
      <div className="mbody">
        <div className="card pad row g16">
          <Avatar name={u.name} size={64} />
          <div className="col g6">
            <strong className="t-lg b">{u.name}</strong>
            <span className="t-xs muted">아이디 {u.loginId}</span>
            <div className="row g6 wrap">
              {base === "/t" ? <ClassPicker /> : <Badge tone="info">{u.group}부 부장교사</Badge>}
              {u.roles.includes("super") && <Badge tone="warning">최고 관리자</Badge>}
              {!u.roles.includes("super") && u.roles.includes("admin") && <Badge tone="warning">일반 관리자</Badge>}
            </div>
          </div>
        </div>
        {isAdmin(u) && (
          <Link to="/admin" className="row g12" style={{ background: "var(--primary)", color: "#fff", borderRadius: 16, padding: 16 }}>
            <span className="icon-btn" style={{ background: "var(--secondary)", color: "#fff", borderRadius: 12 }}><Icon name="shield" /></span>
            <span className="col g2 grow">
              <strong className="sb">관리자 모드로 전환</strong>
              <span className="t-xs" style={{ opacity: 0.8 }}>전체 학생·교사 출결과 계정을 관리합니다</span>
            </span>
            <Icon name="right" />
          </Link>
        )}
        <div className="card list">
          {other && (
            <Link to={other} className="menu-row"><Icon name="refresh" /><span className="grow sb">{other === "/h" ? "부장교사 화면으로 전환" : "담당 반 화면으로 전환"}</span><Icon name="right" size={16} /></Link>
          )}
          <button type="button" className="menu-row" onClick={() => setSheet("pw")}><Icon name="lock" /><span className="grow sb">비밀번호 변경</span><Icon name="right" size={16} /></button>
          <button type="button" className="menu-row" onClick={askPush}><Icon name="bell" /><span className="grow sb">푸시 알림</span><Badge tone={pushOn ? "success" : "neutral"}>{pushOn ? "허용됨" : "미허용"}</Badge></button>
          {pushOn && <button type="button" className="menu-row" onClick={testPush}><Icon name="check" /><span className="grow sb">테스트 알림 받아 보기</span><Icon name="right" size={16} /></button>}
          <button type="button" className="menu-row" onClick={() => setSheet("install")}><Icon name="download" /><span className="grow sb">홈 화면에 앱 설치</span><Icon name="right" size={16} /></button>
          <div className="menu-row"><Icon name="info" /><span className="grow sb">앱 버전</span><span className="muted">1.0.0</span></div>
        </div>
        <Note icon="bell">매주 일요일 오후 3시, 출석이 완료되지 않으면 알림을 보내드립니다. 아이폰은 홈 화면에 설치한 앱에서 알림을 허용해야 합니다.</Note>
        <Button variant="danger" size="l" block onClick={() => { logout(); nav("/login", { replace: true }); }}>로그아웃</Button>
      </div>
      {sheet === "pw" && (
        <Sheet onClose={() => setSheet(null)}>
          <h2 className="t-lg b">비밀번호 변경</h2>
          <PasswordForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "install" && (
        <Sheet onClose={() => setSheet(null)}>
          <h2 className="t-lg b">홈 화면에 앱 설치</h2>
          <ol className="col g10" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            <li><b>아이폰(Safari)</b>: 아래 공유 버튼 → "홈 화면에 추가"를 누릅니다.</li>
            <li><b>안드로이드(Chrome)</b>: 오른쪽 위 메뉴 → "홈 화면에 추가" 또는 "앱 설치"를 누릅니다.</li>
            <li>홈 화면의 아이콘으로 앱을 연 뒤, 이 화면에서 푸시 알림을 허용해 주세요.</li>
          </ol>
          <Button size="l" block onClick={() => setSheet(null)}>확인</Button>
        </Sheet>
      )}
    </Phone>
  );
}
