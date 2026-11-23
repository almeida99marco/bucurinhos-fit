import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, BookOpen, Dumbbell, History, Pencil, Play, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { backend } from "@/lib/backend";
import { useData } from "@/hooks/useData";
import type { Exercise, LibraryItem, WorkoutDay, WorkoutPlan, WorkoutSession, WorkoutSet } from "@/lib/types";
import { cn, fmtDate, fmtDuration, fmtNum, toNum, WEEKDAYS } from "@/lib/utils";
import { MUSCLE_GROUPS } from "@/lib/exerciseLibrary";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { AreaTrend, BarTrend } from "@/components/charts";

type Tab = "ficha" | "historico" | "forca" | "biblioteca";

export default function Workouts() {
  const [tab, setTab] = useState<Tab>("ficha");
  return (
    <div className="space-y-5">
      <PageHeader title="Treinos" subtitle="Sua ficha de musculação, execução e evolução de força." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "ficha", label: "Minha ficha" },
          { value: "historico", label: "Histórico" },
          { value: "forca", label: "Evolução de força" },
          { value: "biblioteca", label: "Biblioteca" },
        ]}
      />
      {tab === "ficha" && <PlanTab />}
      {tab === "historico" && <HistoryTab />}
      {tab === "forca" && <StrengthTab />}
      {tab === "biblioteca" && <LibraryTab />}
    </div>
  );
}

// ------------------------------------------------------------------ FICHA
function PlanTab() {
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const [planId, setPlanId] = useState<string | null>(null);
  const { data: plans, loading, reload: reloadPlans } = useData(() => backend.list<WorkoutPlan>("workout_plans", { order: [["created_at", "desc"]] }), []);
  useEffect(() => {
    if (plans && (!planId || !plans.some((p) => p.id === planId))) setPlanId(plans.find((p) => p.active)?.id ?? plans[0]?.id ?? null);
  }, [plans, planId]);
  const { data, reload } = useData(async () => {
    if (!planId) return { days: [] as WorkoutDay[], exercises: [] as Exercise[] };
    const days = await backend.list<WorkoutDay>("workout_days", { eq: { plan_id: planId }, order: [["position", "asc"]] });
    const exercises = days.length ? await backend.list<Exercise>("exercises", { in: { workout_day_id: days.map((d) => d.id) }, order: [["position", "asc"]] }) : [];
    return { days, exercises };
  }, [planId]);
  const [newOpen, setNewOpen] = useState(false);
  const [exModal, setExModal] = useState<{ day: WorkoutDay; ex?: Exercise } | null>(null);
  const [editPlan, setEditPlan] = useState<WorkoutPlan | null>(null);

  if (loading) return <PageLoader />;
  const plan = plans?.find((p) => p.id === planId);

  if (!plans?.length)
    return (
      <>
        <Empty
          icon={<Dumbbell className="h-8 w-8" />}
          title="Monte sua ficha de treino"
          text="Crie uma divisão (ex.: A, B, C) e adicione os exercícios. Você também pode pedir uma sugestão ao Assistente IA."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> Criar divisão
              </Button>
              <Link to="/assistente">
                <Button variant="secondary">Sugestão da IA</Button>
              </Link>
            </div>
          }
        />
        <NewPlanModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => { setPlanId(id); reloadPlans(); }} />
      </>
    );

  const moveEx = (ex: Exercise, dir: -1 | 1) =>
    run("move", async () => {
      const list = data!.exercises.filter((e) => e.workout_day_id === ex.workout_day_id);
      const i = list.findIndex((e) => e.id === ex.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      await Promise.all([backend.update("exercises", list[i].id, { position: j }), backend.update("exercises", list[j].id, { position: i })]);
      // normaliza posições
      const reordered = [...list];
      [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
      await Promise.all(reordered.map((e, k) => (e.position !== k ? backend.update("exercises", e.id, { position: k }) : null)));
      reload();
    });

  const toggleWeekday = (d: WorkoutDay, wd: number) =>
    run("wd", async () => {
      const weekdays = d.weekdays.includes(wd) ? d.weekdays.filter((x) => x !== wd) : [...d.weekdays, wd].sort();
      await backend.update("workout_days", d.id, { weekdays });
      reload();
    });

  const addDay = () =>
    run("addday", async () => {
      const n = data!.days.length;
      await backend.insert("workout_days", { plan_id: planId, label: `Treino ${String.fromCharCode(65 + n)}`, name: "", weekdays: [], position: n });
      reload();
    });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Select value={planId ?? ""} onChange={(e) => setPlanId(e.target.value)} className="max-w-xs">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.active ? "• ativa" : ""}
              </option>
            ))}
          </Select>
          {plan?.source === "ai" && <Badge tone="brand">IA</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {plan && !plan.active && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "activate"}
              onClick={() =>
                run("activate", async () => {
                  await Promise.all(plans.filter((p) => p.active).map((p) => backend.update("workout_plans", p.id, { active: false })));
                  await backend.update("workout_plans", plan.id, { active: true });
                  reloadPlans();
                }, "Ficha ativada.")
              }
            >
              Tornar ativa
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => plan && setEditPlan(plan)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> Nova divisão
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.days.map((d) => {
          const exs = data.exercises.filter((e) => e.workout_day_id === d.id);
          return (
            <Card key={d.id}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <DayTitle day={d} onSaved={reload} />
                <div className="flex gap-1">
                  <Link to={`/treinos/executar/${d.id}`}>
                    <Button size="sm" disabled={!exs.length}>
                      <Play className="h-4 w-4" /> Iniciar
                    </Button>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir treino"
                    onClick={async () => {
                      if (await confirm({ title: `Excluir ${d.label}?`, text: "Os exercícios deste treino também serão excluídos.", danger: true, confirmLabel: "Excluir" }))
                        run("delday", async () => {
                          await backend.remove("workout_days", d.id);
                          reload();
                        }, "Treino excluído.");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => toggleWeekday(d, i)}
                    className={cn("rounded-lg px-2 py-1 text-[11px] font-semibold", d.weekdays.includes(i) ? "bg-brand text-onbrand" : "bg-surface2 text-muted hover:text-ink")}
                  >
                    {w}
                  </button>
                ))}
              </div>
              {exs.length === 0 ? (
                <p className="rounded-xl bg-surface2 p-4 text-center text-sm text-muted">Nenhum exercício ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {exs.map((e, i) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-xl bg-surface2 p-2.5">
                      <div className="flex flex-col">
                        <button disabled={i === 0} onClick={() => moveEx(e, -1)} className="text-muted hover:text-ink disabled:opacity-20" aria-label="Subir">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={i === exs.length - 1} onClick={() => moveEx(e, 1)} className="text-muted hover:text-ink disabled:opacity-20" aria-label="Descer">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setExModal({ day: d, ex: e })}>
                        <p className="truncate text-sm font-medium">{e.name}</p>
                        <p className="text-xs text-muted">
                          {e.sets}×{e.reps} · {e.load_kg != null ? `${fmtNum(e.load_kg, 1)} kg` : "sem carga"} · {e.rest_seconds}s
                          {e.muscle_group && ` · ${e.muscle_group}`}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setExModal({ day: d })}>
                <Plus className="h-4 w-4" /> Adicionar exercício
              </Button>
            </Card>
          );
        })}
        <button onClick={addDay} className="flex min-h-[140px] items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted hover:border-brand/40 hover:text-ink">
          <Plus className="h-4 w-4" /> Adicionar treino à divisão
        </button>
      </div>

      <NewPlanModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => { setPlanId(id); reloadPlans(); }} />
      <ExerciseModal state={exModal} onClose={() => setExModal(null)} onSaved={reload} count={exModal ? data!.exercises.filter((e) => e.workout_day_id === exModal.day.id).length : 0} />
      <EditPlanModal plan={editPlan} onClose={() => setEditPlan(null)} onSaved={reloadPlans} />
    </div>
  );
}

function DayTitle({ day, onSaved }: { day: WorkoutDay; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(day.label);
  const [name, setName] = useState(day.name ?? "");
  const { run } = useAction();
  if (editing)
    return (
      <div className="flex flex-1 flex-col gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Rótulo" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Peito e tríceps" aria-label="Nome" />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              run("t", async () => {
                await backend.update("workout_days", day.id, { label: label.trim() || day.label, name: name.trim() });
                setEditing(false);
                onSaved();
              })
            }
          >
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  return (
    <button className="text-left" onClick={() => setEditing(true)}>
      <p className="text-lg font-bold">{day.label}</p>
      <p className="text-sm text-muted">{day.name || "Toque para nomear"}</p>
    </button>
  );
}

function NewPlanModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("Minha divisão");
  const [count, setCount] = useState(3);
  const [goal, setGoal] = useState("");
  const { busy, run } = useAction();
  const create = () =>
    run("c", async () => {
      const others = await backend.list<WorkoutPlan>("workout_plans", { eq: { active: true } });
      await Promise.all(others.map((p) => backend.update("workout_plans", p.id, { active: false })));
      const plan = await backend.insert<WorkoutPlan>("workout_plans", { name: name.trim() || "Minha divisão", goal: goal || null, active: true, source: "manual" });
      await backend.insertMany(
        "workout_days",
        Array.from({ length: count }, (_, i) => ({ plan_id: plan.id, label: `Treino ${String.fromCharCode(65 + i)}`, name: "", weekdays: [], position: i })),
      );
      onClose();
      onCreated(plan.id);
    }, "Divisão criada.");
  return (
    <Modal open={open} onClose={onClose} title="Nova divisão de treino">
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Quantidade de treinos">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => setCount(n)} className={cn("h-10 flex-1 rounded-xl border text-sm font-semibold", count === n ? "border-brand bg-brand text-onbrand" : "border-line text-muted")}>
                {String.fromCharCode(64 + n)}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted">Treinos A até {String.fromCharCode(64 + count)}. Você pode adicionar ou remover depois.</span>
        </Field>
        <Field label="Objetivo (opcional)">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Hipertrofia, força, condicionamento..." />
        </Field>
        <Button className="w-full" onClick={create} loading={busy === "c"}>
          Criar
        </Button>
      </div>
    </Modal>
  );
}

function EditPlanModal({ plan, onClose, onSaved }: { plan: WorkoutPlan | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  useEffect(() => {
    setName(plan?.name ?? "");
    setGoal(plan?.goal ?? "");
    setNotes(plan?.notes ?? "");
  }, [plan]);
  if (!plan) return null;
  return (
    <Modal open onClose={onClose} title="Editar divisão">
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Objetivo">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-between">
          <Button
            variant="danger"
            onClick={async () => {
              if (await confirm({ title: "Excluir divisão?", text: "Todos os treinos e exercícios desta divisão serão excluídos. O histórico de treinos realizados é mantido.", danger: true, confirmLabel: "Excluir" }))
                run("d", async () => {
                  await backend.remove("workout_plans", plan.id);
                  onClose();
                  onSaved();
                }, "Divisão excluída.");
            }}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <Button
            loading={busy === "s"}
            onClick={() =>
              run("s", async () => {
                await backend.update("workout_plans", plan.id, { name: name.trim() || plan.name, goal: goal || null, notes: notes || null });
                onClose();
                onSaved();
              }, "Divisão atualizada.")
            }
          >
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ExerciseModal({ state, onClose, onSaved, count }: { state: { day: WorkoutDay; ex?: Exercise } | null; onClose: () => void; onSaved: () => void; count: number }) {
  const { data: library } = useData(() => backend.list<LibraryItem>("exercise_library", { order: [["name", "asc"]] }), []);
  const empty = { library_id: "", name: "", muscle_group: "", sets: "3", reps: "10", load_kg: "", rest_seconds: "60", notes: "" };
  const [v, setV] = useState(empty);
  const [q, setQ] = useState("");
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  useEffect(() => {
    const e = state?.ex;
    setQ("");
    setV(
      e
        ? { library_id: e.library_id ?? "", name: e.name, muscle_group: e.muscle_group ?? "", sets: String(e.sets), reps: e.reps, load_kg: e.load_kg?.toString() ?? "", rest_seconds: String(e.rest_seconds), notes: e.notes ?? "" }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return (library ?? []).filter((l) => l.name.toLowerCase().includes(s) || l.muscle_group.toLowerCase().includes(s)).slice(0, 6);
  }, [q, library]);
  if (!state) return null;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const save = () =>
    run("s", async () => {
      if (!v.name.trim()) throw new Error("Informe o nome do exercício.");
      const sets = Math.round(toNum(v.sets) ?? 0);
      if (sets < 1 || sets > 20) throw new Error("Séries devem estar entre 1 e 20.");
      const rest = Math.round(toNum(v.rest_seconds) ?? 60);
      const payload = {
        library_id: v.library_id || null,
        name: v.name.trim(),
        muscle_group: v.muscle_group || null,
        sets,
        reps: v.reps.trim() || "10",
        load_kg: toNum(v.load_kg),
        rest_seconds: Math.min(900, Math.max(0, rest)),
        notes: v.notes.trim() || null,
      };
      if (state.ex) await backend.update("exercises", state.ex.id, payload);
      else await backend.insert("exercises", { ...payload, workout_day_id: state.day.id, position: count });
      onClose();
      onSaved();
    }, "Exercício salvo.");
  return (
    <Modal open onClose={onClose} title={state.ex ? "Editar exercício" : `Adicionar em ${state.day.label}`}>
      <div className="space-y-3">
        {!state.ex && (
          <div className="relative">
            <Field label="Buscar na biblioteca">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: supino, agachamento, costas" />
              </div>
            </Field>
            {results.length > 0 && (
              <div className="mt-1 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {results.map((l) => (
                  <button
                    key={l.id}
                    className="flex w-full justify-between bg-surface2 px-3 py-2 text-left text-sm hover:bg-surface"
                    onClick={() => {
                      setV({ ...v, library_id: l.id, name: l.name, muscle_group: l.muscle_group });
                      setQ("");
                    }}
                  >
                    <span>{l.name}</span>
                    <span className="text-xs text-muted">{l.muscle_group}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exercício" className="col-span-2">
            <Input value={v.name} onChange={set("name")} />
          </Field>
          <Field label="Grupo muscular" className="col-span-2">
            <Select value={v.muscle_group} onChange={set("muscle_group")}>
              <option value="">Selecione</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Séries">
            <Input inputMode="numeric" value={v.sets} onChange={set("sets")} />
          </Field>
          <Field label="Repetições" hint="Ex.: 10 ou 8-12">
            <Input value={v.reps} onChange={set("reps")} />
          </Field>
          <Field label="Carga (kg)">
            <Input inputMode="decimal" value={v.load_kg} onChange={set("load_kg")} />
          </Field>
          <Field label="Descanso (s)">
            <Input inputMode="numeric" value={v.rest_seconds} onChange={set("rest_seconds")} />
          </Field>
          <Field label="Observações" className="col-span-2">
            <Textarea value={v.notes} onChange={set("notes")} rows={2} />
          </Field>
        </div>
        <div className="flex justify-between pt-2">
          {state.ex ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: "Excluir exercício?", text: state.ex!.name, danger: true, confirmLabel: "Excluir" }))
                  run("d", async () => {
                    await backend.remove("exercises", state.ex!.id);
                    onClose();
                    onSaved();
                  }, "Exercício excluído.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} loading={busy === "s"}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ HISTÓRICO
function HistoryTab() {
  const { data, loading, reload } = useData(async () => {
    const sessions = await backend.list<WorkoutSession>("workout_sessions", { order: [["started_at", "desc"]], limit: 60 });
    const sets = sessions.length ? await backend.list<WorkoutSet>("workout_sets", { in: { session_id: sessions.map((s) => s.id) } }) : [];
    return { sessions, sets };
  }, []);
  const [open, setOpen] = useState<string | null>(null);
  const { run } = useAction();
  const { confirm } = useFeedback();
  if (loading) return <PageLoader />;
  const finished = data!.sessions.filter((s) => s.finished_at);
  if (!data!.sessions.length) return <Empty icon={<History className="h-8 w-8" />} title="Nenhum treino realizado" text="Inicie um treino na sua ficha para começar o histórico." />;
  const perWeek: Record<string, number> = {};
  for (const s of finished) {
    const d = new Date(s.started_at);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = fmtDate(d.toISOString().slice(0, 10), "dd/MM");
    perWeek[k] = (perWeek[k] ?? 0) + 1;
  }
  const weekChart = Object.entries(perWeek).reverse().slice(-10).map(([w, n]) => ({ w, n }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-muted">Treinos concluídos</p>
          <p className="text-3xl font-bold">{finished.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Volume total (kg × reps)</p>
          <p className="text-3xl font-bold">{fmtNum(data!.sets.filter((s) => s.completed).reduce((a, s) => a + (Number(s.load_kg) || 0) * (s.reps || 0), 0))}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Duração média</p>
          <p className="text-3xl font-bold">{fmtDuration(finished.length ? finished.reduce((a, s) => a + (s.duration_seconds || 0), 0) / finished.length : null)}</p>
        </Card>
      </div>
      {weekChart.length > 1 && (
        <Card>
          <CardTitle>Treinos por semana</CardTitle>
          <BarTrend data={weekChart} x="w" y="n" unit="treinos" name="Treinos" height={180} />
        </Card>
      )}
      {data!.sessions.map((s) => {
        const sets = data!.sets.filter((x) => x.session_id === s.id && x.completed);
        const byEx = sets.reduce<Record<string, WorkoutSet[]>>((a, x) => ((a[x.exercise_name] ??= []).push(x), a), {});
        return (
          <Card key={s.id}>
            <div className="flex items-center justify-between gap-2">
              <button className="flex-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-muted">
                  {fmtDate(s.started_at.slice(0, 10))} · {s.finished_at ? fmtDuration(s.duration_seconds) : "não finalizado"} · {sets.length} séries
                </p>
              </button>
              {!s.finished_at && <Badge tone="warn">Em aberto</Badge>}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir"
                onClick={async () => {
                  if (await confirm({ title: "Excluir treino do histórico?", danger: true, confirmLabel: "Excluir" }))
                    run("d", async () => {
                      await backend.remove("workout_sessions", s.id);
                      reload();
                    }, "Treino excluído.");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {open === s.id && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                {Object.entries(byEx).map(([name, xs]) => (
                  <div key={name} className="text-sm">
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted">{xs.sort((a, b) => a.set_number - b.set_number).map((x) => `${x.reps ?? "-"}×${x.load_kg ?? 0}kg`).join("  ·  ")}</p>
                  </div>
                ))}
                {s.notes && <p className="text-xs text-muted">Obs.: {s.notes}</p>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ FORÇA
function StrengthTab() {
  const { data, loading } = useData(() => backend.list<WorkoutSet>("workout_sets", { eq: { completed: true }, order: [["created_at", "asc"]] }), []);
  const names = useMemo(() => Array.from(new Set((data ?? []).map((s) => s.exercise_name))).sort(), [data]);
  const [ex, setEx] = useState("");
  useEffect(() => {
    if (!ex && names[0]) setEx(names[0]);
  }, [names, ex]);
  if (loading) return <PageLoader />;
  if (!names.length) return <Empty icon={<TrendingUp className="h-8 w-8" />} title="Sem dados de força ainda" text="Conclua séries com carga registrada para acompanhar sua evolução." />;
  const sets = (data ?? []).filter((s) => s.exercise_name === ex);
  const byDay: Record<string, { max: number; e1rm: number; vol: number }> = {};
  for (const s of sets) {
    const d = s.created_at.slice(0, 10);
    const load = Number(s.load_kg) || 0;
    const reps = s.reps || 0;
    const e1rm = load * (1 + reps / 30); // Epley
    const cur = (byDay[d] ??= { max: 0, e1rm: 0, vol: 0 });
    cur.max = Math.max(cur.max, load);
    cur.e1rm = Math.max(cur.e1rm, Math.round(e1rm * 10) / 10);
    cur.vol += load * reps;
  }
  const chart = Object.entries(byDay).map(([d, v]) => ({ d: fmtDate(d, "dd/MM"), ...v }));
  const pr = Math.max(...chart.map((c) => c.max));
  const bestE1rm = Math.max(...chart.map((c) => c.e1rm));
  return (
    <div className="space-y-4">
      <Select value={ex} onChange={(e) => setEx(e.target.value)} className="max-w-sm">
        {names.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </Select>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-muted">Maior carga</p>
          <p className="text-3xl font-bold">{fmtNum(pr, 1)} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">1RM estimado (Epley)</p>
          <p className="text-3xl font-bold">{fmtNum(bestE1rm, 1)} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Sessões registradas</p>
          <p className="text-3xl font-bold">{chart.length}</p>
        </Card>
      </div>
      <Card>
        <CardTitle>Carga máxima por sessão</CardTitle>
        <AreaTrend data={chart} x="d" y="max" unit="kg" name="Carga máx." />
      </Card>
      <Card>
        <CardTitle>Volume por sessão (kg × reps)</CardTitle>
        <BarTrend data={chart} x="d" y="vol" name="Volume" />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ BIBLIOTECA
function LibraryTab() {
  const { data, loading, reload } = useData(() => backend.list<LibraryItem>("exercise_library", { order: [["name", "asc"]] }), []);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [sel, setSel] = useState<LibraryItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [v, setV] = useState({ name: "", muscle_group: "", description: "", instructions: "", media_url: "" });
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  if (loading) return <PageLoader />;
  const list = (data ?? []).filter((l) => (!group || l.muscle_group === group) && (!q || l.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar exercício" />
        </div>
        <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-auto">
          <option value="">Todos os grupos</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((l) => (
          <button key={l.id} onClick={() => setSel(l)} className="rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand/40">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{l.name}</p>
              {l.user_id && <Badge tone="brand">Meu</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-brand">{l.muscle_group}</p>
            <p className="mt-2 line-clamp-2 text-sm text-muted">{l.description}</p>
          </button>
        ))}
      </div>
      {!list.length && <Empty icon={<BookOpen className="h-8 w-8" />} title="Nenhum exercício encontrado" />}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ""}>
        {sel && (
          <div className="space-y-3 text-sm">
            <Badge tone="brand">{sel.muscle_group}</Badge>
            {sel.media_url &&
              (/\.(mp4|webm)$/i.test(sel.media_url) ? (
                <video src={sel.media_url} controls className="w-full rounded-xl" />
              ) : /youtube\.com|youtu\.be/.test(sel.media_url) ? (
                <a href={sel.media_url} target="_blank" rel="noreferrer" className="text-brand underline">
                  Ver vídeo demonstrativo
                </a>
              ) : (
                <img src={sel.media_url} alt={sel.name} className="w-full rounded-xl" />
              ))}
            {sel.description && <p className="text-muted">{sel.description}</p>}
            {sel.instructions && (
              <div>
                <p className="mb-1 font-semibold">Como executar</p>
                <p className="leading-relaxed text-muted">{sel.instructions}</p>
              </div>
            )}
            {sel.user_id && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: "Excluir exercício da biblioteca?", danger: true, confirmLabel: "Excluir" }))
                    run("d", async () => {
                      await backend.remove("exercise_library", sel.id);
                      setSel(null);
                      reload();
                    });
                }}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
        )}
      </Modal>
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Novo exercício na biblioteca">
        <div className="space-y-3">
          <Field label="Nome">
            <Input value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Grupo muscular">
            <Select value={v.muscle_group} onChange={(e) => setV((p) => ({ ...p, muscle_group: e.target.value }))}>
              <option value="">Selecione</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição">
            <Textarea value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </Field>
          <Field label="Instruções de execução">
            <Textarea value={v.instructions} onChange={(e) => setV((p) => ({ ...p, instructions: e.target.value }))} />
          </Field>
          <Field label="Link de imagem ou vídeo (opcional)">
            <Input value={v.media_url} onChange={(e) => setV((p) => ({ ...p, media_url: e.target.value }))} placeholder="https://..." />
          </Field>
          <Button
            className="w-full"
            loading={busy === "n"}
            onClick={() =>
              run("n", async () => {
                if (!v.name.trim() || !v.muscle_group) throw new Error("Informe nome e grupo muscular.");
                if (v.media_url && !/^https:\/\//.test(v.media_url)) throw new Error("O link deve começar com https://");
                await backend.insert("exercise_library", { ...v, media_url: v.media_url || null });
                setNewOpen(false);
                setV({ name: "", muscle_group: "", description: "", instructions: "", media_url: "" });
                reload();
              }, "Exercício adicionado.")
            }
          >
            Salvar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
