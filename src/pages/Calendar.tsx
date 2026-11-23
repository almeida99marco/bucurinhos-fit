import { useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BedDouble, ChevronLeft, ChevronRight, Droplets, Dumbbell, Footprints, Utensils } from "lucide-react";
import { backend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { logActivity, useData } from "@/hooks/useData";
import { getActivePlan, getPlanMeals } from "@/lib/nutrition";
import type { Activity, MealLog, RunningSession, WaterEntry, WorkoutDay, WorkoutPlan, WorkoutSession } from "@/lib/types";
import { addDays, cn, fmtDate, fmtNum, MEAL_LABEL, RUN_TYPES, today, weekStart, WEEKDAYS } from "@/lib/utils";
import { Button, Card, CardTitle, PageHeader, PageLoader, Tabs } from "@/components/ui";
import { useAction } from "@/components/feedback";

type View = "semana" | "mes";

export default function CalendarPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("semana");
  const [anchor, setAnchor] = useState(today());
  const [selected, setSelected] = useState(today());
  const { run, busy } = useAction();

  const range = view === "semana" ? [weekStart(anchor), addDays(weekStart(anchor), 6)] : rangeOfMonth(anchor);
  const { data, loading, reload } = useData(async () => {
    const [from, to] = range;
    const [plans, sessions, runs, logs, water, acts, plan] = await Promise.all([
      backend.list<WorkoutPlan>("workout_plans", { eq: { active: true } }),
      backend.list<WorkoutSession>("workout_sessions", { gte: { started_at: from }, lte: { started_at: to + "T23:59:59.999Z" } }),
      profile?.running_enabled ? backend.list<RunningSession>("running_sessions", { gte: { date: from }, lte: { date: to } }) : Promise.resolve([]),
      backend.list<MealLog>("meal_logs", { gte: { date: from }, lte: { date: to } }),
      backend.list<WaterEntry>("water_tracking", { gte: { date: from }, lte: { date: to } }),
      backend.list<Activity>("daily_activity", { gte: { date: from }, lte: { date: to }, order: [["created_at", "asc"]] }),
      getActivePlan(),
    ]);
    const days = plans.length ? await backend.list<WorkoutDay>("workout_days", { in: { plan_id: plans.map((p) => p.id) } }) : [];
    const meals = plan ? await getPlanMeals(plan.id) : [];
    return { days, sessions, runs, logs, water, acts, meals };
  }, [range[0], range[1], profile?.running_enabled]);

  const dayInfo = (iso: string) => {
    const wd = new Date(iso + "T12:00").getDay();
    const d = data!;
    const workouts = d.days.filter((x) => x.weekdays.includes(wd));
    const sessions = d.sessions.filter((s) => s.finished_at && today(new Date(s.started_at)) === iso);
    const runs = d.runs.filter((r) => r.date === iso);
    const mealsDone = d.logs.filter((l) => l.date === iso && l.meal_id).length;
    const water = d.water.filter((w) => w.date === iso).reduce((a, w) => a + w.amount_ml, 0);
    const acts = d.acts.filter((a) => a.date === iso);
    const rest = !workouts.length && !runs.length;
    return { workouts, sessions, runs, mealsDone, water, acts, rest, restLogged: acts.some((a) => a.kind === "descanso") };
  };

  const shift = (n: number) => {
    const next = view === "semana" ? addDays(anchor, 7 * n) : today(addMonths(new Date(anchor + "T12:00"), n));
    setAnchor(next);
  };

  const title = view === "semana" ? `${fmtDate(range[0], "dd MMM")} – ${fmtDate(range[1], "dd MMM yyyy")}` : format(new Date(anchor + "T12:00"), "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-5">
      <PageHeader title="Calendário e rotina" subtitle="Musculação, corridas, refeições, hidratação e descanso em um só lugar." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-semibold capitalize">{title}</span>
          <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Próximo">
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setAnchor(today()); setSelected(today()); }}>
            Hoje
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <PageLoader />
      ) : (
        <>
          {view === "semana" ? (
            <div className="grid gap-2 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => addDays(range[0], i)).map((iso) => {
                const info = dayInfo(iso);
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso)}
                    className={cn("rounded-2xl border bg-surface p-3 text-left transition hover:border-brand/40", selected === iso ? "border-brand" : "border-line", iso === today() && "ring-1 ring-brand/40")}
                  >
                    <p className="text-xs capitalize text-muted">{fmtDate(iso, "EEE")}</p>
                    <p className="text-lg font-bold">{fmtDate(iso, "dd")}</p>
                    <div className="mt-2 space-y-1 text-[11px]">
                      {info.workouts.map((w) => (
                        <Chip key={w.id} done={info.sessions.some((s) => s.workout_day_id === w.id)} icon={<Dumbbell className="h-3 w-3" />}>
                          {w.label}
                        </Chip>
                      ))}
                      {info.runs.map((r) => (
                        <Chip key={r.id} done={r.status === "done"} icon={<Footprints className="h-3 w-3" />}>
                          {fmtNum(r.distance_km, 1)} km
                        </Chip>
                      ))}
                      {info.rest && <Chip done={info.restLogged} icon={<BedDouble className="h-3 w-3" />}>Descanso</Chip>}
                      {data.meals.length > 0 && (
                        <Chip done={info.mealsDone >= data.meals.length} icon={<Utensils className="h-3 w-3" />}>
                          {info.mealsDone}/{data.meals.length}
                        </Chip>
                      )}
                      <Chip done={info.water >= (profile?.water_goal_ml ?? 2500)} icon={<Droplets className="h-3 w-3" />}>
                        {fmtNum(info.water / 1000, 1)} L
                      </Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <MonthGrid anchor={anchor} selected={selected} onSelect={setSelected} dayInfo={dayInfo} />
          )}

          {/* Detalhe do dia */}
          {(() => {
            const info = dayInfo(selected);
            return (
              <Card>
                <CardTitle>{fmtDate(selected, "EEEE, dd 'de' MMMM")}</CardTitle>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Programado</p>
                    {info.workouts.map((w) => (
                      <p key={w.id} className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-brand" /> {w.label} {w.name && `— ${w.name}`} {info.sessions.some((s) => s.workout_day_id === w.id) && "✓"}
                      </p>
                    ))}
                    {info.runs.map((r) => (
                      <p key={r.id} className="flex items-center gap-2">
                        <Footprints className="h-4 w-4 text-brand" /> {RUN_TYPES[r.type]} · {fmtNum(r.distance_km, 1)} km {r.status === "done" ? "✓" : "(planejada)"}
                      </p>
                    ))}
                    {data.meals.map((m) => (
                      <p key={m.id} className="flex items-center gap-2 text-muted">
                        <Utensils className="h-4 w-4" /> {m.time ? `${m.time} · ` : ""}
                        {MEAL_LABEL[m.meal_type]}
                      </p>
                    ))}
                    <p className="flex items-center gap-2 text-muted">
                      <Droplets className="h-4 w-4 text-sky-400" /> Meta de hidratação: {fmtNum((profile?.water_goal_ml ?? 2500) / 1000, 1)} L ({fmtNum(info.water / 1000, 2)} L registrados)
                    </p>
                    {info.rest && (
                      <div className="flex items-center gap-2">
                        <BedDouble className="h-4 w-4 text-brand" /> Dia de descanso
                        {!info.restLogged && selected <= today() && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busy === "rest"}
                            onClick={() =>
                              run("rest", async () => {
                                await logActivity("descanso", "Dia de descanso", { date: selected });
                                reload();
                              }, "Descanso registrado.")
                            }
                          >
                            Registrar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Histórico de atividades</p>
                    {info.acts.length === 0 ? (
                      <p className="text-sm text-muted">Nenhuma atividade registrada neste dia.</p>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {info.acts.map((a) => (
                          <li key={a.id} className="flex justify-between gap-2">
                            <span>{a.title}</span>
                            <span className="text-xs text-muted">{new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}

function rangeOfMonth(anchor: string): [string, string] {
  const m = startOfMonth(new Date(anchor + "T12:00"));
  return [today(m), today(endOfMonth(m))];
}

function Chip({ children, icon, done }: { children: React.ReactNode; icon: React.ReactNode; done?: boolean }) {
  return <span className={cn("flex items-center gap-1 truncate rounded-md px-1.5 py-0.5", done ? "bg-brand-soft text-brand" : "bg-surface2 text-muted")}>{icon}{children}</span>;
}

function MonthGrid({ anchor, selected, onSelect, dayInfo }: { anchor: string; selected: string; onSelect: (d: string) => void; dayInfo: (iso: string) => any }) {
  const month = startOfMonth(new Date(anchor + "T12:00"));
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const end = endOfMonth(month);
  const cells: string[] = [];
  for (let d = new Date(start); d <= end || cells.length % 7; d.setDate(d.getDate() + 1)) cells.push(today(d));
  return (
    <Card className="p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => (
          <div key={i}>{WEEKDAYS[i]}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso) => {
          const inMonth = new Date(iso + "T12:00").getMonth() === month.getMonth();
          const info = inMonth ? dayInfo(iso) : null;
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              className={cn(
                "flex min-h-[58px] flex-col rounded-xl border p-1.5 text-left text-xs",
                inMonth ? "border-line bg-surface2" : "border-transparent opacity-30",
                selected === iso && "border-brand",
                iso === today() && "ring-1 ring-brand/50",
              )}
            >
              <span className="text-muted">{Number(iso.slice(8))}</span>
              {info && (
                <div className="mt-auto flex flex-wrap gap-0.5">
                  {info.workouts.length > 0 && <Dot done={info.sessions.length > 0} />}
                  {info.runs.map((r: RunningSession) => (
                    <Dot key={r.id} done={r.status === "done"} blue />
                  ))}
                  {info.rest && info.restLogged && <span className="h-1.5 w-1.5 rounded-full bg-muted" />}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1"><Dot done /> Musculação</span>
        <span className="flex items-center gap-1"><Dot done blue /> Corrida</span>
        <span className="flex items-center gap-1"><Dot /> Programado (não feito)</span>
      </div>
    </Card>
  );
}

function Dot({ done, blue }: { done?: boolean; blue?: boolean }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full", done ? (blue ? "bg-sky-400" : "bg-brand") : "border border-muted")} />;
}
