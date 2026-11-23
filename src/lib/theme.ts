import { useEffect, useState } from "react";

export type Accent = "verde" | "vermelho";
const KEY = "bfit:accent";

export function applyAccent(accent: Accent | null | undefined) {
  const a: Accent = accent === "vermelho" ? "vermelho" : "verde";
  document.documentElement.dataset.accent = a;
  try {
    localStorage.setItem(KEY, a);
  } catch {
    /* ignore */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");
  window.dispatchEvent(new Event("bfit:accent"));
}

export function initAccent() {
  let a: string | null = null;
  try {
    a = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  applyAccent(a as Accent);
}

/** Cor de destaque atual (hex) para gráficos SVG. */
export function useBrandColor() {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue("--brand-hex").trim() || "#16a34a";
  const [c, setC] = useState(read);
  useEffect(() => {
    const h = () => setC(read());
    window.addEventListener("bfit:accent", h);
    return () => window.removeEventListener("bfit:accent", h);
  }, []);
  return c;
}
