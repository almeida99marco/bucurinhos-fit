import { backend } from "./backend";
import type { Meal, MealLog, MealPlan, RunningSession } from "./types";
import { addDays, today } from "./utils";
import { logActivity } from "@/hooks/useData";

export type DayType = "padrao" | "vespera_corrida";
export const DAY_TYPE_LABEL: Record<DayType, string> = { padrao: "Dia normal", vespera_corrida: "Véspera de corrida" };
export const planDayType = (p: Pick<MealPlan, "day_type">): DayType => (p.day_type === "vespera_corrida" ? "vespera_corrida" : "padrao");

/** Corrida planejada para amanhã (se houver): define se hoje é véspera de corrida. */
export async function nextDayRun(ownerId?: string): Promise<RunningSession | null> {
  const tomorrow = addDays(today(), 1);
  const runs = await backend.list<RunningSession>("running_sessions", { eq: { date: tomorrow, status: "planned" }, ownerId }).catch(() => []);
  return runs.sort((a, b) => Number(b.distance_km) - Number(a.distance_km))[0] ?? null;
}

/**
 * Plano ativo. Sem `dayType`, escolhe sozinho: se amanhã tem corrida planejada e existe o cardápio de véspera, usa ele.
 */
export async function getActivePlan(ownerId?: string, dayType?: DayType) {
  const rows = await backend.list<MealPlan>("meal_plans", { eq: { status: "active" }, ownerId });
  const of = (t: DayType) => rows.find((p) => planDayType(p) === t) ?? null;
  if (dayType) return of(dayType);
  if (of("vespera_corrida") && (await nextDayRun(ownerId))) return of("vespera_corrida");
  return of("padrao") ?? rows[0] ?? null;
}

export async function getPlanMeals(planId: string, ownerId?: string) {
  return backend.list<Meal>("meals", { eq: { plan_id: planId }, order: [["position", "asc"]], ownerId });
}

/** Marca/desmarca uma refeição do plano como realizada na data. */
export async function toggleMealDone(meal: Meal, date: string, logs: MealLog[]) {
  const existing = logs.find((l) => l.meal_id === meal.id && l.date === date);
  if (existing) {
    await backend.remove("meal_logs", existing.id);
    return false;
  }
  await backend.insert("meal_logs", {
    date,
    meal_id: meal.id,
    name: meal.name,
    calories: meal.calories,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
    fiber_g: meal.fiber_g,
  });
  logActivity("refeicao", `${meal.name} realizada`, { ref_id: meal.id, date, details: { calories: meal.calories } });
  return true;
}

export function sumLogs(logs: MealLog[]) {
  return logs.reduce(
    (a, l) => ({
      calories: a.calories + Number(l.calories || 0),
      protein_g: a.protein_g + Number(l.protein_g || 0),
      carbs_g: a.carbs_g + Number(l.carbs_g || 0),
      fat_g: a.fat_g + Number(l.fat_g || 0),
      fiber_g: a.fiber_g + Number(l.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
}
