import { Link } from "react-router-dom";
import { Activity as ActivityIcon, ArrowRight, Bot, CalendarDays, Check, Dumbbell, Flame, Footprints, Salad, Scale, Target, Utensils } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useData } from "@/hooks/useData";
import { backend } from "@/lib/backend";
import { ageFromBirth, targetCalories } from "@/lib/calc";
import { getActivePlan, getPlanMeals, sumLogs, toggleMealDone } from "@/lib/nutrition";
import type { Activity, BodyMeasurement, Meal, MealLog, RunningSession, WaterEntry, WorkoutDay, WorkoutPlan, WorkoutSession } from "@/lib/types";
import { addDays, cn, lastPerDate, fmtDate, fmtNum, MEAL_LABEL, today, weekStart, WEEKDAYS } from "@/lib/utils";
import { Badge, Button, Card, CardTitle, Empty, PageLoader, Progress, Ring } from "@/components/ui";
import { AreaTrend, BarTrend } from "@/components/charts";
import { WaterCard } from "@/components/WaterCard";
import { useAction } from "@/components/feedback";

export default function Dashboard() {
  const { profile } = useAuth();
  const date = today();
  const wStart = weekStart(date);
  const { run } = useAction();

  const { data, loading, reload, error } = useData(async () => {
    const since90 = addDays(date, -90);
    const since7 = addDays(date, -6);
    const [plan, logs7, measurements, plans, sessions, runs, water7, activity] = await Promise.all([
      getActivePlan(),
      backend.list<MealLog>("meal_logs", { gte: { date: since7 } }),
      backend.list<BodyMeasurement>("body_measurements", { gte: { date: since90 }, order: [["date", "asc"]] }),
      backend.list<WorkoutPlan>("workout_plans", { eq: { active: true } }),
      backend.list<WorkoutSession>("workout_sessions", { gte: { started_at: wStart } }),
      profile?.running_enabled ? backend.list<RunningSession>("running_sessions", { gte: { date: wStart } }) : Promise.resolve([]),
      backend.list<WaterEntry>("water_tracking", { gte: { date: since7 } }),
      backend.list<Activity>("daily_activity", { order: [["created_at", "desc"]], limit: 8 }),
    ]);
    const meals = plan ? await getPlanMeals(plan.id) : [];
    const days = plans.length ? await backend.list<WorkoutDay>("workout_days", { in: { plan_id: plans.map((p) => p.id) }, order: [["position", "asc"]] }) : [];
    return { plan, meals, logs7, measurements, days, sessions, runs, water7, activity };
  }, [date, profile?.running_enabled]);

  if (loading) return <PageLoader />;
  if (error || !data || !profile) return <Empty title="Não foi possível carregar o painel" text={error ?? undefined} action={<Button onClick={reload}>Tentar novamente</Button>} />;

  const age = ageFromBirth(profile.birth_date);
  const lastWeight = [...data.measurements].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? profile.weight_kg;
  const recommended = data.plan?.target_calories ?? targetCalories({ ...profile, age, goal: undefined });
  const todayLogs = data.logs7.filter((l) => l.date === date);
  const consumed = sumLogs(todayLogs);
  const weekday = new Date().getDay();
  const todaysWorkouts = data.days.filter((d) => d.weekdays.includes(weekday));
  const doneToday = data.sessions.filter((s) => s.finished_at && today(new Date(s.started_at)) === date);
  const plannedPerWeek = data.days.reduce((a, d) => a + d.weekdays.length, 0);
  const doneThisWeek = data.sessions.filter((s) => s.finished_at).length;
  const runsDone = data.runs.filter((r) => r.status === "done");
  const kmWeek = runsDone.reduce((a, r) => a + Number(r.distance_km), 0);
  const todayRuns = data.runs.filter((r) => r.date === date);

  const weightChart = lastPerDate(data.measurements.filter((m) => m.weight_kg != null)).map((m) => ({ d: fmtDate(m.date, "dd/MM"), kg: Number(m.weight_kg) }));
  const kcalChart = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i - 6);
    return { d: WEEKDAYS[new Date(d + "T12:00").getDay()], kcal: Math.round(sumLogs(data.logs7.filter((l) => l.date === d)).calories) };
  });
  const waterGoal = profile.water_goal_ml;
  const waterDays = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)).filter(
    (d) => data.water7.filter((w) => w.date === d).reduce((a, w) => a + w.amount_ml, 0) >= waterGoal,
  ).length;
  const mealDays = new Set(data.logs7.map((l) => l.date)).size;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const toggle = (m: Meal) =>
    run("meal", async () => {
      await toggleMealDone(m, date, todayLogs);
      await reload();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDate(date, "EEEE, dd 'de' MMMM")}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greet}, <span className="text-brand">{profile.full_name.split(" ")[0] || "atleta"}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/calendario">
            <Button variant="secondary" size="sm">
              <CalendarDays className="h-4 w-4" /> Calendário
            </Button>
          </Link>
          <Link to="/assistente">
            <Button size="sm">
              <Bot className="h-4 w-4" /> Assistente IA
            </Button>
          </Link>
        </div>
      </div>

      {/* Indicadores principais */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col items-center gap-5 sm:flex-row md:col-span-2">
          <Ring value={consumed.calories} max={recommended ?? 0} size={132} stroke={12}>
            <Flame className="mb-0.5 h-4 w-4 text-brand" />
            <span className="text-2xl font-bold">{fmtNum(consumed.calories)}</span>
            <span className="text-[11px] text-muted">de {recommended ? fmtNum(recommended) : "—"} kcal</span>
          </Ring>
          <div className="w-full flex-1 space-y-3">
            <div>
              <p className="text-xs text-muted">Calorias diárias recomendadas</p>
              <p className="text-lg font-semibold">{recommended ? `${fmtNum(recommended)} kcal` : "Complete seu perfil"}</p>
              {!data.plan && recommended && <p className="text-[11px] text-muted">Estimativa de manutenção. Gere sua dieta para uma meta personalizada.</p>}
            </div>
            {data.plan && (
              <div className="grid grid-cols-3 gap-3 text-xs">
                {[
                  ["Proteínas", consumed.protein_g, data.plan.protein_g],
                  ["Carbos", consumed.carbs_g, data.plan.carbs_g],
                  ["Gorduras", consumed.fat_g, data.plan.fat_g],
                ].map(([l, v, m]) => (
                  <div key={l as string} className="min-w-0">
                    <div className="mb-1 flex flex-col text-muted sm:flex-row sm:justify-between">
                      <span className="truncate">{l}</span>
                      <span className="text-ink/80">
                        {fmtNum(v as number)}/{fmtNum(m as number)}g
                      </span>
                    </div>
                    <Progress value={v as number} max={m as number} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle icon={<Scale className="h-4 w-4 text-brand" />}>Peso</CardTitle>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold">{fmtNum(lastWeight, 1)}</span>
            <span className="mb-1 text-sm text-muted">kg</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Target className="h-4 w-4" />
            Meta: {profile.goal_weight_kg ? `${fmtNum(profile.goal_weight_kg, 1)} kg` : "não definida"}
          </div>
          {profile.goal_weight_kg && lastWeight && (
            <p className="mt-1 text-xs text-muted">
              {Math.abs(lastWeight - profile.goal_weight_kg) < 0.1 ? "Meta atingida! 🎉" : `Faltam ${fmtNum(Math.abs(lastWeight - profile.goal_weight_kg), 1)} kg`}
            </p>
          )}
          <Link to="/evolucao" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">
            Registrar medidas <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Treino de hoje */}
        <Card>
          <CardTitle icon={<Dumbbell className="h-4 w-4 text-brand" />} action={<Link to="/treinos" className="text-xs text-muted hover:text-ink">Ver treinos</Link>}>
            Treino de hoje
          </CardTitle>
          {todaysWorkouts.length === 0 && todayRuns.length === 0 ? (
            <p className="text-sm text-muted">Nenhum treino programado para hoje. Dia de descanso ou organize sua divisão em Treinos.</p>
          ) : (
            <div className="space-y-2">
              {todaysWorkouts.map((d) => {
                const done = doneToday.some((s) => s.workout_day_id === d.id);
                return (
                  <div key={d.id} className="flex items-center justify-between rounded-xl bg-surface2 p-3">
                    <div>
                      <p className="text-sm font-semibold">{d.label}</p>
                      <p className="text-xs text-muted">{d.name || "Musculação"}</p>
                    </div>
                    {done ? (
                      <Badge tone="brand">
                        <Check className="h-3 w-3" /> Concluído
                      </Badge>
                    ) : (
                      <Link to={`/treinos/executar/${d.id}`}>
                        <Button size="sm">Iniciar</Button>
                      </Link>
                    )}
                  </div>
                );
              })}
              {todayRuns.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-surface2 p-3">
                  <div className="flex items-center gap-2">
                    <Footprints className="h-4 w-4 text-brand" />
                    <div>
                      <p className="text-sm font-semibold">Corrida · {fmtNum(r.distance_km, 1)} km</p>
                      <p className="text-xs text-muted">{r.status === "planned" ? "Planejada" : "Realizada"}</p>
                    </div>
                  </div>
                  {r.status === "done" && <Badge tone="brand">Feita</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Refeições de hoje */}
        <Card className="lg:col-span-1">
          <CardTitle icon={<Utensils className="h-4 w-4 text-brand" />} action={<Link to="/nutricao" className="text-xs text-muted hover:text-ink">Ver dieta</Link>}>
            Refeições de hoje
          </CardTitle>
          {data.meals.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Você ainda não tem um plano alimentar ativo.</p>
              <Link to="/nutricao">
                <Button size="sm" variant="secondary">
                  <Salad className="h-4 w-4" /> Criar plano
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {data.meals.map((m) => {
                const done = todayLogs.some((l) => l.meal_id === m.id);
                return (
                  <li key={m.id}>
                    <button onClick={() => toggle(m)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface2">
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", done ? "border-brand bg-brand text-onbrand" : "border-line")}>
                        {done && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", done && "text-muted line-through")}>{MEAL_LABEL[m.meal_type] ?? m.name}</span>
                      </span>
                      <span className="text-xs text-muted">{m.time ?? ""}</span>
                      <span className="w-16 text-right text-xs text-muted">{fmtNum(m.calories)} kcal</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <WaterCard />
      </div>

      {/* Progresso semanal */}
      <Card>
        <CardTitle icon={<ActivityIcon className="h-4 w-4 text-brand" />}>Progresso da semana</CardTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <WeekStat label="Treinos de musculação" value={doneThisWeek} max={plannedPerWeek} />
          {profile.running_enabled && <WeekStat label="Km corridos" value={kmWeek} max={0} unit="km" />}
          <WeekStat label="Dias com refeições registradas" value={mealDays} max={7} />
          <WeekStat label="Dias com meta de água" value={waterDays} max={7} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Evolução do peso (90 dias)</CardTitle>
          {weightChart.length >= 2 ? <AreaTrend data={weightChart} x="d" y="kg" unit="kg" name="Peso" /> : <p className="py-10 text-center text-sm text-muted">Registre seu peso em Evolução para ver o gráfico.</p>}
        </Card>
        <Card>
          <CardTitle>Calorias consumidas (7 dias)</CardTitle>
          {kcalChart.some((k) => k.kcal > 0) ? <BarTrend data={kcalChart} x="d" y="kcal" unit="kcal" name="Calorias" /> : <p className="py-10 text-center text-sm text-muted">Marque refeições como realizadas para acompanhar.</p>}
        </Card>
      </div>

      <Card>
        <CardTitle>Atividades recentes</CardTitle>
        {data.activity.length === 0 ? (
          <p className="text-sm text-muted">Suas atividades aparecerão aqui.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{a.title}</span>
                <span className="text-xs text-muted">{fmtDate(a.date, "dd/MM")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WeekStat({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">
        {fmtNum(value, 1)}
        {max > 0 && <span className="text-sm font-medium text-muted">/{max}</span>}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </p>
      {max > 0 && <Progress value={value} max={max} className="mt-2" />}
    </div>
  );
}
