import { useMemo, useRef, useState } from "react";
import { fmtDateTimeKo, fmtStamp } from "../lib/date";
import { fitImage, kb } from "../lib/image";
import { normalizeUrl, receiptsOf } from "../lib/messages";
import { toast } from "../lib/remote";
import { teacherDuty } from "../lib/stats";
import { deleteMessage, MSG_MAX_IMAGES, MSG_MAX_LINKS, sendMessage, useData } from "../lib/store";
import type { Data, MessageLink, TeacherMessage, User } from "../lib/types";
import { Avatar, Badge, Button, Icon, Modal, Note } from "../ui";
import { MessageBody } from "../ui/MessageBody";
import { Page } from "./AdminApp";
import { SelectBox } from "./Manage";

const msgTeachers = (d: Data): User[] =>
  d.users
    .filter((u) => (u.roles.includes("teacher") || u.roles.includes("head")) && u.active && u.group !== null)
    .sort((a, b) => (a.group ?? 9) - (b.group ?? 9) || Number(b.roles.includes("head")) - Number(a.roles.includes("head")) || a.name.localeCompare(b.name, "ko"));

const userName = (d: Data, id: string | null) => (id && d.users.find((u) => u.id === id)?.name) || "관리자";
const unreadCount = (d: Data, userId: string) => (d.receipts ?? []).filter((r) => r.userId === userId && !r.readAt).length;

type Pic = { id: string; blob: Blob; url: string };

function ComposeModal({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const d = useData();
  const teachers = useMemo(() => msgTeachers(d), [d]);
  const [to, setTo] = useState<string[]>(initial);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pics, setPics] = useState<Pic[]>([]);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const add = (ids: string[]) => setTo((x) => [...new Set([...x, ...ids])]);
  const addPics = async (files: File[]) => {
    const room = MSG_MAX_IMAGES - pics.length;
    if (files.length > room) toast(`사진은 ${MSG_MAX_IMAGES}장까지 보낼 수 있어 ${room}장만 추가했습니다.`, "error");
    for (const f of files.slice(0, Math.max(0, room))) {
      const r = await fitImage(f);
      if (typeof r === "string") toast(r, "error");
      else setPics((x) => [...x, { id: Math.random().toString(36).slice(2), blob: r, url: URL.createObjectURL(r) }]);
    }
  };
  const send = async () => {
    const clean: MessageLink[] = [];
    for (const l of links) {
      if (!l.url.trim() && !l.label.trim()) continue;
      const u = normalizeUrl(l.url);
      if (!u) return toast(`링크 주소가 올바르지 않습니다: ${l.url || "(빈 주소)"}`, "error");
      clean.push(l.label.trim() ? { url: u, label: l.label.trim() } : { url: u });
    }
    setBusy(true);
    const err = await sendMessage({ title, body, images: pics.map((p) => p.blob), links: clean, userIds: to });
    setBusy(false);
    if (err) return toast(err, "error");
    toast(`${to.length}명에게 메세지를 보냈습니다.`);
    setSent(`‘${title.trim()}’을(를) ${to.length}명에게 보냈습니다. 이어서 다음 메세지를 작성할 수 있습니다.`);
    pics.forEach((p) => URL.revokeObjectURL(p.url));
    setTitle(""); setBody(""); setPics([]); setLinks([]);
    document.querySelector(".modal")?.scrollTo({ top: 0, behavior: "smooth" }); // 보냈다는 안내가 보이도록
  };
  const rest = teachers.filter((t) => !to.includes(t.id));
  return (
    <Modal wide title="메세지 보내기" onClose={onClose} footer={<>
      <Button variant="outline" onClick={onClose}>닫기</Button>
      <Button className="grow" disabled={busy || !title.trim() || !to.length} onClick={() => void send()}><Icon name="mail" size={16} />{busy ? "보내는 중…" : `${to.length}명에게 보내기`}</Button>
    </>}>
      {sent && <Note icon="checkCircle">{sent}</Note>}
      <div className="field">
        <label>받는 사람 <span className="muted">({to.length}명)</span></label>
        <div className="row g6 wrap">
          {to.map((id) => (
            <span key={id} className="msg-chip">{userName(d, id)}<button type="button" aria-label={`${userName(d, id)} 빼기`} onClick={() => setTo((x) => x.filter((v) => v !== id))}><Icon name="x" size={14} /></button></span>
          ))}
          {!to.length && <span className="t-xs muted">아래에서 받는 교사를 추가해 주세요.</span>}
        </div>
        <div className="row g8 wrap">
          <SelectBox label="교사 추가" value="" onChange={(v) => v && add([v])}>
            <option value="">교사 추가</option>
            {rest.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.group}부)</option>)}
          </SelectBox>
          <Button variant="outline" size="s" onClick={() => add(teachers.filter((t) => t.group === 1).map((t) => t.id))}>1부 전체</Button>
          <Button variant="outline" size="s" onClick={() => add(teachers.filter((t) => t.group === 2).map((t) => t.id))}>2부 전체</Button>
          {to.length > 0 && <Button variant="outline" size="s" onClick={() => setTo([])}>모두 빼기</Button>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="msg-title">제목 <span className="muted">{title.length}/50</span></label>
        <div className="input"><input id="msg-title" maxLength={50} placeholder="예: 겨울 성경학교 준비 미션" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      </div>
      <div className="field">
        <label htmlFor="msg-body">내용 <span className="muted">{body.length}/2000</span></label>
        <textarea id="msg-body" className="area" style={{ minHeight: 160 }} maxLength={2000} placeholder="선생님께 전할 내용을 적어 주세요." value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="field">
        <label>사진 <span className="muted">{pics.length}/{MSG_MAX_IMAGES}장 · 장당 500KB 이하</span></label>
        <div className="msg-images edit">
          {pics.map((p) => (
            <div key={p.id} className="msg-img">
              <img src={p.url} alt="" />
              <span className="msg-size">{kb(p.blob.size)}</span>
              <button type="button" className="msg-x" aria-label="사진 빼기" onClick={() => { URL.revokeObjectURL(p.url); setPics((x) => x.filter((v) => v.id !== p.id)); }}><Icon name="x" size={14} /></button>
            </div>
          ))}
          {pics.length < MSG_MAX_IMAGES && (
            <button type="button" className="msg-img add" onClick={() => file.current?.click()}><Icon name="image" /><span className="t-xs">사진 추가</span></button>
          )}
        </div>
        <span className="t-xs muted">500KB가 넘는 사진은 자동으로 줄여서 올립니다. 파일 첨부는 지원하지 않으니 문서는 링크로 보내 주세요.</span>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void addPics(f); }} />
      </div>
      <div className="field">
        <label>링크 <span className="muted">{links.length}/{MSG_MAX_LINKS}개</span></label>
        {links.map((l, i) => (
          <div key={i} className="row g8 msg-link-row">
            <div className="input m" style={{ flex: "0 1 34%" }}><input placeholder="표시 이름 (선택)" value={l.label} maxLength={40} onChange={(e) => setLinks((x) => x.map((v, j) => (j === i ? { ...v, label: e.target.value } : v)))} aria-label={`링크 ${i + 1} 표시 이름`} /></div>
            <div className="input m grow"><Icon name="link" size={16} /><input placeholder="https://" value={l.url} inputMode="url" onChange={(e) => setLinks((x) => x.map((v, j) => (j === i ? { ...v, url: e.target.value } : v)))} aria-label={`링크 ${i + 1} 주소`} /></div>
            <button type="button" className="icon-btn" aria-label={`링크 ${i + 1} 빼기`} onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}><Icon name="x" size={18} /></button>
          </div>
        ))}
        {links.length < MSG_MAX_LINKS && <div><Button variant="outline" size="s" onClick={() => setLinks((x) => [...x, { label: "", url: "" }])}><Icon name="plus" size={14} />링크 추가</Button></div>}
      </div>
    </Modal>
  );
}

function DetailModal({ m, onClose }: { m: TeacherMessage; onClose: () => void }) {
  const d = useData();
  const rs = receiptsOf(d, m.id);
  const read = rs.filter((r) => r.readAt).length;
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!window.confirm(`‘${m.title}’ 메세지를 삭제할까요?\n받은 교사 ${rs.length}명의 메세지함에서도 사라지고${m.images.length ? `, 첨부 사진 ${m.images.length}장은 저장소에서 완전히 삭제됩니다` : ""}.\n되돌릴 수 없습니다.`)) return;
    setBusy(true);
    const err = await deleteMessage(m.id);
    setBusy(false);
    if (err) return toast(err, "error");
    toast("메세지를 삭제했습니다.");
    onClose();
  };
  return (
    <Modal wide title="메세지 상세" onClose={onClose} footer={<>
      <Button variant="danger" disabled={busy} onClick={() => void del()}><Icon name="trash" size={16} />{busy ? "삭제 중…" : "삭제"}</Button>
      <Button variant="outline" className="grow" onClick={onClose}>닫기</Button>
    </>}>
      <div className="col g4">
        <strong className="t-lg b">{m.title}</strong>
        <span className="t-xs muted">{fmtDateTimeKo(m.createdAt)} · 보낸 사람 {userName(d, m.senderId)}</span>
      </div>
      <MessageBody m={m} />
      <div className="row between">
        <strong className="sb">받는 사람 {rs.length}명</strong>
        <Badge tone={read === rs.length ? "success" : "warning"}>읽음 {read}/{rs.length}</Badge>
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>교사</th><th>소속</th><th>상태</th><th>읽은 시각</th></tr></thead>
          <tbody>
            {[...rs].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt)).map((r) => {
              const u = d.users.find((x) => x.id === r.userId);
              return (
                <tr key={r.userId}>
                  <td><span className="row g8"><Avatar name={u?.name ?? "?"} size={28} /><strong className="sb">{u?.name ?? "삭제된 계정"}</strong></span></td>
                  <td>{u?.group ? `${u.group}부` : "-"}</td>
                  <td><Badge tone={r.readAt ? "success" : "neutral"}>{r.readAt ? "읽음" : "안 읽음"}</Badge></td>
                  <td className="muted">{r.readAt ? fmtStamp(r.readAt) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function Messages() {
  const d = useData();
  const teachers = useMemo(() => msgTeachers(d), [d]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [compose, setCompose] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mq, setMq] = useState("");
  const [period, setPeriod] = useState("");
  const shown = teachers.filter((t) => (!q.trim() || t.name.includes(q.trim())) && (!group || String(t.group) === group));
  const allOn = shown.length > 0 && shown.every((t) => picked.includes(t.id));
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  const focusUser = focus ? d.users.find((u) => u.id === focus) : null;
  const since = period ? Date.now() - Number(period) * 86400000 : 0;
  const list = (d.messages ?? [])
    .filter((m) => !focus || (d.receipts ?? []).some((r) => r.messageId === m.id && r.userId === focus))
    .filter((m) => (!mq.trim() || m.title.includes(mq.trim()) || m.body.includes(mq.trim())) && new Date(m.createdAt).getTime() >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const opened = open ? d.messages?.find((m) => m.id === open) : null;
  return (
    <Page title="교사별 메세지 전달" sub="교사에게 개인 메세지·미션을 보내고 읽음 여부를 확인합니다">
      <div className="msg-layout">
        <section className="panel msg-people">
          <div className="row between"><h2 className="t-lg b">교사 목록</h2><span className="t-xs muted">{teachers.length}명</span></div>
          <div className="input m"><Icon name="search" size={18} /><input placeholder="교사 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="교사 이름 검색" /></div>
          <div className="row g6">
            {[["", "전체"], ["1", "1부"], ["2", "2부"]].map(([v, l]) => (
              <button key={v} type="button" className={`chip ${group === v ? "on" : ""}`} style={{ height: 32 }} onClick={() => setGroup(v)}>{l}</button>
            ))}
          </div>
          <label className="chk"><input type="checkbox" checked={allOn} onChange={() => setPicked((x) => (allOn ? x.filter((v) => !shown.some((t) => t.id === v)) : [...new Set([...x, ...shown.map((t) => t.id)])]))} />보이는 교사 모두 선택</label>
          <div className="msg-plist">
            {shown.map((t) => {
              const un = unreadCount(d, t.id);
              return (
                <div key={t.id} className={`msg-person ${focus === t.id ? "on" : ""}`}>
                  <label className="chk"><input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} aria-label={`${t.name} 선택`} /></label>
                  <button type="button" className="row g8 grow" onClick={() => setFocus(focus === t.id ? null : t.id)} aria-pressed={focus === t.id} title="이 교사에게 보낸 메세지 보기">
                    <Avatar name={t.name} size={32} />
                    <span className="col grow" style={{ minWidth: 0, textAlign: "left" }}>
                      <strong className="sb">{t.name}</strong>
                      <span className="t-xs muted ellipsis">{t.group}부 · {teacherDuty(d, t)}</span>
                    </span>
                    {un > 0 && <Badge tone="warning">안 읽음 {un}</Badge>}
                  </button>
                </div>
              );
            })}
            {!shown.length && <p className="empty">조건에 맞는 교사가 없습니다.</p>}
          </div>
          <Button block disabled={!picked.length} onClick={() => setCompose(picked)}><Icon name="mail" size={16} />선택한 {picked.length}명에게 보내기</Button>
        </section>

        <section className="panel">
          <div className="row between wrap g8">
            <div className="col g2">
              <h2 className="t-lg b">{focusUser ? `${focusUser.name} 선생님에게 보낸 메세지` : "보낸 메세지"}</h2>
              <span className="t-xs muted">{list.length}건</span>
            </div>
            <div className="row g8">
              {focusUser && <Button variant="outline" onClick={() => setFocus(null)}>전체 보기</Button>}
              <Button onClick={() => setCompose(focusUser ? [focusUser.id] : picked)}><Icon name="plus" size={16} />{focusUser ? `${focusUser.name} 선생님에게 보내기` : "새 메세지"}</Button>
            </div>
          </div>
          <div className="row g8 wrap">
            <div className="input m grow" style={{ minWidth: 200 }}><Icon name="search" size={18} /><input placeholder="제목, 내용 검색" value={mq} onChange={(e) => setMq(e.target.value)} aria-label="메세지 검색" /></div>
            <SelectBox label="기간" value={period} onChange={setPeriod}><option value="">기간: 전체</option><option value="7">최근 1주</option><option value="31">최근 1개월</option><option value="92">최근 3개월</option></SelectBox>
          </div>
          <div className="tablewrap">
            <table className="tbl msg-tbl">
              <thead><tr><th>보낸 날짜</th><th>제목</th><th>받는 사람</th><th>{focusUser ? "상태" : "읽음"}</th></tr></thead>
              <tbody>
                {list.map((m) => {
                  const rs = receiptsOf(d, m.id);
                  const read = rs.filter((r) => r.readAt).length;
                  const mine = focus ? rs.find((r) => r.userId === focus) : null;
                  const names = rs.map((r) => userName(d, r.userId));
                  return (
                    <tr key={m.id} className="click" tabIndex={0} onClick={() => setOpen(m.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(m.id)}>
                      <td className="nowrap muted">{fmtStamp(m.createdAt)}</td>
                      <td>
                        <span className="row g6">
                          <strong className="sb">{m.title}</strong>
                          {m.images.length > 0 && <span className="row g2 t-xs muted" title={`사진 ${m.images.length}장`}><Icon name="image" size={14} />{m.images.length}</span>}
                          {m.links.length > 0 && <span className="row g2 t-xs muted" title={`링크 ${m.links.length}개`}><Icon name="link" size={14} />{m.links.length}</span>}
                        </span>
                      </td>
                      <td className="nowrap">{names.length > 2 ? `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}명` : names.join(", ")}</td>
                      <td className="nowrap">
                        {mine ? <Badge tone={mine.readAt ? "success" : "neutral"}>{mine.readAt ? `읽음 ${fmtStamp(mine.readAt)}` : "안 읽음"}</Badge>
                          : <Badge tone={read === rs.length ? "success" : "warning"}>{read}/{rs.length}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!list.length && <p className="empty">{focusUser ? `${focusUser.name} 선생님에게 보낸 메세지가 없습니다.` : "보낸 메세지가 없습니다."}</p>}
          </div>
          <Note>교사는 앱 첫 화면에서 새 메세지를 바로 확인하고, 내 정보 › 내 메세지함에서 다시 볼 수 있습니다. 메세지를 열면 읽음으로 표시됩니다. 메세지를 삭제하면 첨부 사진도 저장소에서 완전히 지워집니다.</Note>
        </section>
      </div>
      {compose && <ComposeModal initial={compose} onClose={() => setCompose(null)} />}
      {opened && <DetailModal m={opened} onClose={() => setOpen(null)} />}
    </Page>
  );
}
