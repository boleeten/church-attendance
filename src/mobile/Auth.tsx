import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { remoteEnabled, toast } from "../lib/remote";
import { DEMO_PASSWORD } from "../lib/seed";
import { changePassword, login, logout, me, passwordRules, resetDemo, useMe } from "../lib/store";
import { Button, Icon, Note, PasswordInput } from "../ui";
import { afterLoginPath, entryOptions, Phone } from "./Shell";

// [아이디, 버튼 이름, 설명, 로그인 후 열 화면]
const DEMO_ACCOUNTS = [
  ["teacher_kim01", "교사", "1부 4학년 1반 담임", "/t"],
  ["head_park01", "부장교사", "교사 출결관리·관리자 화면 중 선택", undefined],
  ["pastor_han", "관리자", "목사님 · 계정 총괄", "/admin"],
] as const;

export function Login() {
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (loginId: string, password: string, target?: string) => {
    setBusy(true);
    const e = await login(loginId, password);
    setBusy(false);
    if (e) return setErr(e);
    const u = me()!;
    nav(u.mustChangePassword ? "/password" : target ?? afterLoginPath(u), { replace: true });
  };

  return (
    <Phone>
      <form
        className="col g16"
        style={{ padding: "72px 28px 32px", flex: 1 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(id, pw);
        }}
      >
        <div className="col center g16" style={{ marginBottom: 16 }}>
          <img src="/logo.png" alt="" width={96} height={96} style={{ borderRadius: "50%" }} />
          <div className="col center">
            <h1 className="t-3xl sb c-primary">주님의교회 초등부</h1>
            <p className="t-base muted">출석관리</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="login-id">아이디</label>
          <div className="input">
            <Icon name="user" size={18} />
            <input id="login-id" autoComplete="username" autoCapitalize="none" placeholder="아이디를 입력하세요" value={id} onChange={(e) => setId(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="login-pw">비밀번호</label>
          <PasswordInput id="login-pw" label="비밀번호" autoComplete="current-password" placeholder="비밀번호를 입력하세요" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <p className="c-error t-xs sb" role="alert">{err}</p>}
        <Button size="l" block type="submit" disabled={busy || !id || !pw}>{busy ? "로그인 중…" : "로그인"}</Button>
        <Note>계정은 관리자가 발급합니다. 비밀번호를 잊으셨다면 부서 관리자에게 초기화를 요청해 주세요.</Note>

        {!remoteEnabled && (
          <div className="card pad col g10">
            <p className="t-xs sb">데모 계정으로 둘러보기</p>
            <p className="t-xs muted">예시 데이터로 동작하며, 입력한 내용은 이 브라우저에만 저장됩니다.</p>
            {DEMO_ACCOUNTS.map(([loginId, role, desc, target]) => (
              <button key={loginId} type="button" className="row g12" style={{ textAlign: "left" }} disabled={busy} onClick={() => void submit(loginId, DEMO_PASSWORD, target)}>
                <span className="badge info" style={{ width: 72, justifyContent: "center" }}>{role}</span>
                <span className="grow t-xs muted">{desc}</span>
                <Icon name="right" size={16} />
              </button>
            ))}
            <button type="button" className="t-xs muted" style={{ textDecoration: "underline", alignSelf: "flex-start" }} onClick={() => { resetDemo(); toast("예시 데이터를 처음 상태로 되돌렸습니다."); }}>
              예시 데이터 초기화
            </button>
          </div>
        )}
        <p className="t-xs muted" style={{ textAlign: "center", marginTop: "auto" }}>© 주님의교회 초등부</p>
      </form>
    </Phone>
  );
}

export function PasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [cf, setCf] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rules = passwordRules(pw, cf, cur);
  const ok = cur.length > 0 && rules.every((r) => r.ok);
  const field = (label: string, value: string, set: (v: string) => void, ac: string, ph: string) => (
    <div className="field">
      <label>{label}</label>
      <PasswordInput label={label} autoComplete={ac} placeholder={ph} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );
  return (
    <form
      className="col g16 grow"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await changePassword(cur, pw);
        if (r) return setErr(r);
        toast("비밀번호를 변경했습니다.");
        onDone();
      }}
    >
      {forced && <Note warm icon="warning">임시 비밀번호로 로그인했습니다. 새 비밀번호로 변경해야 서비스를 이용할 수 있습니다.</Note>}
      {field(forced ? "현재(임시) 비밀번호" : "현재 비밀번호", cur, setCur, "current-password", "현재 비밀번호를 입력하세요")}
      {field("새 비밀번호", pw, setPw, "new-password", "새 비밀번호를 입력하세요")}
      {field("새 비밀번호 확인", cf, setCf, "new-password", "새 비밀번호를 다시 입력하세요")}
      <ul className="col g6" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rules.map((r) => (
          <li key={r.label} className={`row g6 t-xs ${r.ok ? "c-success" : "muted"}`}>
            <Icon name="check" size={14} stroke={2.4} />
            {r.label}
          </li>
        ))}
      </ul>
      {err && <p className="c-error t-xs sb" role="alert">{err}</p>}
      <Button size="l" block type="submit" disabled={!ok} style={{ marginTop: "auto" }}>{forced ? "변경하고 시작하기" : "비밀번호 변경"}</Button>
    </form>
  );
}

export function ForcedPassword() {
  const nav = useNavigate();
  const u = useMe();
  return (
    <Phone>
      <header className="appbar">
        <h1>비밀번호 변경</h1>
        <button type="button" className="t-xs muted" onClick={() => { logout(); nav("/login", { replace: true }); }}>로그아웃</button>
      </header>
      <div className="mbody">
        <PasswordForm forced onDone={() => u && nav(afterLoginPath(u), { replace: true })} />
      </div>
    </Phone>
  );
}

/** 들어갈 화면 선택 (교사 출결관리·관리자 화면 등 여러 화면을 쓰는 계정) */
export function EntrySelect() {
  const nav = useNavigate();
  const u = useMe()!;
  const options = entryOptions(u);
  return (
    <Phone>
      <div className="col g16" style={{ padding: "64px 24px 32px", flex: 1 }}>
        <div className="col g8" style={{ marginBottom: 8 }}>
          <img src="/logo.png" alt="" width={56} height={56} style={{ borderRadius: "50%" }} />
          <h1 className="t-2xl b">{u.name}님, 어디로 들어갈까요?</h1>
          <p className="muted">사용할 화면을 선택해 주세요. 들어간 뒤에도 메뉴에서 다른 화면으로 바꿀 수 있습니다.</p>
        </div>
        <div className="col g12">
          {options.map((o) => (
            <button key={o.path} type="button" className="entry-card" onClick={() => nav(o.path, { replace: true })}>
              <span className="entry-ico"><Icon name={o.icon} size={24} /></span>
              <span className="col g4 grow" style={{ textAlign: "left" }}>
                <strong className="t-lg b">{o.title}</strong>
                <span className="t-xs muted">{o.desc}</span>
              </span>
              <Icon name="right" size={20} />
            </button>
          ))}
        </div>
        <button type="button" className="t-xs muted" style={{ marginTop: "auto", alignSelf: "center", textDecoration: "underline" }} onClick={() => { logout(); nav("/login", { replace: true }); }}>
          다른 계정으로 로그인
        </button>
      </div>
    </Phone>
  );
}
