// 심방노트 대화: 목사님(최고 관리자) 답변과 교사 답글이 시간순으로 이어진다.
import type { Data, Note, NoteComment } from "./types";

/** '확인' 버튼으로 보내는 기본 답변 */
export const CONFIRM_REPLY = "심방내용 확인했습니다";

export type ThreadItem = NoteComment & { legacy?: boolean };

/**
 * 노트 하나의 대화. 예전 방식으로 저장된 답변(visit_notes.reply)이 남아 있으면 맨 앞에 넣는다.
 * (SQL을 실행하면 예전 답변은 대화의 첫 글 'r-노트ID'로 옮겨지고 원래 칸은 비워진다)
 */
export function threadOf(d: Data, note: Note): ThreadItem[] {
  const list: ThreadItem[] = (d.comments ?? []).filter((c) => c.noteId === note.id);
  if (note.reply && !list.some((c) => c.id === `r-${note.id}`)) {
    list.unshift({ id: `r-${note.id}`, noteId: note.id, authorId: note.replyBy ?? "", body: note.reply, createdAt: note.replyAt ?? note.createdAt, legacy: true });
  }
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const isPastor = (d: Data, userId: string) => !!d.users.find((u) => u.id === userId)?.roles.includes("super");

/**
 * 관리자 목록의 답변 상태
 * - wait: 목사님 글이 아직 없음 · new: 교사가 마지막에 답글을 남김(목사님 차례) · done: 목사님이 마지막에 남김
 */
export function noteStatus(d: Data, note: Note): "wait" | "new" | "done" {
  const t = threadOf(d, note);
  if (!t.some((c) => isPastor(d, c.authorId))) return "wait";
  return isPastor(d, t[t.length - 1].authorId) ? "done" : "new";
}

/** 마지막 글이 목사님의 '확인' 답변인지 */
export function lastIsConfirm(d: Data, note: Note): boolean {
  const t = threadOf(d, note);
  const last = t[t.length - 1];
  return !!last && isPastor(d, last.authorId) && last.body === CONFIRM_REPLY;
}

export const authorLabel = (d: Data, userId: string) => {
  const u = d.users.find((x) => x.id === userId);
  if (!u) return "관리자";
  return u.roles.includes("super") ? `${u.title ?? "목사님"} ${u.name}`.trim() : `${u.name} 선생님`;
};

/** 엑셀·구글 시트용: "목사님 한요한: … / 김은혜 선생님: …" */
export function threadText(d: Data, note: Note): string {
  return threadOf(d, note).map((c) => `${authorLabel(d, c.authorId)}: ${c.body.replace(/\s+/g, " ")}`).join(" / ");
}

/** 엑셀·구글 시트용: 마지막 목사님 답변의 작성자와 시각 */
export function lastPastorReply(d: Data, note: Note): ThreadItem | undefined {
  return [...threadOf(d, note)].reverse().find((c) => isPastor(d, c.authorId));
}
