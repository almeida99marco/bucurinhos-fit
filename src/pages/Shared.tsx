import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import { backend } from "@/lib/backend";
import { useData } from "@/hooks/useData";
import type { BodyMeasurement, MealPlan, ProgressPhoto, RunningSession, WorkoutSession } from "@/lib/types";
import { lastPerDate, fmtDate, fmtDuration, fmtNum, fmtPace, RUN_TYPES } from "@/lib/utils";
import { Badge, Button, Card, CardTitle, Empty, PageHeader, PageLoader } from "@/components/ui";
import { AreaTrend } from "@/components/charts";
import { PlanViewer } from "./Nutrition";
import { PhotoImg } from "./Progress";

const SCOPE_LABEL: Record<string, string> = { evolucao: "Evolução", fotos: "Fotos", treinos: "Treinos", corrida: "Corrida", nutricao: "Nutrição" };

type Share = { id: string; full_name: string; email: string; direction: string; scopes: string[] };

export default function Shared() {
  const { data, loading } = useData(() => backend.rpc<Share[]>("shared_profiles", {}), []);
  const incoming = (data ?? []).filter((s) => s.direction === "incoming");
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (!sel && incoming[0]) setSel(incoming[0].id);
  }, [incoming, sel]);
  if (loading) return <PageLoader />;
  const person = incoming.find((s) => s.id === sel);
  return (
    <div className="space-y-5">
      <PageHeader title="Compartilhados comigo" subtitle="Dados que outras contas autorizaram você a visualizar (somente leitura)." />
      {!incoming.length ? (
        <Empty icon={<Users className="h-8 w-8" />} title="Nada compartilhado com você" text="Quando outra conta autorizar o compartilhamento no Perfil dela, os dados aparecerão aqui." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {incoming.map((s) => (
              <Button key={s.id} size="sm" variant={sel === s.id ? "primary" : "secondary"} onClick={() => setSel(s.id)}>
                {s.full_name || s.email}
              </Button>
            ))}
          </div>
          {person && <PersonView person={person} />}
        </>
      )}
    </div>
  );
}

function PersonView({ person }: { person: Share }) {
  const has = (s: string) => person.scopes.includes(s);
  const { data, loading } = useData(async () => {
    const o = person.id;
    const [ms, sessions, runs, plans, photos] = await Promise.all([
      has("evolucao") ? backend.list<BodyMeasurement>("body_measurements", { ownerId: o, order: [["date", "asc"]] }) : Promise.resolve([]),
      has("treinos") ? backend.list<WorkoutSession>("workout_sessions", { ownerId: o, order: [["started_at", "desc"]], limit: 15 }) : Promise.resolve([]),
      has("corrida") ? backend.list<RunningSession>("running_sessions", { ownerId: o, eq: { status: "done" }, order: [["date", "desc"]], limit: 15 }) : Promise.resolve([]),
      has("nutricao") ? backend.list<MealPlan>("meal_plans", { ownerId: o, eq: { status: "active" } }) : Promise.resolve([]),
      has("fotos") ? backend.list<ProgressPhoto>("progress_photos", { ownerId: o, order: [["date", "desc"]], limit: 12 }) : Promise.resolve([]),
    ]);
    return { ms, sessions, runs, plans, photos };
  }, [person.id, person.scopes.join()]);
  const [planOpen, setPlanOpen] = useState<MealPlan | null>(null);
  if (loading || !data) return <PageLoader />;
  const w = lastPerDate(data.ms.filter((m) => m.weight_kg != null)).map((m) => ({ d: fmtDate(m.date, "dd/MM"), kg: Number(m.weight_kg) }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {person.scopes.map((s) => (
          <Badge key={s} tone="brand">
            <Eye className="h-3 w-3" /> {SCOPE_LABEL[s] ?? s}
          </Badge>
        ))}
      </div>
      {has("evolucao") && (
        <Card>
          <CardTitle>Evolução do peso</CardTitle>
          {w.length > 1 ? <AreaTrend data={w} x="d" y="kg" unit="kg" name="Peso" /> : <p className="text-sm text-muted">Poucos registros.</p>}
        </Card>
      )}
      {has("treinos") && (
        <Card>
          <CardTitle>Treinos recentes</CardTitle>
          {data.sessions.length === 0 ? (
            <p className="text-sm text-muted">Sem treinos registrados.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.sessions.map((s) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>{s.title}</span>
                  <span className="text-xs text-muted">
                    {fmtDate(s.started_at.slice(0, 10))} · {fmtDuration(s.duration_seconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {has("corrida") && (
        <Card>
          <CardTitle>Corridas recentes</CardTitle>
          {data.runs.length === 0 ? (
            <p className="text-sm text-muted">Sem corridas registradas.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.runs.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span>
                    {fmtNum(r.distance_km, 2)} km · {RUN_TYPES[r.type]}
                  </span>
                  <span className="text-xs text-muted">
                    {fmtDate(r.date)} · {fmtPace(r.pace_seconds_per_km)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {has("nutricao") && (
        <Card>
          <CardTitle>Plano alimentar ativo</CardTitle>
          {data.plans[0] ? (
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {data.plans[0].title} · {fmtNum(data.plans[0].total_calories)} kcal
              </span>
              <Button size="sm" variant="secondary" onClick={() => setPlanOpen(data.plans[0])}>
                Ver
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Sem plano ativo.</p>
          )}
        </Card>
      )}
      {has("fotos") && (
        <Card>
          <CardTitle>Fotos de evolução</CardTitle>
          {data.photos.length === 0 ? (
            <p className="text-sm text-muted">Sem fotos.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.photos.map((p) => (
                <PhotoImg key={p.id} photo={p} />
              ))}
            </div>
          )}
        </Card>
      )}
      <PlanViewer plan={planOpen} onClose={() => setPlanOpen(null)} ownerId={person.id} />
    </div>
  );
}
