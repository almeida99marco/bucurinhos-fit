// IA do Bucurinho's Fit quando o app roda dentro do Claude: as respostas vêm do próprio Claude
// (capacidade `sample`), usando a conta Claude de quem está usando o app.
// Mesmas regras de segurança das Edge Functions: metas calculadas pelo app (não pela IA),
// pisos calóricos, teto de volume de corrida e sugestões pendentes até aprovação.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Backend } from "./backend";
import { useCap } from "./claudeRuntime";
import { ageFromBirth, bmi, macroTargets, SECONDARY_GOALS, targetCalories } from "./calc";
import { today } from "./utils";

const MEAL_TYPES = ["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"];
const MEAL_LABEL: Record<string, string> = {
  cafe_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};
const RUN_TYPES = ["leve", "rodagem", "intervalado", "tiros", "longao", "ritmo", "recuperacao"];

const NUTRI_RULES = `Você é o assistente de nutrição educativo do app Bucurinho's Fit (Brasil).
Regras obrigatórias:
- Suas sugestões são educativas e NÃO substituem a avaliação de um nutricionista ou médico.
- Respeite rigorosamente alergias, restrições, condições de saúde e alimentos que o usuário não gosta. Nunca inclua um alérgeno informado.
- Nunca proponha dietas extremas, jejuns prolongados, menos de 1200 kcal/dia para mulheres ou 1500 kcal/dia para homens, nem eliminação de grupos alimentares sem motivo informado.
- Use alimentos comuns no Brasil, compatíveis com o orçamento informado. Quantidades em gramas.
- Valores nutricionais devem ser estimativas realistas baseadas em tabelas como TACO/USDA.
- Responda SOMENTE com JSON válido no formato pedido, em português do Brasil.`;

const COACH_RULES = `Você é o assistente de treinamento do app Bucurinho's Fit (Brasil).
Regras obrigatórias:
- Suas sugestões são educativas, não são prescrição médica nem garantia de resultados.
- Respeite o nível de experiência, a recuperação e o histórico do usuário. Progrida de forma gradual: nunca aumente o volume semanal de corrida mais de 10% em relação à média recente, e inclua dias de descanso.
- Para iniciantes, priorize técnica, cargas leves e exercícios básicos.
- Quando o usuário combina musculação e corrida, evite treino pesado de pernas no dia anterior a corridas intensas ou longas.
- Se o usuário relatar dor, lesão ou condição de saúde, recomende avaliação de um profissional antes de seguir.`;

const FOOD_SCHEMA = `{"name": string, "quantity_g": number, "household_measure": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number, "alternatives": [{"name": string, "quantity_g": number}]}`;

const SENSITIVE = /(gestan|grávid|gravid|amament|lactan|diabet|renal|rim|insufici|card[ií]ac|hipertens|bari[aá]tric|transtorno alimentar|anorex|bulim|c[aâ]ncer|hep[aá]tic)/i;

const num = (v: unknown, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : d;
};

function aiError(e: any): Error {
  switch (e?.code) {
    case "not_granted":
      return new Error("Para usar a IA, permita que o app use o Claude quando ele pedir. Recarregue o app e tente de novo.");
    case "sampling_disabled":
    case "capability_disabled":
    case "capability_removed":
    case "not_declared":
      return new Error("A IA do Claude não está disponível nesta conta.");
    case "rate_limited":
      return new Error(e?.reason === "usage_limit" ? "Você atingiu o limite de uso do seu plano Claude. Tente mais tarde." : "Muitos pedidos à IA seguidos. Aguarde um pouco e tente de novo.");
    case "session_expired":
      return new Error("Sua sessão no Claude expirou. Entre novamente.");
    case "invalid_json":
    case "empty_completion":
      return new Error("A IA retornou uma resposta incompleta. Tente novamente.");
    case "refused":
      return new Error("A IA não pôde atender a esse pedido. Ajuste as informações e tente de novo.");
    default:
      return new Error(e?.message && !e?.code ? e.message : "Falha ao falar com a IA. Tente novamente.");
  }
}

async function askJSON(instructions: string, task: string): Promise<any> {
  const sample = await useCap<any>("sample");
  if (!sample) throw new Error("A IA do Claude não está disponível nesta visualização.");
  try {
    return await sample.json(`${instructions}\n\n${task}\n\nResponda apenas com o JSON pedido, sem texto antes ou depois.`, { modelTier: "default", cache: false });
  } catch (e) {
    throw aiError(e);
  }
}

type Food = { name: string; quantity_g: number; household_measure: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; alternatives: any[]; position: number };

function cleanFood(f: any, position = 0): Food {
  if (!f || typeof f.name !== "string" || !f.name.trim()) throw new Error("A IA retornou um alimento inválido. Tente novamente.");
  return {
    name: f.name.trim().slice(0, 120),
    quantity_g: Math.max(0, num(f.quantity_g)),
    household_measure: typeof f.household_measure === "string" ? f.household_measure.slice(0, 80) : null,
    calories: Math.max(0, num(f.calories)),
    protein_g: Math.max(0, num(f.protein_g)),
    carbs_g: Math.max(0, num(f.carbs_g)),
    fat_g: Math.max(0, num(f.fat_g)),
    fiber_g: Math.max(0, num(f.fiber_g)),
    alternatives: Array.isArray(f.alternatives) ? f.alternatives.slice(0, 4).filter((a: any) => a?.name).map((a: any) => ({ name: String(a.name).slice(0, 120), quantity_g: num(a.quantity_g) })) : [],
    position,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function totals(foods: any[]) {
  const s = (k: string) => r1(foods.reduce((a, f) => a + (Number(f[k]) || 0), 0));
  return { calories: s("calories"), protein_g: s("protein_g"), carbs_g: s("carbs_g"), fat_g: s("fat_g"), fiber_g: s("fiber_g") };
}

async function recomputePlan(be: Backend, planId: string) {
  const meals = await be.list("meals", { eq: { plan_id: planId } });
  await be.update("meal_plans", planId, { total_calories: totals(meals).calories, ...pick(totals(meals)) });
}
const pick = (t: ReturnType<typeof totals>) => ({ protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, fiber_g: t.fiber_g });

async function context(be: Backend) {
  const me = await be.auth.getUser();
  const profile = (await be.list("profiles", { eq: { id: me!.id } }))[0];
  const np = (await be.list("nutrition_profiles", { limit: 1 }))[0];
  if (!profile) throw new Error("Perfil não encontrado.");
  return { profile, np, age: ageFromBirth(profile.birth_date) };
}

function describeUser(profile: any, np: any, age: number) {
  return [
    `Sexo: ${profile.sex}; Idade: ${age}; Altura: ${profile.height_cm} cm; Peso atual: ${profile.weight_kg} kg; Peso desejado: ${np.target_weight_kg ?? profile.goal_weight_kg ?? "não informado"} kg`,
    `Objetivo principal: ${np.goal}; Nível de atividade (sem a corrida): ${np.activity_level ?? profile.activity_level}`,
    `Objetivos complementares: ${(np.secondary_goals ?? []).map((g: string) => SECONDARY_GOALS[g] ?? g).join(", ") || "nenhum"}`,
    `Objetivo descrito pelo usuário: ${np.custom_goal || "—"}`,
    `Carga de treino: musculação ${np.strength_days_per_week ?? "?"}x/semana; corrida ${np.running_km_per_week ?? 0} km/semana; horário dos treinos: ${np.training_time || "não informado"}`,
    `Restrições alimentares: ${np.restrictions || "nenhuma"}`,
    `ALERGIAS (proibido incluir): ${np.allergies || "nenhuma"}`,
    `Condições de saúde: ${np.health_conditions || "nenhuma informada"}`,
    `Preferências: ${np.preferences || "sem preferências"}`,
    `Alimentos que NÃO gosta (não incluir): ${np.dislikes || "nenhum"}`,
    `Suplementos que já usa: ${np.supplements || "nenhum informado"}`,
    `Orçamento: ${np.budget || "moderado"}`,
    `Rotina e horários: ${np.routine || "não informada"}`,
  ].join("\n");
}

function requireNutritionContext(ctx: Awaited<ReturnType<typeof context>>) {
  const { profile, np, age } = ctx;
  if (!np) throw new Error("Preencha seu perfil nutricional antes de gerar a dieta.");
  if (!age || !profile.height_cm || !profile.weight_kg || !profile.sex) throw new Error("Complete data de nascimento, sexo, altura e peso no seu perfil.");
  if (age < 18) throw new Error("A geração automática de dietas é destinada a maiores de 18 anos. Procure um nutricionista.");
  return { profile, np, age };
}

// ====================================================================== NUTRIÇÃO
async function generatePlan(be: Backend) {
  const { profile, np, age } = requireNutritionContext(await context(be));
  const warnings: string[] = [];
  let goal = np.goal ?? "manutencao";
  const imc = bmi(profile.weight_kg, profile.height_cm);
  if (goal === "emagrecimento" && imc != null && imc < 18.5) {
    goal = "manutencao";
    warnings.push("Seu IMC está abaixo de 18,5. Por segurança, o plano foi calculado para manutenção. Procure um nutricionista.");
  }
  if (SENSITIVE.test(`${np.health_conditions ?? ""} ${np.restrictions ?? ""}`))
    warnings.push("Você informou uma condição de saúde que exige acompanhamento profissional. Use este plano apenas como referência e valide-o com seu nutricionista ou médico.");

  const base = targetCalories({ sex: profile.sex, age, height_cm: profile.height_cm, weight_kg: profile.weight_kg, activity_level: np.activity_level ?? profile.activity_level, goal, running_km_week: np.running_km_per_week })!;
  const macros = macroTargets(base, Number(profile.weight_kg), goal, { secondary_goals: np.secondary_goals, running_km_week: np.running_km_per_week });
  const kcal = macros.kcal;
  const perf = (np.secondary_goals ?? []).some((g: string) => g === "performance_corrida" || g === "resistencia") || Number(np.running_km_per_week) > 0;
  const rules = [
    goal === "ganho_massa" && "Ganho de massa: distribua a proteína em todas as refeições (20–40 g por refeição) e inclua refeição proteica antes de dormir quando houver ceia.",
    perf && "Performance na corrida: carboidratos de boa digestão nas refeições próximas aos treinos. Pré-treino (1–3 h antes): carboidrato + pouca proteína, pouca gordura e pouca fibra. Pós-treino: proteína (20–40 g) + carboidrato.",
    perf && "Nas notas, explique como ajustar em dias de corrida longa (mais carboidrato e hidratação com eletrólitos) e em dias de descanso (reduzir um pouco o carboidrato, manter a proteína).",
    np.training_time && `Posicione pré e pós-treino de acordo com o horário dos treinos (${np.training_time}) e indique "pré-treino"/"pós-treino" no nome dessas refeições.`,
    np.supplements && "Não prescreva suplementos; apenas considere os que o usuário já usa.",
  ].filter(Boolean);
  const n = Math.min(6, Math.max(3, np.meals_per_day ?? 5));
  const mealTypes = n === 3 ? ["cafe_manha", "almoco", "jantar"] : n === 4 ? ["cafe_manha", "almoco", "lanche_tarde", "jantar"] : n === 5 ? ["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar"] : MEAL_TYPES;

  const ai = await askJSON(
    NUTRI_RULES,
    `Dados do usuário:
${describeUser(profile, { ...np, goal }, age)}

Meta diária calculada pelo app: ${kcal} kcal; proteínas ~${macros.protein} g; carboidratos ~${macros.carbs} g; gorduras ~${macros.fat} g; fibras ≥ ${macros.fiber} g.
${rules.length ? `Orientações específicas:\n- ${rules.join("\n- ")}` : ""}
Monte um plano alimentar de 1 dia com exatamente estas refeições, nesta ordem: ${mealTypes.map((m) => `${m} (${MEAL_LABEL[m]})`).join(", ")}.
O total diário deve ficar entre ${Math.round(kcal * 0.95)} e ${Math.round(kcal * 1.05)} kcal. Para cada alimento, sugira 2 a 3 alternativas equivalentes.

Formato JSON:
{"title": string, "notes": string, "meals": [{"meal_type": string, "name": string, "time": "HH:MM", "foods": [${FOOD_SCHEMA}]}]}`,
  );
  if (!Array.isArray(ai?.meals) || !ai.meals.length) throw new Error("A IA não retornou refeições. Tente novamente.");
  const meals = ai.meals
    .filter((m: any) => MEAL_TYPES.includes(m?.meal_type) && Array.isArray(m.foods) && m.foods.length)
    .map((m: any, i: number) => {
      const foods = m.foods.slice(0, 12).map((f: any, j: number) => cleanFood(f, j));
      return { meal_type: m.meal_type, name: String(m.name || MEAL_LABEL[m.meal_type]).slice(0, 80), time: typeof m.time === "string" ? m.time.slice(0, 5) : null, position: i, foods, ...totals(foods) };
    });
  if (!meals.length) throw new Error("A IA retornou refeições inválidas. Tente novamente.");
  const pt = totals(meals);

  for (const a of await be.list("meal_plans", { eq: { status: "active" } })) await be.update("meal_plans", a.id, { status: "archived" });
  const plan = await be.insert<any>("meal_plans", {
    title: String(ai.title || `Plano ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 120),
    status: "active",
    target_calories: kcal,
    total_calories: pt.calories,
    ...pick(pt),
    notes: [typeof ai.notes === "string" ? ai.notes : "", ...warnings].filter(Boolean).join("\n\n"),
    source: "ai",
  });
  const mealRows = await be.insertMany<any>("meals", meals.map(({ foods: _f, ...m }: any) => ({ ...m, plan_id: plan.id })));
  await be.insertMany(
    "food_items",
    meals.flatMap((m: any, i: number) => m.foods.map((f: Food) => ({ ...f, meal_id: mealRows[i].id }))),
  );
  await be.insert("ai_interactions", { kind: "dieta", request: { kcal, macros, goal }, response: { title: ai.title }, status: "done" });
  await be.insert("daily_activity", { kind: "dieta", title: "Novo plano alimentar gerado pelo Claude", ref_id: plan.id, date: today(), details: {} });
  return { plan_id: plan.id, warnings };
}

async function substituteMeal(be: Backend, mealId: string, hint?: string) {
  const { profile, np, age } = requireNutritionContext(await context(be));
  const meal = await be.get<any>("meals", mealId);
  if (!meal) throw new Error("Refeição não encontrada.");
  const foods = await be.list<any>("food_items", { eq: { meal_id: mealId } });
  const ai = await askJSON(
    NUTRI_RULES,
    `Dados do usuário:
${describeUser(profile, np, age)}

Refeição atual (${MEAL_LABEL[meal.meal_type]}): ${foods.map((f) => `${f.name} ${f.quantity_g} g`).join("; ")}.
Total atual: ${meal.calories} kcal, P ${meal.protein_g} g, C ${meal.carbs_g} g, G ${meal.fat_g} g.
${hint ? `Pedido do usuário: ${String(hint).slice(0, 300)}` : ""}
Crie uma refeição DIFERENTE e equivalente (±10% de calorias e proteínas).
Formato JSON: {"name": string, "foods": [${FOOD_SCHEMA}]}`,
  );
  if (!Array.isArray(ai?.foods) || !ai.foods.length) throw new Error("A IA não retornou alimentos. Tente novamente.");
  const clean = ai.foods.slice(0, 12).map((f: any, j: number) => cleanFood(f, j));
  await be.removeWhere("food_items", { meal_id: mealId });
  await be.insertMany("food_items", clean.map((f: Food) => ({ ...f, meal_id: mealId })));
  await be.update("meals", mealId, { name: String(ai.name || meal.name).slice(0, 80), ...totals(clean) });
  await recomputePlan(be, meal.plan_id);
  await be.insert("ai_interactions", { kind: "substituir_refeicao", request: { meal_id: mealId }, response: { name: ai.name }, status: "done" });
  return { ok: true };
}

async function substituteFood(be: Backend, foodId: string, preferred?: string) {
  const { profile, np, age } = requireNutritionContext(await context(be));
  const food = await be.get<any>("food_items", foodId);
  if (!food) throw new Error("Alimento não encontrado.");
  const meal = await be.get<any>("meals", food.meal_id);
  const ai = await askJSON(
    NUTRI_RULES,
    `Dados do usuário:
${describeUser(profile, np, age)}

Substitua o alimento "${food.name}" (${food.quantity_g} g; ${food.calories} kcal; P ${food.protein_g} g; C ${food.carbs_g} g; G ${food.fat_g} g) da refeição ${MEAL_LABEL[meal?.meal_type] ?? ""} por um alimento equivalente diferente.
${preferred ? `O usuário prefere: ${String(preferred).slice(0, 120)}` : ""}
Formato JSON: ${FOOD_SCHEMA}`,
  );
  await be.update("food_items", foodId, cleanFood(ai, food.position));
  const foods = await be.list<any>("food_items", { eq: { meal_id: food.meal_id } });
  await be.update("meals", food.meal_id, totals(foods));
  if (meal) await recomputePlan(be, meal.plan_id);
  await be.insert("ai_interactions", { kind: "substituir_alimento", request: { food_item_id: foodId }, response: { name: ai?.name }, status: "done" });
  return { ok: true };
}

// ====================================================================== TREINO
function userLine(profile: any) {
  return `Sexo: ${profile.sex ?? "não informado"}; Idade: ${ageFromBirth(profile.birth_date) ?? "não informada"}; Altura: ${profile.height_cm ?? "?"} cm; Peso: ${profile.weight_kg ?? "?"} kg; Objetivos: ${profile.fitness_goals || "não informados"}`;
}

async function coachStrength(be: Backend, input: any) {
  const { profile } = await context(be);
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const sets = await be.list<any>("workout_sets", { eq: { completed: true }, gte: { created_at: since } });
  const sessions = await be.list<any>("workout_sessions", { gte: { started_at: since } });
  const best: Record<string, { load: number; reps: number }> = {};
  for (const s of sets) {
    const l = Number(s.load_kg) || 0;
    if (!best[s.exercise_name] || l > best[s.exercise_name].load) best[s.exercise_name] = { load: l, reps: s.reps ?? 0 };
  }
  const history = Object.entries(best).slice(0, 40).map(([n, b]) => `${n}: ${b.load} kg x ${b.reps}`).join("; ") || "sem histórico registrado";
  const days = Math.min(6, Math.max(2, Number(input.days_per_week) || 3));
  const ai = await askJSON(
    COACH_RULES,
    `Usuário: ${userLine(profile)}
Objetivo do treino: ${input.goal || profile.fitness_goals || "hipertrofia e saúde"}
Experiência: ${input.experience || "iniciante"}
Frequência semanal desejada: ${days} dias
Grupos musculares prioritários: ${input.focus || "equilibrado"}
Observações/recuperação/limitações: ${input.notes || "nenhuma"}
Sessões de musculação nos últimos 60 dias: ${sessions.length}
Melhores cargas recentes: ${history}

Monte uma divisão semanal com ${days} treinos (labels "Treino A", "Treino B", ...). Para exercícios com histórico, sugira progressão de no máximo 5–10%. Sem histórico, use load_kg null.
Distribua em dias da semana (0=domingo ... 6=sábado) evitando o mesmo grupo muscular em dias consecutivos.
Formato JSON:
{"title": string, "rationale": string, "cautions": [string], "days": [{"label": string, "name": string, "weekdays": [number], "exercises": [{"name": string, "muscle_group": string, "sets": number, "reps": string, "load_kg": number|null, "rest_seconds": number, "notes": string}]}]}`,
  );
  if (!Array.isArray(ai?.days) || !ai.days.length) throw new Error("A IA não retornou uma divisão de treino. Tente novamente.");
  const suggestion = {
    type: "strength",
    title: String(ai.title || "Plano de musculação sugerido").slice(0, 120),
    rationale: String(ai.rationale || ""),
    cautions: Array.isArray(ai.cautions) ? ai.cautions.map(String).slice(0, 6) : [],
    days: ai.days.slice(0, 7).map((d: any, i: number) => ({
      label: String(d.label || `Treino ${String.fromCharCode(65 + i)}`).slice(0, 40),
      name: String(d.name || "").slice(0, 80),
      weekdays: (Array.isArray(d.weekdays) ? d.weekdays : []).map(Number).filter((x: number) => x >= 0 && x <= 6),
      exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 12).map((e: any) => ({
        name: String(e.name || "Exercício").slice(0, 100),
        muscle_group: String(e.muscle_group || "").slice(0, 40),
        sets: Math.min(10, Math.max(1, Math.round(num(e.sets, 3)))),
        reps: String(e.reps ?? "10").slice(0, 20),
        load_kg: e.load_kg == null ? null : Math.max(0, num(e.load_kg)),
        rest_seconds: Math.min(300, Math.max(30, Math.round(num(e.rest_seconds, 60)))),
        notes: String(e.notes || "").slice(0, 200),
      })),
    })),
  };
  const row = await be.insert("ai_interactions", { kind: "musculacao", request: input, response: suggestion, status: "pending" });
  return { interaction: row };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function coachRunning(be: Backend, input: any) {
  const { profile } = await context(be);
  if (!profile.running_enabled) throw new Error("O módulo de corrida não está habilitado para esta conta.");
  const since = new Date(Date.now() - 56 * 864e5).toISOString().slice(0, 10);
  const runs = await be.list<any>("running_sessions", { eq: { status: "done" }, gte: { date: since }, order: [["date", "asc"]] });
  const weekly: Record<string, number> = {};
  let paceSum = 0;
  let paceN = 0;
  for (const r of runs) {
    const d = new Date(r.date + "T12:00:00Z");
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = isoDate(monday);
    weekly[k] = (weekly[k] ?? 0) + Number(r.distance_km);
    if (r.duration_seconds && Number(r.distance_km) > 0) {
      paceSum += r.duration_seconds / Number(r.distance_km);
      paceN++;
    }
  }
  const weeks = Object.values(weekly);
  const last4 = weeks.slice(-4);
  const avg = last4.length ? last4.reduce((a, b) => a + b, 0) / last4.length : 0;
  const avgPace = paceN ? Math.round(paceSum / paceN) : null;
  const nWeeks = Math.min(4, Math.max(1, Number(input.weeks) || 2));
  const runDays = Math.min(6, Math.max(2, Number(input.days_per_week) || 3));
  const caps = Array.from({ length: nWeeks }, (_, i) => Math.round(Math.max(avg, 8) * Math.pow(1.1, i + (avg ? 1 : 0)) * 10) / 10);

  const ai = await askJSON(
    COACH_RULES,
    `Usuário: ${userLine(profile)}
Objetivo de distância: ${input.goal_km ? input.goal_km + " km" : "melhorar condicionamento"}
Frequência semanal desejada: ${runDays} corridas
Média semanal recente (últimas 4 semanas): ${avg.toFixed(1)} km
Pace médio recente: ${avgPace ? `${Math.floor(avgPace / 60)}:${String(avgPace % 60).padStart(2, "0")} min/km` : "sem dados"}
Observações/recuperação: ${input.notes || "nenhuma"}

Monte ${nWeeks} semana(s) de treino. Volume MÁXIMO por semana: ${caps.map((c, i) => `semana ${i + 1}: ${c} km`).join("; ")}.
Tipos permitidos: ${RUN_TYPES.join(", ")}. No máximo 1 treino intenso (intervalado/tiros/ritmo) por semana para iniciantes e 2 para experientes. weekday: 0=domingo ... 6=sábado.
Formato JSON:
{"title": string, "rationale": string, "cautions": [string], "weeks": [{"week": number, "sessions": [{"weekday": number, "type": string, "distance_km": number, "target_pace": string, "notes": string}]}]}`,
  );
  if (!Array.isArray(ai?.weeks) || !ai.weeks.length) throw new Error("A IA não retornou um plano de corrida. Tente novamente.");
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + (((8 - start.getUTCDay()) % 7) || 7));
  const outWeeks = ai.weeks.slice(0, nWeeks).map((w: any, wi: number) => {
    let sessions = (Array.isArray(w.sessions) ? w.sessions : []).slice(0, 7).map((s: any) => ({
      weekday: Math.min(6, Math.max(0, Math.round(num(s.weekday, 1)))),
      type: RUN_TYPES.includes(s.type) ? s.type : "leve",
      distance_km: Math.max(0.5, num(s.distance_km, 3)),
      target_pace: String(s.target_pace || "").slice(0, 20),
      notes: String(s.notes || "").slice(0, 200),
    }));
    const total = sessions.reduce((a: number, s: any) => a + s.distance_km, 0);
    if (total > caps[wi]) sessions = sessions.map((s: any) => ({ ...s, distance_km: Math.round(s.distance_km * (caps[wi] / total) * 10) / 10 }));
    sessions = sessions.map((s: any) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + wi * 7 + ((s.weekday + 6) % 7));
      return { ...s, date: isoDate(d) };
    });
    return { week: wi + 1, cap_km: caps[wi], sessions };
  });
  const suggestion = {
    type: "running",
    title: String(ai.title || "Plano de corrida sugerido").slice(0, 120),
    rationale: String(ai.rationale || ""),
    cautions: Array.isArray(ai.cautions) ? ai.cautions.map(String).slice(0, 6) : [],
    weeks: outWeeks,
  };
  const row = await be.insert("ai_interactions", { kind: "corrida", request: input, response: suggestion, status: "pending" });
  return { interaction: row };
}

async function coachChat(be: Backend, input: any) {
  const question = String(input.question || "").trim().slice(0, 1500);
  if (!question) throw new Error("Escreva sua pergunta.");
  const { profile } = await context(be);
  const since = new Date(Date.now() - 28 * 864e5).toISOString();
  const sessions = await be.list("workout_sessions", { gte: { started_at: since } });
  const runs = profile.running_enabled ? await be.list<any>("running_sessions", { eq: { status: "done" }, gte: { date: since.slice(0, 10) } }) : [];
  const ai = await askJSON(
    COACH_RULES,
    `Usuário: ${userLine(profile)}
Treinos de musculação nas últimas 4 semanas: ${sessions.length}
Corridas nas últimas 4 semanas: ${runs.length} (${runs.reduce((a, r) => a + Number(r.distance_km), 0).toFixed(1)} km)

Pergunta: ${question}

Responda em português do Brasil, de forma prática e curta. Formato JSON: {"answer": string}`,
  );
  const answer = String(ai?.answer || "").slice(0, 6000);
  if (!answer) throw new Error("A IA não retornou uma resposta. Tente novamente.");
  const row = await be.insert("ai_interactions", { kind: "chat", request: { question }, response: { answer }, status: "done" });
  return { interaction: row };
}

// ====================================================================== DISPATCH
export async function runAI(name: string, body: any, be: Backend) {
  if (name === "ai-nutrition") {
    if (body.action === "generate_plan") return generatePlan(be);
    if (body.action === "substitute_meal") return substituteMeal(be, body.meal_id, body.hint);
    if (body.action === "substitute_food") return substituteFood(be, body.food_item_id, body.preferred);
  }
  if (name === "ai-coach") {
    if (body.action === "strength") return coachStrength(be, body.input ?? {});
    if (body.action === "running") return coachRunning(be, body.input ?? {});
    if (body.action === "chat") return coachChat(be, body.input ?? {});
  }
  throw new Error("Ação de IA inválida.");
}
