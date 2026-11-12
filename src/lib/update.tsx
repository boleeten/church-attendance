import { useEffect, useState } from "react";

declare const __BUILD_ID__: string;

/** 서버의 /version.json 이 지금 실행 중인 빌드와 다르면 true (개발 서버에서는 늘 false) */
async function hasNewVersion(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return false;
    const { build } = (await r.json()) as { build?: string };
    return !!build && build !== __BUILD_ID__;
  } catch {
    return false; // 오프라인 등
  }
}

/**
 * 새 버전 안내 띠.
 * 앱을 백그라운드에 둔 채 다시 열면(특히 아이폰 홈 화면 앱) 예전 화면이 그대로 이어지므로,
 * 화면이 다시 보일 때와 10분마다 새 버전이 있는지 확인한다.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const check = () => {
      if (document.visibilityState === "visible") void hasNewVersion().then((v) => v && setReady(true));
    };
    check();
    const timer = window.setInterval(check, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [ready]);
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>새 버전이 있습니다.</span>
      <button type="button" onClick={() => window.location.reload()}>새로고침</button>
    </div>
  );
}
