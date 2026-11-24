import { useMemo, useState } from "react";
import { addDays as addDaysFns, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Check, ChevronDown, ClipboardCopy, Footprints, Repeat, Share2, ShoppingCart, Shuffle } from "lucide-react";
import { backend } from "@/lib/backend";
import { useData } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { planDayType, type DayType } from "@/lib/nutrition";
import type { FoodItem, Meal, MealPlan, NutritionProfile, RunningSession } from "@/lib/types";
import { addDays, cn, fmtNum, MEAL_LABEL, today } from "@/lib/utils";
import { contextOf, guessGroup, matchFood, norm, RAW, SECTION_ORDER, sectionOf, swapsFor, type FoodGroup, type Section } from "@/lib/foods";
import { Badge, Button, Card, Empty, PageLoader, Tabs } from "@/components/ui";
import { useFeedback } from "@/components/feedback";

type DayFood = Pick<FoodItem, "name" | "quantity_g" | "household_measure" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g"> & { swappedFrom?: string };
type DayMeal = { id: string; meal_type: string; name: string; time: string | null; foods: DayFood[] };
type Day = { date: string; type: DayType; auto: boolean; runTomorrow: RunningSession | null; meals: DayMeal[]; kcal: number; protein: number; carbs: number; fat: number };
type ShopItem = { key: string; section: Section; grams: number; units: number; ml: number };

const VARY_GROUPS: FoodGroup[] = ["proteina", "carboidrato", "fruta", "leguminosa"];
const NEVER_SUGGEST = new Set(["Whey protein", "Mel", "Granola"]);

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* armazenamento indisponível */
    }
  },
};

function nextMonday(iso: string) {
  const d = parseISO(iso);
  const add = ((8 - d.getDay()) % 7) || 7;
  return format(addDaysFns(d, add), "yyyy-MM-dd");
}

const dayLabel = (iso: string) => format(parseISO(iso), "EEE, dd/MM", { locale: ptBR });
const r1 = (n: number) => Math.round(n * 10) / 10;

export function WeekTab({ goPlan }: { goPlan: () => void }) {
  const { profile } = useAuth();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<"proximos" | "semana">("proximos");
  const [view, setView] = useState<"cardapio" | "compras">("cardapio");
  const [vary, setVaryState] = useState<boolean>(() => store.get("bfit-week-vary", true));
  const [overrides, setOverrides] = useState<Record<string, DayType>>(() => store.get("bfit-week-types", {}));
  const [open, setOpen] = useState<string | null>(null);
  const start = mode === "proximos" ? today() : nextMonday(today());
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const [checked, setCheckedState] = useState<string[]>(() => store.get(`bfit-shop-${start}`, []));
  const setVary = (v: boolean) => (setVaryState(v), store.set("bfit-week-vary", v));
  const setChecked = (v: string[]) => (setCheckedState(v), store.set(`bfit-shop-${start}`, v));

  const { data, loading } = useData(async () => {
    const plans = await backend.list<MealPlan>("meal_plans", { eq: { status: "active" } });
    const meals = plans.length ? await backend.list<Meal>("meals", { in: { plan_id: plans.map((p) => p.id) }, order: [["position", "asc"]] }) : [];
    const foods = meals.length ? await backend.list<FoodItem>("food_items", { in: { meal_id: meals.map((m) => m.id) }, order: [["position", "asc"]] }) : [];
    const runs = profile?.running_enabled
      ? await backend.list<RunningSession>("running_sessions", { eq: { status: "planned" }, gte: { date: addDays(start, 1) }, lte: { date: addDays(start, 7) } }).catch(() => [])
      : [];
    const np = (await backend.list<NutritionProfile>("nutrition_profiles", { limit: 1 }).catch(() => []))[0] ?? null;
    return { plans, meals, foods, runs, np };
  }, [start, profile?.running_enabled]);

  // Alimentos que não podem aparecer nas variações (alergias e o que não gosta)
  const blocked = useMemo(() => {
    const words = norm(`${data?.np?.allergies ?? ""} ${data?.np?.dislikes ?? ""}`).split(" ").filter((w) => w.length > 3);
    return (name: string) => words.some((w) => norm(name).includes(w));
  }, [data?.np]);

  const days = useMemo<Day[]>(() => {
    if (!data) return [];
    const byType = (t: DayType) => data.plans.find((p) => planDayType(p) === t) ?? null;
    const padrao = byType("padrao") ?? data.plans[0] ?? null;
    const vespera = byType("vespera_corrida");
    if (!padrao) return [];
    const swapCache = new Map<string, DayFood[]>();
    // Cada alimento alterna entre o original (dias A) e UMA alternativa equivalente (dias B):
    // varia o cardápio sem multiplicar a lista de compras.
    const options = (f: FoodItem, mealType: string): DayFood[] => {
      if (swapCache.has(f.id)) return swapCache.get(f.id)!;
      const g = guessGroup(f);
      // Café da manhã e lanches só recebem alimentos de café; almoço e jantar, alimentos de prato
      const mealCtx: "cafe" | "prato" = mealType === "almoco" || mealType === "jantar" ? "prato" : "cafe";
      const own = contextOf(f.name, mealType);
      const ctx = own.includes(mealCtx) ? [mealCtx] : own;
      let opts: DayFood[] = [f];
      if (VARY_GROUPS.includes(g)) {
        const alt = swapsFor(f, g)
          .filter((s) => s.food.group === g && !NEVER_SUGGEST.has(s.food.name) && !blocked(s.food.name) && Math.abs(s.diffKcal) <= Math.max(40, f.calories * 0.2))
          .filter((s) => contextOf(s.food.name).some((c) => ctx.includes(c)))
          .slice(0, 1)
          .map((s) => ({ name: s.food.name, quantity_g: s.quantity_g, household_measure: s.household_measure, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, fiber_g: s.fiber_g, swappedFrom: f.name }));
        opts = [f, ...alt];
      }
      swapCache.set(f.id, opts);
      return opts;
    };
    return dates.map((date, di) => {
      const runTomorrow = data.runs.filter((r) => r.date === addDays(date, 1)).sort((a, b) => Number(b.distance_km) - Number(a.distance_km))[0] ?? null;
      const autoType: DayType = runTomorrow && vespera ? "vespera_corrida" : "padrao";
      const type: DayType = vespera ? overrides[date] ?? autoType : "padrao";
      const plan = type === "vespera_corrida" ? vespera! : padrao;
      const meals = data.meals
        .filter((m) => m.plan_id === plan.id)
        .map((m) => ({
          id: m.id,
          meal_type: m.meal_type,
          name: m.name,
          time: m.time,
          // Véspera de corrida não varia: alimentos conhecidos e de fácil digestão
          foods: data.foods
            .filter((f) => f.meal_id === m.id)
            .map((f) => {
              if (!vary || type === "vespera_corrida") return f as DayFood;
              const o = options(f, m.meal_type);
              return o[di % o.length];
            }),
        }));
      const all = meals.flatMap((m) => m.foods);
      const sum = (k: keyof DayFood) => r1(all.reduce((a, f) => a + (Number(f[k]) || 0), 0));
      return { date, type, auto: !(date in overrides), runTomorrow, meals, kcal: sum("calories"), protein: sum("protein_g"), carbs: sum("carbs_g"), fat: sum("fat_g") };
    });
  }, [data, dates, vary, overrides, blocked]);

  const shopping = useMemo(() => {
    const map = new Map<string, ShopItem>();
    for (const d of days)
      for (const m of d.meals)
        for (const f of m.foods) {
          const ref = matchFood(f.name);
          const grams = Number(f.quantity_g) || 0;
          if (!grams) continue;
          const raw = ref ? RAW[ref.name] : undefined;
          const key = raw ? raw[0] : ref?.name ?? f.name;
          const item = map.get(key) ?? { key, section: sectionOf(ref, ref?.group ?? guessGroup(f)), grams: 0, units: 0, ml: 0 };
          if (ref?.name === "Ovo cozido") item.units += grams / 50;
          else if (ref?.name === "Clara de ovo cozida") item.units += grams / 33;
          else if (ref && /^Leite/.test(ref.name)) item.ml += grams;
          else if (ref?.unit && ["unidade", "unidade média"].includes(ref.unit[0]) && !raw) {
            item.units += grams / ref.unit[2];
            item.grams += grams;
          } else item.grams += grams * (raw ? raw[1] : 1);
          map.set(key, item);
        }
    return [...map.values()].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.key.localeCompare(b.key));
  }, [days]);

  if (loading) return <PageLoader />;
  if (!days.length)
    return <Empty icon={<CalendarDays className="h-8 w-8" />} title="Gere sua dieta primeiro" text="A rotina da semana e a lista de compras são montadas a partir do seu plano alimentar." action={<Button onClick={goPlan}>Ir para o plano</Button>} />;

  const hasVespera = data!.plans.some((p) => planDayType(p) === "vespera_corrida");
  const qtyText = (i: ShopItem) => {
    if (i.ml) return i.ml >= 1000 ? `${fmtNum(Math.ceil(i.ml / 100) / 10, 1)} L` : `${Math.ceil(i.ml / 50) * 50} ml`;
    if (i.units && !i.grams) return `${Math.ceil(i.units)} ${Math.ceil(i.units) === 1 ? "unidade" : "unidades"}`;
    const g = Math.ceil(i.grams / 50) * 50;
    const w = g >= 1000 ? `${fmtNum(Math.round(g / 100) / 10, 1)} kg` : `${g} g`;
    return i.units ? `${Math.ceil(i.units)} unidades (≈ ${w})` : w;
  };
  const period = `${format(parseISO(dates[0]), "dd/MM")} a ${format(parseISO(dates[6]), "dd/MM")}`;
  const listText = () =>
    [`🛒 Lista de compras – ${period}`, ...SECTION_ORDER.flatMap((s) => {
      const items = shopping.filter((i) => i.section === s);
      return items.length ? ["", s.toUpperCase(), ...items.map((i) => `${checked.includes(i.key) ? "☑" : "☐"} ${i.key} – ${qtyText(i)}`)] : [];
    })].join("\n");
  const share = async () => {
    const text = listText();
    try {
      if (navigator.share) await navigator.share({ title: "Lista de compras", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Lista copiada.");
      }
    } catch {
      /* compartilhamento cancelado */
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listText());
      toast("Lista copiada. Cole no WhatsApp ou nas Notas.");
    } catch {
      toast("Não foi possível copiar.", "error");
    }
  };
  const toggleType = (d: Day) => {
    const next: DayType = d.type === "padrao" ? "vespera_corrida" : "padrao";
    const o = { ...overrides, [d.date]: next };
    setOverrides(o);
    store.set("bfit-week-types", o);
  };
  const avg = days.reduce((a, d) => a + d.kcal, 0) / days.length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Tabs value={mode} onChange={(m) => { setMode(m); setCheckedState(store.get(`bfit-shop-${m === "proximos" ? today() : nextMonday(today())}`, [])); }} items={[{ value: "proximos", label: "Próximos 7 dias" }, { value: "semana", label: "Semana que vem" }]} />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{period}</p>
            <p className="text-xs text-muted">Média de {fmtNum(avg)} kcal/dia</p>
          </div>
          <button onClick={() => setVary(!vary)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", vary ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}>
            <Shuffle className="h-3.5 w-3.5" /> Variar {vary ? "ligado" : "desligado"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          {vary
            ? "Dias alternados trocam proteínas, carboidratos e frutas por uma opção equivalente (↻), sem aumentar muito a lista de compras. Na véspera de corrida o cardápio não varia."
            : "Todos os dias seguem o seu cardápio, sem variações."}
          {hasVespera ? " Toque no tipo do dia para trocar entre dia normal e véspera de corrida." : ""}
        </p>
      </Card>

      <Tabs value={view} onChange={setView} items={[{ value: "cardapio", label: "Cardápio da semana" }, { value: "compras", label: `Lista de compras (${shopping.length})` }]} />

      {view === "cardapio" ? (
        <div className="space-y-2">
          {days.map((d) => (
            <Box key={d.date}>
              <div className="flex items-center gap-2 p-3">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === d.date ? null : d.date)}>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition", open === d.date && "rotate-180")} />
                  <div className="min-w-0">
                    <p className="font-semibold capitalize">{dayLabel(d.date)}</p>
                    <p className="text-xs text-muted">
                      {fmtNum(d.kcal)} kcal · P {fmtNum(d.protein)} · C {fmtNum(d.carbs)} · G {fmtNum(d.fat)}
                    </p>
                  </div>
                </button>
                <button onClick={() => hasVespera && toggleType(d)} disabled={!hasVespera} aria-label="Trocar tipo do dia">
                  {d.type === "vespera_corrida" ? (
                    <Badge tone="warn"><Footprints className="h-3 w-3" /> Véspera</Badge>
                  ) : (
                    <Badge>Normal</Badge>
                  )}
                </button>
              </div>
              {d.runTomorrow && (
                <p className="-mt-1 px-3 pb-2 text-[11px] text-brand">
                  Corrida no dia seguinte: {fmtNum(d.runTomorrow.distance_km, 1)} km{!hasVespera ? " · gere o cardápio de véspera no Plano atual" : ""}
                </p>
              )}
              {open === d.date && (
                <div className="space-y-3 border-t border-line p-3">
                  {d.meals.map((m) => (
                    <div key={m.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                        {MEAL_LABEL[m.meal_type] ?? m.name} {m.time && <span className="text-muted">· {m.time}</span>}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {m.foods.map((f, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="min-w-0">
                              {f.swappedFrom && <Repeat className="mr-1 inline h-3 w-3 text-brand" aria-label={`no lugar de ${f.swappedFrom}`} />}
                              {f.name}
                            </span>
                            <span className="shrink-0 text-muted">
                              {fmtNum(f.quantity_g)} g{f.household_measure ? ` · ${f.household_measure}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Box>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{checked.filter((c) => shopping.some((i) => i.key === c)).length}</span> de {shopping.length} itens no carrinho
            </p>
            <Button size="sm" variant="secondary" onClick={copy} aria-label="Copiar lista">
              <ClipboardCopy className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={share}>
              <Share2 className="h-4 w-4" /> Enviar
            </Button>
          </Card>
          {SECTION_ORDER.map((s) => {
            const items = shopping.filter((i) => i.section === s);
            if (!items.length) return null;
            return (
              <Box key={s}>
                <p className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{s}</p>
                <ul className="divide-y divide-line">
                  {items.map((i) => {
                    const on = checked.includes(i.key);
                    return (
                      <li key={i.key}>
                        <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setChecked(on ? checked.filter((c) => c !== i.key) : [...checked, i.key])}>
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand bg-brand text-onbrand" : "border-line")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                          <span className={cn("min-w-0 flex-1 text-sm", on && "text-muted line-through")}>{i.key}</span>
                          <span className={cn("shrink-0 text-sm font-medium", on && "text-muted")}>{qtyText(i)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Box>
            );
          })}
          {checked.length > 0 && (
            <Button variant="ghost" className="w-full" onClick={() => setChecked([])}>
              Desmarcar tudo
            </Button>
          )}
          <p className="text-[11px] text-muted">Quantidades somadas dos 7 dias e arredondadas para cima. Arroz, massas, feijão e carnes aparecem em peso cru (o que você compra). Valores aproximados.</p>
        </div>
      )}
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{children}</div>;
}
