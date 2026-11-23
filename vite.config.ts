import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { getDept, type Department } from "./src/config/departments.js";

// 배포마다 달라지는 빌드 번호. 앱은 /version.json 과 비교해 새 버전이 나왔는지 안다.
const BUILD_ID = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: "version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

/** 부서 이름을 index.html 과 홈 화면 앱 정보(manifest)에 넣는다 */
function deptBranding(dept: Department): Plugin {
  const name = `${dept.church} ${dept.name} 출석관리`;
  const manifest = JSON.stringify(
    {
      name,
      short_name: dept.appShort,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f5f7fa",
      theme_color: "#041c46",
      lang: "ko",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
  return {
    name: "dept-branding",
    transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", name).replaceAll("%APP_SHORT%", dept.appShort),
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_req, res) => {
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifest });
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_DEPT: 어느 부서로 빌드할지 (Vercel 환경 변수 또는 .env). 없으면 초등부
  const dept = getDept(process.env.VITE_DEPT ?? loadEnv(mode, process.cwd(), "VITE_").VITE_DEPT);
  return {
    plugins: [react(), versionFile(), deptBranding(dept)],
    define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
    server: { port: 5183 },
  };
});
