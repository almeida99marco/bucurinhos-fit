// Edge Function: geração de plano alimentar e substituições com IA.
// Ações: generate_plan | substitute_meal | substitute_food
import { callAI, getUserClient, handle, HttpError, json, num } from "../_shared/common.ts";
import { ageFromBirth, bmi, macroTargets, SECONDARY_GOALS, targetCalories } from "../_shared/calc.ts";

const MEAL_TYPES = ["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"];
const MEAL_LABEL: Record<string, string> = {
  cafe_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};

const SYSTEM = `Você é um assistente de nutrição educativo do app Bucurinho's Fit (Brasil).
Regras obrigatórias:
- Suas sugestões são educativas e NÃO substituem a avaliação de um nutricionista ou médico.
- Respeite rigorosamente alergias, restrições, condições de saúde e alimentos que o usuário não gosta. Nunca inclua um alérgeno informado.
- Nunca proponha dietas extremas, jejuns prolongados, menos de 1200 kcal/dia para mulheres ou 1500 kcal/dia para homens, nem eliminação de grupos alimentares sem motivo informado.
- Use alimentos comuns no Brasil, compatíveis com o orçamento informado. Quantidades em gramas (ou ml para líquidos, expressos em gramas equivalentes).
- Valores nutricionais devem ser estimativas realistas baseadas em tabelas como TACO/USDA.
- Responda SOMENTE com JSON válido, no formato pedido, em português do Brasil.`;

const FOOD_SCHEMA = `{"name": string, "quantity_g": number, "household_measure": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number, "alternatives": [{"name": string, "quantity_g": number}]}`;

type Food = {
  name: string; quantity_g: number; household_measure?: string; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
  alternatives?: { name: string; quantity_g: number }[];
};

function cleanFood(f: any, position = 0) {
  if (!f || typeof f.name !== "string" || !f.name.trim()) throw new HttpError(502, "A IA retornou um alimento inválido.");
  return {
    name: f.name.trim().slice(0, 120),
    quantity_g: Math.max(0, num(f.quantity_g)),
    household_measure: typeof f.household_measure === "string" ? f.household_measure.slice(0, 80) : null,
    calories: Math.max(0, num(f.calories)),
    protein_g: Math.max(0, num(f.protein_g)),
    carbs_g: Math.max(0, num(f.carbs_g)),
    fat_g: Math.max(0, num(f.fat_g)),
    fiber_g: Math.max(0, num(f.fiber_g)),
    alternatives: Array.isArray(f.alternatives)
      ? f.alternatives.slice(0, 4).filter((a: any) => a?.name).map((a: any) => ({ name: String(a.name).slice(0, 120), quantity_g: num(a.quantity_g) }))
      : [],
    position,
  };
}

const sum = (foods: Food[], k: keyof Food) => Math.round(foods.reduce((s, f) => s + (Number(f[k]) || 0), 0) * 10) / 10;

function totals(foods: Food[]) {
  return {
    calories: sum(foods, "calories"),
    protein_g: sum(foods, "protein_g"),
    carbs_g: sum(foods, "carbs_g"),
    fat_g: sum(foods, "fat_g"),
    fiber_g: sum(foods, "fiber_g"),
  };
}

async function loadContext(supabase: any, userId: string) {
  const [{ data: profile }, { data: np }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("nutrition_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile) throw new HttpError(400, "Perfil não encontrado.");
  if (!np) throw new HttpError(400, "Preencha seu perfil nutricional antes de gerar a dieta.");
  const age = ageFromBirth(profile.birth_date);
  if (!age || !profile.height_cm || !profile.weight_kg || !profile.sex)
    throw new HttpError(400, "Complete idade (data de nascimento), sexo, altura e peso no seu perfil.");
  if (age < 18) throw new HttpError(400, "A geração automática de dietas é destinada a maiores de 18 anos. Procure um nutricionista.");
  return { profile, np, age };
}

function describeUser(profile: any, np: any, age: number) {
  return [
    `Sexo: ${profile.sex}; Idade: ${age}; Altura: ${profile.height_cm} cm; Peso atual: ${profile.weight_kg} kg; Peso desejado: ${np.target_weight_kg ?? profile.goal_weight_kg ?? "não informado"} kg`,
    `Objetivo: ${np.goal}; Nível de atividade: ${np.activity_level ?? profile.activity_level}`,
    `Restrições alimentares: ${np.restrictions || "nenhuma"}`,
    `ALERGIAS (proibido incluir): ${np.allergies || "nenhuma"}`,
    `Condições de saúde: ${np.health_conditions || "nenhuma informada"}`,
    `Preferências: ${np.preferences || "sem preferências"}`,
    `Alimentos que NÃO gosta (não incluir): ${np.dislikes || "nenhum"}`,
    `Orçamento: ${np.budget || "moderado"}`,
    `Rotina e horários: ${np.routine || "não informada"}`,
    `Objetivos complementares: ${(np.secondary_goals ?? []).map((g: string) => SECONDARY_GOALS[g] ?? g).join(", ") || "nenhum"}`,
    `Objetivo descrito pelo usuário: ${np.custom_goal || "—"}`,
    `Carga de treino: musculação ${np.strength_days_per_week ?? "?"}x/semana; corrida ${np.running_km_per_week ?? 0} km/semana; horário dos treinos: ${np.training_time || "não informado"}`,
    `Suplementos que já usa: ${np.supplements || "nenhum informado"}`,
  ].join("\n");
}

const SENSITIVE = /(gestan|grávid|gravid|amament|lactan|diabet|renal|rim|insufici|card[ií]ac|hipertens|bari[aá]tric|transtorno alimentar|anorex|bulim|c[aâ]ncer|hep[aá]tic)/i;

async function recomputePlan(supabase: any, planId: string) {
  const { data: meals } = await supabase.from("meals").select("calories,protein_g,carbs_g,fat_g,fiber_g").eq("plan_id", planId);
  const t = totals((meals ?? []) as Food[]);
  await supabase.from("meal_plans").update({
    total_calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, fiber_g: t.fiber_g,
  }).eq("id", planId);
}

Deno.serve(handle(async (req) => {
  const { supabase, userId } = await getUserClient(req);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ------------------------------------------------------------------ GENERATE
  if (action === "generate_plan") {
    const { profile, np, age } = await loadContext(supabase, userId);
    const warnings: string[] = [];
    let goal = np.goal ?? "manutencao";
    const imc = bmi(profile.weight_kg, profile.height_cm);
    if (goal === "emagrecimento" && imc != null && imc < 18.5) {
      goal = "manutencao";
      warnings.push("Seu IMC está abaixo de 18,5. Por segurança, o plano foi calculado para manutenção. Procure um nutricionista antes de buscar emagrecimento.");
    }
    if (SENSITIVE.test(`${np.health_conditions ?? ""} ${np.restrictions ?? ""}`)) {
      warnings.push("Você informou uma condição de saúde que exige acompanhamento profissional. Use este plano apenas como referência e valide-o com seu nutricionista ou médico.");
    }
    const base = targetCalories({ sex: profile.sex, age, height_cm: profile.height_cm, weight_kg: profile.weight_kg, activity_level: np.activity_level ?? profile.activity_level, goal, running_km_week: np.running_km_per_week })!;
    const macros = macroTargets(base, Number(profile.weight_kg), goal, { secondary_goals: np.secondary_goals, running_km_week: np.running_km_per_week });
    const kcal = macros.kcal;
    const perf = (np.secondary_goals ?? []).some((g: string) => g === "performance_corrida" || g === "resistencia") || Number(np.running_km_per_week) > 0;
    const sportRules = [
      goal === "ganho_massa" && "Ganho de massa: distribua a proteína em todas as refeições (cerca de 0,3–0,4 g/kg por refeição, 20–40 g) e inclua uma refeição proteica antes de dormir quando houver ceia.",
      perf && "Performance na corrida: priorize carboidratos de boa digestão nas refeições próximas aos treinos. Pré-treino (1–3 h antes): carboidrato + pouca proteína, pouca gordura e pouca fibra. Pós-treino: proteína (20–40 g) + carboidrato para recuperação do glicogênio.",
      perf && "Nas notas, explique como ajustar em dias de corrida longa (mais carboidrato e hidratação com eletrólitos) e em dias de descanso (reduzir um pouco o carboidrato, manter a proteína).",
      np.training_time && `Posicione as refeições pré e pós-treino de acordo com o horário dos treinos (${np.training_time}) e nomeie essas refeições indicando "pré-treino" ou "pós-treino" quando aplicável.`,
      np.supplements && "Não prescreva suplementos; apenas considere os que o usuário já usa ao montar as refeições.",
    ].filter(Boolean).join("\n- ");
    const mealsPerDay = Math.min(6, Math.max(3, np.meals_per_day ?? 5));
    const mealTypes =
      mealsPerDay === 3 ? ["cafe_manha", "almoco", "jantar"]
      : mealsPerDay === 4 ? ["cafe_manha", "almoco", "lanche_tarde", "jantar"]
      : mealsPerDay === 5 ? ["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar"]
      : MEAL_TYPES;

    const prompt = `Dados do usuário:
${describeUser(profile, { ...np, goal }, age)}

Meta diária calculada: ${kcal} kcal; proteínas ~${macros.protein} g; carboidratos ~${macros.carbs} g; gorduras ~${macros.fat} g; fibras ≥ ${macros.fiber} g.
${sportRules ? `Orientações específicas para este usuário:\n- ${sportRules}` : ""}
Monte um plano alimentar de 1 dia com exatamente estas refeições, nesta ordem: ${mealTypes.map((m) => `${m} (${MEAL_LABEL[m]})`).join(", ")}.
O total diário deve ficar entre ${Math.round(kcal * 0.95)} e ${Math.round(kcal * 1.05)} kcal.
Para cada alimento, sugira 2 a 3 alternativas equivalentes em "alternatives".

Formato JSON:
{"title": string, "notes": string (orientações gerais curtas, incluindo hidratação), "meals": [{"meal_type": string, "name": string, "time": "HH:MM", "foods": [${FOOD_SCHEMA}]}]}`;

    const ai = await callAI(SYSTEM, prompt);
    if (!Array.isArray(ai?.meals) || ai.meals.length === 0) throw new HttpError(502, "A IA não retornou refeições. Tente novamente.");

    const meals = ai.meals
      .filter((m: any) => MEAL_TYPES.includes(m?.meal_type) && Array.isArray(m.foods) && m.foods.length)
      .map((m: any, i: number) => {
        const foods = m.foods.slice(0, 12).map((f: any, j: number) => cleanFood(f, j));
        return { meal_type: m.meal_type, name: String(m.name || MEAL_LABEL[m.meal_type]).slice(0, 80), time: typeof m.time === "string" ? m.time.slice(0, 5) : null, position: i, foods, ...totals(foods) };
      });
    if (!meals.length) throw new HttpError(502, "A IA retornou refeições inválidas. Tente novamente.");
    const planTotals = totals(meals as any);

    // Arquiva o plano ativo anterior (fica disponível no histórico)
    await supabase.from("meal_plans").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");

    const { data: plan, error: planErr } = await supabase.from("meal_plans").insert({
      user_id: userId,
      title: String(ai.title || `Plano ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 120),
      status: "active",
      target_calories: kcal,
      total_calories: planTotals.calories,
      protein_g: planTotals.protein_g,
      carbs_g: planTotals.carbs_g,
      fat_g: planTotals.fat_g,
      fiber_g: planTotals.fiber_g,
      notes: [typeof ai.notes === "string" ? ai.notes : "", ...warnings].filter(Boolean).join("\n\n"),
      source: "ai",
    }).select().single();
    if (planErr) throw new HttpError(500, planErr.message);

    for (const m of meals) {
      const { foods, ...meal } = m;
      const { data: mealRow, error: mErr } = await supabase.from("meals").insert({ ...meal, user_id: userId, plan_id: plan.id }).select().single();
      if (mErr) throw new HttpError(500, mErr.message);
      const { error: fErr } = await supabase.from("food_items").insert(foods.map((f: any) => ({ ...f, user_id: userId, meal_id: mealRow.id })));
      if (fErr) throw new HttpError(500, fErr.message);
    }

    await supabase.from("ai_interactions").insert({ user_id: userId, kind: "dieta", request: { kcal, macros, goal }, response: ai, status: "done" });
    await supabase.from("daily_activity").insert({ user_id: userId, kind: "dieta", title: "Novo plano alimentar gerado", ref_id: plan.id });
    return json({ plan_id: plan.id, warnings });
  }

  // ------------------------------------------------------------------ SUBSTITUTE MEAL
  if (action === "substitute_meal") {
    const { profile, np, age } = await loadContext(supabase, userId);
    const { data: meal } = await supabase.from("meals").select("*, food_items(*)").eq("id", body.meal_id).single();
    if (!meal) throw new HttpError(404, "Refeição não encontrada.");
    const prompt = `Dados do usuário:
${describeUser(profile, np, age)}

Refeição atual (${MEAL_LABEL[meal.meal_type]}): ${meal.food_items.map((f: any) => `${f.name} ${f.quantity_g} g`).join("; ")}.
Total atual: ${meal.calories} kcal, P ${meal.protein_g} g, C ${meal.carbs_g} g, G ${meal.fat_g} g.
${body.hint ? `Pedido do usuário: ${String(body.hint).slice(0, 300)}` : ""}
Crie uma refeição DIFERENTE e equivalente (±10% de calorias e proteínas).
Formato JSON: {"name": string, "foods": [${FOOD_SCHEMA}]}`;
    const ai = await callAI(SYSTEM, prompt);
    if (!Array.isArray(ai?.foods) || !ai.foods.length) throw new HttpError(502, "A IA não retornou alimentos. Tente novamente.");
    const foods = ai.foods.slice(0, 12).map((f: any, j: number) => cleanFood(f, j));
    await supabase.from("food_items").delete().eq("meal_id", meal.id);
    const { error } = await supabase.from("food_items").insert(foods.map((f: any) => ({ ...f, user_id: userId, meal_id: meal.id })));
    if (error) throw new HttpError(500, error.message);
    await supabase.from("meals").update({ name: String(ai.name || meal.name).slice(0, 80), ...totals(foods) }).eq("id", meal.id);
    await recomputePlan(supabase, meal.plan_id);
    await supabase.from("ai_interactions").insert({ user_id: userId, kind: "substituir_refeicao", request: { meal_id: meal.id }, response: ai, status: "done" });
    return json({ ok: true });
  }

  // ------------------------------------------------------------------ SUBSTITUTE FOOD
  if (action === "substitute_food") {
    const { profile, np, age } = await loadContext(supabase, userId);
    const { data: food } = await supabase.from("food_items").select("*, meals(id, plan_id, meal_type)").eq("id", body.food_item_id).single();
    if (!food) throw new HttpError(404, "Alimento não encontrado.");
    const prompt = `Dados do usuário:
${describeUser(profile, np, age)}

Substitua o alimento "${food.name}" (${food.quantity_g} g; ${food.calories} kcal; P ${food.protein_g} g; C ${food.carbs_g} g; G ${food.fat_g} g) da refeição ${MEAL_LABEL[food.meals.meal_type]} por um alimento equivalente diferente.
${body.preferred ? `O usuário prefere: ${String(body.preferred).slice(0, 120)}` : ""}
Formato JSON: ${FOOD_SCHEMA}`;
    const ai = await callAI(SYSTEM, prompt);
    const clean = cleanFood(ai, food.position);
    await supabase.from("food_items").update(clean).eq("id", food.id);
    const { data: foods } = await supabase.from("food_items").select("*").eq("meal_id", food.meal_id);
    await supabase.from("meals").update(totals(foods as Food[])).eq("id", food.meal_id);
    await recomputePlan(supabase, food.meals.plan_id);
    await supabase.from("ai_interactions").insert({ user_id: userId, kind: "substituir_alimento", request: { food_item_id: food.id }, response: ai, status: "done" });
    return json({ ok: true });
  }

  throw new HttpError(400, "Ação inválida");
}));
