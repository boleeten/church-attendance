import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fmtBirth, todayISO } from "../lib/date";
import { homeroomName } from "../lib/stats";
import { classLabel, useData } from "../lib/store";
import type { Student } from "../lib/types";
import { Badge, Button, Icon, PhotoAvatar, Seg } from "../ui";
import { Page } from "./AdminApp";
import { classOf, StudentDetailModal } from "./Manage";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 이번 주(일~토) 범위의 "MM-DD" 목록. 연말·연초에 걸쳐도 맞도록 실제 날짜로 계산한다. */
function thisWeekMD(today: string): Set<string> {
  const t = new Date(today + "T00:00:00Z");
  const sun = t.getTime() - t.getUTCDay() * 86400000;
  return new Set(Array.from({ length: 7 }, (_, i) => new Date(sun + i * 86400000).toISOString().slice(5, 10)));
}

/** A11 월별 생일: 등록·장결자 학생 중 그 달에 생일인 학생을 날짜순으로 */
export function Birthdays() {
  const d = useData();
  const today = todayISO();
  const [ym, setYm] = useState({ y: +today.slice(0, 4), m: +today.slice(5, 7) });
  const [group, setGroup] = useState<"0" | "1" | "2">("0");
  const [detail, setDetail] = useState<Student | null>(null);
  const week = useMemo(() => thisWeekMD(today), [today]);

  const active = d.students.filter((s) => (s.status === "등록" || s.status === "장결자") && (group === "0" || String(classOf(d, s)?.group) === group));
  const missing = active.filter((s) => !s.birthDate).length;
  const mm = String(ym.m).padStart(2, "0");
  const days = useMemo(() => {
    const map = new Map<number, Student[]>();
    for (const s of active) if (s.birthDate?.slice(5, 7) === mm) {
      const day = +s.birthDate.slice(8, 10);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([day, list]) => [day, list.sort((a, b) => a.name.localeCompare(b.name, "ko"))] as const);
  }, [active, mm]);
  const total = days.reduce((n, [, l]) => n + l.length, 0);
  const move = (n: number) => setYm(({ y, m }) => { const t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const isNow = ym.y === +today.slice(0, 4) && ym.m === +today.slice(5, 7);

  return (
    <Page title="학생 생일" sub="월별로 학생 생일을 확인합니다">
      <section className="panel col g16">
        <div className="row between wrap g12">
          <div className="row g8 bd-nav">
            <Button variant="outline" size="s" aria-label="이전 달" onClick={() => move(-1)}><Icon name="left" size={14} /></Button>
            <strong className="t-xl b num" style={{ minWidth: 112, textAlign: "center" }}>{ym.y}년 {ym.m}월</strong>
            <Button variant="outline" size="s" aria-label="다음 달" onClick={() => move(1)}><Icon name="right" size={14} /></Button>
            {!isNow && <Button variant="outline" size="s" onClick={() => setYm({ y: +today.slice(0, 4), m: +today.slice(5, 7) })}>이번 달</Button>}
          </div>
          <Seg value={group} options={[["0", "전체"], ["1", "1부"], ["2", "2부"]] as const} onChange={setGroup} />
        </div>
        <p className="muted">
          {ym.m}월 생일 <strong className="sb" style={{ color: "var(--text)" }}>{total}명</strong>
          {missing > 0 && <> · 생년월일 미입력 {missing}명 <Link to="/admin/students" className="c-primary sb">학생 관리에서 입력</Link></>}
        </p>
      </section>

      {days.length === 0 ? (
        <section className="panel"><p className="empty">{ym.m}월에 생일인 학생이 없습니다.</p></section>
      ) : (
        days.map(([day, list]) => {
          const md = `${mm}-${String(day).padStart(2, "0")}`;
          const wd = WEEK[new Date(Date.UTC(ym.y, ym.m - 1, day)).getUTCDay()];
          return (
            <section key={day} className="panel col g12">
              <div className="row g8">
                <h2 className="t-base b">{ym.m}월 {day}일 ({wd})</h2>
                {isNow && today.slice(5) === md ? <Badge tone="error">오늘</Badge> : week.has(md) && ym.y === +today.slice(0, 4) ? <Badge tone="info">이번 주</Badge> : null}
                <span className="muted t-sm">{list.length}명</span>
              </div>
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>학생</th><th>반</th><th>담임교사</th><th>생년월일</th><th /></tr></thead>
                  <tbody>
                    {list.map((s) => {
                      const c = classOf(d, s);
                      return (
                        <tr key={s.id}>
                          <td><span className="row g8"><PhotoAvatar name={s.name} photo={s.photo} size={36} /><strong className="sb">{s.name}</strong>{s.status === "장결자" && <Badge tone="warning">장결자</Badge>}</span></td>
                          <td>{c ? classLabel(c) : "미배정"}</td>
                          <td>{c ? homeroomName(d, c.id) : "-"}</td>
                          <td className="num">{fmtBirth(s.birthDate)}</td>
                          <td><Button variant="outline" size="s" onClick={() => setDetail(s)}>상세</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      {detail && <StudentDetailModal student={detail} onClose={() => setDetail(null)} />}
    </Page>
  );
}
