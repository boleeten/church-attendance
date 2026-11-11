// 버전: 2026-11-11b 홈 아이콘 숫자 배지를 알림 센터에 남은 알림 수에 맞춤
// 출석관리 서비스 워커: 푸시 알림을 받아 표시하고, 누르면 해당 화면을 연다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration
      .showNotification(data.title || "주일 출석체크 안내", {
        body: data.body || "출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: data.tag || "attendance-reminder",
        data: { url: data.url || "/" },
      })
      .then(updateBadge),
  );
});

/** 홈 화면 아이콘 숫자 = 알림 센터에 남아 있는 이 앱의 알림 수 (앱을 열면 앱이 '안 읽은 알림 수'로 다시 맞춘다) */
async function updateBadge() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (!self.navigator.setAppBadge) return;
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    /* 배지를 지원하지 않는 기기 */
  }
}

self.addEventListener("notificationclose", (event) => event.waitUntil(updateBadge()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  updateBadge();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
