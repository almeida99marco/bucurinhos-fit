import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { initAccent } from "./lib/theme";
import { initBackend } from "./lib/backend";

initAccent();
// iPhone: o Safari ignora "user-scalable=no", então bloqueia o gesto de pinça diretamente
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (e) => { if ((e as TouchEvent).touches.length > 1) e.preventDefault(); }, { passive: false });

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif", color: "#66736C" }}>
    Carregando Bucurinho's Fit…
  </div>,
);
initBackend()
  .then(async (be) => {
    // Web app instalável (GitHub Pages): registra o service worker
    if (be.mode === "supabase" && "serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
    const { default: App } = await import("./App");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch(() => {
    root.render(<div style={{ padding: 24, fontFamily: "system-ui" }}>Não foi possível iniciar o app. Recarregue a página.</div>);
  });
