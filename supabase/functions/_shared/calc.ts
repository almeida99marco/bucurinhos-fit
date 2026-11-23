// Cálculos nutricionais (usados no app e copiados para supabase/functions/_shared/calc.ts).
// Fórmula de Mifflin-St Jeor com limites de segurança para evitar dietas extremas.

export type CalcInput = {
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_level?: string | null;
  goal?: string | null;
  /** km de corrida por semana — somados à parte do nível de atividade */
  running_km_week?: number | null;
};

export const SECONDARY_GOALS: Record<string, string> = {
  performance_corrida: "Performance na corrida",
  forca: "Ganho de força",
  resistencia: "Resistência / condicionamento",
  recomposicao: "Recomposição corporal",
  saude: "Saúde e energia no dia a dia",
};

/** Gasto médio diário estimado da corrida (~1 kcal/kg/km). */
export function runningKcalPerDay({ weight_kg, running_km_week }: CalcInput) {
  if (!weight_kg || !running_km_week) return 0;
  return (weight_kg * running_km_week) / 7;
}

export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  muito_intenso: 1.9,
};

export function bmr({ sex, age, height_cm, weight_kg }: CalcInput): number | null {
  if (!age || !height_cm || !weight_kg) return null;
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (sex === "masculino") return base + 5;
  if (sex === "feminino") return base - 161;
  return base - 78; // média entre as duas fórmulas
}

export function tdee(input: CalcInput): number | null {
  const b = bmr(input);
  if (b == null) return null;
  return b * (ACTIVITY_FACTORS[input.activity_level ?? "leve"] ?? 1.375) + runningKcalPerDay(input);
}

/** Meta calórica diária com déficit/superávit moderados e piso de segurança. */
export function targetCalories(input: CalcInput): number | null {
  const t = tdee(input);
  if (t == null) return null;
  let kcal = t;
  if (input.goal === "emagrecimento") kcal = t * 0.82; // déficit ~18%
  if (input.goal === "ganho_massa") kcal = t * 1.1; // superávit ~10%
  const floor = input.sex === "masculino" ? 1500 : 1200;
  kcal = Math.max(kcal, floor, (bmr(input) ?? 0) * 1.0);
  return Math.round(kcal / 10) * 10;
}

/**
 * Distribuição de macronutrientes em gramas.
 * - Proteína: 1,6–2,0 g/kg (2,0 para ganho de massa/emagrecimento), teto de 2,2 g/kg.
 * - Gordura: mínimo de 0,8 g/kg ou 25% das calorias.
 * - Carboidrato: restante; com foco em performance de corrida, mínimo de 5–8 g/kg conforme o volume semanal.
 *   Se o mínimo não couber, as calorias sobem (exceto em emagrecimento, quando a gordura é reduzida ao piso).
 */
export function macroTargets(
  kcalIn: number,
  weight_kg: number,
  goal?: string | null,
  opts: { secondary_goals?: string[] | null; running_km_week?: number | null } = {},
) {
  let kcal = kcalIn;
  const perf = (opts.secondary_goals ?? []).some((g) => g === "performance_corrida" || g === "resistencia");
  const protein = Math.round(Math.min(weight_kg * (goal === "manutencao" ? 1.6 : 2.0), weight_kg * 2.2));
  let fat = Math.round(Math.max(weight_kg * 0.8, (kcal * 0.25) / 9));
  let carbs = (kcal - protein * 4 - fat * 9) / 4;
  let carbsPerKg: number | null = null;
  if (perf) {
    carbsPerKg = Math.min(8, Math.max(5, 5 + (opts.running_km_week ?? 0) / 25));
    const min = carbsPerKg * weight_kg;
    if (carbs < min) {
      if (goal === "emagrecimento") {
        fat = Math.round(weight_kg * 0.8);
        carbs = (kcal - protein * 4 - fat * 9) / 4;
      } else {
        carbs = min;
        kcal = protein * 4 + fat * 9 + carbs * 4;
      }
    }
  }
  carbs = Math.max(0, Math.round(carbs));
  kcal = Math.round(kcal / 10) * 10;
  const fiber = Math.round((kcal / 1000) * 14);
  return { kcal, protein, carbs, fat, fiber, carbsPerKg: carbsPerKg ? Math.round(carbsPerKg * 10) / 10 : null };
}

export function ageFromBirth(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

export function bmi(weight?: number | null, height_cm?: number | null) {
  if (!weight || !height_cm) return null;
  const h = height_cm / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}
