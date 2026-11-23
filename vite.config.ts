import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

// Remove manifesto/ícones do HTML no arquivo único (artefato do Claude), onde não existem.
const stripPwa = {
  name: "strip-pwa",
  transformIndexHtml: (html: string) => html.replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, ""),
};

export default defineConfig(({ mode }) => ({
  base: mode === "preview" ? "/" : process.env.VITE_BASE || "/",
  plugins: [react(), ...(mode === "preview" ? [viteSingleFile(), stripPwa] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build:
    mode === "preview"
      ? { outDir: "dist-preview" }
      : { rollupOptions: { output: { manualChunks: { charts: ["recharts"], supabase: ["@supabase/supabase-js"], vendor: ["react", "react-dom", "react-router-dom", "date-fns"] } } } },
  server: { port: 8080 },
}));
