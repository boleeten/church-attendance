import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { currentSunday, fmtKoFull, fmtMD, sundaysOfMonth, ym } from "../lib/date";
import { consecutiveAbsences, groupTeachers, pct, pctText, personRate, roster, teacherDuty, yearSundays } from "../lib/stats";
import { useData, useMe } from "../lib/store";
import { Badge, Icon, MarkDot, Progress, Seg } from "../ui";
import { AppBar, ClassPicker, HEAD_TABS, Phone, TEACHER_TABS, useMyClass } from "./Shell";

type Tab = "week" | "month" | "year";

export function History({ mode }: { mode: "student" | "teacher" }) {
  const d = useData();
  const u = useMe()!;
  const nav = useNavigate();
  const { cls } = useMyClass();
  const isStudent = mode === "student";
  const base = isStudent ? "/t" : "/h";
  const group = u.group ?? 1;
  const cur = currentSunday();
  const dates = yearSundays(d);
  const [tab, setTab] = useState<Tab>("month");
  const [month, setMonth] = useState(ym(cur).m);
  const [week, setWeek] = useState(cur);
  const [q, setQ] = useState("");
  const year = d.settings.year;

  const marks = isStudent ? d.studentMarks : d.teacherMarks;
  const people = (isStudent ? (cls ? roster(d, cls.id).map((s) => ({ id: s.id, name: s.name, sub: "" })) : []) : groupTeachers(d, group).map((t) => ({ id: t.id, name: t.name, sub: teacherDuty(d, t) }))).filter((p) => p.name.includes(q.trim()));
  const sessionDone = (dt: string) => !!d.sessions[`${dt}|${isStudent ? `class:${cls?.id}` : `group:${group}`}`]?.completed;

  const monthAll = sundaysOfMonth(year, month);
  const monthPast = monthAll.filter((x) => x <= cur);
  let p = 0;
  let a = 0;
  let un = 0;
  for (const dt of monthPast)
    for (const person of people) {
      const m = marks[`${dt}|${person.id}`];
      if (m === "P") p++;
      else if (m === "A") a++;
      else un++;
    }
  const rate = pct(p, a);
  const incomplete = monthPast.filter((x) => !sessionDone(x));
  const provisional = incomplete.length > 0;
  const wi = dates.indexOf(week);

  const tabs = [["week", isStudent ? "주간" : "주일별"], ["month", "월간"], ["year", "연간"]] as const;

  return (
    <Phone tabs={isStudent ? TEACHER_TABS : HEAD_TABS}>
      <AppBar title={isStudent ? "출석 이력" : "교사 출석 이력"} right={isStudent ? <ClassPicker /> : <Badge tone="info">{group}부</Badge>} />
      <div className="mbody">
        {!isStudent && (
          <div className="input">
            <Icon name="search" size={18} />
            <input placeholder="교사 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="교사 이름 검색" />
          </div>
        )}
        <Seg value={tab} options={tabs} onChange={setTab} />

        {tab === "month" && (
          <>
            <div className="row between">
              <button type="button" className="icon-btn" aria-label="이전 달" disabled={month <= 1} onClick={() => setMonth(month - 1)}><Icon name="left" size={16} /></button>
              <strong className="t-lg b">{year}년 {month}월</strong>
              <button type="button" className="icon-btn" aria-label="다음 달" disabled={month >= ym(cur).m} onClick={() => setMonth(month + 1)}><Icon name="right" size={16} /></button>
            </div>
            <div className="card pad col g10">
              <div className="row between">
                <span className="muted">{isStudent ? "우리 반" : `${group}부 교사`} 출석률</span>
                <strong className="t-2xl b c-primary">{pctText(rate)}</strong>
              </div>
              <Progress value={rate ?? 0} />
              <span className="t-xs muted">출석 {p} · 결석 {a} · 미확인 {un}{provisional ? ` (${incomplete.map(fmtMD).join(", ")} 미완료)` : ""}</span>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table className="mtable">
                <thead>
                  <tr>
                    <th>{isStudent ? "이름" : "교사"}</th>
                    {monthAll.map((dt) => (
                      <th key={dt} style={{ width: 36 }}>
                        {dt <= cur ? <button type="button" onClick={() => nav(`${base}/check?date=${dt}`)} aria-label={`${fmtMD(dt)} 출석부 열기`}>{fmtMD(dt)}</button> : fmtMD(dt)}
                      </th>
                    ))}
                    <th style={{ width: 52 }}>출석률</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="col g2">
                          <strong className="sb ellipsis" style={{ maxWidth: 96 }}>{person.name}</strong>
                          {person.sub && <span className="t-xs muted">{person.sub}</span>}
                        </div>
                      </td>
                      {monthAll.map((dt) => (
                        <td key={dt}><MarkDot mark={marks[`${dt}|${person.id}`]} future={dt > cur} /></td>
                      ))}
                      <td className="sb num">{pctText(personRate(marks, person.id, monthPast).rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {people.length === 0 && <p className="empty">표시할 기록이 없습니다.</p>}
            </div>
            <p className="row g6 t-xs muted"><Icon name="info" size={14} />날짜를 눌러 과거 출석부를 조회·수정할 수 있습니다.</p>
          </>
        )}

        {tab === "week" && (
          <>
            <div className="row between">
              <button type="button" className="icon-btn" aria-label="이전 주일" disabled={wi <= 0} onClick={() => setWeek(dates[wi - 1])}><Icon name="left" size={16} /></button>
              <strong className="t-lg b">{fmtKoFull(week)}</strong>
              <button type="button" className="icon-btn" aria-label="다음 주일" disabled={wi >= dates.length - 1} onClick={() => setWeek(dates[wi + 1])}><Icon name="right" size={16} /></button>
            </div>
            <div className="row between">
              <Badge tone={sessionDone(week) ? "success" : "warning"}>{sessionDone(week) ? "출석 완료" : "미완료"}</Badge>
              <Link to={`${base}/check?date=${week}`} className="btn secondary s">출석부 열기</Link>
            </div>
            <div className="card list">
              {people.map((person) => {
                const m = marks[`${week}|${person.id}`];
                return (
                  <div key={person.id} className="row between" style={{ padding: "12px 16px" }}>
                    <div className="col g2">
                      <strong className="sb">{person.name}</strong>
                      {person.sub && <span className="t-xs muted">{person.sub}</span>}
                    </div>
                    <Badge tone={m === "P" ? "success" : m === "A" ? "error" : "neutral"}>{m === "P" ? "출석" : m === "A" ? "결석" : "미확인"}</Badge>
                  </div>
                );
              })}
              {people.length === 0 && <p className="empty">표시할 기록이 없습니다.</p>}
            </div>
          </>
        )}

        {tab === "year" && (
          <>
            <strong className="t-lg b" style={{ textAlign: "center" }}>{year}학년도</strong>
            <div className="card" style={{ overflow: "hidden" }}>
              <table className="mtable">
                <thead>
                  <tr><th>{isStudent ? "이름" : "교사"}</th><th>출석</th><th>결석</th><th>연속 결석</th><th style={{ width: 56 }}>출석률</th></tr>
                </thead>
                <tbody>
                  {people.map((person) => {
                    const r = personRate(marks, person.id, dates);
                    const streak = consecutiveAbsences(marks, person.id, dates).count;
                    return (
                      <tr key={person.id}>
                        <td>
                          <div className="col g2">
                            <strong className="sb">{person.name}</strong>
                            {person.sub && <span className="t-xs muted">{person.sub}</span>}
                          </div>
                        </td>
                        <td className="num">{r.p}</td>
                        <td className="num">{r.a}</td>
                        <td className={`num ${streak >= 2 ? "c-error sb" : "muted"}`}>{streak >= 2 ? `${streak}주` : "-"}</td>
                        <td className="sb num">{pctText(r.rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {people.length === 0 && <p className="empty">표시할 기록이 없습니다.</p>}
            </div>
          </>
        )}
      </div>
    </Phone>
  );
}
