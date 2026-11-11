// Google Sheets 동기화 (Vercel 서버 함수)
// - GET : 시트에 편집자로 공유해야 할 서비스 계정 이메일을 알려 준다.
// - POST: 관리자 화면이 만든 시트별 표(rows)를 받아, 설정에 지정된 구글 시트 파일에 덮어쓴다.
//         어느 파일에 쓸지는 요청 값이 아니라 DB 설정(settings.data.sheetSharedId / sheetPrivateId)에서 정한다.
// 필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON(서비스 계정 키 JSON 전체)
import { createSign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const fail = (res, status, error) => res.status(status).json({ error });
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** 서비스 계정 키를 읽는다. 문제가 있으면 원인을 problem에 담는다(키 값 자체는 절대 돌려주지 않는다). */
function serviceAccount() {
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return { sa: null, problem: "GOOGLE_SERVICE_ACCOUNT_JSON 환경 변수가 비어 있거나 이 배포에 들어 있지 않습니다. Production에 넣은 뒤 다시 배포해야 합니다." };
  // 앞뒤를 따옴표로 한 번 더 감싸 붙여 넣은 경우도 받아 준다
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('"{'))) raw = raw.slice(1, -1);
  let sa;
  try {
    sa = JSON.parse(raw);
    if (typeof sa === "string") sa = JSON.parse(sa);
  } catch {
    return { sa: null, problem: `GOOGLE_SERVICE_ACCOUNT_JSON 값이 올바른 JSON이 아닙니다. 키 파일 내용 전체({ 로 시작해 } 로 끝남)를 그대로 붙여 넣어 주세요. (현재 ${raw.length}자, 시작 문자 '${raw[0]}')` };
  }
  if (!sa?.client_email || !sa?.private_key) return { sa: null, problem: "JSON에 client_email 또는 private_key가 없습니다. 서비스 계정의 '키 → JSON' 파일인지 확인해 주세요." };
  sa.private_key = String(sa.private_key).replace(/\\n/g, "\n");
  return { sa, problem: null };
}

/** 서비스 계정 키로 Google 접근 토큰을 받는다 (JWT bearer). */
async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Google 인증 실패: ${j.error_description || j.error || r.status}`);
  return j.access_token;
}

async function sheetsApi(token, path, method = "GET", body) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error?.message || `Google Sheets 오류 (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return j;
}

const quote = (title) => `'${title.replace(/'/g, "''")}'`;
const cell = (v) => (v === null || v === undefined ? "" : typeof v === "number" ? v : String(v));

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return fail(res, 503, "서버에 Supabase 키가 설정되지 않았습니다.");
  const { sa, problem } = serviceAccount();
  if (problem) console.error("[sheets-sync]", problem);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 요청한 사람 확인: 관리자만 ──
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await sb.auth.getUser(token) : { data: null };
  if (!auth?.user) return fail(res, 401, "로그인이 필요합니다.");
  const { data: actor } = await sb.from("profiles").select("roles, active").eq("id", auth.user.id).single();
  if (!actor?.active || !actor.roles.some((r) => r === "admin" || r === "super")) return fail(res, 403, "관리자만 할 수 있습니다.");

  if (req.method === "GET") return res.status(200).json({ configured: !!sa, email: sa?.client_email ?? null, problem });
  if (req.method !== "POST") return fail(res, 405, "지원하지 않는 요청입니다.");
  if (!sa) return fail(res, 503, problem);

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { data: settingsRow } = await sb.from("settings").select("data").eq("id", 1).single();
  const settings = settingsRow?.data || {};
  const spreadsheetId = body.target === "private" ? settings.sheetPrivateId : body.target === "shared" ? settings.sheetSharedId : null;
  if (!spreadsheetId) return fail(res, 400, "동기화할 구글 시트가 지정되지 않았습니다.");
  const sheets = (Array.isArray(body.sheets) ? body.sheets : []).filter((s) => s && typeof s.title === "string" && Array.isArray(s.rows));
  if (!sheets.length) return fail(res, 400, "보낼 데이터가 없습니다.");

  try {
    const gtoken = await googleToken(sa);
    // 없는 시트(탭)는 만든다
    const meta = await sheetsApi(gtoken, `${spreadsheetId}?fields=sheets.properties.title`);
    const existing = new Set((meta.sheets || []).map((s) => s.properties.title));
    const missing = sheets.filter((s) => !existing.has(s.title));
    if (missing.length) await sheetsApi(gtoken, `${spreadsheetId}:batchUpdate`, "POST", { requests: missing.map((s) => ({ addSheet: { properties: { title: s.title } } })) });
    // 기존 내용을 지우고 새로 쓴다 (앱 DB가 원본)
    await sheetsApi(gtoken, `${spreadsheetId}/values:batchClear`, "POST", { ranges: sheets.map((s) => quote(s.title)) });
    await sheetsApi(gtoken, `${spreadsheetId}/values:batchUpdate`, "POST", {
      valueInputOption: "RAW",
      data: sheets.map((s) => ({ range: `${quote(s.title)}!A1`, values: s.rows.map((row) => (Array.isArray(row) ? row.map(cell) : [])) })),
    });
    return res.status(200).json({ ok: true, sheets: sheets.length, rows: sheets.reduce((n, s) => n + s.rows.length, 0) });
  } catch (e) {
    if (e.status === 403 || e.status === 404)
      return fail(res, 400, `구글 시트에 쓸 수 없습니다. 시트를 ${sa.client_email} 에 '편집자'로 공유했는지, 링크가 맞는지 확인해 주세요.`);
    return fail(res, 500, e.message || "동기화 중 오류가 났습니다.");
  }
}
