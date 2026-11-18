// 데모 모드용 예시 데이터. 실제 인물이 아닌 가상의 이름·연락처다.
import { addWeeks, currentSunday, sundaysOfYear, ym } from "./date";
import type { Assignment, ClassRoom, Data, Mark, Role, Student, User } from "./types";

export const DEMO_PASSWORD = "demo1234";
export const TEMP_PASSWORD = "temp1234";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUR = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍", "남궁", "도", "민", "변"];
const GIV = ["하준", "서연", "지호", "하은", "채원", "수아", "시우", "민준", "예린", "도윤", "서준", "지아", "주원", "하린", "은우", "소율", "건우", "다은", "유준", "서윤", "예준", "지유", "선우", "나은", "현우", "아린", "준서", "시아", "지안", "유나", "우진", "솔", "서율", "태윤", "가은", "로운", "채아", "이안", "하율", "연우"];

const at = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString();

export function buildSeed(): Data {
  const r = rng(20261115);
  const cur = currentSunday();
  const year = ym(cur).y;
  const sundays = sundaysOfYear(year, cur);

  // ── 반 ──
  const sizes: Record<string, number[]> = {
    "1": [10, 8, 7, 7, 8, 6, 7, 7, 7, 9, 5, 5],
    "2": [7, 8, 7, 7, 7, 6, 6, 7, 7],
  };
  const classes: ClassRoom[] = [];
  for (const g of [1, 2] as const)
    for (const grade of [4, 5, 6])
      for (let no = 1; no <= (g === 1 ? 4 : 3); no++) classes.push({ id: `g${g}-${grade}-${no}`, group: g, grade, no, capacity: 10 });
  // 새친구반 (학년 0): 기존 반 순서를 흐트리지 않도록 뒤에 붙인다
  for (const g of [1, 2] as const) classes.push({ id: `g${g}-new`, group: g, grade: 0, no: 1, capacity: 10 });

  // ── 사용자 ──
  const users: User[] = [];
  const assignments: Assignment[] = [];
  const mkUser = (loginId: string, name: string, roles: Role[], group: 1 | 2 | null, extra: Partial<User> = {}): User => {
    const u: User = { id: `u_${loginId}`, loginId, name, password: DEMO_PASSWORD, roles, group, active: true, mustChangePassword: false, pushAllowed: true, ...extra };
    users.push(u);
    return u;
  };
  mkUser("pastor_han", "한요한", ["owner", "super"], null, { title: "목사님" });
  mkUser("head_park01", "박성민", ["head", "super"], 1, { title: "1부 부장교사" });
  mkUser("head_seo02", "서지원", ["head", "super"], 2, { title: "2부 부장교사" });
  mkUser("admin_lee01", "이행정", ["super"], null, { title: "행정팀장 A" });
  mkUser("admin_cho02", "조행정", ["super"], null, { title: "행정팀장 B" });

  const g1Homeroom = ["김은혜", "이정훈", "박소영", "최민수", "정다은", "한지우", "윤서준", "임수빈", "오세훈", "강유진", "서민재", "조하늘"];
  const g2Homeroom = ["천소희", "장미래", "류성훈", "민지아", "권도현", "송예진", "노경민", "안소율", "배준서"];
  const known: Record<string, string> = { 김은혜: "teacher_kim01", 최민수: "teacher_choi03", 강유진: "teacher_kang07", 장미래: "teacher_jang11", 송예진: "teacher_song14" };
  let seq = 20;
  const idOf = (name: string) => known[name] ?? `teacher_${String(seq++).padStart(2, "0")}`;
  const byGroup = (g: 1 | 2) => classes.filter((c) => c.group === g);
  g1Homeroom.forEach((name, i) => {
    const u = mkUser(idOf(name), name, ["teacher"], 1);
    assignments.push({ userId: u.id, classId: byGroup(1)[i].id, kind: "담임" });
  });
  g2Homeroom.forEach((name, i) => {
    const roles: Role[] = name === "송예진" ? ["teacher", "admin"] : ["teacher"];
    const u = mkUser(idOf(name), name, roles, 2, name === "노경민" ? { pushAllowed: false } : name === "송예진" ? { adminScope: "학생·교사 데이터, 출결 운영" } : {});
    assignments.push({ userId: u.id, classId: byGroup(2)[i].id, kind: "담임" });
  });
  const moon = mkUser("teacher_moon02", "문지영", ["teacher"], 1);
  // 같은 부에서는 한 반만, 다른 부의 반은 하나 더 맡을 수 있다 (1부 4-1반 · 2부 5-2반 보조)
  assignments.push({ userId: moon.id, classId: "g1-4-1", kind: "보조" }, { userId: moon.id, classId: "g2-5-2", kind: "보조" });
  const baek = mkUser("teacher_baek16", "백승호", ["teacher"], 1, { pushAllowed: false });
  assignments.push({ userId: baek.id, classId: "g1-6-2", kind: "보조" });
  const hwang = mkUser("teacher_hwang17", "황보람", ["teacher"], 2);
  assignments.push({ userId: hwang.id, classId: "g2-4-1", kind: "보조" });
  const woo = mkUser("teacher_woo18", "우다인", ["teacher"], 2);
  assignments.push({ userId: woo.id, classId: "g2-5-1", kind: "보조" });
  assignments.push({ userId: mkUser("teacher_new21", "나새롬", ["teacher"], 1).id, classId: "g1-new", kind: "담임" });
  assignments.push({ userId: mkUser("teacher_new22", "반가람", ["teacher"], 2).id, classId: "g2-new", kind: "담임" });
  mkUser("teacher_hong19", "홍기태", ["teacher", "admin"], 2, {
    password: TEMP_PASSWORD,
    mustChangePassword: true,
    pushAllowed: false,
    adminScope: "학생 데이터 조회",
  });

  // ── 학생 ──
  const students: Student[] = [];
  const firstClass = ["강하준", "김서연", "박지호", "오하은", "윤채원", "이수아", "임시우", "정민준", "최예린", "한도윤"];
  const used = new Set(firstClass);
  let sid = 1;
  const phone = (p: string) => `010-${p}-${String(1000 + Math.floor(r() * 9000))}`;
  for (const c of classes) {
    const n = c.grade === 0 ? 4 : sizes[String(c.group)][byGroup(c.group).indexOf(c)];
    for (let i = 0; i < n; i++) {
      let name: string;
      if (c.id === "g1-4-1") name = firstClass[i];
      else {
        do name = SUR[Math.floor(r() * SUR.length)] + GIV[Math.floor(r() * GIV.length)];
        while (used.has(name));
        used.add(name);
      }
      students.push({
        id: `s${sid++}`,
        name,
        gender: sid % 2 ? "남" : "여",
        birthDate: r() < 0.1 ? null : `${+cur.slice(0, 4) - 6 - (c.grade || 5)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`,
        classId: c.id,
        status: c.grade === 0 ? "새친구" : "등록",
        phone: r() < 0.15 ? "" : phone("2345"),
        guardianPhone: phone("9876"),
        guardianRel: r() < 0.7 ? "모" : "부",
      });
    }
  }
  const find = (name: string) => students.find((s) => s.name === name)!;
  // 상태 예시: 장결자 2명, 교회이동 1명 (출석 명단에서는 빠진다)
  students.filter((s) => s.classId === "g1-6-1").slice(-1).forEach((s) => (s.status = "장결자"));
  students.filter((s) => s.classId === "g2-5-2").slice(-1).forEach((s) => (s.status = "장결자"));
  students.filter((s) => s.classId === "g2-6-3").slice(-1).forEach((s) => (s.status = "교회이동"));
  find("박지호").phone = "010-2345-6789";
  find("박지호").guardianPhone = "010-9876-5432";
  find("박지호").guardianRel = "모";

  // ── 출석 기록 ──
  const studentMarks: Record<string, Mark> = {};
  const teacherMarks: Record<string, Mark> = {};
  const sessions: Data["sessions"] = {};
  const rate = new Map(students.map((s) => [s.id, 0.8 + r() * 0.18]));
  const teachers = users.filter((u) => u.roles.includes("teacher") && u.active);
  const homeroomOf = (classId: string) => assignments.find((a) => a.classId === classId && a.kind === "담임")!.userId;
  const lastThree = sundays.slice(-3);
  const prevTwo = sundays.slice(-3, -1);

  for (const date of sundays) {
    const isCur = date === cur;
    for (const c of classes) {
      const roster = students.filter((s) => s.classId === c.id);
      // 이번 주일의 진행 상황: 일부 반은 미완료
      let mode: "done" | "partial" | "none" = "done";
      if (isCur) {
        if (["g1-4-1", "g1-5-3", "g2-6-1"].includes(c.id)) mode = "partial";
        else if (["g1-6-2", "g2-4-2"].includes(c.id)) mode = "none";
      }
      if (mode === "none") continue;
      roster.forEach((s, i) => {
        // 미완료 반은 3명을 미확인으로 남긴다
        if (mode === "partial" && (c.id === "g1-4-1" ? ["윤채원", "임시우", "한도윤"].includes(s.name) : i >= roster.length - 3)) return;
        let m: Mark = r() < rate.get(s.id)! ? "P" : "A";
        if (c.id === "g1-4-1" && isCur) m = "P";
        if (s.name === "박지호" && lastThree.includes(date)) m = "A";
        if (s.name === "임시우" && prevTwo.includes(date)) m = "A";
        // 새친구반: 앞의 두 명은 최근 3주 연속 출석(반 배정 대상), 나머지는 최근 결석 섞음
        if (c.grade === 0) { const k = roster.indexOf(s); m = k < 2 ? (lastThree.includes(date) ? "P" : m) : lastThree.indexOf(date) === 1 ? "A" : m; }
        studentMarks[`${date}|${s.id}`] = m;
      });
      sessions[`${date}|class:${c.id}`] = { completed: mode === "done", savedAt: at(date, mode === "done" ? "12:2" + (c.no % 10) : "12:48"), savedBy: homeroomOf(c.id) };
    }
    for (const g of [1, 2] as const) {
      if (isCur && g === 2) continue; // 2부 교사 출석은 아직 입력 전
      const list = teachers.filter((t) => t.group === g);
      list.forEach((t, i) => {
        if (isCur && i >= list.length - 4) return;
        teacherMarks[`${date}|${t.id}`] = isCur && t.name === "최민수" ? "A" : r() < 0.95 ? "P" : "A";
      });
      const head = users.find((u) => u.roles.includes("head") && u.group === g)!;
      teacherMarks[`${date}|${head.id}`] = "P";
      sessions[`${date}|group:${g}`] = { completed: !isCur, savedAt: at(date, "12:30"), savedBy: head.id };
    }
  }

  // ── 심방노트 ──
  const kim = users.find((u) => u.name === "김은혜")!;
  const notes: Data["notes"] = [
    { id: "n1", studentId: find("박지호").id, date: cur, reason: "질병", content: "감기로 결석. 어머니와 통화했고 다음 주 출석 예정.", authorId: kim.id, createdAt: at(cur, "12:40") },
    { id: "n2", studentId: find("박지호").id, date: addWeeks(cur, -1), reason: "가족 행사·여행", content: "할머니 댁 방문으로 결석. 문자로 안부 전함.", authorId: kim.id, createdAt: at(addWeeks(cur, -1), "13:05") },
    { id: "n3", studentId: find("임시우").id, date: addWeeks(cur, -2), reason: "질병", content: "독감으로 일주일 결석 예정.", authorId: kim.id, createdAt: at(addWeeks(cur, -2), "12:44") },
    { id: "n4", studentId: find("강하준").id, date: addWeeks(cur, -1), reason: null, content: "요즘 예배 태도가 좋아짐. 다음 달 찬양팀 권유해 보기로 함.", authorId: kim.id, createdAt: at(addWeeks(cur, -1), "13:20") },
  ];
  const jang = users.find((u) => u.name === "장미래")!;
  const jangStudent = students.find((s) => s.classId === "g2-4-2")!;
  notes.push({ id: "n5", studentId: jangStudent.id, date: addWeeks(cur, -1), reason: "늦잠", content: "늦잠으로 결석. 다음 주 함께 오기로 약속.", authorId: jang.id, createdAt: at(addWeeks(cur, -1), "12:52") });

  // 최고 관리자의 심방 답변 예시
  const pastor = users.find((u) => u.roles.includes("owner"))!;
  Object.assign(notes[1], { reply: "할머니 댁 다녀온 이야기 꼭 들어 주세요. 다음 주에 반갑게 맞아 주시면 좋겠습니다. 가정을 위해 함께 기도하겠습니다.", replyBy: pastor.id, replyAt: at(addWeeks(cur, -1), "18:10") });
  Object.assign(notes[0], { reply: "빨리 낫도록 기도하겠습니다. 다음 주에도 못 나오면 제게 알려 주세요. 함께 심방 가겠습니다.", replyBy: pastor.id, replyAt: at(cur, "16:20") });

  // ── 알림 ──
  const body = "1부 4학년 1반의 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.";
  const park = users.find((u) => u.loginId === "head_park01")!;
  const notifications: Data["notifications"] = [
    { id: "nt0", userId: kim.id, kind: "reply", title: "심방노트에 답변이 왔습니다", body: `[박지호] ${pastor.title ?? pastor.name}: 빨리 낫도록 기도하겠습니다. 다음 주에도 못 나오면 제게 알려 주세요. 함께 심방 가…`, date: cur, createdAt: at(cur, "16:20"), read: false, link: `/t/students/${find("박지호").id}#note-n1` },
    { id: "nt1", userId: kim.id, kind: "student", title: "주일 출석체크 안내", body, date: cur, createdAt: at(cur, "15:00"), read: false },
    { id: "nt2", userId: kim.id, kind: "student", title: "주일 출석체크 안내", body, date: addWeeks(cur, -4), createdAt: at(addWeeks(cur, -4), "15:00"), read: true },
    { id: "nt3", userId: park.id, kind: "teacher", title: "교사 출석체크 안내", body: "1부 교사 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.", date: cur, createdAt: at(cur, "15:30"), read: false },
  ];
  const yoon = users.find((u) => u.name === "윤서준")!;
  const kang = users.find((u) => u.name === "강유진")!;
  const noh = users.find((u) => u.name === "노경민")!;
  const notifLogs: Data["notifLogs"] = [
    { id: "l1", at: at(cur, "15:00"), mode: "자동", userId: kim.id, target: "1부 4학년 1반", result: "성공" },
    { id: "l2", at: at(cur, "15:00"), mode: "자동", userId: yoon.id, target: "1부 5학년 3반", result: "성공" },
    { id: "l3", at: at(cur, "15:00"), mode: "자동", userId: kang.id, target: "1부 6학년 2반", result: "성공" },
    { id: "l4", at: at(cur, "15:00"), mode: "자동", userId: jang.id, target: "2부 4학년 2반", result: "실패" },
    { id: "l5", at: at(cur, "15:00"), mode: "자동", userId: noh.id, target: "2부 6학년 1반", result: "권한 미허용" },
  ];
  const audits: Data["audits"] = [
    { id: "a1", at: at(cur, "12:52"), actorId: kim.id, type: "학생 출석", target: `박지호 · ${ym(cur).m}/${ym(cur).d} 출석부`, before: "미확인", after: "결석" },
    { id: "a2", at: at(addWeeks(cur, -1), "18:20"), actorId: "u_admin_lee01", type: "교사 배정", target: "문지영", before: "4학년 1반 보조", after: "1부 4-1반 · 2부 5-2반 보조" },
    { id: "a3", at: at(addWeeks(cur, -1), "09:31"), actorId: "u_admin_lee01", type: "비밀번호 초기화", target: "teacher_hong19", before: "-", after: "임시 비밀번호 발급" },
  ];

  // ── 교사별 메세지 ──
  const poster = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#e8f0ff"/><circle cx="660" cy="110" r="70" fill="#ffd36b"/><path d="M0 380 Q200 300 400 370 T800 350 V500 H0z" fill="#9fc3ff"/><path d="M0 430 Q220 380 420 430 T800 420 V500 H0z" fill="#5b8def"/><text x="60" y="150" font-family="sans-serif" font-size="54" font-weight="700" fill="#1f3b7a">겨울 성경학교</text><text x="60" y="215" font-family="sans-serif" font-size="30" fill="#33508f">12월 27일(주일) 오후 2시</text></svg>');
  const g1Teachers = users.filter((u) => u.group === 1 && u.roles.includes("teacher"));
  const messages: NonNullable<Data["messages"]> = [
    { id: "msg3", title: "겨울 성경학교 준비 미션", body: "선생님, 이번 겨울 성경학교에서 반별 율동을 맡아 주세요.\n\n· 12월 첫 주까지 율동 영상 확인\n· 반 아이들과 2주 동안 연습\n· 성경학교 당일 반별 발표 (3분 이내)\n\n준비하면서 궁금한 점은 언제든 말씀해 주세요.", images: [poster], links: [{ url: "https://www.youtube.com/", label: "율동 영상 보기" }], senderId: pastor.id, createdAt: at(cur, "17:10") },
    { id: "msg2", title: "새친구 환영 카드 부탁드립니다", body: "이번 주 새친구로 온 아이에게 손글씨 환영 카드를 써 주세요. 카드는 교육부실 책상 위에 있습니다.", images: [], links: [], senderId: "u_admin_lee01", createdAt: at(addWeeks(cur, -1), "14:30") },
    { id: "msg1", title: "11월 교사 기도제목", body: "이번 달에는 반 아이들 한 명 한 명의 이름을 불러 가며 기도해 주세요. 다음 교사 모임 때 나눔 시간이 있습니다.", images: [], links: [], senderId: pastor.id, createdAt: at(addWeeks(cur, -3), "19:00") },
  ];
  const receipts: NonNullable<Data["receipts"]> = [
    ...g1Teachers.map((u, i) => ({ messageId: "msg3", userId: u.id, readAt: u.id === kim.id || i % 3 ? null : at(cur, "18:05") })),
    { messageId: "msg3", userId: park.id, readAt: null },
    { messageId: "msg2", userId: kim.id, readAt: at(addWeeks(cur, -1), "15:02") },
    { messageId: "msg1", userId: kim.id, readAt: at(addWeeks(cur, -3), "20:11") },
    { messageId: "msg1", userId: jang.id, readAt: null },
  ];

  return {
    version: 1,
    users,
    classes,
    assignments,
    students,
    studentMarks,
    teacherMarks,
    sessions,
    notes,
    notifications,
    notifLogs,
    audits,
    messages,
    receipts,
    settings: {
      year,
      studentNotifyTime: "15:00",
      studentNotifyOn: true,
      teacherNotifyTime: "15:30",
      teacherNotifyOn: false,
      sheetLastSuccess: null,
      sheetLastFail: null,
      sheetSyncCount: 0,
      sheetFailCount: 0,
      lastBackup: null,
    },
  };
}
