import { useEffect, useRef } from "react";
import { backend } from "@/lib/backend";
import type { NotificationRule } from "@/lib/types";
import { today } from "@/lib/utils";
import { useAuth } from "./useAuth";
import { useFeedback } from "@/components/feedback";

/**
 * Dispara os lembretes configurados enquanto o app está aberto
 * (notificação do navegador quando permitida; caso contrário, aviso dentro do app).
 * Para notificações com o app fechado, a arquitetura está pronta para Web Push numa próxima versão.
 */
export function useReminders() {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const rules = useRef<NotificationRule[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      backend
        .list<NotificationRule>("notifications", { eq: { enabled: true } })
        .then((r) => alive && (rules.current = r))
        .catch(() => undefined);
    load();
    const reloadT = setInterval(load, 5 * 60_000);
    const onChange = () => load();
    window.addEventListener("bfit:reminders-changed", onChange);

    const tick = async () => {
      const now = new Date();
      const day = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      for (const r of rules.current) {
        if (!r.enabled || !r.weekdays.includes(day)) continue;
        const [h, m] = r.time_of_day.split(":").map(Number);
        const target = h * 60 + m;
        const sentToday = r.last_sent_at && today(new Date(r.last_sent_at)) === today(now);
        if (mins >= target && mins - target <= 10 && !sentToday) {
          r.last_sent_at = now.toISOString();
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("Bucurinho's Fit", { body: r.title });
            } catch {
              toast(`⏰ ${r.title}`, "info");
            }
          } else toast(`⏰ ${r.title}`, "info");
          backend.update("notifications", r.id, { last_sent_at: r.last_sent_at }).catch(() => undefined);
        }
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(reloadT);
      window.removeEventListener("bfit:reminders-changed", onChange);
    };
  }, [user, toast]);
}
