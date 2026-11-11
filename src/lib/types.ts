export type Role = "teacher" | "head" | "admin" | "super" | "owner";
export type Mark = "P" | "A"; // 출석 / 결석 (값이 없으면 미확인)
export type StudentStatus = "등록" | "장결자" | "교회이동";
export type AssignKind = "담임" | "보조";

export interface User {
  id: string;
  loginId: string;
  name: string;
  password: string; // 데모 모드 전용. Supabase 모드에서는 사용하지 않는다.
  roles: Role[];
  group: 1 | 2 | null;
  title?: string; // 목사님, 행정팀장 등
  active: boolean;
  mustChangePassword: boolean;
  pushAllowed: boolean;
  adminScope?: string;
}

export interface ClassRoom {
  id: string;
  group: 1 | 2;
  grade: number;
  no: number;
  capacity: number;
}

export interface Assignment {
  userId: string;
  classId: string;
  kind: AssignKind;
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  status: StudentStatus;
  phone: string;
  guardianPhone: string;
  guardianRel: string;
  photo?: string;
}

export interface SessionState {
  completed: boolean;
  savedAt: string; // ISO
  savedBy: string;
}

export interface Note {
  id: string;
  studentId: string;
  date: string; // 주일
  reason: string | null;
  content: string;
  authorId: string;
  createdAt: string;
  /** 최고 관리자의 심방 답변 */
  reply?: string | null;
  replyBy?: string | null;
  replyAt?: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: "student" | "teacher" | "reply";
  title: string;
  body: string;
  date: string; // 대상 주일
  createdAt: string;
  read: boolean;
  /** 누르면 이동할 화면. 없으면 해당 주일 출석체크 화면 */
  link?: string | null;
}

export interface NotifLog {
  id: string;
  at: string;
  mode: "자동" | "수동";
  userId: string;
  target: string;
  result: "성공" | "실패" | "권한 미허용";
}

export interface AuditLog {
  id: string;
  at: string;
  actorId: string;
  type: string;
  target: string;
  before: string;
  after: string;
}

export interface Settings {
  year: number;
  studentNotifyTime: string;
  studentNotifyOn: boolean;
  teacherNotifyTime: string;
  teacherNotifyOn: boolean;
  sheetLastSuccess: string | null;
  sheetLastFail: string | null;
  sheetSyncCount: number;
  sheetFailCount: number;
  /** 동기화할 구글 시트 파일 ID (교사 공유용 출석대장 / 관리자 전용) */
  sheetSharedId?: string | null;
  sheetPrivateId?: string | null;
  /** 계정 삭제 권한을 받은 사용자 ID (계정 총괄은 항상 가능) */
  accountDeleters?: string[];
  lastBackup: string | null;
}

export interface Data {
  version: number;
  users: User[];
  classes: ClassRoom[];
  assignments: Assignment[];
  students: Student[];
  /** key: `${date}|${studentId}` */
  studentMarks: Record<string, Mark>;
  /** key: `${date}|${userId}` */
  teacherMarks: Record<string, Mark>;
  /** key: `${date}|class:${classId}` 또는 `${date}|group:${1|2}` */
  sessions: Record<string, SessionState>;
  notes: Note[];
  notifications: AppNotification[];
  notifLogs: NotifLog[];
  audits: AuditLog[];
  settings: Settings;
}

export const REASONS = ["질병", "가족 행사·여행", "늦잠", "연락 안 됨", "기타"] as const;
