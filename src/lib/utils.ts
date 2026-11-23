import { clsx, type ClassValue } from "clsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const cn = (...c: ClassValue[]) => clsx(c);

/** Data local no formato YYYY-MM-DD (sem conversão para UTC). */
export function today(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return today(d);
}

/** Segunda-feira da semana da data informada. */
export function weekStart(iso: string) {
  const d = parseISO(iso);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return today(d);
}

export const fmtDate = (iso?: string | null, pattern = "dd/MM/yyyy") => (iso ? format(parseISO(iso), pattern, { locale: ptBR }) : "—");
export const fmtDay = (iso: string) => format(parseISO(iso), "EEE, dd MMM", { locale: ptBR });

export function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtDuration(sec?: number | null) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtPace(secPerKm?: number | null) {
  if (!secPerKm || !Number.isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}/km`;
}

/** Converte "hh:mm:ss" ou "mm:ss" em segundos. */
export function parseDuration(s: string): number | null {
  const parts = s.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((p) => Number.isNaN(p) || p < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0] * 60;
  return null;
}

export const toNum = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Mantém só o último registro de cada data (ordem preservada) — evita pontos duplicados nos gráficos. */
export function lastPerDate<T extends { date: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.date, r);
  return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const MEAL_LABEL: Record<string, string> = {
  cafe_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};

export const RUN_TYPES: Record<string, string> = {
  leve: "Corrida leve",
  rodagem: "Rodagem",
  intervalado: "Intervalado",
  tiros: "Tiros",
  longao: "Longão",
  ritmo: "Treino de ritmo",
  recuperacao: "Recuperação",
};

export const ACTIVITY_LABEL: Record<string, string> = {
  sedentario: "Sedentário",
  leve: "Levemente ativo (1–3x/sem)",
  moderado: "Moderadamente ativo (3–5x/sem)",
  intenso: "Muito ativo (6–7x/sem)",
  muito_intenso: "Extremamente ativo (2x/dia)",
};

export const GOAL_LABEL: Record<string, string> = {
  emagrecimento: "Emagrecimento",
  manutencao: "Manutenção",
  ganho_massa: "Ganho de massa muscular",
};

export async function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const { inClaude, useCap } = await import("./claudeRuntime");
  if (inClaude()) {
    const downloads = await useCap<any>("downloads");
    if (!downloads) throw new Error("Download indisponível nesta visualização.");
    try {
      await downloads.save({ filename: name, data: (type.startsWith("text/csv") ? "\ufeff" : "") + content });
    } catch (e: any) {
      if (e?.code === "declined") return;
      throw new Error("Não foi possível baixar o arquivo.");
    }
    return;
  }
  const blob = new Blob(["\ufeff" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => c !== "user_id");
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
}

/** Reduz imagens antes do envio (máx. 1280 px, JPEG). */
export async function compressImage(file: File, max = 1280): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Não foi possível ler a imagem."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}
