// 부서별 설정. 같은 코드를 부서마다 따로 배포하고, 환경 변수 VITE_DEPT 로 어느 부서인지 정한다.
// (예: VITE_DEPT=youth → 청소년부. 값이 없거나 모르는 값이면 초등부)
// 앱(브라우저)과 서버 함수(api/*.js)가 함께 쓰므로 일반 JS 로 둔다. 타입은 departments.d.ts.
//
// grades.value : DB 에 저장되는 학년 숫자. 0 은 새친구반 전용이라 쓰지 않는다.
// grades.label : 화면에 보이는 이름 (예: "4학년", "중1")
// grades.short : 반 줄임 표기 앞부분 (예: "4" → "4-1반", "중1" → "중1-1반")
// groups       : 운영하는 부 (1부·2부). 한 부만 있으면 [1]
//
// ⚠️ 초등부 외 부서의 학년 구성은 초안이다. 실제 반 구성이 정해지면 고친다.

const range = (from, to, label, short) => Array.from({ length: to - from + 1 }, (_, i) => ({ value: from + i, label: label(i), short: short(i) }));

export const DEPARTMENTS = {
  elementary: {
    church: "주님의교회",
    name: "초등부",
    appShort: "초등부출첵",
    groups: [1, 2],
    grades: range(4, 6, (i) => `${4 + i}학년`, (i) => `${4 + i}`),
  },
  kids: {
    church: "주님의교회",
    name: "유년부",
    appShort: "유년부출첵",
    groups: [1, 2],
    grades: range(1, 3, (i) => `${1 + i}학년`, (i) => `${1 + i}`),
  },
  infant: {
    church: "주님의교회",
    name: "영아부",
    appShort: "영아부출첵",
    groups: [1, 2],
    // 0세~3세. 0 은 새친구반이라 저장 값은 1부터 시작한다.
    grades: range(1, 4, (i) => `${i}세`, (i) => `${i}세`),
  },
  youth: {
    church: "주님의교회",
    name: "청소년부",
    appShort: "청소년부출첵",
    groups: [1, 2],
    grades: range(7, 12, (i) => (i < 3 ? `중${i + 1}` : `고${i - 2}`), (i) => (i < 3 ? `중${i + 1}` : `고${i - 2}`)),
  },
};

export function getDept(key) {
  return DEPARTMENTS[key] ?? DEPARTMENTS.elementary;
}

/** 학년 이름. 0 이면 새친구반, 설정에 없는 숫자면 "N학년" */
export function gradeLabel(dept, grade) {
  if (!grade) return "새친구반";
  return dept.grades.find((g) => g.value === grade)?.label ?? `${grade}학년`;
}

/** 반 줄임 표기: "4-1반", "중1-1반" */
export function classShortLabel(dept, grade, no) {
  if (!grade) return "새친구반";
  const g = dept.grades.find((x) => x.value === grade);
  return `${g ? g.short : grade}-${no}반`;
}

/** 반 전체 표기: "4학년 1반", "중1 1반" */
export function classLongLabel(dept, grade, no) {
  if (!grade) return "새친구반";
  return `${gradeLabel(dept, grade)} ${no}반`;
}
