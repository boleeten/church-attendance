// 계정 생성·비밀번호 초기화 (Vercel 서버 함수)
// 다른 사람의 로그인 계정을 만들거나 비밀번호를 바꾸려면 Supabase secret(service_role) 키가 필요해서
// 브라우저가 아니라 여기서 처리한다. 요청한 사람이 관리자인지, 대상 계정을 다룰 권한이 있는지 먼저 확인한다.
// 필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EMAIL_DOMAIN = "attendance.local";
const LOGIN_ID = /^[a-z0-9_]{4,20}$/;

/** 헷갈리는 글자(0/O, 1/l/I)를 뺀 임시 비밀번호. 영문 6자 + 숫자 4자 */
function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += letters[randomInt(letters.length)];
  for (let i = 0; i < 4; i++) s += digits[randomInt(digits.length)];
  return s;
}

/** 앱(store.ts canResetPassword)과 같은 규칙: 목사님 계정·본인은 불가, 최고 관리자 계정은 최고 관리자만 */
function canReset(actor, target) {
  if (target.roles.includes("owner")) return false;
  if (target.id === actor.id) return false;
  if (target.roles.includes("super")) return actor.roles.includes("super");
  return actor.roles.includes("super") || actor.roles.includes("admin");
}

const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "POST만 지원합니다.");
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return fail(res, 503, "서버에 Supabase 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 요청한 사람 확인 ──
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(res, 401, "로그인이 필요합니다.");
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return fail(res, 401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const { data: actor } = await sb.from("profiles").select("id, roles, active").eq("id", auth.user.id).single();
  if (!actor?.active || !actor.roles.some((r) => r === "admin" || r === "super")) return fail(res, 403, "관리자만 할 수 있습니다.");

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // ── 교사 계정 만들기 ──
  if (body.action === "create") {
    const loginId = String(body.loginId || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const group = body.group === 1 || body.group === 2 ? body.group : null;
    // 새 계정에는 교사·부장교사 권한만 준다. 관리자 권한은 만든 뒤 '관리자 계정 관리'에서 따로 부여한다.
    const roles = (Array.isArray(body.roles) ? body.roles : []).filter((r) => r === "teacher" || r === "head");
    if (!LOGIN_ID.test(loginId)) return fail(res, 400, "아이디는 영문 소문자·숫자·밑줄 4~20자로 정해 주세요.");
    if (!name) return fail(res, 400, "이름을 입력해 주세요.");
    if (!roles.length) roles.push("teacher");

    const { data: dup } = await sb.from("profiles").select("id").eq("login_id", loginId).maybeSingle();
    if (dup) return fail(res, 409, "이미 사용 중인 아이디입니다.");

    const password = tempPassword();
    const { data: created, error } = await sb.auth.admin.createUser({ email: `${loginId}@${EMAIL_DOMAIN}`, password, email_confirm: true });
    if (error || !created?.user) {
      const msg = /already/i.test(error?.message || "") ? "이미 사용 중인 아이디입니다." : `계정을 만들지 못했습니다. (${error?.message || "알 수 없는 오류"})`;
      return fail(res, 400, msg);
    }
    const profile = { id: created.user.id, login_id: loginId, name, roles, group, active: true, must_change_password: true, push_allowed: false };
    const { error: pErr } = await sb.from("profiles").insert(profile);
    if (pErr) {
      await sb.auth.admin.deleteUser(created.user.id); // 반쯤 만들어진 계정을 남기지 않는다
      return fail(res, 500, `프로필을 저장하지 못했습니다. (${pErr.message})`);
    }
    return res.status(200).json({ user: profile, tempPassword: password });
  }

  // ── 비밀번호 초기화 ──
  if (body.action === "reset") {
    const { data: target } = await sb.from("profiles").select("id, login_id, roles").eq("id", String(body.userId || "")).single();
    if (!target) return fail(res, 404, "대상 계정을 찾을 수 없습니다.");
    if (!canReset(actor, target)) return fail(res, 403, "이 계정의 비밀번호를 초기화할 권한이 없습니다.");
    const password = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(target.id, { password });
    if (error) return fail(res, 500, `비밀번호를 바꾸지 못했습니다. (${error.message})`);
    await sb.from("profiles").update({ must_change_password: true }).eq("id", target.id);
    return res.status(200).json({ tempPassword: password });
  }

  return fail(res, 400, "알 수 없는 요청입니다.");
}
