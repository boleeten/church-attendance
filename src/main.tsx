import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { restoreSession } from "./lib/store";
import "./styles.css";

void restoreSession().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
