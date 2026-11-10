// 출석 미완료 푸시 알림 발송 (Vercel 서버 함수)
// - 매주 일요일 오후 3시(KST)에 Vercel Cron이 호출한다 (vercel.json).
// - 관리자가 앱에서 "알림 보내기"를 누르면 같은 함수를 호출해 기기 푸시만 추가로 보낸다.
// 필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET
// 주의: 실제 Supabase·푸시 키로 아직 실행해 보지 않은 코드다.
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const uid = () => Math.random().toString(36).slice(2, 12);

/** 한국 시간 기준으로 오늘이 일요일이면 오늘, 아니면 가장 최근 일요일 */
function currentSundayKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - kst.getUTCDay());
  return kst.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: "푸시 알림에 필요한 환경 변수가 설정되지 않았습니다." });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  webpush.setVapidDetails("mailto:admin@attendance.local", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // ── 호출자 확인: Vercel Cron(비밀 값) 또는 로그인한 관리자 ──
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const isCron = Boolean(CRON_SECRET) && token === CRON_SECRET;
  if (!isCron) {
    const { data: auth } = await sb.auth.getUser(token);
    const { data: profile } = auth?.user ? await sb.from("profiles").select("roles, active").eq("id", auth.user.id).single() : { data: null };
    const ok = profile?.active && profile.roles.some((r) => r === "admin" || r === "super");
    if (!ok) return res.status(401).json({ error: "권한이 없습니다." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const date = body.date || currentSundayKST();
  const mode = isCron ? "자동" : "수동";

  const [{ data: classes }, { data: sessions }, { data: assigns }, { data: settingsRow }, { data: heads }] = await Promise.all([
    sb.from("classes").select("*"),
    sb.from("sessions").select("target, completed").eq("date", date),
    sb.from("teacher_assignments").select("user_id, class_id, kind").eq("kind", "담임"),
    sb.from("settings").select("data").eq("id", 1).single(),
    sb.from("profiles").select("id, group, roles, active").contains("roles", ["head"]),
  ]);
  const settings = settingsRow?.data || {};
  const done = new Set((sessions || []).filter((s) => s.completed).map((s) => s.target));

  // ── 보낼 알림 목록 만들기 ──
  const items = [];
  if (!isCron || settings.studentNotifyOn !== false) {
    for (const c of classes || []) {
      if (body.classId && c.id !== body.classId) continue;
      if (done.has(`class:${c.id}`)) continue;
      const label = `${c.group}부 ${c.grade}학년 ${c.no}반`;
      for (const a of (assigns || []).filter((x) => x.class_id === c.id)) {
        items.push({ userId: a.user_id, kind: "student", target: label, title: "주일 출석체크 안내", body: `${label}의 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.`, url: `/t/check?date=${date}` });
      }
    }
  }
  if ((isCron && settings.teacherNotifyOn) || body.teachers) {
    for (const g of [1, 2]) {
      if (done.has(`group:${g}`)) continue;
      for (const h of (heads || []).filter((x) => x.active && x.group === g)) {
        items.push({ userId: h.id, kind: "teacher", target: `${g}부 교사`, title: "교사 출석체크 안내", body: `${g}부 교사 출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.`, url: `/h/check?date=${date}` });
      }
    }
  }
  if (!items.length) return res.status(200).json({ date, sent: 0, failed: 0, message: "미완료 출석부가 없습니다." });

  const userIds = [...new Set(items.map((i) => i.userId))];
  const { data: subs } = await sb.from("push_subscriptions").select("user_id, endpoint, subscription").in("user_id", userIds);

  let sent = 0;
  let failed = 0;
  const logs = [];
  const notifications = [];
  for (const item of items) {
    const mine = (subs || []).filter((s) => s.user_id === item.userId);
    let result = mine.length ? "실패" : "권한 미허용";
    for (const s of mine) {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: `reminder-${date}` }));
        result = "성공";
      } catch (e) {
        // 만료된 기기 등록은 지운다
        if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subscriptions").delete().match({ user_id: s.user_id, endpoint: s.endpoint });
      }
    }
    if (result === "성공") sent++;
    else failed++;
    // 수동 발송은 앱이 이미 알림 목록·발송 결과를 기록했으므로 자동 발송일 때만 남긴다
    if (isCron) {
      notifications.push({ id: uid(), user_id: item.userId, kind: item.kind, title: item.title, body: item.body, date, read: false });
      logs.push({ id: uid(), mode, user_id: item.userId, target: item.target, result });
    }
  }
  if (notifications.length) await sb.from("notifications").insert(notifications);
  if (logs.length) await sb.from("notification_logs").insert(logs);
  return res.status(200).json({ date, sent, failed });
}
