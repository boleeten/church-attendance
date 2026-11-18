import { useEffect, useState } from "react";
import { remote, remoteEnabled } from "./remote";
import type { Data, MessageReceipt, TeacherMessage } from "./types";

export type InboxItem = TeacherMessage & { readAt: string | null };

/** 이 교사가 받은 메세지 (최신순) */
export function inboxOf(d: Data, userId: string): InboxItem[] {
  const mine = new Map((d.receipts ?? []).filter((r) => r.userId === userId && !r.deletedAt).map((r) => [r.messageId, r.readAt]));
  return (d.messages ?? []).filter((m) => mine.has(m.id)).map((m) => ({ ...m, readAt: mine.get(m.id) ?? null })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const receiptsOf = (d: Data, messageId: string): MessageReceipt[] => (d.receipts ?? []).filter((r) => r.messageId === messageId);

/** 비공개 저장소의 사진 경로를 화면에 띄울 수 있는 주소로 바꾼다. 데모(data URL)는 그대로 쓴다 */
const urlCache = new Map<string, { url: string; until: number }>();
export function useImageUrls(paths: string[]): Record<string, string> {
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const out: Record<string, string> = {};
    const need: string[] = [];
    for (const p of paths) {
      const c = urlCache.get(p);
      if (!remoteEnabled || p.startsWith("data:") || /^https?:/.test(p)) out[p] = p;
      else if (c && c.until > Date.now()) out[p] = c.url;
      else need.push(p);
    }
    setUrls(out);
    if (need.length)
      void remote.messageImageUrls(need).then((got) => {
        for (const [p, u] of Object.entries(got)) urlCache.set(p, { url: u, until: Date.now() + 50 * 60 * 1000 });
        if (alive) setUrls((x) => ({ ...x, ...got }));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** 링크는 http/https 주소만 받는다 */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export const linkText = (l: { url: string; label?: string }) => l.label?.trim() || new URL(l.url).hostname.replace(/^www\./, "");

/** 메세지 알림의 링크(…/messages/{id})에서 메세지 ID를 꺼낸다 */
export const messageIdOfLink = (link?: string | null) => link?.match(/\/messages\/([^/?#]+)/)?.[1] ?? null;

/** 회수·삭제되어 더 볼 수 없는 메세지의 알림은 목록에서 뺀다 */
export function visibleNotifications(d: Data, userId: string) {
  const inbox = new Set(inboxOf(d, userId).map((m) => m.id));
  return d.notifications.filter((n) => n.userId === userId && (n.kind !== "message" || inbox.has(messageIdOfLink(n.link) ?? "")));
}
