import { useEffect, useMemo, useState } from "react";
import { Archive, Check, Copy, History, ListPlus, Pencil, Plus, RefreshCw, Repeat, Sparkles, Trash2, Wand2 } from "lucide-react";
import { backend, isLocal } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { useAutosave, useData, logActivity } from "@/hooks/useData";
import { getActivePlan, getPlanMeals, sumLogs, toggleMealDone } from "@/lib/nutrition";
import type { FoodItem, Meal, MealLog, MealPlan, NutritionProfile } from "@/lib/types";
import { ACTIVITY_LABEL, cn, fmtDate, fmtNum, GOAL_LABEL, MEAL_LABEL, toNum, today } from "@/lib/utils";
import { ageFromBirth, macroTargets, SECONDARY_GOALS, targetCalories } from "@/lib/calc";
import { Badge, Button, Card, CardTitle, Disclaimer, Empty, Field, Input, Modal, PageHeader, PageLoader, Progress, Select, Tabs, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { WaterCard } from "@/components/WaterCard";
import { BarTrend } from "@/components/charts";

type Tab = "plano" | "hoje" | "perfil" | "historico";

const DISCLAIMER =
  "As sugestões nutricionais do Bucurinho's Fit são educativas e não substituem a avaliação de um nutricionista. Em caso de condições de saúde, gestação, uso de medicamentos ou dúvidas, procure um profissional.";

export default function Nutrition() {
  const [tab, setTab] = useState<Tab>("plano");
  const { data: np, reload: reloadNp, loading } = useData(async () => (await backend.list<NutritionProfile>("nutrition_profiles", { limit: 1 }))[0] ?? null, []);
  useEffect(() => {
    if (!loading && !np) setTab("perfil");
  }, [loading, np]);
  if (loading) return <PageLoader />;
  return (
    <div className="space-y-5">
      <PageHeader title="Nutrição" subtitle="Plano alimentar personalizado e acompanhamento diário." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "plano", label: "Plano atual" },
          { value: "hoje", label: "Hoje" },
          { value: "perfil", label: "Perfil nutricional" },
          { value: "historico", label: "Histórico" },
        ]}
      />
      {tab === "plano" && <PlanTab np={np} goProfile={() => setTab("perfil")} />}
      {tab === "hoje" && <TodayTab />}
      {tab === "perfil" && <ProfileTab np={np} onSaved={reloadNp} goPlan={() => setTab("plano")} />}
      {tab === "historico" && <HistoryTab onActivated={() => setTab("plano")} />}
    </div>
  );
}

// ------------------------------------------------------------------ helpers
const r1 = (n: number) => Math.round(n * 10) / 10;
async function recomputeMeal(mealId: string) {
  const foods = await backend.list<FoodItem>("food_items", { eq: { meal_id: mealId } });
  const t = foods.reduce(
    (a, f) => ({
      calories: a.calories + Number(f.calories || 0),
      protein_g: a.protein_g + Number(f.protein_g || 0),
      carbs_g: a.carbs_g + Number(f.carbs_g || 0),
      fat_g: a.fat_g + Number(f.fat_g || 0),
      fiber_g: a.fiber_g + Number(f.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
  await backend.update("meals", mealId, { calories: r1(t.calories), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) });
}
async function recomputePlan(planId: string) {
  const meals = await getPlanMeals(planId);
  const s = (k: keyof Meal) => r1(meals.reduce((a, m) => a + Number(m[k] || 0), 0));
  await backend.update("meal_plans", planId, { total_calories: s("calories"), protein_g: s("protein_g"), carbs_g: s("carbs_g"), fat_g: s("fat_g"), fiber_g: s("fiber_g") });
}

// ------------------------------------------------------------------ PLAN
function PlanTab({ np, goProfile }: { np: NutritionProfile | null; goProfile: () => void }) {
  const { toast, confirm } = useFeedback();
  const { busy, run } = useAction();
  const date = today();
  const { data, loading, reload } = useData(async () => {
    const plan = await getActivePlan();
    if (!plan) return { plan: null, meals: [] as Meal[], foods: [] as FoodItem[], logs: [] as MealLog[] };
    const meals = await getPlanMeals(plan.id);
    const foods = meals.length ? await backend.list<FoodItem>("food_items", { in: { meal_id: meals.map((m) => m.id) }, order: [["position", "asc"]] }) : [];
    const logs = await backend.list<MealLog>("meal_logs", { eq: { date } });
    return { plan, meals, foods, logs };
  }, [date]);
  const [foodModal, setFoodModal] = useState<{ meal: Meal; food?: FoodItem } | null>(null);
  const [altFood, setAltFood] = useState<FoodItem | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const generate = async () => {
    const fresh = np ?? (await backend.list<NutritionProfile>("nutrition_profiles", { limit: 1 }).catch(() => []))[0];
    if (!fresh) {
      toast("Preencha seu perfil nutricional primeiro.", "info");
      return goProfile();
    }
    if (data?.plan && !(await confirm({ title: "Gerar nova dieta?", text: "O plano atual será arquivado e continuará disponível no Histórico.", confirmLabel: "Gerar" }))) return;
    const r = await run(
      "gen",
      () => backend.fn<{ plan_id: string; warnings: string[] }>("ai-nutrition", { action: "generate_plan" }),
    );
    if (r) {
      toast("Novo plano alimentar gerado!");
      r.warnings?.forEach((w) => toast(w, "info"));
      reload();
    }
  };

  const saveCopy = () =>
    run(
      "copy",
      async () => {
        const p = data!.plan!;
        const copy = await backend.insert<MealPlan>("meal_plans", {
          title: `${p.title} (cópia salva em ${fmtDate(today())})`,
          status: "archived",
          target_calories: p.target_calories,
          total_calories: p.total_calories,
          protein_g: p.protein_g,
          carbs_g: p.carbs_g,
          fat_g: p.fat_g,
          fiber_g: p.fiber_g,
          notes: p.notes,
          source: p.source,
        });
        for (const m of data!.meals) {
          const { id, plan_id, ...rest } = m as any;
          delete rest.user_id;
          delete rest.created_at;
          const nm = await backend.insert<Meal>("meals", { ...rest, plan_id: copy.id });
          const foods = data!.foods.filter((f) => f.meal_id === m.id).map(({ id: _i, meal_id: _m, ...f }: any) => {
            delete f.user_id;
            delete f.created_at;
            return { ...f, meal_id: nm.id };
          });
          await backend.insertMany("food_items", foods);
        }
      },
      "Dieta salva no histórico.",
    );

  if (loading) return <PageLoader />;
  if (!data?.plan)
    return (
      <div className="space-y-4">
        <Empty
          icon={<Sparkles className="h-8 w-8" />}
          title="Nenhum plano alimentar ativo"
          text={np ? "Gere uma sugestão de dieta personalizada com IA ou monte seu plano manualmente." : "Preencha seu perfil nutricional para a IA montar um plano sob medida."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={generate} loading={busy === "gen"}>
                <Wand2 className="h-4 w-4" /> Gerar dieta com IA
              </Button>
              <Button variant="secondary" onClick={() => setManualOpen(true)}>
                <ListPlus className="h-4 w-4" /> Montar manualmente
              </Button>
            </div>
          }
        />
        <Disclaimer>{DISCLAIMER}</Disclaimer>
        <ManualPlanModal open={manualOpen} onClose={() => setManualOpen(false)} onCreated={reload} np={np} />
      </div>
    );

  const { plan, meals, foods, logs } = data;
  const consumed = sumLogs(logs);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{plan.title}</h2>
              <Badge tone="brand">{plan.source === "ai" ? "IA" : "Manual"}</Badge>
            </div>
            <p className="text-xs text-muted">Criado em {fmtDate(plan.created_at.slice(0, 10))}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={generate} loading={busy === "gen"}>
              <Wand2 className="h-4 w-4" /> Gerar nova dieta
            </Button>
            <Button size="sm" variant="secondary" onClick={goProfile} title="Atualize o perfil e gere novamente">
              <RefreshCw className="h-4 w-4" /> Atualizar dieta
            </Button>
            <Button size="sm" variant="secondary" onClick={saveCopy} loading={busy === "copy"}>
              <Copy className="h-4 w-4" /> Salvar dieta
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MacroBox label="Calorias" value={plan.total_calories} unit="kcal" target={plan.target_calories} />
          <MacroBox label="Proteínas" value={plan.protein_g} unit="g" />
          <MacroBox label="Carboidratos" value={plan.carbs_g} unit="g" />
          <MacroBox label="Gorduras" value={plan.fat_g} unit="g" />
          <MacroBox label="Fibras" value={plan.fiber_g} unit="g" />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Consumido hoje</span>
            <span>
              {fmtNum(consumed.calories)} / {fmtNum(plan.total_calories)} kcal
            </span>
          </div>
          <Progress value={consumed.calories} max={plan.total_calories} />
        </div>
        {plan.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-surface2 p-3 text-sm text-muted">{plan.notes}</p>}
      </Card>

      {meals.map((m) => {
        const mf = foods.filter((f) => f.meal_id === m.id);
        const done = logs.some((l) => l.meal_id === m.id);
        return (
          <Card key={m.id} className={cn(done && "border-brand/30")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  {MEAL_LABEL[m.meal_type]} {m.time && <span className="text-muted">· {m.time}</span>}
                </p>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-xs text-muted">
                  {fmtNum(m.calories)} kcal · P {fmtNum(m.protein_g)}g · C {fmtNum(m.carbs_g)}g · G {fmtNum(m.fat_g)}g · F {fmtNum(m.fiber_g)}g
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={done ? "primary" : "secondary"}
                  onClick={() =>
                    run(`done-${m.id}`, async () => {
                      await toggleMealDone(m, date, logs);
                      await reload();
                    })
                  }
                  loading={busy === `done-${m.id}`}
                >
                  <Check className="h-4 w-4" /> {done ? "Realizada" : "Marcar realizada"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Substituir refeição com IA"
                  loading={busy === `sub-${m.id}`}
                  onClick={async () => {
                    if (!(await confirm({ title: "Substituir refeição?", text: "A IA vai sugerir uma refeição equivalente e substituir os alimentos atuais.", confirmLabel: "Substituir" }))) return;
                    const r = await run(`sub-${m.id}`, () => backend.fn("ai-nutrition", { action: "substitute_meal", meal_id: m.id }), "Refeição substituída.");
                    if (r) reload();
                  }}
                >
                  <Repeat className="h-4 w-4" /> <span className="hidden sm:inline">Substituir</span>
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="pb-2 font-medium">Alimento</th>
                    <th className="pb-2 text-right font-medium">Qtd</th>
                    <th className="pb-2 text-right font-medium">kcal</th>
                    <th className="pb-2 text-right font-medium">P</th>
                    <th className="pb-2 text-right font-medium">C</th>
                    <th className="pb-2 text-right font-medium">G</th>
                    <th className="pb-2 text-right font-medium">F</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mf.map((f) => (
                    <tr key={f.id}>
                      <td className="py-2 pr-2">
                        <p>{f.name}</p>
                        {f.household_measure && <p className="text-[11px] text-muted">{f.household_measure}</p>}
                      </td>
                      <td className="py-2 text-right text-muted">{fmtNum(f.quantity_g)} g</td>
                      <td className="py-2 text-right">{fmtNum(f.calories)}</td>
                      <td className="py-2 text-right text-muted">{fmtNum(f.protein_g, 1)}</td>
                      <td className="py-2 text-right text-muted">{fmtNum(f.carbs_g, 1)}</td>
                      <td className="py-2 text-right text-muted">{fmtNum(f.fat_g, 1)}</td>
                      <td className="py-2 text-right text-muted">{fmtNum(f.fiber_g, 1)}</td>
                      <td className="py-2 pl-2">
                        <div className="flex justify-end gap-0.5">
                          <Button size="icon" variant="ghost" title="Alternativas e substituição" onClick={() => setAltFood(f)}>
                            <Repeat className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar" onClick={() => setFoodModal({ meal: m, food: f })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFoodModal({ meal: m })}>
              <Plus className="h-4 w-4" /> Adicionar alimento
            </Button>
          </Card>
        );
      })}
      <Disclaimer>{DISCLAIMER}</Disclaimer>

      <FoodModal
        state={foodModal}
        onClose={() => setFoodModal(null)}
        onSaved={async (mealId) => {
          await recomputeMeal(mealId);
          await recomputePlan(plan.id);
          reload();
        }}
      />
      <AlternativesModal
        food={altFood}
        onClose={() => setAltFood(null)}
        onDone={() => {
          setAltFood(null);
          reload();
        }}
      />
    </div>
  );
}

function MacroBox({ label, value, unit, target }: { label: string; value: number; unit: string; target?: number | null }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-bold">
        {fmtNum(value)}
        <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>
      </p>
      {target ? <p className="text-[10px] text-muted">meta {fmtNum(target)}</p> : null}
    </div>
  );
}

function FoodModal({ state, onClose, onSaved }: { state: { meal: Meal; food?: FoodItem } | null; onClose: () => void; onSaved: (mealId: string) => Promise<void> }) {
  const empty = { name: "", quantity_g: "", household_measure: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" };
  const [v, setV] = useState(empty);
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  useEffect(() => {
    const f = state?.food;
    setV(
      f
        ? {
            name: f.name,
            quantity_g: String(f.quantity_g ?? ""),
            household_measure: f.household_measure ?? "",
            calories: String(f.calories ?? ""),
            protein_g: String(f.protein_g ?? ""),
            carbs_g: String(f.carbs_g ?? ""),
            fat_g: String(f.fat_g ?? ""),
            fiber_g: String(f.fiber_g ?? ""),
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  if (!state) return null;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const save = () =>
    run("save", async () => {
      if (!v.name.trim()) throw new Error("Informe o nome do alimento.");
      const payload = {
        name: v.name.trim(),
        quantity_g: toNum(v.quantity_g) ?? 0,
        household_measure: v.household_measure.trim() || null,
        calories: toNum(v.calories) ?? 0,
        protein_g: toNum(v.protein_g) ?? 0,
        carbs_g: toNum(v.carbs_g) ?? 0,
        fat_g: toNum(v.fat_g) ?? 0,
        fiber_g: toNum(v.fiber_g) ?? 0,
      };
      if (state.food) await backend.update("food_items", state.food.id, payload);
      else await backend.insert("food_items", { ...payload, meal_id: state.meal.id, alternatives: [], position: 99 });
      await onSaved(state.meal.id);
      onClose();
    }, "Alimento salvo.");
  const del = async () => {
    if (!state.food || !(await confirm({ title: "Remover alimento?", text: `"${state.food.name}" será removido desta refeição.`, danger: true, confirmLabel: "Remover" }))) return;
    run("del", async () => {
      await backend.remove("food_items", state.food!.id);
      await onSaved(state.meal.id);
      onClose();
    }, "Alimento removido.");
  };
  return (
    <Modal open onClose={onClose} title={state.food ? "Editar alimento" : `Adicionar em ${MEAL_LABEL[state.meal.meal_type]}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Alimento" className="col-span-2">
          <Input value={v.name} onChange={set("name")} placeholder="Ex.: Arroz integral cozido" />
        </Field>
        <Field label="Quantidade (g)">
          <Input inputMode="decimal" value={v.quantity_g} onChange={set("quantity_g")} />
        </Field>
        <Field label="Medida caseira">
          <Input value={v.household_measure} onChange={set("household_measure")} placeholder="4 col. sopa" />
        </Field>
        <Field label="Calorias (kcal)">
          <Input inputMode="decimal" value={v.calories} onChange={set("calories")} />
        </Field>
        <Field label="Proteínas (g)">
          <Input inputMode="decimal" value={v.protein_g} onChange={set("protein_g")} />
        </Field>
        <Field label="Carboidratos (g)">
          <Input inputMode="decimal" value={v.carbs_g} onChange={set("carbs_g")} />
        </Field>
        <Field label="Gorduras (g)">
          <Input inputMode="decimal" value={v.fat_g} onChange={set("fat_g")} />
        </Field>
        <Field label="Fibras (g)">
          <Input inputMode="decimal" value={v.fiber_g} onChange={set("fiber_g")} />
        </Field>
      </div>
      <div className="mt-5 flex justify-between gap-2">
        {state.food ? (
          <Button variant="danger" onClick={del} loading={busy === "del"}>
            <Trash2 className="h-4 w-4" /> Remover
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} loading={busy === "save"}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function AlternativesModal({ food, onClose, onDone }: { food: FoodItem | null; onClose: () => void; onDone: () => void }) {
  const [pref, setPref] = useState("");
  const { busy, run } = useAction();
  useEffect(() => setPref(""), [food]);
  if (!food) return null;
  const substitute = (preferred?: string) =>
    run("sub", async () => {
      await backend.fn("ai-nutrition", { action: "substitute_food", food_item_id: food.id, preferred });
      onDone();
    }, "Alimento substituído.");
  return (
    <Modal open onClose={onClose} title={`Substituir: ${food.name}`}>
      <div className="space-y-4">
        {food.alternatives?.length ? (
          <div>
            <p className="mb-2 text-xs text-muted">Alternativas equivalentes sugeridas</p>
            <div className="space-y-2">
              {food.alternatives.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-surface2 p-3 text-sm">
                  <span>
                    {a.name} <span className="text-muted">· {fmtNum(a.quantity_g)} g</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => substitute(`${a.name} (${a.quantity_g} g)`)} loading={busy === "sub"}>
                    Usar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Sem alternativas salvas para este alimento.</p>
        )}
        <Field label="Ou descreva o que prefere (opcional)">
          <Input value={pref} onChange={(e) => setPref(e.target.value)} placeholder="Ex.: algo sem lactose, tapioca..." />
        </Field>
        <Button className="w-full" onClick={() => substitute(pref || undefined)} loading={busy === "sub"}>
          <Sparkles className="h-4 w-4" /> Substituir com IA
        </Button>
        <p className="text-[11px] text-muted">A IA recalcula os valores nutricionais e atualiza os totais da refeição e do dia.</p>
      </div>
    </Modal>
  );
}

function ManualPlanModal({ open, onClose, onCreated, np }: { open: boolean; onClose: () => void; onCreated: () => void; np: NutritionProfile | null }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState("Meu plano alimentar");
  const [types, setTypes] = useState<string[]>(["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar"]);
  const { busy, run } = useAction();
  const create = () =>
    run(
      "create",
      async () => {
        if (!types.length) throw new Error("Selecione ao menos uma refeição.");
        const age = ageFromBirth(profile?.birth_date);
        const base = targetCalories({ ...profile, age, activity_level: np?.activity_level ?? profile?.activity_level, goal: np?.goal, running_km_week: np?.running_km_per_week });
        const kcal = base && profile?.weight_kg ? macroTargets(base, profile.weight_kg, np?.goal, { secondary_goals: np?.secondary_goals, running_km_week: np?.running_km_per_week }).kcal : base;
        for (const a of await backend.list<MealPlan>("meal_plans", { eq: { status: "active" } })) await backend.update("meal_plans", a.id, { status: "archived" });
        const plan = await backend.insert<MealPlan>("meal_plans", { title: title.trim() || "Meu plano", status: "active", target_calories: kcal, source: "manual" });
        const order = Object.keys(MEAL_LABEL).filter((t) => types.includes(t));
        await backend.insertMany(
          "meals",
          order.map((t, i) => ({ plan_id: plan.id, meal_type: t, name: MEAL_LABEL[t], position: i, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })),
        );
        logActivity("dieta", "Plano alimentar manual criado", { ref_id: plan.id });
        onClose();
        onCreated();
      },
      "Plano criado. Adicione os alimentos em cada refeição.",
    );
  return (
    <Modal open={open} onClose={onClose} title="Montar plano manualmente">
      <div className="space-y-4">
        <Field label="Nome do plano">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-xs text-muted">Refeições do dia</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(MEAL_LABEL).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTypes(types.includes(k) ? types.filter((t) => t !== k) : [...types, k])}
                className={cn("rounded-full border px-3 py-1.5 text-xs", types.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={create} loading={busy === "create"}>
          Criar plano
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ TODAY
function TodayTab() {
  const date = today();
  const { data, loading, reload } = useData(async () => {
    const plan = await getActivePlan();
    const [logs, meals, week] = await Promise.all([
      backend.list<MealLog>("meal_logs", { eq: { date }, order: [["created_at", "asc"]] }),
      plan ? getPlanMeals(plan.id) : Promise.resolve([] as Meal[]),
      backend.list<MealLog>("meal_logs", { gte: { date: new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10) } }),
    ]);
    return { plan, logs, meals, week };
  }, [date]);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  if (loading || !data) return <PageLoader />;
  const t = sumLogs(data.logs);
  const p = data.plan;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5);
    const iso = today(d);
    return { d: fmtDate(iso, "dd/MM"), kcal: Math.round(sumLogs(data.week.filter((l) => l.date === iso)).calories) };
  });
  const add = () =>
    run("add", async () => {
      if (!v.name.trim()) throw new Error("Informe o alimento/refeição.");
      await backend.insert("meal_logs", {
        date,
        name: v.name.trim(),
        calories: toNum(v.calories) ?? 0,
        protein_g: toNum(v.protein_g) ?? 0,
        carbs_g: toNum(v.carbs_g) ?? 0,
        fat_g: toNum(v.fat_g) ?? 0,
        fiber_g: toNum(v.fiber_g) ?? 0,
      });
      setOpen(false);
      setV({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
      reload();
    }, "Registro adicionado.");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Registrar consumo</Button>}>Consumo de hoje</CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["Calorias", t.calories, p?.total_calories, "kcal"],
              ["Proteínas", t.protein_g, p?.protein_g, "g"],
              ["Carboidratos", t.carbs_g, p?.carbs_g, "g"],
              ["Gorduras", t.fat_g, p?.fat_g, "g"],
              ["Fibras", t.fiber_g, p?.fiber_g, "g"],
            ] as [string, number, number | undefined, string][]
          ).map(([l, val, max, u]) => (
            <div key={l} className="rounded-xl bg-surface2 p-3">
              <p className="text-[11px] text-muted">{l}</p>
              <p className="text-lg font-bold">
                {fmtNum(val)}
                <span className="text-xs text-muted">
                  {max ? `/${fmtNum(max)}` : ""} {u}
                </span>
              </p>
              {max ? <Progress value={val} max={max} className="mt-2" /> : null}
            </div>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {data.logs.length === 0 && <li className="py-6 text-center text-sm text-muted">Nada registrado hoje. Marque refeições do plano ou registre um consumo.</li>}
          {data.logs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <p>{l.name}</p>
                <p className="text-xs text-muted">
                  P {fmtNum(l.protein_g)}g · C {fmtNum(l.carbs_g)}g · G {fmtNum(l.fat_g)}g
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted">{fmtNum(l.calories)} kcal</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Excluir registro"
                  onClick={async () => {
                    if (await confirm({ title: "Excluir registro?", text: l.name, danger: true, confirmLabel: "Excluir" }))
                      run("del", async () => {
                        await backend.remove("meal_logs", l.id);
                        reload();
                      });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <WaterCard />
        <Card>
          <CardTitle>Calorias — 14 dias</CardTitle>
          <BarTrend data={days} x="d" y="kcal" unit="kcal" name="Calorias" height={180} />
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar consumo">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Alimento ou refeição" className="col-span-2">
            <Input value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          {(["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const).map((k) => (
            <Field key={k} label={{ calories: "Calorias (kcal)", protein_g: "Proteínas (g)", carbs_g: "Carboidratos (g)", fat_g: "Gorduras (g)", fiber_g: "Fibras (g)" }[k]}>
              <Input inputMode="decimal" value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Button className="mt-5 w-full" onClick={add} loading={busy === "add"}>
          Adicionar
        </Button>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ PROFILE
function ProfileTab({ np, onSaved, goPlan }: { np: NutritionProfile | null; onSaved: () => void; goPlan: () => void }) {
  const { profile } = useAuth();
  const { toast } = useFeedback();
  const { busy, run } = useAction();
  const [id, setId] = useState<string | null>(np?.id ?? null);
  const [v, setV] = useState({
    goal: np?.goal ?? "",
    activity_level: np?.activity_level ?? profile?.activity_level ?? "",
    target_weight_kg: (np?.target_weight_kg ?? profile?.goal_weight_kg)?.toString() ?? "",
    restrictions: np?.restrictions ?? "",
    allergies: np?.allergies ?? "",
    health_conditions: np?.health_conditions ?? "",
    preferences: np?.preferences ?? "",
    dislikes: np?.dislikes ?? "",
    meals_per_day: String(np?.meals_per_day ?? 5),
    budget: np?.budget ?? "moderado",
    routine: np?.routine ?? "",
    secondary_goals: (np?.secondary_goals ?? []) as string[],
    custom_goal: np?.custom_goal ?? "",
    strength_days_per_week: np?.strength_days_per_week?.toString() ?? "",
    running_km_per_week: np?.running_km_per_week?.toString() ?? "",
    training_time: np?.training_time ?? "",
    supplements: np?.supplements ?? "",
  });
  const payload = useMemo(
    () => ({
      ...v,
      goal: v.goal || null,
      activity_level: v.activity_level || null,
      target_weight_kg: toNum(v.target_weight_kg),
      meals_per_day: Math.min(6, Math.max(3, Number(v.meals_per_day) || 5)),
      strength_days_per_week: toNum(v.strength_days_per_week) != null ? Math.min(7, Math.max(0, Math.round(toNum(v.strength_days_per_week)!))) : null,
      running_km_per_week: toNum(v.running_km_per_week) != null ? Math.min(250, Math.max(0, toNum(v.running_km_per_week)!)) : null,
      custom_goal: v.custom_goal.trim() || null,
      training_time: v.training_time.trim() || null,
      supplements: v.supplements.trim() || null,
    }),
    [v],
  );
  const autosave = useAutosave(
    payload,
    async (p) => {
      if (!p.goal || !p.activity_level) return;
      if (id) await backend.update("nutrition_profiles", id, p);
      else {
        setId((await backend.insert<NutritionProfile>("nutrition_profiles", p)).id);
        onSaved();
      }
    },
    true,
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const age = ageFromBirth(profile?.birth_date);
  const base = targetCalories({ ...profile, age, activity_level: payload.activity_level, goal: payload.goal, running_km_week: payload.running_km_per_week });
  const macros = base && profile?.weight_kg ? macroTargets(base, profile.weight_kg, payload.goal, { secondary_goals: payload.secondary_goals, running_km_week: payload.running_km_per_week }) : null;
  const kcal = macros?.kcal ?? base;
  const toggleGoal = (g: string) => setV((p) => ({ ...p, secondary_goals: p.secondary_goals.includes(g) ? p.secondary_goals.filter((x) => x !== g) : [...p.secondary_goals, g] }));

  // Preenche a carga de treino a partir do que já está registrado no app
  const fillFromApp = () =>
    run("fill", async () => {
      const since = today(new Date(Date.now() - 28 * 864e5));
      const [runs, plans] = await Promise.all([
        profile?.running_enabled ? backend.list<{ distance_km: number }>("running_sessions", { eq: { status: "done" }, gte: { date: since } }) : Promise.resolve([]),
        backend.list<{ id: string }>("workout_plans", { eq: { active: true } }),
      ]);
      const days = plans.length ? await backend.list<{ weekdays: number[] }>("workout_days", { in: { plan_id: plans.map((p) => p.id) } }) : [];
      const km = runs.reduce((a, r) => a + Number(r.distance_km), 0) / 4;
      const strength = new Set(days.flatMap((d) => d.weekdays)).size;
      setV((p) => ({ ...p, running_km_per_week: km ? String(Math.round(km * 10) / 10) : p.running_km_per_week, strength_days_per_week: strength ? String(strength) : p.strength_days_per_week }));
    }, "Carga de treino preenchida com seus registros.");

  const saveAndGenerate = async () => {
    if (!payload.goal || !payload.activity_level) return toast("Informe objetivo e nível de atividade.", "error");
    const ok = await run("gen", async () => {
      if (id) await backend.update("nutrition_profiles", id, payload);
      else setId((await backend.insert<NutritionProfile>("nutrition_profiles", payload)).id);
      onSaved();
      if (isLocal) return true;
      await backend.fn("ai-nutrition", { action: "generate_plan" });
      return true;
    });
    if (ok) {
      toast(isLocal ? "Perfil salvo. A geração por IA requer o Supabase conectado." : "Dieta gerada com base no seu perfil!", isLocal ? "info" : "success");
      if (!isLocal) goPlan();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle action={<span className={cn("text-xs", autosave === "error" ? "text-red-600" : "text-muted")}>{{ idle: "", saving: "Salvando…", saved: "Salvo automaticamente", error: "Erro ao salvar" }[autosave]}</span>}>
          Perfil nutricional
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface2 p-3 text-sm sm:col-span-2">
            <div>
              <p className="text-[11px] text-muted">Idade / sexo</p>
              <p>
                {age ?? "—"} anos · {profile?.sex ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">Altura</p>
              <p>{fmtNum(profile?.height_cm)} cm</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">Peso atual</p>
              <p>{fmtNum(profile?.weight_kg, 1)} kg</p>
            </div>
            <p className="col-span-3 text-[11px] text-muted">Altere esses dados em Perfil.</p>
          </div>
          <Field label="Objetivo">
            <Select value={v.goal} onChange={set("goal")}>
              <option value="">Selecione</option>
              {Object.entries(GOAL_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-muted">Objetivos complementares</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SECONDARY_GOALS).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleGoal(k)}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", v.secondary_goals.includes(k) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <Field label="Descreva seu objetivo com suas palavras (opcional)" className="sm:col-span-2" hint="A IA usa esse texto para ajustar a dieta. Ex.: ganhar massa sem perder rendimento na corrida; prova de 10 km em março.">
            <Textarea value={v.custom_goal} onChange={set("custom_goal")} rows={2} />
          </Field>
          <div className="rounded-xl border border-line p-3 sm:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Carga de treino</p>
              <Button type="button" size="sm" variant="ghost" onClick={fillFromApp} loading={busy === "fill"}>
                Usar meus registros
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Dias de musculação/semana">
                <Input inputMode="numeric" value={v.strength_days_per_week} onChange={set("strength_days_per_week")} placeholder="4" />
              </Field>
              <Field label="Km de corrida/semana">
                <Input inputMode="decimal" value={v.running_km_per_week} onChange={set("running_km_per_week")} placeholder="20" />
              </Field>
              <Field label="Horário dos treinos">
                <Input value={v.training_time} onChange={set("training_time")} placeholder="Corrida 6h, musculação 18h" />
              </Field>
            </div>
          </div>
          <Field label="Nível de atividade (sem contar a corrida)" hint="Considere musculação e dia a dia. A corrida é somada à parte pelos km semanais.">
            <Select value={v.activity_level} onChange={set("activity_level")}>
              <option value="">Selecione</option>
              {Object.entries(ACTIVITY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Peso desejado (kg)">
            <Input inputMode="decimal" value={v.target_weight_kg} onChange={set("target_weight_kg")} />
          </Field>
          <Field label="Refeições por dia">
            <Select value={v.meals_per_day} onChange={set("meals_per_day")}>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} refeições
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Alergias" hint="A IA nunca incluirá alimentos alergênicos informados.">
            <Input value={v.allergies} onChange={set("allergies")} placeholder="Ex.: amendoim, camarão" />
          </Field>
          <Field label="Restrições alimentares">
            <Input value={v.restrictions} onChange={set("restrictions")} placeholder="Ex.: sem lactose, vegetariano" />
          </Field>
          <Field label="Condições de saúde (opcional)" className="sm:col-span-2" hint="Ex.: diabetes, hipertensão, gestação. Nesses casos, procure acompanhamento profissional.">
            <Input value={v.health_conditions} onChange={set("health_conditions")} />
          </Field>
          <Field label="Preferências alimentares">
            <Textarea value={v.preferences} onChange={set("preferences")} placeholder="Ex.: gosto de frango, ovos, frutas" />
          </Field>
          <Field label="Alimentos que não gosta">
            <Textarea value={v.dislikes} onChange={set("dislikes")} placeholder="Ex.: fígado, quiabo" />
          </Field>
          <Field label="Orçamento alimentar">
            <Select value={v.budget} onChange={set("budget")}>
              <option value="economico">Econômico</option>
              <option value="moderado">Moderado</option>
              <option value="livre">Sem restrição</option>
            </Select>
          </Field>
          <Field label="Suplementos que já usa (opcional)">
            <Input value={v.supplements} onChange={set("supplements")} placeholder="Ex.: whey, creatina" />
          </Field>
          <Field label="Rotina e horários das refeições" className="sm:col-span-2">
            <Textarea value={v.routine} onChange={set("routine")} placeholder="Ex.: acordo 6h, almoço 12h30, treino 18h, durmo 23h" />
          </Field>
        </div>
        <Button className="mt-5 w-full sm:w-auto" onClick={saveAndGenerate} loading={busy === "gen"}>
          <Wand2 className="h-4 w-4" /> Salvar e gerar dieta
        </Button>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>Estimativa diária</CardTitle>
          {kcal ? (
            <>
              <p className="text-3xl font-bold">
                {fmtNum(kcal)} <span className="text-sm font-medium text-muted">kcal</span>
              </p>
              {macros && (
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  <li>Proteínas: ~{macros.protein} g</li>
                  <li>Carboidratos: ~{macros.carbs} g</li>
                  <li>Gorduras: ~{macros.fat} g</li>
                  <li>Fibras: ≥ {macros.fiber} g</li>
                  {profile?.weight_kg && (
                    <li className="pt-1 text-xs">
                      {fmtNum(macros.protein / profile.weight_kg, 1)} g/kg de proteína · {fmtNum(macros.carbs / profile.weight_kg, 1)} g/kg de carboidrato
                    </li>
                  )}
                </ul>
              )}
              {macros?.carbsPerKg && <p className="mt-3 rounded-lg bg-brand-soft p-2 text-[11px] text-brand">Foco em performance: carboidrato mínimo de {fmtNum(macros.carbsPerKg, 1)} g/kg para sustentar os treinos de corrida.</p>}
              <p className="mt-3 text-[11px] text-muted">Mifflin-St Jeor + gasto estimado da corrida, com superávit/déficit moderados e piso de segurança.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Complete data de nascimento, altura, peso, objetivo e atividade.</p>
          )}
        </Card>
        <Disclaimer>{DISCLAIMER}</Disclaimer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ HISTORY
function HistoryTab({ onActivated }: { onActivated: () => void }) {
  const { data, loading, reload } = useData(() => backend.list<MealPlan>("meal_plans", { order: [["created_at", "desc"]] }), []);
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const [view, setView] = useState<MealPlan | null>(null);
  if (loading) return <PageLoader />;
  if (!data?.length) return <Empty icon={<History className="h-8 w-8" />} title="Nenhuma dieta anterior" text="Seus planos gerados ou salvos aparecerão aqui." />;
  return (
    <div className="space-y-3">
      {data.map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{p.title}</p>
              {p.status === "active" ? <Badge tone="brand">Ativo</Badge> : <Badge>Arquivado</Badge>}
            </div>
            <p className="text-xs text-muted">
              {fmtDate(p.created_at.slice(0, 10))} · {fmtNum(p.total_calories)} kcal · P {fmtNum(p.protein_g)}g · C {fmtNum(p.carbs_g)}g · G {fmtNum(p.fat_g)}g
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setView(p)}>
              Ver
            </Button>
            {p.status !== "active" && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `act-${p.id}`}
                onClick={() =>
                  run(`act-${p.id}`, async () => {
                    const active = data.find((x) => x.status === "active");
                    if (active) await backend.update("meal_plans", active.id, { status: "archived" });
                    await backend.update("meal_plans", p.id, { status: "active" });
                    onActivated();
                  }, "Plano reativado.")
                }
              >
                <Archive className="h-4 w-4" /> Usar este
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Excluir plano"
              onClick={async () => {
                if (await confirm({ title: "Excluir plano?", text: "Esta ação não pode ser desfeita.", danger: true, confirmLabel: "Excluir" }))
                  run("del", async () => {
                    await backend.remove("meal_plans", p.id);
                    reload();
                  }, "Plano excluído.");
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}
      <PlanViewer plan={view} onClose={() => setView(null)} />
    </div>
  );
}

export function PlanViewer({ plan, onClose, ownerId }: { plan: MealPlan | null; onClose: () => void; ownerId?: string }) {
  const { data } = useData(async () => {
    if (!plan) return null;
    const meals = await getPlanMeals(plan.id, ownerId);
    const foods = meals.length ? await backend.list<FoodItem>("food_items", { in: { meal_id: meals.map((m) => m.id) }, order: [["position", "asc"]], ownerId }) : [];
    return { meals, foods };
  }, [plan?.id]);
  if (!plan) return null;
  return (
    <Modal open onClose={onClose} title={plan.title} wide>
      <div className="space-y-4">
        {data?.meals.map((m) => (
          <div key={m.id}>
            <p className="text-sm font-semibold text-brand">
              {MEAL_LABEL[m.meal_type]} <span className="font-normal text-muted">· {fmtNum(m.calories)} kcal</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {data.foods
                .filter((f) => f.meal_id === m.id)
                .map((f) => (
                  <li key={f.id}>
                    {f.name} — {fmtNum(f.quantity_g)} g
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {plan.notes && <p className="whitespace-pre-line rounded-xl bg-surface2 p-3 text-xs text-muted">{plan.notes}</p>}
      </div>
    </Modal>
  );
}
