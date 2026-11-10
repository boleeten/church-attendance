// 웹 푸시: 전화번호 없이, 홈 화면에 설치한 앱(또는 브라우저)에 알림을 보낸다.
// 기기 등록 정보(구독)는 Supabase의 push_subscriptions 에 저장되고, 서버 함수(api/push-reminders.js)가 발송한다.
import { remote, remoteEnabled } from "./remote";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () => "serviceWorker" in navigator && "Notification" in window;
export const pushPermission = (): NotificationPermission | "unsupported" => (pushSupported() ? Notification.permission : "unsupported");
/** 아이폰은 홈 화면에 설치한 앱에서만 알림을 받을 수 있다. */
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 알림 권한을 요청하고, 서버 발송이 설정돼 있으면 이 기기를 등록한다. */
export async function enablePush(userId: string): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) return { ok: false, message: isIOS() ? "아이폰은 홈 화면에 앱을 추가한 뒤, 그 앱에서 알림을 허용해 주세요." : "이 브라우저는 알림을 지원하지 않습니다." };
  if (isIOS() && !isStandalone()) return { ok: false, message: "아이폰은 홈 화면에 앱을 추가한 뒤, 그 앱에서 알림을 허용해 주세요." };
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, message: "알림이 차단되어 있습니다. 기기 설정에서 이 앱의 알림을 허용해 주세요." };
  const reg = await navigator.serviceWorker.ready;
  if (remoteEnabled && VAPID_PUBLIC_KEY) {
    try {
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
      remote.upsert("push_subscriptions", { userId, endpoint: sub.endpoint, subscription: sub.toJSON() });
    } catch (e) {
      return { ok: false, message: `이 기기를 알림 대상으로 등록하지 못했습니다. ${(e as Error).message}` };
    }
  }
  return { ok: true, message: "알림을 허용했습니다." };
}

/** 이 기기에서 알림이 실제로 뜨는지 확인하는 테스트 알림 */
export async function sendTestNotification(url: string): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("주일 출석체크 안내 (테스트)", {
    body: "알림이 정상적으로 표시됩니다. 누르면 출석체크 화면으로 이동합니다.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "attendance-test",
    data: { url },
  });
  return true;
}
