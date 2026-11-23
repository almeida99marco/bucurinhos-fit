import { Droplets, Undo2 } from "lucide-react";
import { backend } from "@/lib/backend";
import type { WaterEntry } from "@/lib/types";
import { fmtNum, today } from "@/lib/utils";
import { useData, logActivity } from "@/hooks/useData";
import { useAction } from "./feedback";
import { Button, Card, CardTitle, Progress } from "./ui";
import { useAuth } from "@/hooks/useAuth";

export function WaterCard({ onChange }: { onChange?: () => void }) {
  const { profile } = useAuth();
  const date = today();
  const { data, reload } = useData(() => backend.list<WaterEntry>("water_tracking", { eq: { date }, order: [["created_at", "asc"]] }), [date]);
  const { busy, run } = useAction();
  const total = (data ?? []).reduce((a, w) => a + w.amount_ml, 0);
  const goal = profile?.water_goal_ml ?? 2500;

  const add = (ml: number) =>
    run(`add${ml}`, async () => {
      await backend.insert("water_tracking", { date, amount_ml: ml });
      const after = total + ml;
      if (total < goal && after >= goal) logActivity("agua", `Meta de água atingida (${fmtNum(after)} ml)`);
      await reload();
      onChange?.();
    });
  const undo = () =>
    run("undo", async () => {
      const last = (data ?? [])[data!.length - 1];
      if (last) await backend.remove("water_tracking", last.id);
      await reload();
      onChange?.();
    });

  return (
    <Card>
      <CardTitle icon={<Droplets className="h-4 w-4 text-sky-400" />} action={<span className="text-xs text-muted">Meta {fmtNum(goal / 1000, 1)} L</span>}>
        Hidratação
      </CardTitle>
      <div className="mb-2 flex items-end gap-1">
        <span className="text-3xl font-bold">{fmtNum(total / 1000, 2)}</span>
        <span className="mb-1 text-sm text-muted">L hoje</span>
      </div>
      <Progress value={total} max={goal} />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[200, 300, 500].map((ml) => (
          <Button key={ml} variant="secondary" size="sm" onClick={() => add(ml)} loading={busy === `add${ml}`}>
            +{ml}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={undo} disabled={!data?.length} loading={busy === "undo"} aria-label="Desfazer último registro">
          <Undo2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
