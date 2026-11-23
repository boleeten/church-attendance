import { useState } from "react";
import { fmtStamp } from "../lib/date";
import { authorLabel, isPastor, threadOf } from "../lib/notes";
import { toast } from "../lib/remote";
import { addNoteComment, canTalkOnNote, editNoteComment, useData, useMe } from "../lib/store";
import type { Note } from "../lib/types";
import { Button, Icon } from ".";

/**
 * 심방노트 아래 대화. 목사님 글은 왼쪽 파란 말풍선, 내 글은 오른쪽 회색 말풍선, 다른 교사 글은 왼쪽 회색.
 * compose 를 주면 맨 아래에 답글 입력칸이 붙는다 (교사 앱).
 */
export function NoteThread({ note, compose }: { note: Note; compose?: boolean }) {
  const d = useData();
  const me = useMe();
  const list = threadOf(d, note);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = !!me && canTalkOnNote(note.id, me.id);
  const send = () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    const err = addNoteComment(note.id, text);
    setBusy(false);
    if (err) return toast(err, "error");
    setText("");
    toast(me && isPastor(d, me.id) ? "답변을 보냈습니다." : "답글을 남겼습니다. 목사님께 알림이 갑니다.");
  };
  const saveEdit = (id: string, value: string | null) => {
    if (value === null && !window.confirm("이 글을 삭제할까요? 상대방 화면에서도 사라집니다.")) return;
    const err = editNoteComment(id, value);
    if (err) return toast(err, "error");
    setEditId(null);
    toast(value === null ? "삭제했습니다." : "수정했습니다.");
  };
  if (!list.length && !(compose && canWrite)) return null;
  return (
    <div className="thread">
      {list.map((c) => {
        const pastor = isPastor(d, c.authorId);
        const mine = c.authorId === me?.id;
        return (
          <div key={c.id} className={`bubble ${pastor ? "pastor" : mine ? "mine" : "other"}`}>
            <div className="row g6 bubble-head">
              {pastor && <Icon name="note" size={14} />}
              <strong className="sb grow ellipsis">{authorLabel(d, c.authorId)}{mine && !pastor ? " (나)" : ""}</strong>
              <span className="t-xs muted num">{fmtStamp(c.createdAt)}{c.updatedAt ? " · 수정됨" : ""}</span>
            </div>
            {editId === c.id ? (
              <div className="col g6">
                <textarea className="area s" value={editText} maxLength={1000} onChange={(e) => setEditText(e.target.value)} aria-label="글 수정" autoFocus />
                <div className="row g6" style={{ justifyContent: "flex-end" }}>
                  <Button variant="outline" size="s" onClick={() => setEditId(null)}>취소</Button>
                  <Button size="s" disabled={!editText.trim()} onClick={() => saveEdit(c.id, editText)}>저장</Button>
                </div>
              </div>
            ) : (
              <p className="bubble-text">{c.body}</p>
            )}
            {mine && editId !== c.id && (
              <div className="row g10 bubble-tools">
                <button type="button" onClick={() => { setEditId(c.id); setEditText(c.body); }}>수정</button>
                <button type="button" onClick={() => saveEdit(c.id, null)}>삭제</button>
              </div>
            )}
          </div>
        );
      })}
      {compose && canWrite && (
        <form className="thread-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            className="area s"
            rows={1}
            placeholder={list.length ? "답글 입력…" : "목사님께 남길 말이 있으면 적어 주세요"}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            aria-label="답글 입력"
          />
          <Button type="submit" size="s" disabled={busy || !text.trim()}>보내기</Button>
        </form>
      )}
    </div>
  );
}
