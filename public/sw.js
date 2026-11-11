// 버전: 2026-11-11 상태바 배지(흰색 꽃 실루엣) 적용
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
    self.registration.showNotification(data.title || "주일 출석체크 안내", {
      body: data.body || "출석체크가 완료되지 않았습니다. 출석 등록을 부탁드립니다.",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag || "attendance-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
