// 이 배포의 부서. 화면 코드는 여기서만 부서 정보를 가져온다.
import { classLongLabel, classShortLabel, getDept, gradeLabel } from "./departments.js";

export const DEPT = getDept(import.meta.env.VITE_DEPT);

/** "주님의교회 초등부" */
export const DEPT_TITLE = `${DEPT.church} ${DEPT.name}`;
/** 학년 숫자 목록 (예: [4, 5, 6]) */
export const GRADES = DEPT.grades.map((g) => g.value);
/** 졸업 학년 (마지막 학년) */
export const LAST_GRADE = GRADES[GRADES.length - 1];
/** 진급 대상 학년 (마지막 학년 제외) */
export const LOWER_GRADES = GRADES.slice(0, -1);
/** 운영하는 부 */
export const GROUPS = DEPT.groups;
/** "1부·2부" */
export const GROUPS_TEXT = GROUPS.map((g) => `${g}부`).join("·");

export const gradeName = (grade: number) => gradeLabel(DEPT, grade);
/** 여러 학년을 "4·5학년" / "중1·중2" 처럼 묶어 쓴다 */
export const gradesText = (list: number[]) => {
  const labels = list.map(gradeName);
  const unit = labels.every((l) => l.endsWith("학년")) ? "학년" : "";
  return unit ? labels.map((l) => l.slice(0, -unit.length)).join("·") + unit : labels.join("·");
};
export const classShort = (grade: number, no: number) => classShortLabel(DEPT, grade, no);
export const classLong = (grade: number, no: number) => classLongLabel(DEPT, grade, no);
/** 학년 칸 표기 (엑셀 등): "4", "중1" */
export const gradeShortName = (grade: number) => DEPT.grades.find((g) => g.value === grade)?.short ?? String(grade);

/** 학년 글자를 숫자로: "4", "4학년", "중1" → 저장 값. 모르면 null */
export function parseGrade(text: string | undefined): number | null {
  const t = (text ?? "").replace(/\s/g, "");
  if (!t) return null;
  const hit = DEPT.grades.find((g) => g.label.replace(/\s/g, "") === t || g.short === t);
  if (hit) return hit.value;
  const n = Number(t.replace(/학년$/, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 반 글자를 학년·반으로: "4-1반", "4학년 1반", "중1-2반" */
export function parseClassText(text: string | undefined): { grade: number; no: number } | null {
  const t = (text ?? "").trim();
  const m = t.match(/^(.+?)\s*-\s*(\d+)\s*반?$/) ?? t.match(/^(.+?)\s+(\d+)\s*반$/);
  if (!m) return null;
  const grade = parseGrade(m[1]);
  return grade ? { grade, no: Number(m[2]) } : null;
}
