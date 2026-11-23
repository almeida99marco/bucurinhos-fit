import type { Query } from "./backend";

export const CASCADE: Record<string, [string, string][]> = {
  meal_plans: [["meals", "plan_id"]],
  meals: [["food_items", "meal_id"]],
  workout_plans: [["workout_days", "plan_id"]],
  workout_days: [["exercises", "workout_day_id"]],
  workout_sessions: [["workout_sets", "session_id"]],
};

export const SHARE_SCOPE: Record<string, string> = {
  nutrition_profiles: "nutricao", meal_plans: "nutricao", meals: "nutricao", food_items: "nutricao", meal_logs: "nutricao",
  workout_plans: "treinos", workout_days: "treinos", exercises: "treinos", workout_sessions: "treinos", workout_sets: "treinos",
  running_sessions: "corrida", running_goals: "corrida", body_measurements: "evolucao", progress_photos: "fotos",
};

const cmp = (a: any, b: any) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

/** Aplica filtros/ordenação/limite de uma Query a linhas em memória. */
export function applyQuery<T = any>(input: any[], q: Query = {}): T[] {
  let rows = [...input];
  for (const [k, v] of Object.entries(q.eq ?? {})) rows = rows.filter((r) => (r[k] ?? null) === v);
  for (const [k, v] of Object.entries(q.gte ?? {})) rows = rows.filter((r) => r[k] != null && r[k] >= (v as any));
  for (const [k, v] of Object.entries(q.lte ?? {})) rows = rows.filter((r) => r[k] != null && r[k] <= (v as any));
  for (const [k, v] of Object.entries(q.in ?? {})) rows = rows.filter((r) => v.includes(r[k]));
  const order = q.order ?? [];
  if (order.length)
    rows.sort((a, b) => {
      for (const [k, dir] of order) {
        const c = cmp(a[k], b[k]);
        if (c) return dir === "asc" ? c : -c;
      }
      return 0;
    });
  if (q.limit) rows = rows.slice(0, q.limit);
  return rows as T[];
}
