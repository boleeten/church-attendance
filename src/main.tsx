import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./lib/push";
import { restoreSession } from "./lib/store";
import "./styles.css";

registerServiceWorker();

// 관리자 화면으로 열릴 가능성이 높으면, 데이터를 받는 동안 관리자 화면 코드도 미리 받아 둔다
if (location.pathname.startsWith("/admin") || location.hostname.startsWith("lord-admin.")) void import("./admin/AdminApp");

void restoreSession().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
