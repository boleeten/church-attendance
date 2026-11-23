export interface GradeDef {
  value: number;
  label: string;
  short: string;
}

export interface Department {
  church: string;
  name: string;
  appShort: string;
  groups: (1 | 2)[];
  grades: GradeDef[];
}

export const DEPARTMENTS: Record<string, Department>;
export function getDept(key: string | undefined): Department;
export function gradeLabel(dept: Department, grade: number): string;
export function classShortLabel(dept: Department, grade: number, no: number): string;
export function classLongLabel(dept: Department, grade: number, no: number): string;
