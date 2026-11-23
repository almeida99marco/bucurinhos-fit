import { DependencyList, useCallback, useEffect, useRef, useState } from "react";
import { backend } from "@/lib/backend";
import { today } from "@/lib/utils";

/** Carrega dados assíncronos com estados de carregamento/erro e função de recarga. */
export function useData<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const d = await loader();
      if (n === seq.current) setData(d);
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, setData, loading, error, reload };
}

/** Registra um evento no histórico de atividades. */
export function logActivity(kind: string, title: string, opts: { ref_id?: string | null; details?: unknown; date?: string } = {}) {
  return backend
    .insert("daily_activity", { kind, title, ref_id: opts.ref_id ?? null, details: opts.details ?? {}, date: opts.date ?? today() })
    .catch(() => undefined);
}

/** Salvamento automático com debounce. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, enabled: boolean, delay = 900) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  const json = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setState("saving");
      try {
        await saveRef.current(JSON.parse(json));
        setState("saved");
      } catch {
        setState("error");
      }
    }, delay);
    return () => clearTimeout(t);
  }, [json, enabled, delay]);
  return state;
}
