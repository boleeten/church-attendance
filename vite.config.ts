import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5183 },
});
