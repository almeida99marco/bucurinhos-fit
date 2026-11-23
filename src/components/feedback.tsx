import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Button, Modal } from "./ui";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ConfirmOpts = { title: string; text?: string; confirmLabel?: string; danger?: boolean };

const Ctx = createContext<{
  toast: (text: string, kind?: Toast["kind"]) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}>({ toast: () => {}, confirm: async () => false });

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const idRef = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => {
    setConfirm(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    setConfirm(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur animate-in",
              t.kind === "success" && "border-brand/30 bg-surface/95 text-ink",
              t.kind === "error" && "border-red-500/40 bg-surface/95 text-red-700",
              t.kind === "info" && "border-line bg-surface/95 text-ink",
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />}
            {t.kind === "error" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
            {t.kind === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title ?? ""}>
        <div className="space-y-5">
          {confirmState?.text && (
            <p className="flex gap-2 text-sm text-muted">
              {confirmState.danger && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
              {confirmState.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={confirmState?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {confirmState?.confirmLabel ?? "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export const useFeedback = () => useContext(Ctx);

/** Executa uma ação assíncrona exibindo erro amigável. */
export function useAction() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Algo deu errado. Tente novamente.", "error");
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}
